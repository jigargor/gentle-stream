-- ─────────────────────────────────────────────────────────────────────────────
-- Gentle Stream — Database Schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable the uuid extension (usually already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Articles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core content (from ingest agent)
  headline        TEXT NOT NULL,
  subheadline     TEXT NOT NULL DEFAULT '',
  byline          TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL,
  body            TEXT NOT NULL,
  pull_quote      TEXT NOT NULL DEFAULT '',
  image_prompt    TEXT NOT NULL DEFAULT '',

  -- Timestamps
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',

  -- Enrichment (from tagger agent)
  tags            TEXT[]  NOT NULL DEFAULT '{}',
  sentiment       TEXT    NOT NULL DEFAULT 'uplifting',
  emotions        TEXT[]  NOT NULL DEFAULT '{}',
  locale          TEXT    NOT NULL DEFAULT 'global',
  reading_time_secs INT   NOT NULL DEFAULT 120,
  quality_score   FLOAT   NOT NULL DEFAULT 0.5,

  -- Feed mechanics
  used_count      INT     NOT NULL DEFAULT 0,
  tagged          BOOLEAN NOT NULL DEFAULT FALSE
);

-- Index for fast per-category feed queries (only untagged + unexpired)
CREATE INDEX IF NOT EXISTS idx_articles_category_tagged_expires
  ON articles (category, tagged, expires_at);

-- Index for stock check (count unread per category)
CREATE INDEX IF NOT EXISTS idx_articles_category_expires
  ON articles (category, expires_at);

-- ─── User profiles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id           TEXT PRIMARY KEY,

  -- Personalisation weights (JSON object: category → weight 0–1)
  category_weights  JSONB   NOT NULL DEFAULT '{}',
  game_ratio        FLOAT   NOT NULL DEFAULT 0.2,
  -- general = reader; creator = future self-publishing (promoted server-side only)
  user_role         TEXT    NOT NULL DEFAULT 'general'
                      CHECK (user_role IN ('general', 'creator')),

  -- Arrays stored as JSON for simplicity
  preferred_emotions TEXT[] NOT NULL DEFAULT '{}',
  preferred_locales  TEXT[] NOT NULL DEFAULT '{global}',

  -- Seen article IDs (prevent repeats in the feed)
  seen_article_ids   UUID[] NOT NULL DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Auto-update updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON user_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Cleanup: remove expired articles nightly ─────────────────────────────────
-- Call this from your cron job, or set up a Supabase scheduled function:
-- DELETE FROM articles WHERE expires_at < NOW();
