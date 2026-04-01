import { describe, expect, it } from "vitest";
import { generateRabbitHole } from "@/lib/games/rabbitHoleGenerator";

describe("generateRabbitHole", () => {
  it("returns deterministic output for same seed and difficulty", () => {
    const a = generateRabbitHole("medium", "seed-123");
    const b = generateRabbitHole("medium", "seed-123");
    expect(a).toEqual(b);
  });

  it("applies depth scaling by difficulty", () => {
    const easy = generateRabbitHole("easy", "depth-seed");
    const medium = generateRabbitHole("medium", "depth-seed");
    const hard = generateRabbitHole("hard", "depth-seed");
    expect(easy.links[0]?.depth).toBe(1);
    expect(medium.links[0]?.depth).toBe(2);
    expect(hard.links[0]?.depth).toBe(3);
  });

  it("includes required link metadata for gameplay card rendering", () => {
    const puzzle = generateRabbitHole("hard", "metadata-seed");
    expect(puzzle.topic.length).toBeGreaterThan(0);
    expect(puzzle.starterArticle.startsWith("https://en.wikipedia.org/wiki/")).toBe(true);
    expect(puzzle.links.length).toBeGreaterThanOrEqual(4);
    for (const link of puzzle.links) {
      expect(link.title.length).toBeGreaterThan(0);
      expect(link.href.startsWith("https://en.wikipedia.org/wiki/")).toBe(true);
      expect(link.blurb.length).toBeGreaterThan(0);
      expect(link.lure.length).toBeGreaterThan(0);
      expect(link.depth).toBeGreaterThan(0);
    }
  });
});
