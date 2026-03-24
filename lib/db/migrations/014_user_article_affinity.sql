-- Lightweight per-user affinity snapshot for recommendation scoring.
-- Stores decayed engagement strength by category and locale.

CREATE TABLE IF NOT EXISTS user_article_affinity (
  user_id         TEXT NOT NULL,
  category        TEXT NOT NULL,
  locale          TEXT NOT NULL DEFAULT 'global',
  affinity_score  DOUBLE PRECISION NOT NULL DEFAULT 0,
  interactions    INT NOT NULL DEFAULT 0,
  last_event_at   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, category, locale)
);

CREATE INDEX IF NOT EXISTS idx_user_article_affinity_user_score
  ON user_article_affinity (user_id, affinity_score DESC, updated_at DESC);

ALTER TABLE user_article_affinity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_article_affinity_own_select" ON user_article_affinity;
CREATE POLICY "user_article_affinity_own_select"
  ON user_article_affinity FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

-- Optional helper: rebuild one user's affinity from last 30 days of events.
-- Weight map:
--   impression 0.2, open 0.6, read_30s 1.0, read_75pct 1.4, like 2.0, save 3.0, share 2.5
CREATE OR REPLACE FUNCTION refresh_user_article_affinity(p_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM user_article_affinity WHERE user_id = p_user_id;

  INSERT INTO user_article_affinity (
    user_id,
    category,
    locale,
    affinity_score,
    interactions,
    last_event_at,
    updated_at
  )
  SELECT
    e.user_id,
    a.category,
    COALESCE(NULLIF(a.locale, ''), 'global') AS locale,
    SUM(
      CASE e.event_type
        WHEN 'impression' THEN 0.2
        WHEN 'open' THEN 0.6
        WHEN 'read_30s' THEN 1.0
        WHEN 'read_75pct' THEN 1.4
        WHEN 'like' THEN 2.0
        WHEN 'save' THEN 3.0
        WHEN 'share' THEN 2.5
        ELSE 0
      END
      * EXP(-0.05 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - e.occurred_at)) / 86400.0))
    ) AS affinity_score,
    COUNT(*)::INT AS interactions,
    MAX(e.occurred_at) AS last_event_at,
    NOW() AS updated_at
  FROM article_engagement_events e
  JOIN articles a ON a.id = e.article_id
  WHERE e.user_id = p_user_id
    AND e.occurred_at >= NOW() - INTERVAL '30 days'
  GROUP BY e.user_id, a.category, COALESCE(NULLIF(a.locale, ''), 'global');
END;
$$;

