-- Migration 016: Security fixes
-- 1) Fix child_notifications_read — restrict to parent-owned children only
-- 2) Fix create_notification() — add authorization check
-- 3) Add PIN brute-force protection (failed_pin_attempts + lockout)

-- ════════════════════════════════════════════════════════════════
-- FIX 1: Notifications enfant — policy trop permissive
-- Avant : tout user authentifié pouvait lire les notifs de N'importe quel enfant
-- Après : uniquement le parent propriétaire de l'enfant
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "child_notifications_read" ON notifications;

-- La policy "parent_notifications" existante couvre déjà les deux cas
-- (parent notifs + child notifs via children JOIN), donc aucune policy
-- supplémentaire n'est nécessaire. Les enfants lisent leurs notifs via
-- le même filtre parent qui possède l'enfant.
-- Si une lecture directe côté enfant (device non-auth) est nécessaire,
-- elle doit passer par une RPC SECURITY DEFINER avec token de session enfant.

-- ════════════════════════════════════════════════════════════════
-- FIX 2: create_notification() — ajouter une vérification d'autorisation
-- Avant : tout user authentifié pouvait créer une notif pour n'importe qui
-- Après : seule une fonction DEFINER interne peut l'appeler, ou le parent
--         propriétaire de l'enfant ciblé
-- ════════════════════════════════════════════════════════════════
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
BEGIN
  -- Authorization check:
  -- • If recipient is a parent  → caller must BE that parent
  -- • If recipient is a child   → caller must be the parent of that child
  --   (or NULL = called from another SECURITY DEFINER function internally)
  IF v_caller IS NOT NULL THEN
    IF p_recipient_type = 'parent' AND v_caller != p_recipient_id THEN
      RAISE EXCEPTION 'Not authorized: cannot create notification for another parent';
    END IF;

    IF p_recipient_type = 'child' THEN
      IF NOT EXISTS (
        SELECT 1 FROM children
        WHERE id = p_recipient_id AND parent_id = v_caller
      ) THEN
        RAISE EXCEPTION 'Not authorized: child does not belong to caller';
      END IF;
    END IF;
  END IF;
  -- If v_caller IS NULL, we are inside another SECURITY DEFINER function
  -- (e.g. validate_child_activity) — allow it.

  INSERT INTO notifications (recipient_type, recipient_id, title, body, icon, route, data)
  VALUES (p_recipient_type, p_recipient_id, p_title, p_body, p_icon, p_route, p_data)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
-- FIX 3: PIN brute-force protection
-- Ajoute un compteur d'échecs et un verrouillage temporaire (5 essais → 15 min)
-- ════════════════════════════════════════════════════════════════

-- Ajoute les colonnes si elles n'existent pas déjà
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'children' AND column_name = 'failed_pin_attempts'
  ) THEN
    ALTER TABLE children ADD COLUMN failed_pin_attempts integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'children' AND column_name = 'pin_locked_until'
  ) THEN
    ALTER TABLE children ADD COLUMN pin_locked_until timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Remplace child_pin_login avec protection brute-force
CREATE OR REPLACE FUNCTION child_pin_login(p_child_id uuid, p_pin text)
RETURNS json AS $$
DECLARE
  v_child children%ROWTYPE;
  v_max_attempts CONSTANT integer := 5;
  v_lockout_minutes CONSTANT integer := 15;
BEGIN
  SELECT * INTO v_child FROM children WHERE id = p_child_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Profil introuvable');
  END IF;

  -- Check lockout
  IF v_child.pin_locked_until IS NOT NULL AND v_child.pin_locked_until > now() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Trop de tentatives. Réessaie dans ' || v_lockout_minutes || ' minutes.',
      'locked_until', v_child.pin_locked_until
    );
  END IF;

  -- Reset lockout if expired
  IF v_child.pin_locked_until IS NOT NULL AND v_child.pin_locked_until <= now() THEN
    UPDATE children SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = p_child_id;
    SELECT * INTO v_child FROM children WHERE id = p_child_id;
  END IF;

  IF v_child.pin_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Aucun PIN configuré');
  END IF;

  -- Verify PIN
  IF v_child.pin_hash != extensions.crypt(p_pin, v_child.pin_hash) THEN
    -- Increment failure counter
    UPDATE children
    SET
      failed_pin_attempts = failed_pin_attempts + 1,
      pin_locked_until = CASE
        WHEN failed_pin_attempts + 1 >= v_max_attempts
        THEN now() + (v_lockout_minutes || ' minutes')::interval
        ELSE NULL
      END
    WHERE id = p_child_id;

    RETURN json_build_object(
      'success', false,
      'error', 'PIN incorrect',
      'attempts_left', GREATEST(0, v_max_attempts - (v_child.failed_pin_attempts + 1))
    );
  END IF;

  -- Success — reset counter
  UPDATE children SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = p_child_id;

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
