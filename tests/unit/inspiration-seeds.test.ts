import { describe, expect, it } from "vitest";
import { buildInspirationContextSeeds } from "@/lib/creator/inspiration-seeds";

describe("buildInspirationContextSeeds", () => {
  it("uses article type tone hints for recipes", () => {
    const seeds = buildInspirationContextSeeds({
      articleType: "recipe",
      headline: "Weeknight pasta",
    });

    expect(seeds).toContain("warm");
    expect(seeds).toContain("inviting");
  });

  it("includes headline keywords before static fallbacks", () => {
    const seeds = buildInspirationContextSeeds({
      headline: "Breakthrough discovery in quantum research",
    });

    expect(seeds[0]).toBe("breakthrough");
    expect(seeds).toContain("discovery");
  });
});
