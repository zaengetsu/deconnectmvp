-- Migration 007: Child invitation pipeline
-- Parent can invite child by email or phone number

CREATE TABLE IF NOT EXISTS child_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('email', 'phone')),
  recipient text NOT NULL,           -- email address OR phone number
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Token generation trigger
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW.token := encode(extensions.gen_random_bytes(24), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invitation_token
  BEFORE INSERT ON child_invitations
  FOR EACH ROW EXECUTE FUNCTION generate_invitation_token();

ALTER TABLE child_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parent_invitations" ON child_invitations FOR ALL
  USING (auth.uid() = parent_id);

-- Public read for invitation acceptance (by token only)
CREATE POLICY "public_invite_accept" ON child_invitations FOR SELECT
  USING (status = 'pending' AND expires_at > now());

-- RPC: Create invitation (returns token)
CREATE OR REPLACE FUNCTION create_child_invitation(
  p_child_id uuid,
  p_method text,
  p_recipient text
) RETURNS text AS $$
DECLARE
  v_parent_id uuid;
  v_token text;
BEGIN
  -- Verify child belongs to calling parent
  SELECT parent_id INTO v_parent_id FROM children WHERE id = p_child_id;
  IF v_parent_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Cancel any pending invitations for this child
  UPDATE child_invitations
  SET status = 'cancelled'
  WHERE child_id = p_child_id AND status = 'pending';

  -- Create new invitation
  INSERT INTO child_invitations (child_id, parent_id, method, recipient)
  VALUES (p_child_id, auth.uid(), p_method, p_recipient)
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Accept invitation (marks as accepted, returns child info)
CREATE OR REPLACE FUNCTION accept_child_invitation(p_token text)
RETURNS json AS $$
DECLARE
  v_inv child_invitations%ROWTYPE;
  v_child children%ROWTYPE;
  v_parent profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM child_invitations
  WHERE token = p_token AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lien invalide ou expiré');
  END IF;

  SELECT * INTO v_child FROM children WHERE id = v_inv.child_id;
  SELECT * INTO v_parent FROM profiles WHERE id = v_inv.parent_id;

  UPDATE child_invitations SET status = 'accepted', accepted_at = now() WHERE id = v_inv.id;

  RETURN json_build_object(
    'success', true,
    'child', json_build_object(
      'id', v_child.id,
      'display_name', v_child.display_name,
      'avatar_url', v_child.avatar_url,
      'level', v_child.level,
      'total_points', v_child.total_points
    ),
    'parent_name', v_parent.full_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
