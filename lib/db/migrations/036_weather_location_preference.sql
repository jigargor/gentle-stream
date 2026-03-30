ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS weather_location TEXT;
