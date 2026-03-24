-- User role: general (default) vs creator (future Substack-style publishing).
-- Promote to creator via Supabase SQL or a future admin tool — not self-serve from the app.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS user_role TEXT NOT NULL DEFAULT 'general';

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_user_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_user_role_check
  CHECK (user_role IN ('general', 'creator'));
