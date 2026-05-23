-- Migration 015: Family members + Task scheduling
-- 1) family_members: co-parents & educators linked to children
-- 2) family_invitations: email/QR invite for co-parents
-- 3) parent_role on profiles: Maman / Papa / Éducateur / Tuteur
-- 4) child_activities: assigned_by, scheduled_for, expires_at, recurrence

-- ════════════════════════════════════════════════════════════════
-- 1. Parent role type on profile
-- ════════════════════════════════════════════════════════════════
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS parent_role text DEFAULT 'parent'
  CHECK (parent_role IN ('maman', 'papa', 'educateur', 'tuteur', 'parent'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_emoji text DEFAULT '👤';

-- ════════════════════════════════════════════════════════════════
-- 2. Family members (co-parent / educator access to children)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner is the primary parent who created the child profile
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Member is the co-parent / educator being granted access
  member_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  member_email text NOT NULL,
  member_role text NOT NULL DEFAULT 'co_parent'
    CHECK (member_role IN ('co_parent', 'educator', 'grandparent', 'babysitter')),
  -- Scope: which children can this member see?
  child_ids uuid[] DEFAULT NULL, -- NULL = all children of owner
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked')),
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family_member_owner" ON family_members
  FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "family_member_self" ON family_members
  FOR SELECT USING (auth.uid() = member_id);

-- ════════════════════════════════════════════════════════════════
-- 3. Family invitations (email or QR)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS family_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'co_parent',
  invite_email text,           -- NULL if QR-based
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(20), 'hex'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family_invitation_owner" ON family_invitations
  FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "family_invitation_public_read" ON family_invitations
  FOR SELECT USING (status = 'pending' AND expires_at > now());

-- ════════════════════════════════════════════════════════════════
-- 4. Task scheduling on child_activities
-- ════════════════════════════════════════════════════════════════
ALTER TABLE child_activities
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by_role text, -- snapshot of role at assignment time
  ADD COLUMN IF NOT EXISTS scheduled_for date,    -- specific date (NULL = anytime)
  ADD COLUMN IF NOT EXISTS expires_at timestamptz, -- task expires after this
  ADD COLUMN IF NOT EXISTS recurrence_type text DEFAULT 'none'
    CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'custom')),
  ADD COLUMN IF NOT EXISTS recurrence_days integer[] DEFAULT NULL; -- [1,2,3,4,5] = Mon-Fri

-- ════════════════════════════════════════════════════════════════
-- 5. RPC: Create family invitation
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_family_invitation(
  p_member_role text,
  p_invite_email text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_token text;
  v_owner_name text;
BEGIN
  SELECT full_name INTO v_owner_name FROM profiles WHERE id = auth.uid();

  INSERT INTO family_invitations (owner_id, member_role, invite_email)
  VALUES (auth.uid(), p_member_role, p_invite_email)
  RETURNING token INTO v_token;

  RETURN json_build_object(
    'token', v_token,
    'owner_name', v_owner_name,
    'role', p_member_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
-- 6. RPC: Accept family invitation
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION accept_family_invitation(p_token text)
RETURNS json AS $$
DECLARE
  v_inv family_invitations%ROWTYPE;
  v_owner profiles%ROWTYPE;
  v_member profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM family_invitations
  WHERE token = p_token AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invitation invalide ou expirée');
  END IF;

  SELECT * INTO v_member FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_owner FROM profiles WHERE id = v_inv.owner_id;

  -- Mark invitation accepted
  UPDATE family_invitations SET status = 'accepted' WHERE id = v_inv.id;

  -- Add as family member
  INSERT INTO family_members (owner_id, member_id, member_email, member_role, status, joined_at)
  VALUES (v_inv.owner_id, auth.uid(), v_member.email, v_inv.member_role, 'active', now())
  ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'owner_name', v_owner.full_name,
    'your_role', v_inv.member_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
-- 7. RLS: Family members can see children they have access to
-- ════════════════════════════════════════════════════════════════
-- Allow family members to read children they've been granted access to
CREATE POLICY "family_member_children_read" ON children
  FOR SELECT USING (
    auth.uid() = parent_id
    OR EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.member_id = auth.uid()
        AND fm.owner_id = children.parent_id
        AND fm.status = 'active'
        AND (fm.child_ids IS NULL OR children.id = ANY(fm.child_ids))
    )
  );

-- Allow family members to create/update child_activities
CREATE POLICY "family_member_assign_activities" ON child_activities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM children c
      WHERE c.id = child_activities.child_id
      AND (
        c.parent_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM family_members fm
          WHERE fm.member_id = auth.uid()
            AND fm.owner_id = c.parent_id
            AND fm.status = 'active'
        )
      )
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 8. Auto-expire tasks (mark expired as 'rejected' with reason)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION expire_overdue_tasks()
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
  UPDATE child_activities
  SET status = 'rejected',
      rejection_reason = 'Tâche expirée automatiquement',
      rejected_at = now()
  WHERE expires_at IS NOT NULL
    AND expires_at < now()
    AND status IN ('available', 'selected');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
