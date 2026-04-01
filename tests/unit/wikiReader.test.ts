import { describe, expect, it } from "vitest";
import {
  isAllowedEnglishWikipediaHost,
  parseEnglishWikipediaArticleTitle,
  stripUnsafeWikiHtmlFragment,
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

describe("isAllowedEnglishWikipediaHost", () => {
  it("only accepts strict host allowlist", () => {
    expect(isAllowedEnglishWikipediaHost("en.wikipedia.org")).toBe(true);
    expect(isAllowedEnglishWikipediaHost("en.m.wikipedia.org")).toBe(true);
    expect(isAllowedEnglishWikipediaHost("wikipedia.org.evil.com")).toBe(false);
    expect(isAllowedEnglishWikipediaHost("evilwikipedia.org")).toBe(false);
  });
});

describe("stripUnsafeWikiHtmlFragment", () => {
  it("removes tags to plain text", () => {
    const sanitized = stripUnsafeWikiHtmlFragment(
      `<div onclick="x()"><script>alert(1)</script><style>body{}</style>Hello <b>world</b></div>`
    );
    expect(sanitized).toContain("Hello");
    expect(sanitized).toContain("world");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("<style");
    expect(sanitized).not.toContain("<b>");
  });
});
