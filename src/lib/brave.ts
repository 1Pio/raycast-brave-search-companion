import { webcrypto } from "node:crypto";
import { parseAIStream, parseAskPage, parseSearchPage, parseSuggestionPayload } from "./parse";
import {
  buildAIStreamUrl,
  buildAskUrl,
  buildSearchUrl,
  buildSuggestUrl,
  buildTapNewUrl,
  buildTapStreamUrl,
} from "./urls";
import { BraveAIAnswer, BraveSource, BraveWebResult } from "./types";

const FETCH_TIMEOUT_MS = 30000;
const TRANSIENT_FETCH_RETRIES = 1;
const TRANSIENT_RETRY_DELAY_MS = 900;
const MIN_BRAVE_REQUEST_GAP_MS = 180;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

let braveRequestQueue = Promise.resolve();
let lastBraveRequestStartedAt = 0;

const HTML_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": BROWSER_USER_AGENT,
};

const JSON_HEADERS = {
  accept: "application/json",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": BROWSER_USER_AGENT,
};

const STREAM_HEADERS = {
  accept: "text/event-stream,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": BROWSER_USER_AGENT,
};

interface SearchPageResult {
  conversationId?: string;
  results: BraveWebResult[];
}

export async function fetchSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const response = await fetchWithRetries(
    buildSuggestUrl(query),
    {
      headers: JSON_HEADERS,
    },
    signal,
    TRANSIENT_FETCH_RETRIES,
  );

  if (!response.ok) {
    throw new Error(`Suggestion request failed: ${response.status}`);
  }

  return parseSuggestionPayload(await response.json());
}

export async function fetchSearchPage(query: string, signal?: AbortSignal): Promise<SearchPageResult> {
  const response = await fetchWithRetries(
    buildSearchUrl(query),
    {
      headers: HTML_HEADERS,
    },
    signal,
    TRANSIENT_FETCH_RETRIES,
  );

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`);
  }

  return parseSearchPage(await response.text());
}

export async function fetchAIAnswer(
  query: string,
  conversationId: string | undefined,
  fallbackSources: BraveSource[],
  signal?: AbortSignal,
): Promise<BraveAIAnswer> {
  if (conversationId) {
    try {
      return await fetchLegacyAIAnswer(conversationId, fallbackSources, signal);
    } catch (legacyError) {
      if (signal?.aborted) {
        return { answer: "", sources: fallbackSources, status: "idle" };
      }

      const tapAnswer = await fetchTapAIAnswer(query, fallbackSources, signal).catch(() => undefined);
      if (tapAnswer) {
        return {
          ...tapAnswer,
          conversationId: tapAnswer.conversationId ?? conversationId,
          sources: tapAnswer.sources.length > 0 ? tapAnswer.sources : fallbackSources,
        };
      }

      return failedAIAnswer(legacyError, fallbackSources, conversationId);
    }
  }

  try {
    return await fetchTapAIAnswer(query, fallbackSources, signal);
  } catch (error) {
    if (signal?.aborted) {
      return { answer: "", sources: fallbackSources, status: "idle" };
    }

    return failedAIAnswer(error, fallbackSources);
  }
}

async function fetchTapAIAnswer(
  query: string,
  fallbackSources: BraveSource[],
  signal?: AbortSignal,
): Promise<BraveAIAnswer> {
  const askPageResponse = await fetchWithTimeout(
    buildAskUrl(query),
    {
      headers: HTML_HEADERS,
    },
    signal,
  );

  if (!askPageResponse.ok) {
    throw new Error(`Ask page request failed: ${askPageResponse.status}`);
  }

  const askPage = parseAskPage(await askPageResponse.text());
  if (!askPage.token) {
    throw new Error("Brave did not provide an Ask token for this query.");
  }

  const symmetricKey = await generateSymmetricKey();
  const newConversationResponse = await fetchWithTimeout(
    buildTapNewUrl(askPage.token, symmetricKey, askPage.clientParams),
    {},
    signal,
  );

  if (!newConversationResponse.ok) {
    throw await responseError(newConversationResponse, "AI conversation request failed");
  }

  const newConversation = (await newConversationResponse.json()) as { id?: string };
  if (!newConversation.id) {
    throw new Error("Brave did not return an AI conversation id.");
  }

  const streamResponse = await fetchWithTimeout(
    buildTapStreamUrl(newConversation.id, query, symmetricKey, askPage.clientParams),
    {},
    signal,
  );

  if (!streamResponse.ok) {
    throw await responseError(streamResponse, "AI answer request failed");
  }

  const parsed = parseAIStream(await streamResponse.text(), fallbackSources);
  const streamedConversationId = streamResponse.headers.get("x-conversation") ?? newConversation.id;

  return {
    answer: parsed.answer,
    conversationId: streamedConversationId,
    sources: parsed.sources,
    status: parsed.answer ? "ready" : "unavailable",
  };
}

async function fetchLegacyAIAnswer(
  conversationId: string | undefined,
  fallbackSources: BraveSource[],
  signal?: AbortSignal,
): Promise<BraveAIAnswer> {
  if (!conversationId) {
    return {
      answer: "",
      sources: fallbackSources,
      status: "unavailable",
    };
  }

  const response = await fetchWithTimeout(
    buildAIStreamUrl(conversationId),
    {
      headers: STREAM_HEADERS,
    },
    signal,
  );

  if (!response.ok) {
    throw await responseError(response, "AI answer request failed");
  }

  const parsed = parseAIStream(await response.text(), fallbackSources);
  return {
    answer: parsed.answer,
    conversationId,
    sources: parsed.sources,
    status: parsed.answer ? "ready" : "unavailable",
  };
}

function failedAIAnswer(
  error: unknown,
  fallbackSources: BraveSource[],
  conversationId?: string,
): BraveAIAnswer {
  return {
    answer: "",
    conversationId,
    sources: fallbackSources,
    status: "error",
    error: error instanceof Error ? error.message : "AI answer request failed.",
  };
}

async function generateSymmetricKey(): Promise<string> {
  const cryptoProvider = globalThis.crypto ?? webcrypto;
  const key = await cryptoProvider.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const jwk = await cryptoProvider.subtle.exportKey("jwk", key);
  if (!jwk.k) {
    throw new Error("Failed to generate Brave Ask symmetric key.");
  }
  return jwk.k;
}

async function responseError(response: Response, prefix: string): Promise<Error> {
  if (response.status === 429) {
    try {
      const body = (await response.clone().json()) as unknown;
      if (isVerificationChallenge(body)) {
        return new Error("Brave requested browser verification before streaming AI answers.");
      }
    } catch {
      return new Error(`${prefix}: ${response.status}`);
    }
  }

  return new Error(`${prefix}: ${response.status}`);
}

function isVerificationChallenge(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "set_token" in value &&
    "tokens" in value &&
    Array.isArray((value as { tokens?: unknown }).tokens)
  );
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const abort = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  }
  parentSignal?.addEventListener("abort", abort, { once: true });

  return waitForBraveRequestSlot(parentSignal)
    .then(() => fetch(input, { ...init, signal: controller.signal }))
    .finally(() => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abort);
    });
}

async function fetchWithRetries(
  input: RequestInfo | URL,
  init: RequestInit,
  parentSignal: AbortSignal | undefined,
  retries: number,
): Promise<Response> {
  let attempt = 0;

  while (true) {
    const response = await fetchWithTimeout(input, init, parentSignal);
    if (attempt >= retries || !isTransientResponse(response)) {
      return response;
    }

    void response.body?.cancel().catch(() => undefined);
    await delay(readRetryAfter(response) ?? TRANSIENT_RETRY_DELAY_MS * (attempt + 1), parentSignal);
    attempt += 1;
  }
}

async function waitForBraveRequestSlot(signal?: AbortSignal): Promise<void> {
  const turn = braveRequestQueue.then(async () => {
    throwIfAborted(signal);
    const waitMs = Math.max(0, MIN_BRAVE_REQUEST_GAP_MS - (Date.now() - lastBraveRequestStartedAt));
    if (waitMs > 0) {
      await delay(waitMs, signal);
    }
    throwIfAborted(signal);
    lastBraveRequestStartedAt = Date.now();
  });

  braveRequestQueue = turn.catch(() => {
    return undefined;
  });
  await turn;
}

function isTransientResponse(response: Response): boolean {
  return (
    response.status === 408 ||
    response.status === 409 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500
  );
}

function readRetryAfter(response: Response): number | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 5000);
  }

  const date = Date.parse(retryAfter);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), 5000);
  }

  return undefined;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  if (signal?.aborted) {
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}
