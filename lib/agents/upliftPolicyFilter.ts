interface PolicyCheckInput {
  headline?: string;
  subheadline?: string;
  body?: string;
  rationale?: string;
}

export interface PolicyCheckResult {
  accepted: boolean;
  reason: string | null;
  matchedTerm: string | null;
}

const DISALLOWED_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: "political", pattern: /\b(election|ballot|campaign|parliament|senate|congress|prime minister|president|governor|mayor|policy debate|geopolitic|political)\b/i },
  { reason: "conflict", pattern: /\b(war|military strike|airstrike|missile|invasion|battlefield|ceasefire|armed conflict)\b/i },
  { reason: "crime", pattern: /\b(murder|homicide|assault|kidnapp|traffick|robbery|shooting|arrested|charged with)\b/i },
  { reason: "tragedy", pattern: /\b(death|died|killed|fatal|funeral|obituary|mourning|memorial|grieving)\b/i },
  { reason: "disaster", pattern: /\b(earthquake|tsunami|wildfire|flooding|hurricane|cyclone|tornado|landslide|catastrophe)\b/i },
  { reason: "solemn", pattern: /\b(vigil|remembrance service|solemn|somber|somberly|tribute after loss)\b/i },
];

const UPLIFT_SIGNAL_PATTERN =
  /\b(uplifting|kindness|breakthrough|recovery|joy|celebrate|community support|volunteer|innovation|conservation success|education win|milestone)\b/i;

function normalizeInput(input: PolicyCheckInput): string {
  return [input.headline, input.subheadline, input.rationale, input.body]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" \n ")
    .slice(0, 4000);
}

export function checkUpliftPolicy(input: PolicyCheckInput): PolicyCheckResult {
  const text = normalizeInput(input);
  if (!text)
    return {
      accepted: false,
      reason: "empty",
      matchedTerm: null,
    };

  for (const rule of DISALLOWED_PATTERNS) {
    const match = rule.pattern.exec(text);
    if (match)
      return {
        accepted: false,
        reason: rule.reason,
        matchedTerm: match[0] ?? null,
      };
  }

  const hasUpliftSignal = UPLIFT_SIGNAL_PATTERN.test(text);
  if (!hasUpliftSignal)
    return {
      accepted: false,
      reason: "low_uplift_signal",
      matchedTerm: null,
    };

  return {
    accepted: true,
    reason: null,
    matchedTerm: null,
  };
}
