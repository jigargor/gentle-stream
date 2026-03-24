/**
 * Static word banks for word search (offline + DB seed).
 * Categories align with `lib/constants.ts` feed sections.
 */

export const WORD_BANKS: Record<string, string[]> = {
  "Science & Discovery": [
    "QUANTUM", "NEURON", "GENOME", "PHOTON", "ENZYME",
    "PLASMA", "FOSSIL", "PRISM", "ORBIT", "COMET",
    "LASER", "ATOM", "HELIX", "VORTEX", "NEBULA",
    "CATALYST", "MUTATION", "SPECTRUM", "VELOCITY", "PROTON",
    "ECLIPSE", "GRAVITY", "ISOTOPE", "MOLECULE", "STELLAR",
    "THEORY", "CRYSTAL", "SPECIES", "TITAN", "PULSAR",
  ],
  "Environment & Nature": [
    "CORAL", "FOREST", "GLACIER", "WETLAND", "SAVANNA",
    "POLLEN", "CANOPY", "ESTUARY", "TUNDRA", "MANGROVE",
    "FALCON", "OTTER", "BISON", "LICHEN", "FERN",
    "HABITAT", "MIGRATION", "WATERSHED", "BIODIVERSITY", "ECOSYSTEM",
    "MEADOW", "RIPPLE", "SUMMIT", "BROOK", "CASCADE",
    "PETAL", "ROOTS", "SOLSTICE", "ZEPHYR", "MARSH",
  ],
  "Arts & Culture": [
    "MOSAIC", "SONNET", "FRESCO", "BALLAD", "MURAL",
    "CANVAS", "RHYTHM", "PALETTE", "LIBRETTO", "ETCHING",
    "FUGUE", "BRONZE", "STANZA", "OVERTURE", "MOTIF",
    "IMPROV", "TABLEAU", "NOCTURNE", "GALLERY", "SCULPT",
    "CANTATA", "DANCER", "ENCORE", "HARPIST", "LUMEN",
    "OPUS", "RELIEF", "TEMPO", "VERSE", "TIMBRE",
  ],
  "Innovation & Tech": [
    "NEURAL", "CIPHER", "SILICON", "PIXEL", "ROUTER",
    "KERNEL", "VECTOR", "CLUSTER", "PROTOCOL", "BINARY",
    "LATENCY", "CACHE", "TENSOR", "QUANTUM", "DRONE",
    "BLOCKCHAIN", "ALGORITHM", "SATELLITE", "BANDWIDTH", "COMPILER",
    "EMULATOR", "FIRMWARE", "NETWORK", "SENSOR", "TABLET",
    "UPLOAD", "SOCKET", "WIDGET", "CRYPTO", "DOMAIN",
  ],
  "Health & Wellness": [
    "CORTEX", "INSULIN", "SYNAPSE", "VITAMIN", "CARDIO",
    "COLLAGEN", "SEROTONIN", "PROTEIN", "MINDFUL", "AEROBIC",
    "IMMUNE", "NEURAL", "LYMPH", "THYROID", "MARROW",
    "STAMINA", "REFLEX", "HORMONE", "PLACEBO", "METABOLISM",
    "BALANCE", "HYDRATE", "NUTRIENT", "RESTFUL", "VITAL",
    "CALMING", "GENTLE", "RECOVERY", "THERAPY", "WELLNESS",
  ],
  "Human Kindness": [
    "EMPATHY", "SOLACE", "GENEROUS", "COMFORT", "MENTOR",
    "COURAGE", "GRATITUDE", "HUMBLE", "CARING", "WARMTH",
    "VOLUNTEER", "HARMONY", "SUPPORT", "BENEVOLENT", "SHELTER",
    "FOSTER", "KINDRED", "RESILIENT", "INSPIRE", "NURTURE",
    "WELCOME", "TENDER", "PATIENT", "LISTEN", "EMBRACE",
    "HEARTEN", "UPHOLD", "MERCY", "COMPASS", "FRIEND",
  ],
  "Community Heroes": [
    "RESCUE", "VALOR", "PATROL", "BEACON", "SERVICE",
    "BRIGADE", "MEDIC", "SHELTER", "COURAGE", "OUTREACH",
    "RESPOND", "PROTECT", "REBUILD", "SUSTAIN", "MENTOR",
    "VOLUNTEER", "STEWARD", "TRUSTEE", "ADVOCATE", "CHAMPION",
    "CAPTAIN", "RANGER", "SENTRY", "GUARD", "HONOR",
    "MISSION", "RALLY", "UNITED", "DEFEND", "AIDING",
  ],
  Education: [
    "SCHOLAR", "THESIS", "MENTOR", "CAMPUS", "LECTURE",
    "ALGEBRA", "GRAMMAR", "DEBATE", "LIBRARY", "SEMINAR",
    "INQUIRY", "RESEARCH", "DIPLOMA", "TUTOR", "SYLLABUS",
    "LITERACY", "LOGIC", "THEOREM", "ESSAY", "CURRICULUM",
    "STUDENT", "TEACHER", "WISDOM", "NOTEBOOK", "PENCIL",
    "COHORT", "DEGREE", "EXAM", "FORUM", "LAB",
  ],
};

/** Fallback theme when no category; also seeded as category NULL in DB. */
export const DEFAULT_WORDS: string[] = [
  "PUZZLE", "SEARCH", "HIDDEN", "LETTERS", "GRID",
  "WORDS", "FIND", "ACROSS", "DIAGONAL", "COLUMN",
  "BRIGHT", "CLEVER", "NIMBLE", "SWIFT", "CURIOUS",
];

/** Extra uplifting / contemplative words for the generic pool (category NULL). */
export const UPLIFT_SPIRIT_WORDS: string[] = [
  "GRACE", "MERCY", "HOPE", "FAITH", "PEACE",
  "LIGHT", "BLESS", "PRAYER", "SPIRIT", "REVERE",
  "PRAISE", "HALLOW", "DIVINE", "SACRED", "SERENE",
  "JOYFUL", "RENEW", "COMFORT", "HEAL", "TRUST",
  "GUIDE", "WISDOM", "CHARITY", "ASPIRE", "UPLIFT",
  "REFUGE", "COVENANT", "GLORY", "CHAPEL", "CHORAL",
  "ANOINT", "GOSPEL", "PSALM", "HALLEL", "BENIGN",
  "DEVOUT", "HUMBLE", "REJOICE", "THANKS", "BELOVED",
];

export function getAllStaticSeedRows(): Array<{
  category: string | null;
  word: string;
  source: string;
}> {
  const rows: Array<{ category: string | null; word: string; source: string }> =
    [];

  for (const [category, words] of Object.entries(WORD_BANKS)) {
    for (const w of words) {
      rows.push({ category, word: w.toUpperCase().trim(), source: "curated" });
    }
  }

  const generic = Array.from(
    new Set([...DEFAULT_WORDS, ...UPLIFT_SPIRIT_WORDS])
  );
  for (const w of generic) {
    rows.push({ category: null, word: w.toUpperCase().trim(), source: "curated" });
  }

  return rows;
}
