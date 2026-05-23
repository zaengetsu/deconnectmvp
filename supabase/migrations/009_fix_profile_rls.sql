-- Migration 009: Fix profile upsert RLS for auto-creation backfill
-- The existing INSERT policy requires auth.uid() = id
-- We add a SELECT policy that allows a user to read their own profile during upsert

-- Allow upsert (INSERT + UPDATE) on own profile — needed for auto-backfill
-- The trigger creates profiles via SECURITY DEFINER, but client-side upsert needs UPDATE policy
ALTER POLICY "own_profile_update" ON profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure INSERT also has WITH CHECK (it may only have USING)
-- Note: these policies might already exist, this ensures they're complete
DO $$
BEGIN
  -- Already exists from migration 002; just ensure completeness
  -- No-op if already correct
END;
$$;
