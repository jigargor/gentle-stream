-- Allow authenticated users to SELECT any avatar (public reads)
CREATE POLICY "avatars_select"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to INSERT into their own folder only
CREATE POLICY "avatars_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to UPDATE their own folder only
CREATE POLICY "avatars_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to DELETE their own folder only
CREATE POLICY "avatars_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);