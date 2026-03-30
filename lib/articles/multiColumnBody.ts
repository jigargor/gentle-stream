/** Minimum markdown length before multi-column is considered (very short = never). */
const MULTICOLUMN_MIN_CHARS_SOFT = 1800;

/** Length at which multi-column almost always applies. */
const MULTICOLUMN_MIN_CHARS_STRONG = 3600;

/** Reading time (seconds) that implies long-form even if character count is moderate. */
const MULTICOLUMN_READING_SECS = 240; // 4 minutes

/**
 * Use CSS multi-column layout for long article bodies so text balances across
 * columns instead of a single tall strip (newspaper-style).
 */
export function shouldUseMultiColumnArticleBody(input: {
  markdownLength: number;
  readingTimeSecs?: number | null;
}): boolean {
  const { markdownLength, readingTimeSecs } = input;
  if (markdownLength < MULTICOLUMN_MIN_CHARS_SOFT) return false;
  if (markdownLength >= MULTICOLUMN_MIN_CHARS_STRONG) return true;
  if (readingTimeSecs != null && readingTimeSecs >= MULTICOLUMN_READING_SECS) {
    return true;
  }
  return markdownLength >= 2800;
}
