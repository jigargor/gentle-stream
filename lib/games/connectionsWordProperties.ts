/**
 * lib/games/connectionsWordProperties.ts
 *
 * A curated word property database used by the Connections ingest agent.
 * Each entry lists the semantic domains a word belongs to — used to
 * programmatically verify that a word genuinely fits multiple categories
 * before using it as a red herring.
 *
 * This replaces RAG. The bottleneck for Connections quality is creative
 * misdirection, not factual recall. A flat lookup is faster, cheaper,
 * and more reliable than a vector database for this purpose.
 *
 * Format: WORD → array of domain tags
 * Tags are intentionally broad so cross-category overlap is easy to detect.
 */

export const WORD_PROPERTIES: Record<string, string[]> = {
  // ── Animals ─────────────────────────────────────────────────────────────────
  BARK:    ["dog", "tree", "sound", "boat", "verb"],
  BITE:    ["dog", "food", "insect", "verb", "injury"],
  FETCH:   ["dog", "computing", "verb", "errand"],
  SIT:     ["dog", "posture", "verb", "meditation"],
  STAY:    ["dog", "hotel", "verb", "music"],
  HEEL:    ["dog", "shoe", "body", "bread", "verb"],
  ROLL:    ["dog", "bread", "music", "verb", "drum", "bowling"],
  DOWN:    ["dog", "direction", "feathers", "music", "verb", "football"],
  PLAY:    ["dog", "music", "theater", "verb", "children"],
  SHAKE:   ["dog", "drink", "verb", "music", "earthquake"],
  SPEAK:   ["dog", "verb", "language"],
  COME:    ["dog", "verb", "direction"],

  // ── Nature / Weather ────────────────────────────────────────────────────────
  BANK:    ["river", "money", "verb", "snow", "cloud"],
  BED:     ["river", "furniture", "garden", "verb", "sleep"],
  MOUTH:   ["river", "body", "cave", "speech"],
  SPRING:  ["season", "water", "metal", "verb", "jump"],
  FALL:    ["season", "verb", "direction", "autumn", "waterfall"],
  BOLT:    ["lightning", "door", "fabric", "verb", "food"],
  FLASH:   ["lightning", "light", "verb", "photography", "news"],
  STRIKE:  ["lightning", "bowling", "work", "verb", "match"],
  CROWN:   ["tree", "royalty", "teeth", "head", "body", "verb"],
  TRUNK:   ["tree", "elephant", "car", "swimming", "luggage"],
  LIMB:    ["tree", "body", "verb"],
  ROOT:    ["tree", "music", "verb", "origin", "vegetable"],
  BRANCH:  ["tree", "bank", "verb", "government"],
  LEAF:    ["tree", "book", "verb", "gold"],
  PATCH:   ["garden", "software", "fabric", "verb", "eye"],

  // ── Music ───────────────────────────────────────────────────────────────────
  SHARP:   ["music", "knife", "adjective", "taste"],
  FLAT:    ["music", "tire", "adjective", "apartment"],
  BRIDGE:  ["music", "structure", "card", "nose", "technology", "verb"],
  CHORUS:  ["music", "singing", "repeating"],
  SCALE:   ["music", "fish", "weight", "verb", "mountain"],
  REST:    ["music", "sleep", "verb", "remaining"],
  NOTE:    ["music", "money", "verb", "letter"],
  MEASURE: ["music", "verb", "quantity", "unit"],
  KEY:     ["music", "door", "island", "adjective", "computer"],
  SOLO:    ["music", "adjective", "brand", "flight"],
  BEAT:    ["music", "verb", "rhythm", "police"],
  BASS:    ["music", "fish", "adjective"],
  PITCH:   ["music", "baseball", "sales", "tar", "verb", "tent"],
  STAFF:   ["music", "employees", "stick", "magic"],
  CLEF:    ["music"],

  // ── Money / Finance ─────────────────────────────────────────────────────────
  BILL:    ["money", "name", "law", "bird", "theater", "verb"],
  BUCK:    ["money", "animal", "verb"],
  CHANGE:  ["money", "verb", "clothes"],
  POOL:    ["money", "swimming", "verb", "billiards", "car"],
  MINT:    ["money", "food", "herb", "color", "adjective", "candy"],
  BOND:    ["money", "connection", "spy", "verb", "name"],
  INTEREST:["money", "attention", "adjective"],
  YIELD:   ["money", "farming", "verb", "traffic"],
  RETURN:  ["money", "verb", "tennis"],
  STOCK:   ["money", "food", "adjective", "livestock"],
  HEDGE:   ["money", "garden", "verb"],
  CAPITAL: ["money", "city", "adjective", "letters"],

  // ── Sport ───────────────────────────────────────────────────────────────────
  COURT:   ["sport", "law", "royalty", "verb"],
  FAULT:   ["sport", "geology", "error"],
  LOVE:    ["sport", "emotion", "noun", "verb"],
  LET:     ["sport", "verb", "apartment"],
  BREAK:   ["sport", "verb", "rest", "music", "news"],
  MATCH:   ["sport", "fire", "verb", "similarity"],
  SET:     ["sport", "verb", "noun", "sun", "music"],
  GAME:    ["sport", "hunting", "adjective", "verb"],
  DRIVE:   ["sport", "verb", "road", "computer"],
  IRON:    ["sport", "metal", "verb", "clothes"],
  WOOD:    ["sport", "material", "name", "forest"],
  STROKE:  ["sport", "art", "medical", "verb", "swim"],
  LAP:     ["sport", "body", "verb", "liquid"],

  // ── Food ────────────────────────────────────────────────────────────────────
  BATTER:  ["food", "sport", "verb"],
  FLOUR:   ["food", "baking"],
  SAGE:    ["food", "adjective", "herb", "color"],
  MAROON:  ["food", "color", "verb"],
  PLUM:    ["food", "color", "adjective", "name"],
  OLIVE:   ["food", "color", "name", "tree"],
  ROSE:    ["food", "flower", "verb", "color", "name"],
  CARAMEL: ["food", "color"],
  PEPPER:  ["food", "verb", "name", "spice"],
  HONEY:   ["food", "adjective", "name", "bee"],
  CHESTNUT:["food", "color", "tree", "joke"],
  TOAST:   ["food", "verb", "bread", "celebration"],
  STEW:    ["food", "verb", "name"],
  CLUB:    ["food", "sandwich", "organization", "verb", "music", "card"],

  // ── Colors (as secondary meanings) ──────────────────────────────────────────
  BLUE:    ["color", "music", "emotion", "verb"],
  GREEN:   ["color", "environment", "adjective", "golf", "name"],
  ORANGE:  ["color", "food", "name", "show"],
  VIOLET:  ["color", "name", "flower"],
  JADE:    ["color", "material", "name"],
  RUBY:    ["color", "name", "gem", "language"],
  AMBER:   ["color", "material", "name"],
  CORAL:   ["color", "animal", "name"],
  IVORY:   ["color", "material", "name"],
  CREAM:   ["color", "food", "verb"],
  TEAL:    ["color", "bird", "name"],

  // ── Directions / Positions ───────────────────────────────────────────────────
  RIGHT:   ["direction", "adjective", "verb", "politics", "law"],
  LEFT:    ["direction", "verb", "politics"],
  LEAD:    ["direction", "metal", "verb", "music", "theater"],
  CROSS:   ["direction", "adjective", "verb", "religion", "hybrid"],
  DRAW:    ["direction", "art", "verb", "sport", "guns"],
  RUN:     ["direction", "verb", "sport", "tights", "politics", "machine"],
  PASS:    ["direction", "verb", "sport", "mountain", "document"],
  TURN:    ["direction", "verb", "cooking", "chance"],
  SWING:   ["direction", "verb", "music", "playground", "politics"],

  // ── Technology ──────────────────────────────────────────────────────────────
  BUG:     ["technology", "animal", "verb", "listening"],
  CRASH:   ["technology", "verb", "accident", "party"],
  THREAD:  ["technology", "sewing", "verb", "conversation"],
  FRAME:   ["technology", "art", "verb", "structure", "innocence"],
  HOST:    ["technology", "verb", "person", "biology"],
  PORT:    ["technology", "water", "wine", "body"],
  SHELL:   ["technology", "animal", "verb", "missile"],
  WINDOW:  ["technology", "architecture", "verb", "opportunity"],
  CLOUD:   ["technology", "weather", "verb", "emotion"],
  BOOT:    ["technology", "shoe", "verb", "car"],
  COOKIE:  ["technology", "food", "name"],

  // ── Theater / Performance ────────────────────────────────────────────────────
  ACT:     ["theater", "verb", "law", "music"],
  CAST:    ["theater", "fishing", "medical", "verb"],
  STAGE:   ["theater", "verb", "race", "development"],
  PLOT:    ["theater", "land", "verb", "conspiracy"],
  CURTAIN: ["theater", "furniture", "end"],
  CUE:     ["theater", "sport", "verb"],
  LIGHT:   ["theater", "adjective", "verb", "weight"],
  BOX:     ["theater", "verb", "container", "sport"],
  SPOT:    ["theater", "verb", "adjective", "location"],

  // ── Body parts (secondary meanings) ─────────────────────────────────────────
  ELBOW:   ["body", "verb", "pasta"],
  CHEST:   ["body", "furniture", "treasure"],
  SHOULDER:["body", "verb", "road"],
  PALM:    ["body", "tree", "verb"],
  TEMPLE:  ["body", "religion", "name"],
  RIB:     ["body", "food", "verb", "architecture"],
  SHIN:    ["body", "verb"],
  CAP:     ["body", "clothing", "verb", "limit", "chemistry"],

  // ── Royalty / Power ──────────────────────────────────────────────────────────
  REIGN:   ["royalty", "verb", "homophone"],
  RULE:    ["royalty", "verb", "measuring", "school"],
  PRINCE:  ["royalty", "name", "music", "frog"],
  DUKE:    ["royalty", "name", "verb", "food"],
  JACK:    ["royalty", "name", "verb", "tool", "car", "pirate"],
  ACE:     ["royalty", "sport", "adjective", "name", "military"],
  KNIGHT:  ["royalty", "chess", "homophone"],
  BISHOP:  ["royalty", "chess", "religion", "name"],
  QUEEN:   ["royalty", "chess", "music", "bee"],
  KING:    ["royalty", "chess", "name", "bed"],
};

/**
 * Returns all semantic domains for a word.
 * Case-insensitive.
 */
export function getWordDomains(word: string): string[] {
  return WORD_PROPERTIES[word.toUpperCase()] ?? [];
}

/**
 * Check if two words share at least one domain — useful for detecting
 * potential red herrings (words that could fit multiple categories).
 */
export function sharesAnyDomain(wordA: string, wordB: string): boolean {
  const a = new Set(getWordDomains(wordA));
  const b = getWordDomains(wordB);
  return b.some((d) => a.has(d));
}

/**
 * Score how "tricky" a set of 4 words is — higher = more cross-domain overlap,
 * meaning more potential for misdirection.
 */
export function trickinessScore(words: string[]): number {
  let score = 0;
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (sharesAnyDomain(words[i], words[j])) score++;
    }
  }
  return score; // max = 6 (all pairs share a domain)
}
