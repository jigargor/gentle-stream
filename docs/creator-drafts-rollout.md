# Creator Drafts Rollout and Rollback

## Migration Order
1. Apply `061_creator_drafts.sql`.
2. Apply `062_creator_feature_flags.sql`.
3. Reload Supabase API schema cache.

## Backfill
- No mandatory data backfill is required for first rollout.
- Existing `article_submissions` remain source-of-truth for moderation history.
- Optional one-time backfill can create one draft per most recent pending submission per creator.

## Feature Flag Rollout
- Use `creator_feature_flags` to roll out by scope:
  - `global` for baseline defaults,
  - `cohort` for staged rollout (`creator_default`, `creator_canary`),
  - `user` for targeted opt-in/rollback.
- Suggested flags:
  - `drafts_enabled`
  - `draft_autosave_enabled`
  - `assist_streaming_enabled`
  - `assist_structured_output_enabled`
  - `analyst_worker_enabled`

## Rollback Plan
- Disable rollout flags immediately (`global` false or cohort/user overrides).
- Keep tables in place; they are additive and safe.
- If needed, soft-disable APIs by checking feature flags and returning `503`.

## Operational Checks
- Verify draft write rate limits are active.
- Verify assist route rate limits and burst behavior.
- Verify RLS policies for drafts and draft versions under authenticated users.
- Validate export/delete path in `/api/creator/data-portability`.
