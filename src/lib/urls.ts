import { BraveAskToken, BraveClientParams } from "./types";

export const BRAVE_SEARCH_ORIGIN = "https://search.brave.com";

export function buildSearchUrl(query: string): string {
  const url = new URL("/search", BRAVE_SEARCH_ORIGIN);
  url.searchParams.set("q", query);
  return url.toString();
}

export function buildAskUrl(query: string, conversationId?: string): string {
  const url = new URL("/ask", BRAVE_SEARCH_ORIGIN);
  url.searchParams.set("q", query);
  url.searchParams.set("source", "llmSuggest");
  if (conversationId) {
    url.searchParams.set("conversation", conversationId);
  }
  return url.toString();
}

export function buildSuggestUrl(query: string): string {
  const url = new URL("/api/suggest", BRAVE_SEARCH_ORIGIN);
  url.searchParams.set("q", query);
  return url.toString();
}

export function buildAIStreamUrl(conversationId: string): string {
  const url = new URL("/api/chatllm/with_ask", BRAVE_SEARCH_ORIGIN);
  url.searchParams.set("conversation", conversationId);
  url.searchParams.set("enable_inline_entities", "true");
  return url.toString();
}

export function buildTapNewUrl(
  token: BraveAskToken,
  symmetricKey: string,
  clientParams: BraveClientParams,
): string {
  const url = new URL("/api/tap/v1/new", BRAVE_SEARCH_ORIGIN);
  applyClientParams(url.searchParams, clientParams);
  url.searchParams.set("symmetric_key", symmetricKey);
  url.searchParams.set("source", "llmSuggest");
  url.searchParams.set("enable_research", "false");
  url.searchParams.set("q", token.q);
  url.searchParams.set("nonce", token.nonce);
  url.searchParams.set("sig", token.sig);
  return url.toString();
}

export function buildTapStreamUrl(
  conversationId: string,
  query: string,
  symmetricKey: string,
  clientParams: BraveClientParams,
): string {
  const url = new URL("/api/tap/v1/stream", BRAVE_SEARCH_ORIGIN);
  applyClientParams(url.searchParams, clientParams);
  url.searchParams.set("id", conversationId);
  url.searchParams.set("query", query);
  url.searchParams.set("symmetric_key", symmetricKey);
  url.searchParams.set("enable_inline_entities", "true");
  return url.toString();
}

function applyClientParams(searchParams: URLSearchParams, clientParams: BraveClientParams): void {
  for (const [key, value] of Object.entries(clientParams)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }
}
