-- Article engagement event stream (impressions, opens, reads, likes, saves, shares).
-- Append-only table for ranking features and analytics.

CREATE TABLE IF NOT EXISTS article_engagement_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  article_id  UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (
    event_type IN (
      'impression',
      'open',
      'read_30s',
      'read_75pct',
      'like',
      'save',
      'share'
    )
  ),
  event_value DOUBLE PRECISION,
  session_id  TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_article_engagement_user_time
  ON article_engagement_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_engagement_article_time
  ON article_engagement_events (article_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_engagement_type_time
  ON article_engagement_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_engagement_context_gin
  ON article_engagement_events USING GIN (context);

ALTER TABLE article_engagement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "article_engagement_own_select" ON article_engagement_events;
CREATE POLICY "article_engagement_own_select"
  ON article_engagement_events FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "article_engagement_own_insert" ON article_engagement_events;
CREATE POLICY "article_engagement_own_insert"
  ON article_engagement_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

