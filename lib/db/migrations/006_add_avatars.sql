-- Migration 004: Avatar support
-- Run in Supabase SQL Editor after migrations 001–003.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Storage bucket setup is done via Dashboard UI (see comments below)
-- or via the JS client in scripts/setup-storage.ts
--
-- Bucket name:  avatars
-- Public:       YES
-- Max size:     2 MB
-- MIME types:   image/jpeg, image/png, image/webp, image/gif
--
-- RLS Policies to add in Dashboard → Storage → avatars → Policies:
--
-- SELECT (read):
--   bucket_id = 'avatars'
--
-- INSERT (upload):
--   bucket_id = 'avatars'
--   AND (storage.foldername(name))[1] = auth.uid()::text
--
-- UPDATE:
--   bucket_id = 'avatars'
--   AND (storage.foldername(name))[1] = auth.uid()::text
--
-- DELETE:
--   bucket_id = 'avatars'
--   AND (storage.foldername(name))[1] = auth.uid()::text
--
-- File path convention: avatars/{userId}/avatar.{ext}
-- Same path on re-upload = automatic replacement, no orphans.
