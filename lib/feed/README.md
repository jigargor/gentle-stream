# Feed selection

## Current behavior

1. **Profile-weighted categories** — `pickCategory` + per-category DB fetch (tagged, then untagged fallback).
2. **Random pool** — If nothing is available for that section (e.g. sparse DB, dev-light, all unseen exhausted), fetch a shuffled slice of **all** unexpired articles (still excluding `seenArticleIds` when possible). Slices are **rotated by `sectionIndex`**, not re-sorted by quality score (sorting would always return the same top three).
3. **Resurface** — If the pool is still empty, shuffle among unexpired articles **without** the seen filter so the feed never dead-ends when rows exist. Same rotation rule as random pool.

## Future: preferences & engagement

- Extend `FeedSelectionContext` in `selection-types.ts` with metrics (clicks, time-on-article, dismissals).
- Add candidate providers (functions that return `StoredArticle[]`) and compose them in `rankerAgent.ts` or a dedicated `composeFeedCandidates()` module.
- Keep `/api/feed` returning `FeedResponse`; add optional fields (e.g. `selectionMode` is already there) rather than breaking clients.
