-- Profile display columns + avatar URL (run after 001–004 in Supabase SQL Editor).
-- If you already ran an older version that only added avatar_url, re-run this whole
-- file — ADD COLUMN IF NOT EXISTS is safe.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON user_profiles (LOWER(username))
  WHERE username IS NOT NULL AND TRIM(username) <> '';

-- Storage bucket setup: Dashboard → Storage → New bucket → id `avatars` → Public.
-- Or run `006_storage_avatars.sql` / `007_avatar_policy.sql` as documented there.
--
-- File path convention for uploads: avatars/{userId}/avatar.{ext}
