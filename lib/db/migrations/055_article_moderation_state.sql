ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS moderation_status TEXT
    NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'rejected')),
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderation_confidence REAL,
  ADD COLUMN IF NOT EXISTS moderation_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by_user_id TEXT;

UPDATE articles
SET moderation_status = 'approved'
WHERE moderation_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_moderation_status
  ON articles (moderation_status);

CREATE INDEX IF NOT EXISTS idx_articles_feed_visibility
  ON articles (category, moderation_status, tagged, deleted_at);

CREATE OR REPLACE FUNCTION get_feed_articles_for_user(
  p_category TEXT,
  p_limit INT,
  p_user_id TEXT,
  p_tagged BOOLEAN,
  p_content_kinds TEXT[] DEFAULT NULL,
  p_exclude_ids UUID[] DEFAULT '{}'
)
RETURNS SETOF articles
LANGUAGE sql
STABLE
AS $$
  SELECT a.*
  FROM articles a
  WHERE a.category = p_category
    AND a.tagged = p_tagged
    AND a.deleted_at IS NULL
    AND a.moderation_status = 'approved'
    AND (
      p_category <> 'recipe'
      OR a.content_kind = 'recipe'
    )
    AND (
      p_content_kinds IS NULL
      OR cardinality(p_content_kinds) = 0
      OR a.content_kind = ANY(p_content_kinds)
    )
    AND (
      p_user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM user_seen_articles usa
        WHERE usa.user_id = p_user_id
          AND usa.article_id = a.id
      )
    )
    AND (
      cardinality(p_exclude_ids) = 0
      OR NOT (a.id = ANY(p_exclude_ids))
    )
  ORDER BY
    CASE WHEN p_tagged THEN a.quality_score END DESC NULLS LAST,
    CASE WHEN NOT p_tagged THEN a.fetched_at END DESC NULLS LAST
  LIMIT p_limit;
$$;
