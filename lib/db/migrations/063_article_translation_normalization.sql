-- Persisted translation traceability for ingest/news normalization.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS original_headline TEXT,
  ADD COLUMN IF NOT EXISTS original_subheadline TEXT,
  ADD COLUMN IF NOT EXISTS original_body TEXT,
  ADD COLUMN IF NOT EXISTS translated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS translation_provider TEXT,
  ADD COLUMN IF NOT EXISTS source_language TEXT;

CREATE INDEX IF NOT EXISTS idx_articles_translation_pending
  ON articles (fetched_at DESC)
  WHERE source = 'ingest'
    AND content_kind = 'news'
    AND deleted_at IS NULL
    AND translated_at IS NULL;
