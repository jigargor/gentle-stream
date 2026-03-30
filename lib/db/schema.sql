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
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT '2100-01-01T00:00:00.000Z',

  -- Enrichment (from tagger agent)
  tags            TEXT[]  NOT NULL DEFAULT '{}',
  sentiment       TEXT    NOT NULL DEFAULT 'uplifting',
  emotions        TEXT[]  NOT NULL DEFAULT '{}',
  locale          TEXT    NOT NULL DEFAULT 'global',
  reading_time_secs INT   NOT NULL DEFAULT 120,
  quality_score   FLOAT   NOT NULL DEFAULT 0.5,

  -- Feed mechanics
  used_count      INT     NOT NULL DEFAULT 0,
  tagged          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Source metadata
  source          TEXT    NOT NULL DEFAULT 'ingest'
                    CHECK (source IN ('ingest', 'creator')),
  author_user_id  TEXT,
  submission_id   UUID,
  creator_explicit_tags TEXT[] NOT NULL DEFAULT '{}'
);

-- Index for fast per-category feed queries
CREATE INDEX IF NOT EXISTS idx_articles_category_tagged_expires
  ON articles (category, tagged, expires_at);

-- Index for stock check (count unread per category)
CREATE INDEX IF NOT EXISTS idx_articles_category_expires
  ON articles (category, expires_at);

CREATE INDEX IF NOT EXISTS idx_articles_source_tagged
  ON articles (source, tagged);

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

  display_name       TEXT,
  username           TEXT,
  avatar_url         TEXT,
  username_set_at    TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON user_profiles (LOWER(username))
  WHERE username IS NOT NULL AND TRIM(username) <> '';

-- ─── Creator publishing ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_profiles (
  user_id                    TEXT PRIMARY KEY REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  pen_name                   TEXT NOT NULL,
  bio                        TEXT NOT NULL DEFAULT '',
  interest_categories        TEXT[] NOT NULL DEFAULT '{}',
  website_url                TEXT,
  locale                     TEXT,
  timezone                   TEXT,
  guidelines_acknowledged_at TIMESTAMPTZ,
  onboarding_completed_at    TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id      TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  headline            TEXT NOT NULL,
  subheadline         TEXT NOT NULL DEFAULT '',
  body                TEXT NOT NULL,
  pull_quote          TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL,
  locale              TEXT NOT NULL DEFAULT 'global',
  explicit_hashtags   TEXT[] NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  admin_note          TEXT,
  rejection_reason    TEXT,
  reviewed_by_user_id TEXT,
  reviewed_at         TIMESTAMPTZ,
  published_article_id UUID REFERENCES articles (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_submissions_status_created_at
  ON article_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_submissions_author_created_at
  ON article_submissions (author_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_article_submissions_published_article_unique
  ON article_submissions (published_article_id)
  WHERE published_article_id IS NOT NULL;

ALTER TABLE articles
  ADD CONSTRAINT articles_submission_id_fkey
  FOREIGN KEY (submission_id) REFERENCES article_submissions (id) ON DELETE SET NULL;

-- ─── Game completions & saves (user metrics + resume) ─────────────────────────
CREATE TABLE IF NOT EXISTS game_completions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  game_type         TEXT NOT NULL CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram', 'crossword', 'connections')),
  difficulty        TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  duration_seconds  INT NOT NULL CHECK (duration_seconds >= 0),
  score             DOUBLE PRECISION,
  metadata          JSONB NOT NULL DEFAULT '{}',
  completed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_saves (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  game_type        TEXT NOT NULL CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram', 'crossword', 'connections')),
  difficulty       TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  elapsed_seconds  INT NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  game_state       JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_type)
);

CREATE TABLE IF NOT EXISTS article_likes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  article_id     UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  article_title  TEXT NOT NULL,
  liked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, article_id)
);

CREATE TABLE IF NOT EXISTS article_saves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  article_id     UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  article_title  TEXT NOT NULL,
  article_url    TEXT,
  summary        TEXT,
  saved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, article_id)
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

DROP TRIGGER IF EXISTS set_updated_at_on_creator_profiles ON creator_profiles;
CREATE TRIGGER set_updated_at_on_creator_profiles
  BEFORE UPDATE ON creator_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_on_article_submissions ON article_submissions;
CREATE TRIGGER set_updated_at_on_article_submissions
  BEFORE UPDATE ON article_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Cleanup (TTL disabled) ────────────────────────────────────────────────────
-- Article TTL expiry is disabled; keep this note so old runbooks do not attempt
-- to delete rows by expires_at.
