/**
 * Test: Connections game data rules + domain helpers.
 *
 * Run from project root:
 *   npx tsx scripts/test-connections.ts
 */

import { CATEGORIES } from "../lib/constants";
import type { ConnectionsPuzzle } from "../lib/games/connectionsIngestAgent";
import {
  getWordDomains,
  sharesAnyDomain,
  trickinessScore,
} from "../lib/games/connectionsWordProperties";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    if (detail) console.error(`     ${detail}`);
    failed++;
  }
}

const FIXTURE: ConnectionsPuzzle = {
  category: "Science & Discovery",
  difficulty: "medium",
  groups: [
    {
      label: "Tree parts",
      words: ["BARK", "ROOT", "TRUNK", "LEAF"],
      tier: 1,
      explanation: "All are botanical terms tied to trees.",
    },
    {
      label: "Music terms",
      words: ["KEY", "NOTE", "SCALE", "REST"],
      tier: 2,
      explanation: "All are common terms in musical notation/theory.",
    },
    {
      label: "Finance words",
      words: ["BOND", "STOCK", "YIELD", "RETURN"],
      tier: 3,
      explanation: "All are investing/markets vocabulary.",
    },
    {
      label: "Can be verbs",
      words: ["PLAY", "DRIVE", "MATCH", "TURN"],
      tier: 4,
      explanation: "Each also functions as a common verb.",
    },
  ],
  redHerrings: [
    { word: "BARK", couldAlsoBelong: "Dog commands" },
    { word: "KEY", couldAlsoBelong: "Objects that open locks" },
  ],
};

function validatePuzzleShape(puzzle: ConnectionsPuzzle): void {
  console.log("\n── Puzzle shape ────────────────────────────────────────────────");

  assert(
    CATEGORIES.includes(puzzle.category as (typeof CATEGORIES)[number]),
    "Category is one of app categories",
    `got "${puzzle.category}"`
  );
  assert(puzzle.difficulty === "medium", 'Difficulty is "medium"');
  assert(puzzle.groups.length === 4, `Exactly 4 groups (got ${puzzle.groups.length})`);

  const tiers = puzzle.groups.map((g) => g.tier).sort((a, b) => a - b);
  assert(
    JSON.stringify(tiers) === JSON.stringify([1, 2, 3, 4]),
    "Group tiers are exactly [1,2,3,4]",
    `got ${JSON.stringify(tiers)}`
  );

  const allWords = puzzle.groups.flatMap((g) => g.words);
  assert(allWords.length === 16, `Exactly 16 puzzle words (got ${allWords.length})`);
  assert(
    new Set(allWords).size === 16,
    "All 16 words are unique across groups"
  );
  assert(
    allWords.every((w) => /^[A-Z]+$/.test(w)),
    "All words are uppercase A-Z only"
  );

  const allGroupsHaveFour = puzzle.groups.every((g) => g.words.length === 4);
  assert(allGroupsHaveFour, "Each group has exactly 4 words");

  const redHerringsArePuzzleWords = puzzle.redHerrings.every((rh) =>
    allWords.includes(rh.word)
  );
  assert(
    redHerringsArePuzzleWords,
    "Every red herring references a word in puzzle groups"
  );
}

function validateDomainHelpers(): void {
  console.log("\n── Word property helpers ─────────────────────────────────────");

  const barkDomains = getWordDomains("bark");
  assert(
    barkDomains.includes("tree") && barkDomains.includes("dog"),
    "getWordDomains() is case-insensitive and returns expected domains",
    `got ${JSON.stringify(barkDomains)}`
  );

  assert(
    sharesAnyDomain("BARK", "ROOT"),
    "sharesAnyDomain() finds overlap where expected"
  );
  assert(
    !sharesAnyDomain("CARAMEL", "WINDOW"),
    "sharesAnyDomain() returns false for unrelated words"
  );

  const lowTrick = trickinessScore(["CARAMEL", "WINDOW", "KNIGHT", "CURTAIN"]);
  const highTrick = trickinessScore(["BARK", "ROOT", "TRUNK", "LEAF"]);
  assert(
    highTrick >= lowTrick,
    "trickinessScore() is higher for more semantically overlapping sets",
    `low=${lowTrick} high=${highTrick}`
  );
}

function validateGroupCoherence(puzzle: ConnectionsPuzzle): void {
  console.log("\n── Group coherence sanity ─────────────────────────────────────");

  for (const group of puzzle.groups) {
    const score = trickinessScore(group.words);
    assert(
      score >= 1,
      `Group "${group.label}" has at least one overlapping-domain pair`,
      `score=${score}`
    );
  }
}

console.log("══════════════════════════════════════════════");
console.log("  Connections Game Tests");
console.log("══════════════════════════════════════════════");

validatePuzzleShape(FIXTURE);
validateDomainHelpers();
validateGroupCoherence(FIXTURE);

console.log("\n══════════════════════════════════════════════");
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);

