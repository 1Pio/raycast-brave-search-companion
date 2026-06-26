import { BraveSearchEntry, RetentionPolicy } from "./types";

export const RETENTION_OPTIONS: Array<{ value: RetentionPolicy; title: string; subtitle: string }> = [
  {
    value: "none",
    title: "Never Save",
    subtitle: "Do not persist search queries, AI answers, suggestions, or results.",
  },
  { value: "24h", title: "24 Hours", subtitle: "Default. Keep local history for one day." },
  { value: "7d", title: "1 Week", subtitle: "Keep local history for seven days." },
  { value: "30d", title: "1 Month", subtitle: "Keep local history for thirty days." },
  { value: "90d", title: "3 Months", subtitle: "Keep local history for ninety days." },
  { value: "365d", title: "1 Year", subtitle: "Keep local history for one year." },
  { value: "forever", title: "Forever", subtitle: "Keep local history until you delete it." },
];

export function pruneEntries(
  entries: BraveSearchEntry[],
  retention: RetentionPolicy,
  now = Date.now(),
): BraveSearchEntry[] {
  const retentionMs = retentionToMilliseconds(retention);
  if (retentionMs === undefined) {
    return entries;
  }

  const cutoff = now - retentionMs;
  return entries.filter((entry) => Date.parse(entry.updatedAt) >= cutoff);
}

export function retentionToMilliseconds(retention: RetentionPolicy): number | undefined {
  switch (retention) {
    case "none":
      return 0;
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return 90 * 24 * 60 * 60 * 1000;
    case "365d":
      return 365 * 24 * 60 * 60 * 1000;
    case "forever":
      return undefined;
  }
}
