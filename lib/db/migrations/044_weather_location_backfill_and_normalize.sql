-- Normalize + backfill weather locations so every user has a valid default.
-- Existing free-text values are whitespace/punctuation-normalized.
-- Empty/invalid values are set to "San Jose, CA, US".

UPDATE user_profiles
SET weather_location = NULL
WHERE weather_location IS NOT NULL
  AND btrim(weather_location) = '';

UPDATE user_profiles
SET weather_location = regexp_replace(weather_location, '\s+', ' ', 'g')
WHERE weather_location IS NOT NULL;

UPDATE user_profiles
SET weather_location = btrim(weather_location, ',.;:/\|_- ')
WHERE weather_location IS NOT NULL;

UPDATE user_profiles
SET weather_location = left(weather_location, 120)
WHERE weather_location IS NOT NULL
  AND char_length(weather_location) > 120;

UPDATE user_profiles
SET weather_location = 'San Jose, CA, US'
WHERE weather_location IS NULL
   OR btrim(weather_location) = '';
