ALTER TABLE article_engagement_events
  DROP CONSTRAINT IF EXISTS article_engagement_events_event_type_check;

ALTER TABLE article_engagement_events
  ADD CONSTRAINT article_engagement_events_event_type_check
  CHECK (
    event_type IN (
      'impression',
      'open',
      'click_through',
      'scroll_depth',
      'read_30s',
      'read_75pct',
      'read_dwell',
      'like',
      'save',
      'share'
    )
  );

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

ALTER TABLE article_submissions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_articles_deleted_at
  ON articles (deleted_at);

CREATE INDEX IF NOT EXISTS idx_article_submissions_deleted_at
  ON article_submissions (deleted_at);

CREATE TABLE IF NOT EXISTS moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES article_submissions (id) ON DELETE SET NULL,
  article_id UUID REFERENCES articles (id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_events_submission_created
  ON moderation_events (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_events_article_created
  ON moderation_events (article_id, created_at DESC);

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
      (
        CASE e.event_type
          WHEN 'impression' THEN
            0.12 * LEAST(1.0, GREATEST(0.0, COALESCE(e.event_value, 0.5)))
          WHEN 'open' THEN
            0.45
          WHEN 'click_through' THEN
            0.95 * LEAST(1.0, GREATEST(0.0, COALESCE(e.event_value, 1.0)))
          WHEN 'scroll_depth' THEN
            0.90 * LEAST(1.0, GREATEST(0.0, COALESCE(e.event_value, 0.0)))
          WHEN 'read_30s' THEN
            1.00 * LEAST(4.0, GREATEST(0.2, COALESCE(e.event_value, 30.0) / 30.0))
          WHEN 'read_75pct' THEN
            1.20 * LEAST(1.25, GREATEST(0.5, COALESCE(e.event_value, 0.75)))
          WHEN 'read_dwell' THEN
            0.35 * LN(1 + LEAST(900.0, GREATEST(0.0, COALESCE(e.event_value, 0.0))))
          WHEN 'like' THEN
            2.40
          WHEN 'save' THEN
            3.20
          WHEN 'share' THEN
            2.80
          ELSE
            0.0
        END
      )
      * EXP(-0.05 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - e.occurred_at)) / 86400.0))
    ) AS affinity_score,
    COUNT(*)::INT AS interactions,
    MAX(e.occurred_at) AS last_event_at,
    NOW() AS updated_at
  FROM article_engagement_events e
  JOIN articles a ON a.id = e.article_id
  WHERE e.user_id = p_user_id
    AND e.occurred_at >= NOW() - INTERVAL '30 days'
    AND a.deleted_at IS NULL
  GROUP BY e.user_id, a.category, COALESCE(NULLIF(a.locale, ''), 'global');
END;
$$;

