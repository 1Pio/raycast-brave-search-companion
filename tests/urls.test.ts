import { describe, expect, it } from "vitest";
import {
  buildAIStreamUrl,
  buildAskUrl,
  buildSearchUrl,
  buildSuggestUrl,
  buildTapNewUrl,
  buildTapStreamUrl,
} from "../src/lib/urls";

describe("Brave URLs", () => {
  it("builds search and ask URLs", () => {
    expect(buildSearchUrl("raycast extension")).toBe("https://search.brave.com/search?q=raycast+extension");
    expect(buildAskUrl("raycast extension", "abc123")).toBe(
      "https://search.brave.com/ask?q=raycast+extension&source=llmSuggest&conversation=abc123",
    );
  });

  it("builds API URLs", () => {
    expect(buildSuggestUrl("raycast")).toBe("https://search.brave.com/api/suggest?q=raycast");
    expect(buildAIStreamUrl("abc123")).toBe(
      "https://search.brave.com/api/chatllm/with_ask?conversation=abc123&enable_inline_entities=true",
    );
    const clientParams = {
      language: "en",
      country: "us",
      ui_lang: "en-us",
      safesearch: "moderate",
      force_safesearch: "0" as const,
      units_of_measurement: "metric",
      use_location: "0" as const,
    };
    expect(
      buildTapNewUrl({ q: "raycast extension", nonce: "nonce", sig: "sig" }, "key", clientParams),
    ).toBe(
      "https://search.brave.com/api/tap/v1/new?language=en&country=us&ui_lang=en-us&safesearch=moderate&force_safesearch=0&units_of_measurement=metric&use_location=0&symmetric_key=key&source=llmSuggest&enable_research=false&q=raycast+extension&nonce=nonce&sig=sig",
    );
    expect(buildTapStreamUrl("conversation", "raycast extension", "key", clientParams)).toBe(
      "https://search.brave.com/api/tap/v1/stream?language=en&country=us&ui_lang=en-us&safesearch=moderate&force_safesearch=0&units_of_measurement=metric&use_location=0&id=conversation&query=raycast+extension&symmetric_key=key&enable_inline_entities=true",
    );
  });
});
