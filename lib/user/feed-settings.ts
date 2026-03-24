/** Preset values for “how much of the feed is games” (0 = none, 1 = all sections). */
export const GAME_RATIO_PRESETS: ReadonlyArray<{
  value: number;
  label: string;
  description: string;
}> = [
  { value: 0, label: "No games", description: "News only" },
  { value: 0.1, label: "Light", description: "About 1 game every 10 sections" },
  { value: 0.2, label: "Balanced", description: "About 1 game every 5 sections" },
  { value: 0.35, label: "Frequent", description: "About 1 game every 3 sections" },
  { value: 0.5, label: "Half & half", description: "Roughly even mix" },
  { value: 1, label: "Games only", description: "Every section is a puzzle" },
];

export function nearestPresetValue(ratio: number): number {
  let best = GAME_RATIO_PRESETS[0]!.value;
  let bestDist = Infinity;
  for (const p of GAME_RATIO_PRESETS) {
    const d = Math.abs(p.value - ratio);
    if (d < bestDist) {
      bestDist = d;
      best = p.value;
    }
  }
  return best;
}
