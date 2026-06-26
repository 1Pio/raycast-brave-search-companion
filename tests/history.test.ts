import { describe, expect, it } from "vitest";
import { dedupeHistory, searchHistory } from "../src/lib/history";
import { pruneEntries, retentionToMilliseconds } from "../src/lib/retention";
import { BraveSearchEntry } from "../src/lib/types";

const baseEntry: BraveSearchEntry = {
  id: "base",
  query: "Raycast Extensions",
  normalizedQuery: "raycast extensions",
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
  aiAnswer: "Raycast extensions are built with TypeScript and React.",
  aiSources: [],
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

describe("searchHistory", () => {
  it("weights query matches above answer and result matches", () => {
    const queryMatch = { ...baseEntry, id: "query", query: "Brave Search API", normalizedQuery: "brave search api" };
    const answerMatch = { ...baseEntry, id: "answer", query: "Browser Tools", normalizedQuery: "browser tools", aiAnswer: "Use Brave Search API carefully." };

    const matches = searchHistory([answerMatch, queryMatch], "brave search api");

    expect(matches.map((match) => match.entry.id)).toEqual(["query", "answer"]);
  });

  it("keeps the newest duplicate query", () => {
    const older = { ...baseEntry, id: "older", updatedAt: "2026-06-25T00:00:00.000Z" };
    const newer = { ...baseEntry, id: "newer", updatedAt: "2026-06-26T00:00:00.000Z" };

    expect(dedupeHistory([older, newer])).toEqual([newer]);
  });
});

describe("retention helpers", () => {
  it("maps retention policies to milliseconds", () => {
    expect(retentionToMilliseconds("24h")).toBe(24 * 60 * 60 * 1000);
    expect(retentionToMilliseconds("forever")).toBeUndefined();
  });

  it("prunes entries outside the retention window", () => {
    const now = Date.parse("2026-06-26T12:00:00.000Z");
    const oldEntry = { ...baseEntry, id: "old", updatedAt: "2026-06-24T00:00:00.000Z" };
    const freshEntry = { ...baseEntry, id: "fresh", updatedAt: "2026-06-26T11:00:00.000Z" };

    expect(pruneEntries([oldEntry, freshEntry], "24h", now).map((entry) => entry.id)).toEqual(["fresh"]);
  });
});
