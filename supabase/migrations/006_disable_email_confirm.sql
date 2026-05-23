-- Migration 006: Custom password reset tokens for Brevo email flow
-- Note: Supabase email confirmation must be disabled via Dashboard:
-- Authentication → Providers → Email → uncheck "Confirm email"

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Password reset tokens table — token generated via trigger
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Generate token before insert
CREATE OR REPLACE FUNCTION generate_reset_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW.token := encode(extensions.gen_random_bytes(32), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_reset_token
  BEFORE INSERT ON password_reset_tokens
  FOR EACH ROW EXECUTE FUNCTION generate_reset_token();

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access" ON password_reset_tokens FOR ALL USING (false);


-- Function to create a reset token and return it
CREATE OR REPLACE FUNCTION create_password_reset_token(p_email text)
RETURNS text AS $$
DECLARE
  v_user_id uuid;
  v_token text;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email AND deleted_at IS NULL;
  IF NOT FOUND THEN
    -- Return dummy to prevent email enumeration
    RETURN encode(extensions.gen_random_bytes(8), 'hex');
  END IF;

  -- Invalidate old tokens
  UPDATE password_reset_tokens SET used_at = now()
  WHERE user_id = v_user_id AND used_at IS NULL AND expires_at > now();

  -- Create new token
  INSERT INTO password_reset_tokens (user_id) VALUES (v_user_id) RETURNING token INTO v_token;
  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate and use a reset token
CREATE OR REPLACE FUNCTION use_password_reset_token(p_token text, p_new_password text)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM password_reset_tokens
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Token invalide ou expiré');
  END IF;

  UPDATE password_reset_tokens SET used_at = now() WHERE token = p_token;

  -- Update password via Supabase auth admin function
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_user_id;

  RETURN json_build_object('success', true, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
