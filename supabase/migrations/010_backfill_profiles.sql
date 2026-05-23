-- Migration 010: Backfill missing profiles and subscriptions for existing users
-- Fixes: users created before migration 008 trigger don't have profiles

INSERT INTO profiles (id, email, full_name, role)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'Utilisateur'),
  COALESCE(u.raw_user_meta_data->>'role', 'parent')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

-- Also backfill subscriptions for parents without one
INSERT INTO subscriptions (parent_id, plan, status)
SELECT p.id, 'free', 'active'
FROM profiles p
WHERE p.role = 'parent'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.parent_id = p.id)
ON CONFLICT DO NOTHING;
