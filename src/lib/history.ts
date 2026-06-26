import { BraveSearchEntry } from "./types";
import { normalizeSearchText } from "./text";

export interface ScoredHistoryEntry {
  entry: BraveSearchEntry;
  score: number;
}

export function createHistoryEntryId(query: string, createdAt: string): string {
  return `${normalizeSearchText(query).replace(/\s+/g, "-") || "search"}-${Date.parse(createdAt).toString(36)}`;
}

export function searchHistory(entries: BraveSearchEntry[], rawNeedle: string): ScoredHistoryEntry[] {
  const needle = normalizeSearchText(rawNeedle);
  const deduped = dedupeHistory(entries);

  if (!needle) {
    return deduped
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((entry) => ({ entry, score: 0 }));
  }

  return deduped
    .map((entry) => ({ entry, score: scoreEntry(entry, needle) }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || Date.parse(right.entry.updatedAt) - Date.parse(left.entry.updatedAt),
    );
}

export function dedupeHistory(entries: BraveSearchEntry[]): BraveSearchEntry[] {
  const byQuery = new Map<string, BraveSearchEntry>();

  for (const entry of entries) {
    const key = entry.normalizedQuery || normalizeSearchText(entry.query);
    const existing = byQuery.get(key);
    if (!existing || Date.parse(entry.updatedAt) > Date.parse(existing.updatedAt)) {
      byQuery.set(key, entry);
    }
  }

  return [...byQuery.values()];
}

function scoreEntry(entry: BraveSearchEntry, needle: string): number {
  const queryScore = scoreText(entry.normalizedQuery || normalizeSearchText(entry.query), needle) * 5;
  const answerScore = scoreText(normalizeSearchText(entry.aiAnswer ?? ""), needle) * 2;
  const resultScore = Math.max(
    ...entry.results.map((result) =>
      scoreText(
        normalizeSearchText(`${result.title} ${result.displayUrl} ${result.description ?? ""}`),
        needle,
      ),
    ),
    0,
  );

  return queryScore + answerScore + resultScore;
}

function scoreText(haystack: string, needle: string): number {
  if (!haystack || !needle) {
    return 0;
  }
  if (haystack === needle) {
    return 100;
  }
  if (haystack.includes(needle)) {
    return 70 + Math.min(20, needle.length);
  }

  const needleWords = needle.split(" ");
  const haystackWords = new Set(haystack.split(" "));
  const wordHits = needleWords.filter((word) => haystackWords.has(word)).length;
  const wordScore = (wordHits / needleWords.length) * 50;
  const fuzzyScore = isSubsequence(needle.replace(/\s/g, ""), haystack.replace(/\s/g, "")) ? 15 : 0;

  return wordScore + fuzzyScore;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let needleIndex = 0;
  for (let index = 0; index < haystack.length && needleIndex < needle.length; index += 1) {
    if (haystack[index] === needle[needleIndex]) {
      needleIndex += 1;
    }
  }
  return needleIndex === needle.length;
}
