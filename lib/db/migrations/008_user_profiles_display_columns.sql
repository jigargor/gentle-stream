-- Fix: "Could not find the 'display_name' column of 'user_profiles' in the schema cache"
--
-- Cause: An older 006 migration only added avatar_url. The app also needs display_name
-- and username for Profile / updateUserDisplay.
--
-- Run this once in Supabase → SQL Editor. Idempotent (safe to re-run).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON user_profiles (LOWER(username))
  WHERE username IS NOT NULL AND TRIM(username) <> '';

-- If PostgREST still complains after a few seconds: Dashboard → Project Settings
-- → API → reload / restart (wording varies by Supabase version).
