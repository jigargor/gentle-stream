import type { FeedSection } from "@/lib/types";

export const FEED_PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
/** Bumped when persisted snapshot shape or mix semantics change (invalidates stale on-disk feeds). */
export const FEED_PERSIST_VERSION = 2;
export const FEED_PERSIST_MAX_SECTIONS_DEFAULT = 48;
export const FEED_PERSIST_MAX_BYTES_DEFAULT = 350_000;

export interface PersistedFeedSnapshot {
  version: number;
  userId: string;
  createdAtMs: number;
  sectionCount: number;
  articleSectionsRendered: number;
  /** Mix used when this snapshot was written — reject hydrate if it no longer matches. */
  feedGameRatio?: number;
  sections: FeedSection[];
  renderedArticleKeys: string[];
  renderedDbArticleIds: string[];
}

export function persistedFeedStorageKey(userId: string): string {
  return `gentle_stream_feed_sections_v${FEED_PERSIST_VERSION}:${userId}`;
}

export function buildPersistedFeedPayload(input: {
  snapshot: PersistedFeedSnapshot;
  maxSections: number;
  maxBytes: number;
}): string | null {
  const boundedSections = input.snapshot.sections.slice(-input.maxSections);
  let snapshot: PersistedFeedSnapshot = {
    ...input.snapshot,
    sectionCount: boundedSections.length,
    sections: boundedSections,
  };
  let payload = JSON.stringify(snapshot);
  if (payload.length <= input.maxBytes) return payload;

  const minKeep = Math.min(8, boundedSections.length);
  let keepCount = boundedSections.length;
  while (payload.length > input.maxBytes && keepCount > minKeep) {
    keepCount -= 4;
    snapshot = {
      ...snapshot,
      sectionCount: keepCount,
      sections: boundedSections.slice(-keepCount),
    };
    payload = JSON.stringify(snapshot);
  }

  return payload.length <= input.maxBytes ? payload : null;
}

export function readPersistedFeedSnapshot(
  raw: string | null,
  userId: string,
  gameRatio: number
): PersistedFeedSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedFeedSnapshot;
    if (
      !parsed ||
      parsed.version !== FEED_PERSIST_VERSION ||
      parsed.userId !== userId ||
      !Array.isArray(parsed.sections)
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAtMs > FEED_PERSIST_TTL_MS) return null;
    const snapRatio = parsed.feedGameRatio;
    if (
      typeof snapRatio !== "number" ||
      Number.isNaN(snapRatio) ||
      Math.abs(snapRatio - gameRatio) > 0.02
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
