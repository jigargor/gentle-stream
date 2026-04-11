import { describe, expect, it } from "vitest";
import {
  buildRssFeedExcerpt,
  isRssNarrativeArticle,
  rssHasExtraContentBeyondExcerpt,
} from "@/lib/articles/rssFeedPreview";

const RSS_FOOTER =
  "This report is sourced directly from the original RSS item and preserved without a full AI rewrite.";

describe("rssFeedPreview helpers", () => {
  it("treats ingest articles with body as RSS-style feed cards (footer marker optional)", () => {
    expect(
      isRssNarrativeArticle({
        source: "ingest",
        contentKind: "news",
        body: "Lead paragraph.\n\nSecond paragraph without pipeline footer.",
      })
    ).toBe(true);
    expect(
      isRssNarrativeArticle({
        source: "ingest",
        contentKind: "news",
        body: `First paragraph.\n\n${RSS_FOOTER}`,
      })
    ).toBe(true);
  });

  it("returns false for non-ingest creator stories", () => {
    expect(
      isRssNarrativeArticle({
        source: "creator",
        body: `First paragraph.\n\n${RSS_FOOTER}`,
      })
    ).toBe(false);
  });

  it("prefers body lead for feed excerpt when present", () => {
    expect(
      buildRssFeedExcerpt({
        subheadline: "A concise description from feed metadata.",
        body: `Long paragraph from body lead.\n\n${RSS_FOOTER}`,
      })
    ).toBe("Long paragraph from body lead.");
  });

  it("strips RSS footer from body fallback excerpt", () => {
    expect(
      buildRssFeedExcerpt({
        body: `First paragraph from source item.\n\n${RSS_FOOTER}`,
      })
    ).toBe("First paragraph from source item.");
  });

  it("preserves paragraph breaks for feed excerpt when body has multiple blocks", () => {
    expect(
      buildRssFeedExcerpt(
        {
          body: `First block of narrative.\n\nSecond block continues the story.\n\n${RSS_FOOTER}`,
        },
        500
      )
    ).toBe("First block of narrative.\n\nSecond block continues the story.");
  });

  it("returns false when excerpt already covers body text", () => {
    expect(
      rssHasExtraContentBeyondExcerpt({
        subheadline: "Astronauts are scheduled to return at 5:07 p.m.",
        body: `Astronauts are scheduled to return at 5:07 p.m.\n\n${RSS_FOOTER}`,
      })
    ).toBe(false);
  });

  it("returns true when body has more narrative than excerpt", () => {
    expect(
      rssHasExtraContentBeyondExcerpt({
        subheadline: "Astronauts are scheduled to return at 5:07 p.m.",
        body:
          "Astronauts are scheduled to return at 5:07 p.m. The mission team will provide a full briefing " +
          "after splashdown, including updated timelines for payload analysis and recovery operations. " +
          "Officials added that the capsule recovery sequence includes multiple weather contingency checks " +
          "and additional public updates once crews complete post-flight inspections in the Pacific." +
          `\n\n${RSS_FOOTER}`,
      }, 120)
    ).toBe(true);
  });
});
