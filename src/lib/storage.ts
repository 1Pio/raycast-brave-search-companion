import { LocalStorage } from "@raycast/api";
import { createHistoryEntryId } from "./history";
import { pruneEntries, RETENTION_OPTIONS } from "./retention";
import { COMPLETION_SUGGESTION_OPTIONS } from "./suggestions";
import { normalizeSearchText } from "./text";
import { BraveSearchEntry, CompletionSuggestionCount, RetentionPolicy, SearchSettings } from "./types";

export { pruneEntries, retentionToMilliseconds, RETENTION_OPTIONS } from "./retention";

const SETTINGS_KEY = "brave-search-companion:settings:v1";
const HISTORY_KEY = "brave-search-companion:history:v1";

export const DEFAULT_SETTINGS: SearchSettings = {
  retention: "24h",
  completionSuggestionCount: 4,
};

export async function getSettings(): Promise<SearchSettings> {
  const stored = await LocalStorage.getItem<string>(SETTINGS_KEY);
  if (!stored) {
    return DEFAULT_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function setSettings(settings: SearchSettings): Promise<void> {
  await LocalStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
  await pruneHistory(settings.retention);
}

export async function getHistory(): Promise<BraveSearchEntry[]> {
  const stored = await LocalStorage.getItem<string>(HISTORY_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
  } catch {
    return [];
  }
}

export async function getHistoryEntryForQuery(query: string): Promise<BraveSearchEntry | undefined> {
  const normalizedQuery = normalizeSearchText(query);
  const history = await getHistory();
  return history.find((entry) => entry.normalizedQuery === normalizedQuery);
}

export async function saveSearchEntry(
  entry: Omit<BraveSearchEntry, "id" | "normalizedQuery" | "createdAt" | "updatedAt">,
): Promise<void> {
  const settings = await getSettings();
  if (settings.retention === "none") {
    await LocalStorage.removeItem(HISTORY_KEY);
    return;
  }

  const now = new Date().toISOString();
  const normalizedQuery = normalizeSearchText(entry.query);
  const currentHistory = await getHistory();
  const existing = currentHistory.find((item) => item.normalizedQuery === normalizedQuery);
  const nextEntry: BraveSearchEntry = {
    ...entry,
    id: existing?.id ?? createHistoryEntryId(entry.query, now),
    normalizedQuery,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextHistory = [nextEntry, ...currentHistory.filter((item) => item.id !== nextEntry.id)];
  await writeHistory(pruneEntries(nextHistory, settings.retention));
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const history = await getHistory();
  await writeHistory(history.filter((entry) => entry.id !== id));
}

export async function deleteHistoryForQuery(query: string): Promise<void> {
  const normalizedQuery = normalizeSearchText(query);
  const history = await getHistory();
  await writeHistory(history.filter((entry) => entry.normalizedQuery !== normalizedQuery));
}

export async function clearHistory(): Promise<void> {
  await LocalStorage.removeItem(HISTORY_KEY);
}

export async function pruneHistory(retention: RetentionPolicy): Promise<void> {
  if (retention === "none") {
    await clearHistory();
    return;
  }

  const history = await getHistory();
  await writeHistory(pruneEntries(history, retention));
}

async function writeHistory(entries: BraveSearchEntry[]): Promise<void> {
  if (entries.length === 0) {
    await LocalStorage.removeItem(HISTORY_KEY);
    return;
  }

  await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

function normalizeSettings(value: unknown): SearchSettings {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const retention = record.retention;
  const completionSuggestionCount = record.completionSuggestionCount;

  return {
    retention: isRetentionPolicy(retention) ? retention : DEFAULT_SETTINGS.retention,
    completionSuggestionCount: isCompletionSuggestionCount(completionSuggestionCount)
      ? completionSuggestionCount
      : DEFAULT_SETTINGS.completionSuggestionCount,
  };
}

function isRetentionPolicy(value: unknown): value is RetentionPolicy {
  return typeof value === "string" && RETENTION_OPTIONS.some((option) => option.value === value);
}

function isCompletionSuggestionCount(value: unknown): value is CompletionSuggestionCount {
  return typeof value === "number" && COMPLETION_SUGGESTION_OPTIONS.some((option) => option.value === value);
}

function isHistoryEntry(value: unknown): value is BraveSearchEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<BraveSearchEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.query === "string" &&
    typeof entry.normalizedQuery === "string" &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string" &&
    Array.isArray(entry.aiSources) &&
    Array.isArray(entry.suggestions) &&
    Array.isArray(entry.results)
  );
}
