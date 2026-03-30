import { describe, expect, it } from "vitest";
import { shouldUseMultiColumnArticleBody } from "@/lib/articles/multiColumnBody";

describe("shouldUseMultiColumnArticleBody", () => {
  it("returns false for short copy", () => {
    expect(
      shouldUseMultiColumnArticleBody({ markdownLength: 500 })
    ).toBe(false);
  });

  it("returns true for very long copy", () => {
    expect(
      shouldUseMultiColumnArticleBody({ markdownLength: 4000 })
    ).toBe(true);
  });

  it("returns true when reading time is long enough", () => {
    expect(
      shouldUseMultiColumnArticleBody({
        markdownLength: 2000,
        readingTimeSecs: 300,
      })
    ).toBe(true);
  });
});
