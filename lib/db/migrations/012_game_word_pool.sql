-- Word search pool + per-user exposure (server-side only; service role in app).
-- Run in Supabase SQL Editor after prior migrations.

CREATE TABLE IF NOT EXISTS game_word_pool (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type    TEXT NOT NULL DEFAULT 'word_search',
  category     TEXT,
  word         TEXT NOT NULL,
  word_length  INT  NOT NULL,
  source       TEXT NOT NULL DEFAULT 'curated',
  batch_id     UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_word_pool_word_upper CHECK (word = upper(word) AND word = trim(word))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_word_pool_dedupe
  ON game_word_pool (game_type, word, COALESCE(category, ''));

CREATE INDEX IF NOT EXISTS idx_game_word_pool_lookup
  ON game_word_pool (game_type, category);

CREATE INDEX IF NOT EXISTS idx_game_word_pool_length
  ON game_word_pool (game_type, word_length);

CREATE TABLE IF NOT EXISTS user_word_search_exposure (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  word           TEXT NOT NULL,
  last_category  TEXT,
  seen_count     INT NOT NULL DEFAULT 1,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_word_exposure_word_upper CHECK (word = upper(word) AND word = trim(word)),
  CONSTRAINT ux_user_word_search UNIQUE (user_id, word)
);

CREATE INDEX IF NOT EXISTS idx_user_word_search_exposure_user
  ON user_word_search_exposure (user_id, last_seen_at DESC);

-- Batch increment exposure (avoids round-trips from the API route)
CREATE OR REPLACE FUNCTION bump_word_search_exposure(
  p_user_id TEXT,
  p_words TEXT[],
  p_category TEXT
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_word_search_exposure (user_id, word, last_category, seen_count)
  SELECT
    p_user_id,
    upper(trim(w)),
    p_category,
    1
  FROM unnest(p_words) AS t(w)
  WHERE length(upper(trim(w))) >= 3
  ON CONFLICT (user_id, word) DO UPDATE SET
    seen_count = user_word_search_exposure.seen_count + 1,
    last_seen_at = NOW(),
    last_category = COALESCE(EXCLUDED.last_category, user_word_search_exposure.last_category);
END;
$$;
