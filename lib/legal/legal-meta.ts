const fallbackLastUpdated = "March 30, 2026";

export const LEGAL_LAST_UPDATED =
  process.env.NEXT_PUBLIC_LEGAL_LAST_UPDATED?.trim() || fallbackLastUpdated;
