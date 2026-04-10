import { describe, expect, it, vi } from "vitest";
import { weightedPickMood } from "@/lib/feed/modules/spotify";

describe("weightedPickMood", () => {
  it("uses uniform pick when scores are empty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(weightedPickMood(["alpha", "beta"], {})).toBe("alpha");
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    expect(weightedPickMood(["alpha", "beta"], null)).toBe("beta");
    vi.restoreAllMocks();
  });

  it("favors moods with higher stored scores", () => {
    const counts = { chill: 0, focus: 0 };
    for (let i = 0; i < 3000; i++) {
      const m = weightedPickMood(["chill", "focus"], { chill: 12, focus: -12 });
      if (m === "chill") counts.chill++;
      else counts.focus++;
    }
    expect(counts.chill).toBeGreaterThan(counts.focus * 1.5);
  });
});
