-- When a username was last chosen or changed (for 24h change cooldown).
-- NULL = legacy row before this migration, or no username set.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS username_set_at TIMESTAMPTZ;
