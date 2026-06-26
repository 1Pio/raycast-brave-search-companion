import { describe, expect, it } from "vitest";
import { limitCompletionSuggestions, prepareCompletionSuggestions } from "../src/lib/suggestions";

describe("prepareCompletionSuggestions", () => {
  it("drops Brave's first mirror suggestion before applying the configured limit", () => {
    expect(prepareCompletionSuggestions(["raycast", "raycast mac", "raycast windows"], 2)).toEqual([
      "raycast mac",
      "raycast windows",
    ]);
  });

  it("hides suggestions when configured to none", () => {
    expect(prepareCompletionSuggestions(["raycast", "raycast mac"], 0)).toEqual([]);
  });
});

describe("limitCompletionSuggestions", () => {
  it("limits cached display suggestions without dropping the first useful item again", () => {
    expect(limitCompletionSuggestions(["raycast mac", "raycast windows"], 1)).toEqual(["raycast mac"]);
  });
});
