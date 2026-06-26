import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHistory,
  getHistoryEntryForQuery,
  getSettings,
  pruneHistory,
  saveSearchEntry,
  setSettings,
} from "../src/lib/storage";
import { localStorageCalls, resetRaycastApiMock } from "./mocks/raycast-api";

const entry = {
  query: "Raycast Extensions",
  conversationId: "conversation-1",
  aiAnswer: "Raycast extensions are built with TypeScript and React.",
  aiSources: [{ title: "Raycast Docs", url: "https://developers.raycast.com/" }],
  suggestions: ["raycast extensions"],
  results: [
    {
      id: "docs",
      rank: 1,
      title: "Raycast Developer Docs",
      url: "https://developers.raycast.com/",
      displayUrl: "developers.raycast.com",
      description: "Build extensions.",
    },
  ],
};

describe("storage", () => {
  beforeEach(() => {
    resetRaycastApiMock();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads default settings and persists completion suggestion count", async () => {
    await expect(getSettings()).resolves.toEqual({ retention: "24h", completionSuggestionCount: 4 });

    await setSettings({ retention: "7d", completionSuggestionCount: 0 });

    await expect(getSettings()).resolves.toEqual({ retention: "7d", completionSuggestionCount: 0 });
  });

  it("does not retain history when retention is none", async () => {
    await saveSearchEntry(entry);
    await expect(getHistory()).resolves.toHaveLength(1);

    await setSettings({ retention: "none", completionSuggestionCount: 4 });
    await saveSearchEntry({ ...entry, query: "Private Search" });

    await expect(getHistory()).resolves.toEqual([]);
    expect(localStorageCalls.removeItem.length).toBeGreaterThan(0);
  });

  it("finds exact query history and prunes expired entries", async () => {
    vi.setSystemTime(new Date("2026-06-24T12:00:00.000Z"));
    await saveSearchEntry({ ...entry, query: "Old Search" });

    vi.setSystemTime(new Date("2026-06-26T12:00:00.000Z"));
    await saveSearchEntry({ ...entry, query: "Fresh Search" });
    await pruneHistory("24h");

    const history = await getHistory();
    expect(history.map((item) => item.query)).toEqual(["Fresh Search"]);
    await expect(getHistoryEntryForQuery(" fresh   search ")).resolves.toMatchObject({
      query: "Fresh Search",
      aiAnswer: entry.aiAnswer,
    });
  });
});
