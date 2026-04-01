ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS weather_unit_system TEXT NOT NULL DEFAULT 'metric'
  CHECK (weather_unit_system IN ('metric', 'imperial'));

UPDATE user_profiles
SET weather_unit_system = 'metric'
WHERE weather_unit_system IS NULL OR TRIM(weather_unit_system) = '';
