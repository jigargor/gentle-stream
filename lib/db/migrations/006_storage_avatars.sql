-- Avatars: profile columns (if you skipped 005), Storage bucket, and policies.
-- Run in Supabase SQL Editor after prior migrations.
--
-- Dashboard (one-time): Storage → New bucket → id/name: avatars → Public → Create.
-- This file can create the bucket via SQL if you prefer:

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- If you never ran 005, add display columns (safe to re-run):
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON user_profiles (LOWER(username))
  WHERE username IS NOT NULL AND TRIM(username) <> '';

-- ─── Storage RLS (for optional future *browser-direct* uploads) ───────────────
-- Server-side uploads use the service role and bypass these policies.

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own_folder" ON storage.objects;
CREATE POLICY "avatars_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_update_own_folder" ON storage.objects;
CREATE POLICY "avatars_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_delete_own_folder" ON storage.objects;
CREATE POLICY "avatars_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
