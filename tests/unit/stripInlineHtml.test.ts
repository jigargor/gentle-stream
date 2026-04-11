import { describe, expect, it } from "vitest";
import { stripInlineHtmlToPlainText } from "@gentle-stream/feed-engine";

describe("stripInlineHtmlToPlainText", () => {
  it("removes script blocks including non-standard closing tags (whitespace / junk before >)", () => {
    const malicious =
      "a<script>evil()</script\t\n bar>b<script src=x>z</script>c";
    expect(stripInlineHtmlToPlainText(malicious)).toBe("a b c");
  });

  it("removes style blocks with a lax closing tag", () => {
    const input = "x<style>.c{color:red}</style\t>y";
    expect(stripInlineHtmlToPlainText(input)).toBe("x y");
  });

  it("still strips ordinary tags after script removal", () => {
    expect(stripInlineHtmlToPlainText("<p>Hi</p>")).toBe("Hi");
  });
});
