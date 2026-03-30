-- Extend ingest cron logging for robust monitoring and debugging.

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_attempted INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_skipped INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_failed INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_retried INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS warning_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS error_summary TEXT;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS attempted_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS failed_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS duration_ms INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS warning_flag BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS error_summary TEXT;
