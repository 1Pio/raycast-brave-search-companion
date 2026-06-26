import { CompletionSuggestionCount } from "./types";

export const COMPLETION_SUGGESTION_OPTIONS: Array<{
  value: CompletionSuggestionCount;
  title: string;
}> = [
  { value: 4, title: "4 Suggestions" },
  { value: 3, title: "3 Suggestions" },
  { value: 2, title: "2 Suggestions" },
  { value: 1, title: "1 Suggestion" },
  { value: 0, title: "None" },
];

export function prepareCompletionSuggestions(
  suggestions: string[],
  maxCount: CompletionSuggestionCount,
): string[] {
  if (maxCount === 0) {
    return [];
  }

  return suggestions.slice(1).slice(0, maxCount);
}
