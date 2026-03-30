-- Rate-limit live game generation (avoid spammy Claude calls from serverless endpoints).
-- One row per game type, updated when we trigger an ingest run.

CREATE TABLE IF NOT EXISTS game_generation_rate_limits (
  game_type TEXT PRIMARY KEY,
  last_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_generation_rate_limits_last_generated
  ON game_generation_rate_limits (last_generated_at DESC);
