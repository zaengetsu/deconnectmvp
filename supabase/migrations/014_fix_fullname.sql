-- Migration 014: Fix full_name for users whose profile was backfilled with email prefix
-- Restore from auth.users metadata if available

UPDATE profiles p
SET full_name = u.raw_user_meta_data->>'full_name'
FROM auth.users u
WHERE p.id = u.id
  AND u.raw_user_meta_data->>'full_name' IS NOT NULL
  AND u.raw_user_meta_data->>'full_name' != ''
  -- Only update if current full_name looks like an email prefix (no spaces, or contains dots/underscores)
  AND (
    p.full_name NOT LIKE '% %'
    OR p.full_name = split_part(u.email, '@', 1)
  );
