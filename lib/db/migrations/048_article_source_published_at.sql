ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS source_published_at TIMESTAMPTZ;

