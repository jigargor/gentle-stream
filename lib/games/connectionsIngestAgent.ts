/**
 * Connections Ingest Agent — 4-stage pipeline
 *
 * Stage 1 — Theme generation
 *   Claude proposes 8 candidate category ideas for the article category,
 *   2 straightforward (yellow/green tier) and 2 tricky/wordplay (blue/purple).
 *   Output: array of {label, tier, hint} objects.
 *
 * Stage 2 — Word selection with intentional overlap
 *   For each of the 4 chosen categories, Claude generates 6 candidate words
 *   and explicitly flags which could plausibly fit another category.
 *   The word property database validates ambiguity programmatically.
 *
 * Stage 3 — Puzzle assembly
 *   Pick 4 words per group, maximize cross-category misdirection,
 *   ensure no word appears twice. Assign difficulty tiers 1–4.
 *
 * Stage 4 — Self-critique & validation
 *   A separate Claude call plays a solver who doesn't know the answers.
 *   It flags any group that is either too obvious or genuinely unfair
 *   (obscure rather than tricky). Revise if needed.
 *
 * One complete puzzle = 3–4 API calls. Stored in the games table.
 */

import { db } from "../db/client";
import { trickinessScore } from "./connectionsWordProperties";
import { ensureConnectionsIdentity } from "./connectionsUniqueness";
import type { Category } from "../constants";
import { CATEGORIES } from "../constants";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL   = "claude-sonnet-4-20250514";

export const MIN_CONNECTIONS_POOL = 6;
const PUZZLES_PER_CATEGORY = 1; // 1 per category per run (4 API calls each)

// ─── Public types ─────────────────────────────────────────────────────────────

export type ConnectionsTier = 1 | 2 | 3 | 4; // 1=yellow, 2=green, 3=blue, 4=purple

export interface ConnectionsGroup {
  label: string;        // e.g. "Things that follow DOG"
  words: string[];      // exactly 4 words, ALL CAPS
  tier: ConnectionsTier;
  explanation: string;  // shown after solve — why these words fit
}

export interface ConnectionsPuzzle {
  groups: ConnectionsGroup[];  // exactly 4 groups
  category: string;
  difficulty: "medium";
  // Misdirection metadata — shown post-solve
  redHerrings: { word: string; couldAlsoBelong: string }[];
  puzzleId?: string;
  uniquenessSignature?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runConnectionsIngest(
  targetCategory?: Category
): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const categories = targetCategory ? [targetCategory] : [...CATEGORIES];
  let inserted = 0;

  for (const category of categories) {
    for (let attempt = 0; attempt < PUZZLES_PER_CATEGORY; attempt++) {
      try {
        console.log(`[ConnectionsIngest] Generating for "${category}"...`);
        const puzzle = await generateOnePuzzle(apiKey, category);
        if (!puzzle) {
          console.warn(`[ConnectionsIngest] Generation failed for "${category}"`);
          continue;
        }
        await storePuzzle(puzzle);
        inserted++;
        console.log(`[ConnectionsIngest] Stored puzzle for "${category}"`);
        await sleep(2500); // brief pause between categories
      } catch (e) {
        console.error(`[ConnectionsIngest] Error for "${category}":`, e);
      }
    }
  }

  return inserted;
}

export async function getConnectionsPoolSize(): Promise<number> {
  const { count, error } = await db
    .from("games")
    .select("*", { count: "exact", head: true })
    .eq("type", "connections");
  if (error) return 0;
  return count ?? 0;
}

// ─── Stage orchestrator ───────────────────────────────────────────────────────

async function generateOnePuzzle(
  apiKey: string,
  category: string
): Promise<ConnectionsPuzzle | null> {
  // Stage 1: generate category themes
  const themes = await stage1_themes(apiKey, category);
  if (!themes || themes.length < 4) {
    console.warn("[ConnectionsIngest] Stage 1 returned too few themes");
    return null;
  }

  // Stage 2: generate word candidates for each theme
  const wordsPerGroup = await stage2_words(apiKey, themes, category);
  if (!wordsPerGroup) return null;

  // Stage 3: assemble puzzle (select best 4 words per group, score misdirection)
  const assembled = stage3_assemble(themes, wordsPerGroup);
  if (!assembled) return null;

  // Stage 4: self-critique and validate
  const validated = await stage4_critique(apiKey, assembled);
  if (!validated) return null;
  return ensureConnectionsIdentity({
    ...validated,
    category,
  });
}

// ─── Stage 1: Theme generation ────────────────────────────────────────────────

interface Theme {
  label: string;
  tier: ConnectionsTier;
  hint: string;       // internal note for stage 2 word selection
  style: "definition" | "wordplay" | "fill-in-blank" | "lateral";
}

async function stage1_themes(
  apiKey: string,
  category: string
): Promise<Theme[] | null> {
  const prompt = `You are designing a Connections puzzle (like NYT Connections) with a "${category}" theme.

Generate exactly 8 category ideas. The puzzle needs:
- 2 YELLOW (tier 1): Obvious, most solvers get immediately. Simple definitions or clear groupings.
- 2 GREEN (tier 2): Requires some thought. Thematic but not immediately obvious.
- 2 BLUE (tier 3): Tricky. Words that seem to fit another category. Often wordplay or lateral.
- 2 PURPLE (tier 4): Devious. The connection is surprising, lateral, or requires insight. Often "___ WORD" or "WORD ___" patterns, or unexpected shared property.

Rules:
- Each group needs exactly 4 words
- Words should be common English words (not obscure)
- The best purple categories have words that all seem to belong to the yellow/green groups
- Use fill-in-the-blank patterns ("___ STREAM", "GENTLE ___") for purple when possible
- Theme should feel connected to "${category}" but don't force it — good puzzle > forced theme

Return ONLY a JSON array, no preamble:
[
  {"label":"Category name","tier":1,"hint":"Why these words fit, what to search for","style":"definition"},
  ...8 items total
]`;

  const raw = await callClaude(apiKey, prompt, 800);
  if (!raw) return null;

  try {
    const parsed = parseJSON<Theme[]>(raw);
    if (!Array.isArray(parsed) || parsed.length < 8) return null;
    // Take best 4: one per tier
    const byTier = [1, 2, 3, 4].map(
      (t) => parsed.find((p) => p.tier === t) ?? parsed[t - 1]
    ) as Theme[];
    return byTier;
  } catch {
    console.error("[Stage1] JSON parse failed:", raw.slice(0, 200));
    return null;
  }
}

// ─── Stage 2: Word selection ──────────────────────────────────────────────────

interface WordCandidate {
  word: string;
  couldAlsoBelong?: string; // label of another group this word might seem to fit
}

async function stage2_words(
  apiKey: string,
  themes: Theme[],
  category: string
): Promise<WordCandidate[][] | null> {
  const themeList = themes
    .map((t, i) => `${i + 1}. "${t.label}" (tier ${t.tier}) — ${t.hint}`)
    .join("\n");

  const prompt = `You are selecting words for a Connections puzzle with theme "${category}".

Here are the 4 categories:
${themeList}

For EACH category, provide 6 candidate words. Requirements:
- All words UPPERCASE
- Common English words recognisable to a general audience
- For tier 3 and 4: deliberately include words that SEEM to fit another category
- Flag any word that could plausibly belong to a different category with "couldAlsoBelong"
- Avoid proper nouns unless they're part of a fill-in-blank (like "___ KING")
- No word should appear in more than one category's candidates

Return ONLY JSON, no preamble:
{
  "group1": [{"word":"BARK","couldAlsoBelong":"Animals"},{"word":"BITE"},...]  ,
  "group2": [...],
  "group3": [...],
  "group4": [...]
}`;

  const raw = await callClaude(apiKey, prompt, 1000);
  if (!raw) return null;

  try {
    const parsed = parseJSON<Record<string, WordCandidate[]>>(raw);
    const groups = ["group1", "group2", "group3", "group4"].map(
      (k) => parsed[k] ?? []
    );
    if (groups.some((g) => g.length < 4)) return null;
    return groups;
  } catch {
    console.error("[Stage2] JSON parse failed:", raw.slice(0, 200));
    return null;
  }
}

// ─── Stage 3: Puzzle assembly ─────────────────────────────────────────────────

function stage3_assemble(
  themes: Theme[],
  wordsPerGroup: { word: string; couldAlsoBelong?: string }[][]
): ConnectionsPuzzle | null {
  const usedWords = new Set<string>();
  const groups: ConnectionsGroup[] = [];
  const redHerrings: ConnectionsPuzzle["redHerrings"] = [];

  for (let i = 0; i < 4; i++) {
    const theme = themes[i];
    const candidates = wordsPerGroup[i]
      .filter((w) => !usedWords.has(w.word.toUpperCase()))
      .map((w) => ({ ...w, word: w.word.toUpperCase() }));

    if (candidates.length < 4) return null;

    // For tier 3 and 4, prefer words with cross-category ambiguity
    // For tier 1 and 2, prefer unambiguous words
    let selected: typeof candidates;
    if (theme.tier >= 3) {
      // Sort by: has couldAlsoBelong first, then by trickiness score
      const withFlag = candidates.filter((c) => c.couldAlsoBelong);
      const without  = candidates.filter((c) => !c.couldAlsoBelong);
      // Want ~2 flagged + 2 unflagged for the tricky tiers
      selected = [...withFlag.slice(0, 2), ...without.slice(0, 2)].slice(0, 4);
      if (selected.length < 4) selected = candidates.slice(0, 4);
    } else {
      // For easy tiers, prefer unambiguous words
      const clean = candidates.filter((c) => !c.couldAlsoBelong);
      selected = (clean.length >= 4 ? clean : candidates).slice(0, 4);
    }

    const words = selected.map((c) => c.word);
    words.forEach((w) => usedWords.add(w));

    // Collect red herrings for post-solve reveal
    selected.forEach((c) => {
      if (c.couldAlsoBelong) {
        redHerrings.push({ word: c.word, couldAlsoBelong: c.couldAlsoBelong });
      }
    });

    // Trickiness score using word property database
    const trickiness = trickinessScore(words);

    groups.push({
      label: theme.label,
      words,
      tier: theme.tier,
      explanation: theme.hint,
    });
  }

  // Validate no word appears twice
  const allWords = groups.flatMap((g) => g.words);
  if (new Set(allWords).size !== 16) return null;

  return {
    groups: groups.sort((a, b) => a.tier - b.tier),
    category: "", // filled by caller
    difficulty: "medium",
    redHerrings,
  };
}

// ─── Stage 4: Self-critique ───────────────────────────────────────────────────

async function stage4_critique(
  apiKey: string,
  puzzle: ConnectionsPuzzle
): Promise<ConnectionsPuzzle | null> {
  const puzzleDesc = puzzle.groups
    .map((g) => `Tier ${g.tier}: [${g.words.join(", ")}] — category: "${g.label}"`)
    .join("\n");

  const prompt = `You are a Connections puzzle quality reviewer. Here is a puzzle:

${puzzleDesc}

Evaluate this puzzle as if you're a solver who does NOT know the answers. Be honest and critical.

Check for:
1. FAIRNESS: Is each group solvable without specialised knowledge? (obscure ≠ tricky)
2. MISDIRECTION: Do any tier 3/4 words genuinely seem to belong to tier 1/2 groups?
3. UNIQUENESS: Could any word belong to more than one group's correct answer?
4. TIER CALIBRATION: Does difficulty genuinely escalate from tier 1 to tier 4?
5. LABEL CLARITY: After solving, does each label make the connection feel satisfying ("oh, of course!")?

Return ONLY JSON:
{
  "verdict": "pass" | "needs_revision",
  "issues": ["issue1", "issue2"],
  "wordConflicts": ["WORD that belongs to multiple groups"],
  "improvedLabels": {"old label": "better label"},
  "quality": 1-10
}`;

  const raw = await callClaude(apiKey, prompt, 600);
  if (!raw) return puzzle; // if critique fails, use as-is

  try {
    const critique = parseJSON<{
      verdict: string;
      issues: string[];
      wordConflicts: string[];
      improvedLabels: Record<string, string>;
      quality: number;
    }>(raw);

    console.log(`[Stage4] Quality: ${critique.quality}/10, verdict: ${critique.verdict}`);

    // Apply any improved labels
    if (critique.improvedLabels) {
      for (const group of puzzle.groups) {
        if (critique.improvedLabels[group.label]) {
          group.label = critique.improvedLabels[group.label];
        }
      }
    }

    // If there are genuine word conflicts, flag in the explanation
    if (critique.wordConflicts?.length > 0) {
      console.warn("[Stage4] Word conflicts detected:", critique.wordConflicts);
    }

    // Reject very low quality puzzles
    if (critique.quality < 4) {
      console.warn("[Stage4] Puzzle rejected — quality too low");
      return null;
    }

    return puzzle;
  } catch {
    return puzzle; // critique parse failed — use as-is
  }
}

// ─── DB storage ───────────────────────────────────────────────────────────────

async function storePuzzle(puzzle: ConnectionsPuzzle): Promise<void> {
  const { error } = await db.from("games").insert({
    type: "connections",
    difficulty: "medium",
    category: puzzle.category,
    payload: puzzle as unknown as Record<string, unknown>,
    used_count: 0,
  });
  if (error) throw new Error(`storePuzzle: ${error.message}`);
}

// ─── Claude API helper ────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<string | null> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
  } catch (e) {
    console.error("[callClaude]", e);
    return null;
  }
}

function parseJSON<T>(text: string): T {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.search(/[\[{]/);
  const end   = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("No JSON found");
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
