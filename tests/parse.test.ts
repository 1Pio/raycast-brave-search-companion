import { describe, expect, it } from "vitest";
import { parseAIStream, parseAskPage, parseSearchPage, parseSuggestionPayload } from "../src/lib/parse";

describe("parseSuggestionPayload", () => {
  it("extracts and deduplicates OpenSearch-style suggestions", () => {
    expect(parseSuggestionPayload(["raycast", ["Raycast", "raycast", "raycast mac", 12]])).toEqual([
      "Raycast",
      "raycast mac",
    ]);
  });
});

describe("parseSearchPage", () => {
  it("extracts the chat conversation and top web results from Brave page state", () => {
    const html = `
      <script>
        __sveltekit_data = {
          web:{type:"search",choice:void 0,results:[
            {title:"Raycast - Store",url:"https://www.raycast.com/store",description:"Search extensions.",profile:{img:"https://example.com/profile.png"},meta_url:{netloc:"raycast.com",hostname:"www.raycast.com",favicon:"https://example.com/favicon.ico"},thumbnail:{src:"https://imgs.search.brave.com/preview.jpg",original:"https://raycast.com/preview.jpg"}},
            {title:"Ignored",url:"javascript:void(0)",description:"bad"}
          ]},
          chatllm:{query:"raycast extension",conversation:"0940f4774e8542337255e807b5a134735185",trigger:true}
        }
      </script>
    `;

    const parsed = parseSearchPage(html);

    expect(parsed.conversationId).toBe("0940f4774e8542337255e807b5a134735185");
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({
      rank: 1,
      title: "Raycast - Store",
      url: "https://www.raycast.com/store",
      displayUrl: "raycast.com",
      previewImageUrl: "https://imgs.search.brave.com/preview.jpg",
      faviconUrl: "https://example.com/favicon.ico",
    });
  });
});

describe("parseAskPage", () => {
  it("extracts the Ask token and browser client params", () => {
    const parsed = parseAskPage(`
      searchLang:"en",country:"us",language:"en-us",safesearch:"moderate",forceSafesearch:false,units:"metric",useLocation:true,geoLocation:"24.454x54.406",premiumCookieName:"__Secure-sku#brave-search-premium",
      token:{q:"raycast extension",nonce:"nonce-1",sig:"sig-1"}
    `);

    expect(parsed.token).toEqual({ q: "raycast extension", nonce: "nonce-1", sig: "sig-1" });
    expect(parsed.clientParams).toMatchObject({
      language: "en",
      country: "us",
      ui_lang: "en-us",
      safesearch: "moderate",
      force_safesearch: "0",
      units_of_measurement: "metric",
      use_location: "1",
      geoloc: "24.454x54.406",
    });
  });
});

describe("parseAIStream", () => {
  it("builds an answer from SSE JSON events and extracts sources", () => {
    const stream = [
      'data: {"type":"inline_entity","name":"Raycast"}',
      'data: {"type":"text_start"}',
      'data: {"type":"text_delta","delta":" extensions are scripts"}',
      'data: {"type":"augment_with_web","service_response":{"web":{"results":[{"title":"Raycast Docs","url":"https://developers.raycast.com/"}]}}}',
      "data: [DONE]",
    ].join("\n");

    const parsed = parseAIStream(stream);

    expect(parsed.answer).toBe("Raycast extensions are scripts");
    expect(parsed.sources).toEqual([{ title: "Raycast Docs", url: "https://developers.raycast.com/" }]);
  });
});
