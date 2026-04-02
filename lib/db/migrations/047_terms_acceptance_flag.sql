-- Persist Terms acceptance server-side on user profile.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

