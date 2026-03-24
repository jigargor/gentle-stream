import { createHash } from "crypto";
import type { ConnectionsPuzzle } from "./types";

function canonicalizePuzzleForId(puzzle: ConnectionsPuzzle): string {
  const groups = [...puzzle.groups]
    .map((g) => ({
      tier: g.tier,
      label: g.label.trim().toUpperCase(),
      words: [...g.words].map((w) => w.trim().toUpperCase()).sort(),
    }))
    .sort((a, b) => a.tier - b.tier);

  const canonical = groups
    .map((g) => `${g.tier}:${g.label}:${g.words.join(",")}`)
    .join("|");
  return canonical;
}

export function makeConnectionsPuzzleId(puzzle: ConnectionsPuzzle): string {
  const canonical = canonicalizePuzzleForId(puzzle);
  const digest = createHash("sha256").update(canonical).digest("hex");
  // Short stable id; enough entropy for this pool size.
  return `conn_${digest.slice(0, 20)}`;
}

export function ensureConnectionsIdentity<T extends ConnectionsPuzzle>(
  puzzle: T
): T & { puzzleId: string; uniquenessSignature: string } {
  const puzzleId =
    puzzle.puzzleId?.trim() || puzzle.uniquenessSignature?.trim() || makeConnectionsPuzzleId(puzzle);
  return {
    ...puzzle,
    puzzleId,
    uniquenessSignature: puzzleId,
  };
}

