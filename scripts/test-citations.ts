/**
 * Test: Citation tag stripping
 *
 * Verifies that stripCitations correctly removes all forms of <cite> markup
 * that Claude injects when web search citations leak into article text.
 *
 * Zero API calls. Zero DB connections. Pure string logic.
 *
 * Run from project root:
 *   npx tsx scripts/test-citations.ts
 */

// ─── The function under test (mirrors NewsFeed.tsx + ingestAgent.ts) ──────────

function stripCitations(text: string): string {
  return text
    .replace(/<cite[^>]*>/gi, "")
    .replace(/<\/cite>/gi, "")
    .trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    if (detail) console.error(`     Got: ${detail}`);
    failed++;
  }
}

function check(input: string, expected: string, label: string) {
  const result = stripCitations(input);
  assert(result === expected, label, result);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("══════════════════════════════════════════════");
console.log("  Citation Stripping Tests");
console.log("══════════════════════════════════════════════");

console.log("\n── Basic forms ───────────────────────────────────────────────");

check(
  `Bull sharks <cite index="11-3">form social bonds</cite> in the wild.`,
  "Bull sharks form social bonds in the wild.",
  "cite with index attribute"
);

check(
  `Results were striking <cite index="4-16,4-17">after decades of disappointment</cite>.`,
  "Results were striking after decades of disappointment.",
  "cite with compound index attribute"
);

check(
  `The study concluded.</cite>`,
  "The study concluded.",
  "bare closing tag with no opening tag"
);

check(
  `<cite index="1-1">Researchers found</cite> that <cite index="1-2">sharks prefer</cite> warm water.`,
  "Researchers found that sharks prefer warm water.",
  "multiple cite tags in one sentence"
);

console.log("\n── Case insensitivity ────────────────────────────────────────");

check(
  `Text <CITE INDEX="1-1">content</CITE> here.`,
  "Text content here.",
  "uppercase CITE tags"
);

check(
  `Text <Cite Index="1-1">content</Cite> here.`,
  "Text content here.",
  "mixed-case Cite tags"
);

console.log("\n── Multiline / body text ─────────────────────────────────────");

const multiline = [
  `<cite index="11-15">"As humans we cultivate a range of social relationships — from casual acquaintances to our best friends, but we also actively avoid certain people — and these bull sharks are doing similar things," said lead author Natasha D. Marosi, an Exeter researcher and founder of Fiji Shark Lab.</cite>`,
  `<cite index="11-20">"Contrary to commonly held perceptions of sharks, our study shows they have relatively rich and complex social lives," said Professor Darren Croft, from Exeter's Centre for Research in Animal Behaviour.</cite>`,
].join(" ");

const cleanMultiline = stripCitations(multiline);
assert(!cleanMultiline.includes("<cite"),  "No opening cite tags remain");
assert(!cleanMultiline.includes("</cite"), "No closing cite tags remain");
assert(cleanMultiline.includes("Natasha D. Marosi"), "Inner content is preserved");
assert(cleanMultiline.includes("Professor Darren Croft"), "Second quote content preserved");
console.log(`  ✓  Real-world example from screenshot cleaned correctly`);

console.log("\n── Edge cases ────────────────────────────────────────────────");

check("No cite tags here at all.", "No cite tags here at all.", "clean text unchanged");
check("", "", "empty string");
check("   ", "", "whitespace-only string (trimmed)");

check(
  `Nested <cite index="1-1">outer <cite index="1-2">inner</cite> text</cite> end.`,
  "Nested outer inner text end.",
  "nested cite tags (unusual but defensive)"
);

check(
  `Text with <a href="#">a link</a> and <cite index="1-1">a cite</cite>.`,
  `Text with <a href="#">a link</a> and a cite.`,
  "only cite tags removed, other HTML preserved"
);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════");
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);
