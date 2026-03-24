-- Game metrics + cloud saves. Safe if you skipped migration 005.
-- Run in Supabase SQL Editor (public schema).

-- ─── Create tables when missing (includes killer_sudoku + nonogram) ────────────
CREATE TABLE IF NOT EXISTS game_completions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  game_type         TEXT NOT NULL CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram')),
  difficulty        TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  duration_seconds  INT NOT NULL CHECK (duration_seconds >= 0),
  score             DOUBLE PRECISION,
  metadata          JSONB NOT NULL DEFAULT '{}',
  completed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_completions_user
  ON game_completions (user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS game_saves (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  game_type        TEXT NOT NULL CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram')),
  difficulty       TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  elapsed_seconds  INT NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  game_state       JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_type)
);

CREATE INDEX IF NOT EXISTS idx_game_saves_user ON game_saves (user_id);

-- ─── Widen game_type CHECK if tables already existed from older 005 ─────────
-- (Drops the 2-game constraint and replaces with 4-game; no-op duplicate if already applied.)

ALTER TABLE game_completions DROP CONSTRAINT IF EXISTS game_completions_game_type_check;
ALTER TABLE game_completions
  ADD CONSTRAINT game_completions_game_type_check
  CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram'));

ALTER TABLE game_saves DROP CONSTRAINT IF EXISTS game_saves_game_type_check;
ALTER TABLE game_saves
  ADD CONSTRAINT game_saves_game_type_check
  CHECK (game_type IN ('sudoku', 'word_search', 'killer_sudoku', 'nonogram'));

-- ─── updated_at on game_saves ─────────────────────────────────────────────────
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

-- ─── RLS (optional for server-only service role, required for direct client access)
ALTER TABLE game_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_saves ENABLE ROW LEVEL SECURITY;

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
