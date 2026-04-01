CREATE TABLE IF NOT EXISTS user_seen_articles (
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'feed',
  section_index INT,
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_user_seen_articles_user_seen_at
  ON user_seen_articles (user_id, seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_seen_articles_article_id
  ON user_seen_articles (article_id);

INSERT INTO user_seen_articles (user_id, article_id, seen_at, source, section_index)
SELECT
  up.user_id,
  a.id,
  NOW(),
  'backfill',
  NULL
FROM user_profiles up
CROSS JOIN LATERAL (
  SELECT (seen_id)::uuid AS article_id
  FROM unnest(up.seen_article_ids) AS seen_id
  WHERE (seen_id)::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
) seen
JOIN articles a
  ON a.id = seen.article_id
ON CONFLICT (user_id, article_id) DO NOTHING;

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

