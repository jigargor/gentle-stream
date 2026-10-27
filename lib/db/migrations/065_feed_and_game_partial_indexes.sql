-- Migration 065: Drop heavy body trigram + add feed/game partial indexes.
-- Run AFTER 064. Run each statement separately if Disk IO is still high.
--
-- Tip (Supabase SQL Editor): if a statement times out, raise the timeout first:
--   SET statement_timeout = '10min';

SET statement_timeout = '10min';

-- Free write amplification from the full-body gin_trgm index.
DROP INDEX IF EXISTS idx_articles_body_trgm;

CREATE INDEX IF NOT EXISTS idx_articles_feed_tagged_quality
  ON articles (category, quality_score DESC)
  WHERE tagged = TRUE
    AND deleted_at IS NULL
    AND moderation_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_articles_feed_untagged_fetched
  ON articles (category, fetched_at DESC)
  WHERE tagged = FALSE
    AND deleted_at IS NULL
    AND moderation_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_articles_untagged_queue
  ON articles (fetched_at ASC)
  WHERE tagged = FALSE
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_games_pool_lookup
  ON games (type, flavor, used_count ASC, created_at ASC);
