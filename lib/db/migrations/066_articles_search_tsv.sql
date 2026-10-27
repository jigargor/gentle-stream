-- Migration 066: Generated FTS column + GIN index (HEAVIEST step).
-- Run AFTER 065, preferably when Disk IO % remaining is healthy.
--
-- Why this timed out before: ADD COLUMN ... GENERATED ... STORED rewrites
-- every row in `articles`. Do not combine with other DDL in one editor run.
--
-- Optional: use the Supabase SQL Editor "Run" on each block separately.

-- Block 1 — raise timeout for this session only
SET statement_timeout = '30min';

-- Block 2 — table rewrite (slow). Safe to re-run: IF NOT EXISTS.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(headline, '') || ' ' || coalesce(subheadline, '') || ' ' || coalesce(body, '')
    )
  ) STORED;

-- Block 3 — GIN index (also slow). Prefer CONCURRENTLY outside a transaction
-- if the SQL Editor allows it; otherwise this CREATE INDEX IF NOT EXISTS is fine.
CREATE INDEX IF NOT EXISTS idx_articles_search_tsv
  ON articles USING gin (search_tsv);
