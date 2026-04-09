-- Per-user Spotify mood thumbs (up/down) to bias feed mood selection.

CREATE TABLE IF NOT EXISTS user_spotify_mood_feedback (
  user_id   TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  mood      TEXT NOT NULL,
  score     SMALLINT NOT NULL DEFAULT 0 CHECK (score >= -20 AND score <= 20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mood)
);

CREATE INDEX IF NOT EXISTS idx_user_spotify_mood_feedback_user
  ON user_spotify_mood_feedback (user_id);

ALTER TABLE user_spotify_mood_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_spotify_mood_feedback_own" ON user_spotify_mood_feedback;
CREATE POLICY "user_spotify_mood_feedback_own"
  ON user_spotify_mood_feedback FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP TRIGGER IF EXISTS set_updated_at_on_user_spotify_mood_feedback ON user_spotify_mood_feedback;
CREATE TRIGGER set_updated_at_on_user_spotify_mood_feedback
  BEFORE UPDATE ON user_spotify_mood_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
