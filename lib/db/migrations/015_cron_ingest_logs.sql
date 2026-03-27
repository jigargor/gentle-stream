CREATE TABLE IF NOT EXISTS cron_ingest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source TEXT NOT NULL DEFAULT 'vercel-cron',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  total_inserted INT NOT NULL DEFAULT 0,
  categories_checked INT NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS cron_ingest_category_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES cron_ingest_runs (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  before_count INT NOT NULL DEFAULT 0,
  requested_count INT NOT NULL DEFAULT 0,
  inserted_count INT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'none',
  newest_fetched_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_ingest_runs_started
  ON cron_ingest_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_ingest_category_runs_run
  ON cron_ingest_category_runs (run_id, created_at DESC);
