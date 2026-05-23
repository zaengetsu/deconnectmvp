-- Migration 011: QR code child-device linking
-- Parent generates a QR token from ChildDetailPage
-- Child scans it from their device to link to the child profile

CREATE TABLE IF NOT EXISTS child_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  pin_hash text,            -- Stores bcrypt of the child's PIN
  device_id text,           -- Device fingerprint after linking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  linked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Token generation trigger
CREATE OR REPLACE FUNCTION generate_link_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW.token := encode(extensions.gen_random_bytes(16), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_link_token
  BEFORE INSERT ON child_link_tokens
  FOR EACH ROW EXECUTE FUNCTION generate_link_token();

ALTER TABLE child_link_tokens ENABLE ROW LEVEL SECURITY;

-- Parents can create/read their own tokens
CREATE POLICY "parent_link_tokens" ON child_link_tokens
  FOR ALL USING (auth.uid() = parent_id);

-- Public read for pending tokens (child scans from unauthenticated device)
CREATE POLICY "public_pending_tokens" ON child_link_tokens
  FOR SELECT USING (status = 'pending' AND expires_at > now());

-- RPC: Parent generates a link token for a child
CREATE OR REPLACE FUNCTION create_child_link_token(p_child_id uuid)
RETURNS text AS $$
DECLARE
  v_parent_id uuid;
  v_token text;
BEGIN
  SELECT parent_id INTO v_parent_id FROM children WHERE id = p_child_id;
  IF v_parent_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Expire old tokens for this child
  UPDATE child_link_tokens SET status = 'expired'
  WHERE child_id = p_child_id AND status = 'pending';

  -- Create new token (15 min expiry)
  INSERT INTO child_link_tokens (child_id, parent_id)
  VALUES (p_child_id, auth.uid())
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Child device claims a token (sets PIN + links)
CREATE OR REPLACE FUNCTION claim_child_link_token(p_token text, p_pin text, p_device_id text DEFAULT NULL)
RETURNS json AS $$
DECLARE
  v_link child_link_tokens%ROWTYPE;
  v_child children%ROWTYPE;
  v_parent profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM child_link_tokens
  WHERE token = p_token AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'QR code invalide ou expiré');
  END IF;

  SELECT * INTO v_child FROM children WHERE id = v_link.child_id;
  SELECT * INTO v_parent FROM profiles WHERE id = v_link.parent_id;

  -- Update token: mark as linked, store PIN hash + device
  UPDATE child_link_tokens
  SET status = 'linked',
      linked_at = now(),
      pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      device_id = p_device_id
  WHERE id = v_link.id;

  -- Store PIN hash on the child record too for future logins
  UPDATE children SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
  WHERE id = v_child.id;

  RETURN json_build_object(
    'success', true,
    'child', json_build_object(
      'id', v_child.id,
      'display_name', v_child.display_name,
      'avatar_url', v_child.avatar_url,
      'age', v_child.age,
      'level', v_child.level,
      'total_points', v_child.total_points
    ),
    'parent_name', v_parent.full_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Child PIN login (from linked device)
CREATE OR REPLACE FUNCTION child_pin_login(p_child_id uuid, p_pin text)
RETURNS json AS $$
DECLARE
  v_child children%ROWTYPE;
BEGIN
  SELECT * INTO v_child FROM children WHERE id = p_child_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Profil introuvable');
  END IF;

  IF v_child.pin_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Aucun PIN configuré');
  END IF;

  IF v_child.pin_hash != extensions.crypt(p_pin, v_child.pin_hash) THEN
    RETURN json_build_object('success', false, 'error', 'PIN incorrect');
  END IF;

  RETURN json_build_object(
    'success', true,
    'child', json_build_object(
      'id', v_child.id,
      'display_name', v_child.display_name,
      'avatar_url', v_child.avatar_url,
      'age', v_child.age,
      'level', v_child.level,
      'total_points', v_child.total_points
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add pin_hash column to children table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'children' AND column_name = 'pin_hash'
  ) THEN
    ALTER TABLE children ADD COLUMN pin_hash text;
  END IF;
END;
$$;
