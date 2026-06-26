export type RetentionPolicy = "none" | "24h" | "7d" | "30d" | "90d" | "365d" | "forever";
export type CompletionSuggestionCount = 0 | 1 | 2 | 3 | 4;

export interface BraveSource {
  title: string;
  url: string;
}

export interface BraveWebResult {
  id: string;
  rank: number;
  title: string;
  url: string;
  displayUrl: string;
  description?: string;
  previewImageUrl?: string;
  faviconUrl?: string;
}

export interface BraveAIAnswer {
  answer: string;
  conversationId?: string;
  sources: BraveSource[];
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  error?: string;
}

export interface BraveAskToken {
  q: string;
  nonce: string;
  sig: string;
}

export interface BraveClientParams {
  language: string;
  country: string;
  ui_lang: string;
  safesearch: string;
  force_safesearch: "0" | "1";
  units_of_measurement: string;
  use_location: "0" | "1";
  geoloc?: string;
  premium_cookie_name?: string;
  premium_cookie_value?: string;
}

export interface BraveSearchEntry {
  id: string;
  query: string;
  normalizedQuery: string;
  createdAt: string;
  updatedAt: string;
  conversationId?: string;
  aiAnswer?: string;
  aiSources: BraveSource[];
  suggestions: string[];
  results: BraveWebResult[];
}

export interface SearchSettings {
  retention: RetentionPolicy;
  completionSuggestionCount: CompletionSuggestionCount;
}
