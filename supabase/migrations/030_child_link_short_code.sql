-- 030 — Lien appareil enfant : code court à saisir « à la place » du QR
--
-- Le QR encode un jeton hexadécimal de 32 caractères, impossible à taper.
-- Chaque jeton reçoit désormais aussi un code court de 6 caractères
-- (alphabet sans ambiguïté : pas de 0/O, 1/I/L) que le parent lit à voix haute
-- et que l'enfant saisit sur son téléphone. Le code n'est valable que tant que
-- le jeton l'est (15 minutes, un seul usage).

ALTER TABLE child_link_tokens ADD COLUMN IF NOT EXISTS short_code text;

CREATE UNIQUE INDEX IF NOT EXISTS child_link_tokens_short_code_pending_idx
  ON child_link_tokens (short_code) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION generate_link_short_code()
RETURNS text AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
BEGIN
  LOOP
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM child_link_tokens WHERE short_code = v_code AND status = 'pending'
    );
  END LOOP;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Le trigger existant génère le jeton ; on y ajoute le code court.
CREATE OR REPLACE FUNCTION generate_link_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW.token := encode(extensions.gen_random_bytes(16), 'hex');
  NEW.short_code := generate_link_short_code();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- create_child_link_token renvoie maintenant le jeton ET le code.
-- (Le client accepte aussi l'ancien retour texte.)
DROP FUNCTION IF EXISTS create_child_link_token(uuid);
CREATE OR REPLACE FUNCTION create_child_link_token(p_child_id uuid)
RETURNS json AS $$
DECLARE
  v_parent_id uuid;
  v_token text;
  v_code text;
  v_expires timestamptz;
BEGIN
  SELECT parent_id INTO v_parent_id FROM children WHERE id = p_child_id;
  IF v_parent_id IS NULL OR v_parent_id <> auth.uid() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  UPDATE child_link_tokens SET status = 'expired'
  WHERE child_id = p_child_id AND status = 'pending';

  INSERT INTO child_link_tokens (child_id, parent_id)
  VALUES (p_child_id, v_parent_id)
  RETURNING token, short_code, expires_at INTO v_token, v_code, v_expires;

  RETURN json_build_object('token', v_token, 'code', v_code, 'expires_at', v_expires);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- claim_child_link_token accepte le jeton complet OU le code court.
CREATE OR REPLACE FUNCTION claim_child_link_token(
  p_token text,
  p_pin text,
  p_device_id text DEFAULT NULL,
  p_auth_user_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_link  child_link_tokens%ROWTYPE;
  v_child children%ROWTYPE;
  v_parent profiles%ROWTYPE;
  v_input text := trim(p_token);
BEGIN
  IF v_input ~ '^[0-9a-fA-F]{32}$' THEN
    SELECT * INTO v_link FROM child_link_tokens
    WHERE token = lower(v_input) AND status = 'pending' AND expires_at > now();
  ELSE
    -- code court : insensible à la casse, espaces/tirets tolérés
    SELECT * INTO v_link FROM child_link_tokens
    WHERE short_code = upper(regexp_replace(v_input, '[^A-Za-z0-9]', '', 'g'))
      AND status = 'pending' AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Code invalide ou expiré. Demande à ton parent d''en générer un nouveau.');
  END IF;

  IF p_pin !~ '^[0-9]{4}$' THEN
    RETURN json_build_object('success', false, 'error', 'Le code PIN doit contenir 4 chiffres');
  END IF;

  SELECT * INTO v_child  FROM children WHERE id = v_link.child_id;
  SELECT * INTO v_parent FROM profiles WHERE id = v_link.parent_id;

  UPDATE child_link_tokens
  SET status = 'linked', linked_at = now(),
      pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      device_id = p_device_id
  WHERE id = v_link.id;

  UPDATE children
  SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      auth_user_id = COALESCE(p_auth_user_id, auth_user_id),
      failed_pin_attempts = 0,
      pin_locked_until = NULL
  WHERE id = v_child.id;

  RETURN json_build_object(
    'success', true,
    'child', json_build_object(
      'id', v_child.id, 'display_name', v_child.display_name,
      'avatar_url', v_child.avatar_url, 'age', v_child.age,
      'level', v_child.level, 'total_points', v_child.total_points
    ),
    'parent_name', v_parent.full_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_child_link_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_child_link_token(text, text, text, uuid) TO anon, authenticated;
