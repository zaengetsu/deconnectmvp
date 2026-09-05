-- 031 — Les sessions enfant (anonymes) ne sont pas des parents
--
-- Symptôme : « Database error creating anonymous user » à la liaison d'un
-- appareil enfant. Cause : le trigger handle_new_user (008) crée un profil
-- parent pour TOUT nouvel utilisateur auth, avec email = NEW.email — NULL pour
-- un utilisateur anonyme → violation de profiles.email NOT NULL → l'inscription
-- anonyme échoue en bloc.
--
-- Un appareil enfant n'a ni profil parent ni abonnement : on saute le trigger
-- pour les utilisateurs anonymes (et, par sécurité, pour tout utilisateur sans email).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.is_anonymous, false) OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'parent')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (parent_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nettoyage : profils « parents » vides créés par erreur pour des sessions anonymes
DELETE FROM public.profiles p
USING auth.users u
WHERE u.id = p.id AND COALESCE(u.is_anonymous, false);

-- ── Le parent est prévenu quand l'appareil de son enfant est relié ─────────
-- children.device_linked_at : date de la dernière liaison (pour un statut
-- discret côté parent au lieu d'une bannière permanente).
ALTER TABLE children ADD COLUMN IF NOT EXISTS device_linked_at timestamptz;

UPDATE children c SET device_linked_at = t.linked_at
FROM (SELECT child_id, max(linked_at) AS linked_at FROM child_link_tokens WHERE status = 'linked' GROUP BY child_id) t
WHERE t.child_id = c.id AND c.device_linked_at IS NULL;

CREATE OR REPLACE FUNCTION on_child_device_linked()
RETURNS TRIGGER AS $$
DECLARE
  v_child children%ROWTYPE;
BEGIN
  IF NEW.status = 'linked' AND (OLD.status IS DISTINCT FROM 'linked') THEN
    SELECT * INTO v_child FROM children WHERE id = NEW.child_id;
    UPDATE children SET device_linked_at = now() WHERE id = NEW.child_id;

    PERFORM enqueue_notification(
      'parent', NEW.parent_id,
      'child_device_linked',
      '📱 Appareil relié',
      v_child.display_name || ' vient de relier son téléphone. Il se connecte désormais avec son code PIN.',
      '📱', '/parent/children/' || NEW.child_id::text,
      jsonb_build_object('child_id', NEW.child_id),
      'normal', 'child', NEW.child_id, NEW.child_id,
      ARRAY['in_app','push'],
      'device_linked:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS child_link_tokens_linked ON child_link_tokens;
CREATE TRIGGER child_link_tokens_linked
  AFTER UPDATE OF status ON child_link_tokens
  FOR EACH ROW EXECUTE FUNCTION on_child_device_linked();
