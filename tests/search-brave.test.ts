import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAIAnswer, fetchSearchPage, fetchSuggestions } from "../src/lib/brave";
import { DEFAULT_SETTINGS, saveSearchEntry } from "../src/lib/storage";
import { SearchState, runSearch } from "../src/search-brave";
import { resetRaycastApiMock } from "./mocks/raycast-api";

vi.mock("../src/lib/brave", () => ({
  fetchAIAnswer: vi.fn(),
  fetchSearchPage: vi.fn(),
  fetchSuggestions: vi.fn(),
}));

const cachedResult = {
  id: "docs",
  rank: 1,
  title: "Raycast Developer Docs",
  url: "https://developers.raycast.com/",
  displayUrl: "developers.raycast.com",
  description: "Build extensions.",
};

describe("runSearch", () => {
  beforeEach(() => {
    resetRaycastApiMock();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses exact-query cache and skips Ask fallback when the live search page fails", async () => {
    await saveSearchEntry({
      query: "Raycast Extensions",
      conversationId: "conversation-1",
      aiAnswer: "Raycast extensions are built with TypeScript and React.",
      aiSources: [{ title: "Raycast Docs", url: "https://developers.raycast.com/" }],
      suggestions: ["raycast extension docs", "raycast extension store"],
      results: [cachedResult],
    });

    vi.mocked(fetchSuggestions).mockRejectedValue(new Error("Suggestion request failed: 429"));
    vi.mocked(fetchSearchPage).mockRejectedValue(new Error("Search request failed: 429"));

    let state: SearchState = {
      query: "",
      isLoading: false,
      suggestions: [],
      results: [],
      ai: {
        answer: "",
        sources: [],
        status: "idle",
      },
    };
    const setState = (update: SearchState | ((previous: SearchState) => SearchState)) => {
      state = typeof update === "function" ? update(state) : update;
    };

    await runSearch("Raycast Extensions", DEFAULT_SETTINGS, new AbortController().signal, setState);

    expect(fetchAIAnswer).not.toHaveBeenCalled();
    expect(state.isLoading).toBe(false);
    expect(state.suggestions).toEqual(["raycast extension docs", "raycast extension store"]);
    expect(state.results).toEqual([cachedResult]);
    expect(state.ai).toMatchObject({
      answer: "Raycast extensions are built with TypeScript and React.",
      conversationId: "conversation-1",
      status: "ready",
    });
  });

  it("does not call Ask fallback when the live search page has no parseable context", async () => {
    vi.mocked(fetchSuggestions).mockResolvedValue(["opaque", "opaque docs"]);
    vi.mocked(fetchSearchPage).mockResolvedValue({ results: [] });

    let state: SearchState = {
      query: "",
      isLoading: false,
      suggestions: [],
      results: [],
      ai: {
        answer: "",
        sources: [],
        status: "idle",
      },
    };
    const setState = (update: SearchState | ((previous: SearchState) => SearchState)) => {
      state = typeof update === "function" ? update(state) : update;
    };

    await runSearch("Opaque", DEFAULT_SETTINGS, new AbortController().signal, setState);

    expect(fetchAIAnswer).not.toHaveBeenCalled();
    expect(state.suggestions).toEqual(["opaque docs"]);
    expect(state.results).toEqual([]);
    expect(state.ai).toMatchObject({
      status: "error",
      error: "Brave Search returned no parseable results.",
    });
  });
});
