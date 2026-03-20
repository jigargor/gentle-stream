-- Migration 002: Add source_urls for URL-based deduplication
-- Run in Supabase SQL Editor after migration 001.
--
-- source_urls stores the normalized URLs of the real web pages Claude
-- used as sources when writing each article. A GIN index makes overlap
-- checks fast. Before inserting a new article we check whether any
-- existing article already references those URLs — even if Claude gave
-- the same story a different headline.

-- 1. Add column (nullable so existing rows don't error)
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS source_urls TEXT[] NOT NULL DEFAULT '{}';

-- 2. GIN index for fast array-overlap queries (@& operator)
CREATE INDEX IF NOT EXISTS idx_articles_source_urls
  ON articles USING GIN (source_urls);
