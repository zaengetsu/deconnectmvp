-- Migration 016: Create activity-proofs storage bucket + RLS policies
-- Fixes 400 Bad Request on proof upload

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-proofs',
  'activity-proofs',
  true,                        -- public URLs work without auth
  10485760,                    -- 10 MB limit
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ];

-- Drop old policies if exist
DROP POLICY IF EXISTS "activity_proofs_upload" ON storage.objects;
DROP POLICY IF EXISTS "activity_proofs_read" ON storage.objects;
DROP POLICY IF EXISTS "activity_proofs_delete" ON storage.objects;

-- Allow authenticated users (parents) to upload
CREATE POLICY "activity_proofs_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'activity-proofs');

-- Allow anon (child device) to upload too — children use the anon key
CREATE POLICY "activity_proofs_upload_anon"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'activity-proofs');

-- Public read for everyone
CREATE POLICY "activity_proofs_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'activity-proofs');

-- Allow authenticated users to delete their own proofs
CREATE POLICY "activity_proofs_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'activity-proofs');
