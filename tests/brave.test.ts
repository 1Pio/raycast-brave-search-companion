import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAIAnswer, fetchSearchPage, fetchSuggestions } from "../src/lib/brave";

describe("Brave fetch layer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches completion suggestions from the free public suggestion endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(["raycast", ["raycast", "raycast mac"]])));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSuggestions("raycast")).resolves.toEqual(["raycast", "raycast mac"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://search.brave.com/api/suggest?q=raycast",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("fetches and parses the Brave search page", async () => {
    const html = `
      web:{type:"search",results:[{title:"Raycast",url:"https://www.raycast.com/",meta_url:{netloc:"raycast.com"},thumbnail:{src:"https://example.com/preview.png"}}]},
      chatllm:{conversation:"conversation-1"}
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)));

    const parsed = await fetchSearchPage("raycast");

    expect(parsed.conversationId).toBe("conversation-1");
    expect(parsed.results[0]).toMatchObject({ title: "Raycast", url: "https://www.raycast.com/" });
  });

  it("fetches and parses the Brave TAP AI answer stream", async () => {
    const askHtml = `
      searchLang:"en",country:"us",language:"en-us",safesearch:"moderate",forceSafesearch:false,units:"metric",useLocation:false,
      token:{q:"raycast extension",nonce:"nonce-1",sig:"sig-1"}
    `;
    const stream = [
      '{"type":"initial_response","service_response":{"web":{"results":[{"title":"Raycast","url":"https://www.raycast.com/"}]}}}',
      '{"type":"inline_entity","name":"Brave"}',
      '{"type":"text_delta","delta":" Search works."}',
    ].join("\n");
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const value = String(url);
      if (value.includes("/ask?")) {
        return new Response(askHtml);
      }
      if (value.includes("/api/tap/v1/new?")) {
        return new Response(JSON.stringify({ id: "conversation-1" }));
      }
      if (value.includes("/api/tap/v1/stream?")) {
        return new Response(stream, { headers: { "x-conversation": "conversation-2" } });
      }
      throw new Error(`Unexpected URL: ${value}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAIAnswer("raycast extension", "legacy-conversation", [])).resolves.toMatchObject({
      answer: "Brave Search works.",
      conversationId: "conversation-2",
      status: "ready",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { accept: "text/html" } });
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fetchMock.mock.calls[1][1]).not.toHaveProperty("headers");
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fetchMock.mock.calls[2][1]).not.toHaveProperty("headers");
  });

  it("surfaces Brave browser verification challenges without trying to bypass them", async () => {
    const askHtml = `token:{q:"raycast extension",nonce:"nonce-1",sig:"sig-1"}`;
    const challenge = {
      set_token: "token",
      tokens: ["challenge"],
      zero_count: 1,
      hash_function_params: { iterations: 2, memory_size: 512, hash_length: 32, parallelism: 1 },
      solution_limit: 5000,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const value = String(url);
        if (value.includes("/ask?")) {
          return new Response(askHtml);
        }
        if (value.includes("/api/tap/v1/new?")) {
          return new Response(JSON.stringify({ id: "conversation-1" }));
        }
        return new Response(JSON.stringify(challenge), { status: 429 });
      }),
    );

    await expect(
      fetchAIAnswer("raycast extension", "legacy-conversation", [{ title: "Fallback", url: "https://example.com/" }]),
    ).resolves.toMatchObject({
      answer: "",
      conversationId: "legacy-conversation",
      error: "Brave requested browser verification before streaming AI answers.",
      status: "error",
    });
  });
});
