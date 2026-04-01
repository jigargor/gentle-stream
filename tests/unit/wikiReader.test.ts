import { describe, expect, it } from "vitest";
import {
  parseEnglishWikipediaArticleTitle,
  wikiHtmlApiPathForTitle,
} from "@/lib/games/wikiReader";

describe("parseEnglishWikipediaArticleTitle", () => {
  it("parses desktop article URLs", () => {
    expect(parseEnglishWikipediaArticleTitle("https://en.wikipedia.org/wiki/Linear_A")).toBe(
      "Linear A"
    );
  });

  it("parses mobile host", () => {
    expect(
      parseEnglishWikipediaArticleTitle("https://en.m.wikipedia.org/wiki/Deep_sea_creature")
    ).toBe("Deep sea creature");
  });

  it("rejects other hosts and namespaces", () => {
    expect(parseEnglishWikipediaArticleTitle("https://fr.wikipedia.org/wiki/Paris")).toBeNull();
    expect(parseEnglishWikipediaArticleTitle("https://en.wikipedia.org/wiki/Special:Search")).toBeNull();
  });
});

describe("wikiHtmlApiPathForTitle", () => {
  it("builds REST path with percent-encoded title", () => {
    expect(wikiHtmlApiPathForTitle("Linear A")).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/html/Linear%20A"
    );
  });
});
