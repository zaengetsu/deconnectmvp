-- ════════════════════════════════════════════════════════════════════════════
-- Migration 024 : identité propre pour l'appareil enfant — retrait du pont
--
-- Avant : l'espace enfant fonctionnait sur la session Supabase du PARENT
--         (pont dev). Toutes les policies étaient en auth.uid() = parent_id,
--         et "child_notifications_read" ouvrait la lecture des notifications
--         de tous les enfants à n'importe quel compte authentifié.
--
-- Après : l'appareil enfant possède sa propre identité auth (session anonyme
--         Supabase liée à children.auth_user_id lors du lien QR / login PIN),
--         et chaque table porte une policy enfant scopée à CET enfant.
--
-- Prérequis : activer "Anonymous sign-ins" (Dashboard → Authentication →
--             Sign In / Providers), config.toml : enable_anonymous_sign_ins.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Identité de l'appareil enfant ────────────────────────────────────────
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS children_auth_user_id_key
  ON children(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Helpers SECURITY DEFINER : contournent la RLS, donc pas de récursion
-- quand ils sont appelés depuis une policy.
CREATE OR REPLACE FUNCTION current_child_id()
RETURNS uuid AS $$
  SELECT id FROM children WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_child_parent_id()
RETURNS uuid AS $$
  SELECT parent_id FROM children WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION current_child_id() FROM public;
REVOKE ALL ON FUNCTION current_child_parent_id() FROM public;
GRANT EXECUTE ON FUNCTION current_child_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION current_child_parent_id() TO authenticated, anon;

-- ── 2. Lien de l'appareil : QR + PIN lient désormais l'identité auth ───────
DROP FUNCTION IF EXISTS claim_child_link_token(text, text, text);

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
BEGIN
  SELECT * INTO v_link FROM child_link_tokens
  WHERE token = p_token AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'QR code invalide ou expiré');
  END IF;

  SELECT * INTO v_child  FROM children WHERE id = v_link.child_id;
  SELECT * INTO v_parent FROM profiles WHERE id = v_link.parent_id;

  UPDATE child_link_tokens
  SET status = 'linked', linked_at = now(),
      pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      device_id = p_device_id
  WHERE id = v_link.id;

  -- PIN + identité de l'appareil enfant
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

-- ── 3. child_pin_login : conserve l'anti-brute-force (016) + lie l'identité ─
DROP FUNCTION IF EXISTS child_pin_login(uuid, text);

CREATE OR REPLACE FUNCTION child_pin_login(
  p_child_id uuid,
  p_pin text,
  p_auth_user_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_child children%ROWTYPE;
  v_max_attempts    CONSTANT integer := 5;
  v_lockout_minutes CONSTANT integer := 15;
BEGIN
  SELECT * INTO v_child FROM children WHERE id = p_child_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Profil introuvable');
  END IF;

  IF v_child.pin_locked_until IS NOT NULL AND v_child.pin_locked_until > now() THEN
    RETURN json_build_object('success', false,
      'error', 'Trop de tentatives. Réessaie dans ' || v_lockout_minutes || ' minutes.',
      'locked_until', v_child.pin_locked_until);
  END IF;

  IF v_child.pin_locked_until IS NOT NULL AND v_child.pin_locked_until <= now() THEN
    UPDATE children SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = p_child_id;
    SELECT * INTO v_child FROM children WHERE id = p_child_id;
  END IF;

  IF v_child.pin_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Aucun PIN configuré');
  END IF;

  IF v_child.pin_hash != extensions.crypt(p_pin, v_child.pin_hash) THEN
    UPDATE children
    SET failed_pin_attempts = failed_pin_attempts + 1,
        pin_locked_until = CASE
          WHEN failed_pin_attempts + 1 >= v_max_attempts
          THEN now() + (v_lockout_minutes || ' minutes')::interval
          ELSE NULL END
    WHERE id = p_child_id;

    RETURN json_build_object('success', false, 'error', 'PIN incorrect',
      'attempts_left', GREATEST(0, v_max_attempts - (v_child.failed_pin_attempts + 1)));
  END IF;

  -- Succès : reset compteur + (re)liaison de l'identité de cet appareil
  UPDATE children
  SET failed_pin_attempts = 0,
      pin_locked_until = NULL,
      auth_user_id = COALESCE(p_auth_user_id, auth_user_id)
  WHERE id = p_child_id;

  RETURN json_build_object(
    'success', true,
    'child', json_build_object(
      'id', v_child.id, 'display_name', v_child.display_name,
      'avatar_url', v_child.avatar_url, 'age', v_child.age,
      'level', v_child.level, 'total_points', v_child.total_points
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Policies enfant (scopées à CET enfant) ──────────────────────────────
DROP POLICY IF EXISTS "child_reads_self" ON children;
CREATE POLICY "child_reads_self" ON children
  FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "child_reads_parent_profile" ON profiles;
CREATE POLICY "child_reads_parent_profile" ON profiles
  FOR SELECT USING (id = current_child_parent_id());

DROP POLICY IF EXISTS "child_own_activities" ON child_activities;
CREATE POLICY "child_own_activities" ON child_activities
  FOR SELECT USING (child_id = current_child_id());

DROP POLICY IF EXISTS "child_updates_own_activities" ON child_activities;
CREATE POLICY "child_updates_own_activities" ON child_activities
  FOR UPDATE USING (child_id = current_child_id())
  WITH CHECK (child_id = current_child_id());

DROP POLICY IF EXISTS "child_reads_activities" ON activities;
CREATE POLICY "child_reads_activities" ON activities
  FOR SELECT USING (
    current_child_id() IS NOT NULL
    AND (is_public = true OR created_by = current_child_parent_id())
  );

DROP POLICY IF EXISTS "child_reads_rewards" ON rewards;
CREATE POLICY "child_reads_rewards" ON rewards
  FOR SELECT USING (
    current_child_id() IS NOT NULL
    AND (parent_id IS NULL OR parent_id = current_child_parent_id())
    AND (child_id IS NULL OR child_id = current_child_id())
  );

DROP POLICY IF EXISTS "child_own_reward_requests" ON reward_requests;
CREATE POLICY "child_own_reward_requests" ON reward_requests
  FOR SELECT USING (child_id = current_child_id());

DROP POLICY IF EXISTS "child_creates_reward_requests" ON reward_requests;
CREATE POLICY "child_creates_reward_requests" ON reward_requests
  FOR INSERT WITH CHECK (child_id = current_child_id());

DROP POLICY IF EXISTS "child_own_badges" ON child_badges;
CREATE POLICY "child_own_badges" ON child_badges
  FOR SELECT USING (child_id = current_child_id());

DROP POLICY IF EXISTS "child_own_points" ON points_ledger;
CREATE POLICY "child_own_points" ON points_ledger
  FOR SELECT USING (child_id = current_child_id());

-- ── 5. Notifications : suppression de la policy trop large ─────────────────
-- Fuite corrigée : "child_notifications_read" autorisait TOUT compte
-- authentifié à lire les notifications de TOUS les enfants.
DROP POLICY IF EXISTS "child_notifications_read" ON notifications;

CREATE POLICY "child_own_notifications" ON notifications
  FOR SELECT USING (
    recipient_type = 'child' AND recipient_id = current_child_id()
  );

CREATE POLICY "child_marks_own_notifications_read" ON notifications
  FOR UPDATE USING (
    recipient_type = 'child' AND recipient_id = current_child_id()
  ) WITH CHECK (
    recipient_type = 'child' AND recipient_id = current_child_id()
  );

-- ── 6. Push tokens : un token appartient à un enfant OU à un parent ────────
DROP POLICY IF EXISTS "child_own_tokens" ON push_tokens;
CREATE POLICY "child_own_tokens" ON push_tokens
  FOR ALL USING (child_id = current_child_id())
  WITH CHECK (child_id = current_child_id());

CREATE INDEX IF NOT EXISTS push_tokens_user_idx  ON push_tokens(user_id)  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_tokens_child_idx ON push_tokens(child_id) WHERE child_id IS NOT NULL;

-- ── 7. create_notification : un enfant peut notifier SON parent ────────────
CREATE OR REPLACE FUNCTION create_notification(
  p_recipient_type text,
  p_recipient_id uuid,
  p_title text,
  p_body text,
  p_icon text DEFAULT '🔔',
  p_route text DEFAULT NULL,
  p_data jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_caller uuid := auth.uid();
  v_child_id uuid := current_child_id();
BEGIN
  IF v_caller IS NOT NULL THEN
    IF v_child_id IS NOT NULL THEN
      -- Appelant = appareil enfant : uniquement son parent ou lui-même
      IF p_recipient_type = 'parent' AND p_recipient_id != current_child_parent_id() THEN
        RAISE EXCEPTION 'Not authorized: child can only notify its own parent';
      END IF;
      IF p_recipient_type = 'child' AND p_recipient_id != v_child_id THEN
        RAISE EXCEPTION 'Not authorized: child can only notify itself';
      END IF;
    ELSE
      -- Appelant = parent
      IF p_recipient_type = 'parent' AND v_caller != p_recipient_id THEN
        RAISE EXCEPTION 'Not authorized: cannot create notification for another parent';
      END IF;
      IF p_recipient_type = 'child' AND NOT EXISTS (
        SELECT 1 FROM children WHERE id = p_recipient_id AND parent_id = v_caller
      ) THEN
        RAISE EXCEPTION 'Not authorized: child does not belong to caller';
      END IF;
    END IF;
  END IF;

  INSERT INTO notifications (recipient_type, recipient_id, title, body, icon, route, data)
  VALUES (p_recipient_type, p_recipient_id, p_title, p_body, p_icon, p_route, p_data)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Index manquants sur notifications ──────────────────────────────────
CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications(recipient_type, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications(recipient_type, recipient_id) WHERE is_read = false;
