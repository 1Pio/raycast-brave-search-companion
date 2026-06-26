import { BraveSource, BraveWebResult } from "./types";

export function formatSourcesForMetadata(sources: BraveSource[], limit = 8): BraveSource[] {
  return sources.slice(0, limit);
}

export function formatResultsForClipboard(results: BraveWebResult[]): string {
  return results.map((result) => `${result.rank}. ${result.title}\n${result.url}`).join("\n\n");
}

export function markdownForAIAnswer(answer: string): string {
  return answer.trim() || "No AI answer is available for this query.";
}

export function markdownForResultPreview(result: BraveWebResult): string {
  const imageUrl = result.previewImageUrl ?? result.faviconUrl;
  if (!imageUrl) {
    return "";
  }

  return `![${escapeMarkdownAlt(result.title)}](${imageUrl})`;
}

export function formatRelativeTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 31) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/[[\]]/g, "");
}
