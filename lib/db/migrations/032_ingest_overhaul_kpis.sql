-- KPI columns for ingest overhaul observability and canary comparison.

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_candidates INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_precheck_rejected INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_expansions INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_input_tokens INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS total_output_tokens INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS insert_per_1k_tokens DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_runs
  ADD COLUMN IF NOT EXISTS duplicate_skip_rate DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS candidate_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS precheck_rejected_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS expansion_count INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS input_tokens INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS output_tokens INT NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS insert_per_1k_tokens DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS duplicate_skip_rate DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE cron_ingest_category_runs
  ADD COLUMN IF NOT EXISTS pipeline_mode TEXT NOT NULL DEFAULT 'legacy';
