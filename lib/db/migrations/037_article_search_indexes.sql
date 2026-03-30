-- Search acceleration for headline/body and tag-based queries.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_articles_headline_trgm
  ON articles USING gin (headline gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_articles_subheadline_trgm
  ON articles USING gin (subheadline gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_articles_body_trgm
  ON articles USING gin (body gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_articles_tags_gin
  ON articles USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_articles_creator_explicit_tags_gin
  ON articles USING gin (creator_explicit_tags);
