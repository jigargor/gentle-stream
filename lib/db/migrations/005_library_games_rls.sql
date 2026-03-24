-- Library, game saves/completions, profile display fields, RLS.
-- Run in Supabase SQL Editor after prior migrations.

-- ─── Extend user_profiles (display) ───────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON user_profiles (LOWER(username))
  WHERE username IS NOT NULL AND TRIM(username) <> '';

-- ─── Game completions (metrics / history) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_completions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  game_type         TEXT NOT NULL CHECK (game_type IN ('sudoku', 'word_search')),
  difficulty        TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  duration_seconds  INT NOT NULL CHECK (duration_seconds >= 0),
  score             DOUBLE PRECISION,
  metadata          JSONB NOT NULL DEFAULT '{}',
  completed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_completions_user ON game_completions (user_id, completed_at DESC);

-- ─── In-progress saves (one row per user per game_type) ───────────────────────
CREATE TABLE IF NOT EXISTS game_saves (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  game_type        TEXT NOT NULL CHECK (game_type IN ('sudoku', 'word_search')),
  difficulty       TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  elapsed_seconds  INT NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  game_state       JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_type)
);

CREATE INDEX IF NOT EXISTS idx_game_saves_user ON game_saves (user_id);

-- Safe if you applied full schema.sql already; required if only numbered migrations ran.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON game_saves;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON game_saves
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Article likes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_likes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  article_id     UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  article_title  TEXT NOT NULL,
  liked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_likes_user ON article_likes (user_id, liked_at DESC);

-- ─── Article saves (library) ───────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_article_saves_user ON article_saves (user_id, saved_at DESC);

-- ─── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_saves ENABLE ROW LEVEL SECURITY;

-- user_profiles: each user only their row (service role bypasses for server agents)
DROP POLICY IF EXISTS "Users read own profile" ON user_profiles;
CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users insert own profile" ON user_profiles;
CREATE POLICY "Users insert own profile"
  ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "game_completions_own" ON game_completions;
CREATE POLICY "game_completions_own"
  ON game_completions FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "game_saves_own" ON game_saves;
CREATE POLICY "game_saves_own"
  ON game_saves FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "article_likes_own" ON article_likes;
CREATE POLICY "article_likes_own"
  ON article_likes FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "article_saves_own" ON article_saves;
CREATE POLICY "article_saves_own"
  ON article_saves FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
