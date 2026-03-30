ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS theme_preference TEXT
  CHECK (theme_preference IN ('light', 'dark'));
