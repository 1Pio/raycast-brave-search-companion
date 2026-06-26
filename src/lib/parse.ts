import { BraveAskToken, BraveClientParams, BraveSource, BraveWebResult } from "./types";
import { stableHash } from "./text";

interface SearchPageData {
  conversationId?: string;
  results: BraveWebResult[];
}

interface ParsedAIStream {
  answer: string;
  sources: BraveSource[];
}

interface AskPageData {
  token?: BraveAskToken;
  clientParams: BraveClientParams;
}

export function parseSuggestionPayload(payload: unknown): string[] {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) {
    return [];
  }

  return uniqueStrings(payload[1].filter((item): item is string => typeof item === "string"));
}

export function parseSearchPage(html: string): SearchPageData {
  return {
    conversationId: parseConversationId(html),
    results: parseWebResults(html),
  };
}

export function parseAskPage(html: string): AskPageData {
  return {
    token: parseAskToken(html),
    clientParams: parseClientParams(html),
  };
}

export function parseAIStream(text: string, fallbackSources: BraveSource[] = []): ParsedAIStream {
  const answerParts: string[] = [];
  const sources: BraveSource[] = [];

  for (const event of parseEventLines(text)) {
    if (event.type === "text_delta" && typeof event.delta === "string") {
      answerParts.push(event.delta);
    }

    if (event.type === "inline_entity" && typeof event.name === "string") {
      answerParts.push(event.name);
    }

    sources.push(...extractSources(event));
  }

  return {
    answer: normalizeAnswer(answerParts.join("")),
    sources: dedupeSources(sources.length > 0 ? sources : fallbackSources),
  };
}

export function parseConversationId(html: string): string | undefined {
  const chatIndex = html.indexOf("chatllm:{");
  if (chatIndex === -1) {
    return undefined;
  }

  const match = html.slice(chatIndex, chatIndex + 2000).match(/conversation:"((?:\\.|[^"\\])*)"/);
  return match ? decodeJsString(match[1]) : undefined;
}

export function parseAskToken(html: string): BraveAskToken | undefined {
  const match = html.match(/token:\{q:"((?:\\.|[^"\\])*)",nonce:"([^"]+)",sig:"([^"]+)"\}/);
  if (!match) {
    return undefined;
  }

  return {
    q: decodeJsString(match[1]),
    nonce: match[2],
    sig: match[3],
  };
}

export function parseClientParams(html: string): BraveClientParams {
  const country = readDataString(html, "country") ?? "us";
  const uiLanguage = readDataString(html, "language") ?? "en-us";

  return {
    language: readDataString(html, "searchLang") ?? uiLanguage.split("-")[0] ?? "en",
    country,
    ui_lang: uiLanguage,
    safesearch: readDataString(html, "safesearch") ?? "moderate",
    force_safesearch: readDataBoolean(html, "forceSafesearch") ? "1" : "0",
    units_of_measurement: readDataString(html, "units") ?? "metric",
    use_location: readDataBoolean(html, "useLocation") ? "1" : "0",
    geoloc: readDataString(html, "geoLocation"),
    premium_cookie_name: readDataString(html, "premiumCookieName"),
    premium_cookie_value: readDataString(html, "premiumCookieValue"),
  };
}

export function parseWebResults(html: string): BraveWebResult[] {
  const webIndex = html.indexOf('web:{type:"search"');
  if (webIndex === -1) {
    return [];
  }

  const resultsIndex = html.indexOf("results:[", webIndex);
  if (resultsIndex === -1) {
    return [];
  }

  const arrayStart = html.indexOf("[", resultsIndex);
  const resultsArray = extractBalanced(html, arrayStart, "[", "]");
  if (!resultsArray) {
    return [];
  }

  return splitTopLevelObjects(resultsArray)
    .map((rawResult, index) => parseResultObject(rawResult, index + 1))
    .filter((result): result is BraveWebResult => Boolean(result))
    .slice(0, 40);
}

function parseResultObject(rawResult: string, rank: number): BraveWebResult | undefined {
  const title = readStringField(rawResult, "title");
  const url = readStringField(rawResult, "url");
  if (!title || !url || !isHttpUrl(url)) {
    return undefined;
  }

  const metaUrl = readObjectField(rawResult, "meta_url");
  const thumbnail = readObjectField(rawResult, "thumbnail");
  const profile = readObjectField(rawResult, "profile");
  const displayUrl =
    readStringField(metaUrl, "netloc") ?? readStringField(metaUrl, "hostname") ?? hostnameFromUrl(url);
  const previewImageUrl =
    readStringField(thumbnail, "src") ??
    readStringField(thumbnail, "original") ??
    readStringField(profile, "img");

  return {
    id: stableHash(url),
    rank,
    title,
    url,
    displayUrl,
    description: readStringField(rawResult, "description"),
    previewImageUrl: previewImageUrl && isHttpUrl(previewImageUrl) ? previewImageUrl : undefined,
    faviconUrl: readStringField(metaUrl, "favicon"),
  };
}

function parseEventLines(text: string): Record<string, unknown>[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("data:") ? line.slice(5).trim() : line))
    .filter((line) => line !== "[DONE]")
    .flatMap((line) => {
      try {
        const value = JSON.parse(line);
        return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
}

function extractSources(value: unknown, depth = 0): BraveSource[] {
  if (depth > 5 || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractSources(item, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const ownSource = sourceFromRecord(record);
  const nestedSources = Object.values(record).flatMap((item) => extractSources(item, depth + 1));
  return ownSource ? [ownSource, ...nestedSources] : nestedSources;
}

function sourceFromRecord(record: Record<string, unknown>): BraveSource | undefined {
  const url = firstString(record.url, record.href, record.link);
  if (!url || !isHttpUrl(url)) {
    return undefined;
  }

  return {
    title: firstString(record.title, record.name, record.display_url, record.url) ?? url,
    url,
  };
}

function readObjectField(source: string | undefined, field: string): string | undefined {
  if (!source) {
    return undefined;
  }

  const keyIndex = source.indexOf(`${field}:`);
  if (keyIndex === -1) {
    return undefined;
  }

  const objectStart = source.indexOf("{", keyIndex);
  if (objectStart === -1) {
    return undefined;
  }

  return extractBalanced(source, objectStart, "{", "}");
}

function readStringField(source: string | undefined, field: string): string | undefined {
  if (!source) {
    return undefined;
  }

  const match = source.match(new RegExp(`${escapeRegExp(field)}:"((?:\\\\.|[^"\\\\])*)"`));
  return match ? decodeJsString(match[1]) : undefined;
}

function readDataString(source: string, field: string): string | undefined {
  const match = source.match(new RegExp(`${escapeRegExp(field)}:"((?:\\\\.|[^"\\\\])*)"`));
  return match ? decodeJsString(match[1]) : undefined;
}

function readDataBoolean(source: string, field: string): boolean {
  const match = source.match(new RegExp(`${escapeRegExp(field)}:(true|false)`));
  return match?.[1] === "true";
}

function extractBalanced(
  source: string,
  startIndex: number,
  open: string,
  close: string,
): string | undefined {
  if (startIndex < 0 || source[startIndex] !== open) {
    return undefined;
  }

  let depth = 0;
  let quote: '"' | "'" | "`" | undefined;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function splitTopLevelObjects(arraySource: string): string[] {
  const objects: string[] = [];
  let index = 1;

  while (index < arraySource.length - 1) {
    const objectStart = arraySource.indexOf("{", index);
    if (objectStart === -1) {
      break;
    }

    const objectSource = extractBalanced(arraySource, objectStart, "{", "}");
    if (!objectSource) {
      break;
    }

    objects.push(objectSource);
    index = objectStart + objectSource.length;
  }

  return objects;
}

function decodeJsString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function normalizeAnswer(value: string): string {
  return value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(value);
    }
  }

  return results;
}

function dedupeSources(sources: BraveSource[]): BraveSource[] {
  const seen = new Set<string>();
  const results: BraveSource[] = [];

  for (const source of sources) {
    const key = normalizeSourceUrl(source.url);
    if (!seen.has(key)) {
      seen.add(key);
      results.push(source);
    }
  }

  return results;
}

function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
