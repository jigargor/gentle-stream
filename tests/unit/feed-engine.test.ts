import { describe, expect, it } from "vitest";
import {
  articleUniqKey,
  cleanArticleForFeed,
  shouldBeGame,
} from "@gentle-stream/feed-engine";
import type { RawArticle } from "@gentle-stream/domain/types";

function makeRawArticle(partial?: Partial<RawArticle>): RawArticle {
  return {
    headline: "Headline",
    subheadline: "Subheadline",
    byline: "Byline",
    location: "Global",
    category: "Science & Discovery",
    body: "Body",
    pullQuote: "Quote",
    imagePrompt: "Prompt",
    sourceUrls: [],
    ...partial,
  };
}

describe("feed-engine helpers", () => {
  it("strips cite tags from feed text fields", () => {
    const input = makeRawArticle({
      headline: "Title <cite>ref</cite>",
      subheadline: "Sub <cite data-x='1'>source</cite>",
      body: "Body <cite>ignore</cite>",
      pullQuote: "Quote </cite>",
    });

    const cleaned = cleanArticleForFeed(input);
    expect(cleaned.headline).toBe("Title ref");
    expect(cleaned.subheadline).toBe("Sub source");
    expect(cleaned.body).toBe("Body ignore");
    expect(cleaned.pullQuote).toBe("Quote");
  });

  it("builds stable uniq key with id when available", () => {
    const withId = {
      ...makeRawArticle(),
      id: "article-123",
    };
    expect(articleUniqKey(withId)).toBe("id:article-123");
  });

  it("falls back to raw composite uniq key", () => {
    const article = makeRawArticle({
      category: "Health & Wellness",
      headline: "Good news",
      byline: "By Ada",
      location: "Lisbon",
    });
    expect(articleUniqKey(article)).toBe(
      "raw:Health & Wellness|Good news|By Ada|Lisbon"
    );
  });

  it("calculates game-slot placement deterministically by ratio", () => {
    expect(shouldBeGame(0, 0)).toBe(false);
    expect(shouldBeGame(2, 1)).toBe(true);
    // ratio 0.25 => period 4 => index 3, 7, 11...
    expect(shouldBeGame(2, 0.25)).toBe(false);
    expect(shouldBeGame(3, 0.25)).toBe(true);
    expect(shouldBeGame(7, 0.25)).toBe(true);
  });
});
