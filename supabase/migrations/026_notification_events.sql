-- ════════════════════════════════════════════════════════════════════════════
-- Migration 026 : les notifications naissent des événements métier
--
-- Avant : cinq pages React appelaient create_notification() à la main.
-- Après : la base réagit aux changements d'état (child_activities,
-- reward_requests) et appelle enqueue_notification(). Le frontend n'a plus
-- rien à déclencher — et une notification ne peut plus être « oubliée »
-- parce que l'app était fermée.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Ton selon l'âge (5.17) ────────────────────────────────────────────────
-- Mêmes tranches que les activités : 3-7 / 8-12 / 13-18
CREATE OR REPLACE FUNCTION child_tone(p_age integer)
RETURNS text AS $$
  SELECT CASE
    WHEN p_age IS NULL THEN 'kid'
    WHEN p_age <= 7  THEN 'young'
    WHEN p_age <= 12 THEN 'kid'
    ELSE 'teen'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ── 1. child_activities : soumission, validation, rappels ─────────────────
CREATE OR REPLACE FUNCTION on_child_activity_change()
RETURNS trigger AS $$
DECLARE
  v_child  children%ROWTYPE;
  v_act    activities%ROWTYPE;
  v_tone   text;
  v_title  text;
  v_body   text;
BEGIN
  SELECT * INTO v_child FROM children   WHERE id = NEW.child_id;
  SELECT * INTO v_act   FROM activities WHERE id = NEW.activity_id;
  IF v_child.id IS NULL OR v_act.id IS NULL THEN RETURN NEW; END IF;
  v_tone := child_tone(v_child.age);

  -- ── L'enfant déclare avoir terminé → le parent doit valider ────────────
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted') THEN
    PERFORM enqueue_notification(
      'parent', v_child.parent_id,
      'activity_validation_required',
      '👀 ' || v_child.display_name || ' a terminé son activité',
      '« ' || v_act.title || ' » attend votre validation.',
      '👀', '/parent/validations',
      jsonb_build_object('child_id', v_child.id, 'child_activity_id', NEW.id),
      'high', 'child_activity', NEW.id, v_child.id,
      ARRAY['in_app','push'],
      'validation:' || NEW.id::text
    );

    -- Une activité terminée n'a plus besoin de rappel
    PERFORM cancel_scheduled_notifications('child_activity', NEW.id);
  END IF;

  -- ── Activité planifiée → rappel programmé (5.10) ───────────────────────
  IF NEW.status = 'selected'
     AND NEW.scheduled_for IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.scheduled_for IS DISTINCT FROM NEW.scheduled_for) THEN

    PERFORM cancel_scheduled_notifications('child_activity', NEW.id, ARRAY['activity_reminder']);

    v_title := CASE v_tone
      WHEN 'young' THEN '🌟 C''est bientôt l''heure !'
      WHEN 'teen'  THEN 'Petit rappel'
      ELSE '🔔 Petit rappel'
    END;
    v_body := CASE v_tone
      WHEN 'young' THEN 'Ton activité « ' || v_act.title || ' » t''attend aujourd''hui.'
      WHEN 'teen'  THEN 'Tu avais prévu « ' || v_act.title || ' » aujourd''hui.'
      ELSE 'Tu avais prévu « ' || v_act.title || ' » aujourd''hui.'
    END;

    -- Rappel le jour prévu à 17h00 (heure locale gérée par les quiet hours)
    PERFORM enqueue_notification(
      'child', v_child.id,
      'activity_reminder',
      v_title, v_body, '🔔', '/child/activities',
      jsonb_build_object('child_activity_id', NEW.id),
      'low', 'child_activity', NEW.id, v_child.id,
      ARRAY['in_app','push'],
      'reminder:' || NEW.id::text,
      (NEW.scheduled_for + time '17:00') AT TIME ZONE 'Europe/Paris'
    );
  END IF;

  -- ── Refus : jamais culpabilisant (5.3) ─────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    PERFORM cancel_scheduled_notifications('child_activity', NEW.id);
    PERFORM enqueue_notification(
      'child', v_child.id, 'activity_rejected',
      CASE v_tone WHEN 'teen' THEN 'À revoir' ELSE 'Presque !' END,
      COALESCE(NULLIF(NEW.rejection_reason, ''),
               '« ' || v_act.title || ' » n''est pas encore validée. Tu peux réessayer !'),
      '💬', '/child/activities',
      jsonb_build_object('child_activity_id', NEW.id),
      'normal', 'child_activity', NEW.id, v_child.id,
      ARRAY['in_app','push'], 'rejected:' || NEW.id::text
    );
  END IF;

  -- ── Abandon → plus aucun rappel (5.9) ──────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.status = 'available' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM cancel_scheduled_notifications('child_activity', NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS child_activity_notifications ON child_activities;
CREATE TRIGGER child_activity_notifications
  AFTER INSERT OR UPDATE OF status, scheduled_for ON child_activities
  FOR EACH ROW EXECUTE FUNCTION on_child_activity_change();

-- ── 2. validate_child_activity : notifications v2 + notification parent ───
CREATE OR REPLACE FUNCTION validate_child_activity(
  p_child_activity_id uuid,
  p_parent_id uuid,
  p_parent_note text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_ca    child_activities%ROWTYPE;
  v_child children%ROWTYPE;
  v_act   activities%ROWTYPE;
  v_pts   integer;
  v_new_total integer;
  v_new_level integer;
  v_old_level integer;
  v_badges_awarded integer;
  v_level_up boolean := false;
  v_tone text;
BEGIN
  SELECT * INTO v_ca FROM child_activities WHERE id = p_child_activity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_ca.status != 'submitted' THEN RAISE EXCEPTION 'Not submitted'; END IF;

  SELECT * INTO v_child FROM children WHERE id = v_ca.child_id;
  IF v_child.parent_id != p_parent_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_act FROM activities WHERE id = v_ca.activity_id;
  v_pts := v_act.points;
  v_old_level := v_child.level;
  v_tone := child_tone(v_child.age);

  UPDATE child_activities
  SET status = 'validated', validated_at = now(), validated_by = p_parent_id,
      earned_points = v_pts, parent_note = p_parent_note
  WHERE id = p_child_activity_id;

  INSERT INTO points_ledger (child_id, source_type, source_id, points, reason, created_by)
  VALUES (v_child.id, 'activity_validation', p_child_activity_id, v_pts, v_act.title, p_parent_id);

  v_new_total := v_child.total_points + v_pts;
  v_new_level := calculate_child_level(v_new_total);
  v_level_up  := v_new_level > v_old_level;

  UPDATE children SET total_points = v_new_total, level = v_new_level WHERE id = v_child.id;
  v_badges_awarded := check_and_award_badges(v_child.id, v_new_total);

  -- Plus aucun rappel sur une activité validée
  PERFORM cancel_scheduled_notifications('child_activity', p_child_activity_id);

  -- Enfant : félicitations (ton adapté à l'âge)
  PERFORM enqueue_notification(
    'child', v_child.id, 'activity_validated',
    CASE v_tone WHEN 'teen' THEN 'Activité validée' ELSE '🎉 Bien joué !' END,
    CASE v_tone
      WHEN 'young' THEN 'Tu as gagné ' || v_pts || ' points pour « ' || v_act.title || ' » !'
      ELSE '+' || v_pts || ' points pour « ' || v_act.title || ' ».'
    END,
    '⭐', '/child/points',
    jsonb_build_object('points', v_pts, 'child_activity_id', p_child_activity_id),
    'normal', 'child_activity', p_child_activity_id, v_child.id,
    ARRAY['in_app','push'], 'validated:' || p_child_activity_id::text
  );

  -- Parent : trace de l'activité terminée (groupable en résumé, cf. 5.18)
  PERFORM enqueue_notification(
    'parent', v_child.parent_id, 'activity_completed',
    '✅ ' || v_child.display_name || ' a terminé son activité',
    '« ' || v_act.title ||' » · +' || v_pts || ' points',
    '✅', '/parent/children/' || v_child.id::text,
    jsonb_build_object('child_id', v_child.id, 'points', v_pts),
    'normal', 'child_activity', p_child_activity_id, v_child.id,
    ARRAY['in_app'], 'completed:' || p_child_activity_id::text,
    NULL, 'daily:' || v_child.parent_id::text || ':' || current_date::text
  );

  IF v_level_up THEN
    PERFORM enqueue_notification(
      'child', v_child.id, 'level_up',
      '🎉 Niveau ' || v_new_level || ' !',
      CASE v_tone
        WHEN 'young' THEN 'Bravo ! Tu passes au niveau ' || v_new_level || ' !'
        ELSE 'Tu passes au niveau ' || v_new_level || '. Continue comme ça !'
      END,
      '🏆', '/child/points',
      jsonb_build_object('new_level', v_new_level),
      'normal', 'child', v_child.id, v_child.id,
      ARRAY['in_app','push'], 'levelup:' || v_child.id::text || ':' || v_new_level::text
    );
  END IF;

  IF v_badges_awarded > 0 THEN
    PERFORM enqueue_notification(
      'child', v_child.id, 'badge_earned',
      '🏅 Nouveau badge !',
      'Tu as gagné ' || v_badges_awarded || ' nouveau(x) badge(s) !',
      '🏅', '/child/points',
      jsonb_build_object('count', v_badges_awarded),
      'normal', 'child', v_child.id, v_child.id,
      ARRAY['in_app','push']
    );
  END IF;

  RETURN json_build_object(
    'success', true, 'points_awarded', v_pts, 'new_total', v_new_total,
    'new_level', v_new_level, 'level_up', v_level_up, 'badges_awarded', v_badges_awarded
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. reward_requests : demande, relances, remise (5.5) ──────────────────
CREATE OR REPLACE FUNCTION on_reward_request_change()
RETURNS trigger AS $$
DECLARE
  v_child  children%ROWTYPE;
  v_reward rewards%ROWTYPE;
BEGIN
  SELECT * INTO v_child  FROM children WHERE id = NEW.child_id;
  SELECT * INTO v_reward FROM rewards  WHERE id = NEW.reward_id;
  IF v_child.id IS NULL OR v_reward.id IS NULL THEN RETURN NEW; END IF;

  -- Demande créée → le parent doit agir
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM enqueue_notification(
      'parent', v_child.parent_id, 'reward_requested',
      '🎁 ' || v_child.display_name || ' a débloqué une récompense',
      '« ' || v_reward.title || ' » — validez-la quand vous êtes prêt à la lui donner.',
      '🎁', '/parent/rewards',
      jsonb_build_object('child_id', v_child.id, 'reward_id', v_reward.id, 'request_id', NEW.id),
      'high', 'reward_request', NEW.id, v_child.id,
      ARRAY['in_app','push'], 'reward_req:' || NEW.id::text
    );

    -- Relance à 24h puis 48h si toujours en attente (annulées à l'approbation)
    PERFORM enqueue_notification(
      'parent', v_child.parent_id, 'reward_pending',
      '🎁 Petit rappel',
      v_child.display_name || ' attend toujours sa récompense « ' || v_reward.title || ' ».',
      '🎁', '/parent/rewards',
      jsonb_build_object('child_id', v_child.id, 'request_id', NEW.id),
      'normal', 'reward_request', NEW.id, v_child.id,
      ARRAY['in_app','push'], 'reward_pending24:' || NEW.id::text,
      now() + interval '24 hours'
    );

    PERFORM enqueue_notification(
      'parent', v_child.parent_id, 'reward_pending',
      'Récompense toujours en attente',
      'La récompense de ' || v_child.display_name || ' n''a pas encore été remise. Pensez-y quand vous en aurez l''occasion.',
      '🎁', '/parent/rewards',
      jsonb_build_object('child_id', v_child.id, 'request_id', NEW.id),
      'low', 'reward_request', NEW.id, v_child.id,
      ARRAY['in_app','push'], 'reward_pending48:' || NEW.id::text,
      now() + interval '48 hours'
    );
  END IF;

  -- Approuvée / remise → on coupe les relances et on prévient l'enfant
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','completed') THEN
    PERFORM cancel_scheduled_notifications('reward_request', NEW.id, ARRAY['reward_pending']);

    PERFORM enqueue_notification(
      'child', v_child.id, 'reward_approved',
      '🎁 Ta récompense est validée !',
      '« ' || v_reward.title || ' » — profite bien !',
      '🎁', '/child/rewards',
      jsonb_build_object('reward_id', v_reward.id),
      'normal', 'reward_request', NEW.id, v_child.id,
      ARRAY['in_app','push'], 'reward_ok:' || NEW.id::text
    );
  END IF;

  -- Refusée → plus de relance, et un message encourageant pour l'enfant
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'rejected' THEN
    PERFORM cancel_scheduled_notifications('reward_request', NEW.id);
    PERFORM enqueue_notification(
      'child', v_child.id, 'reward_rejected',
      'Pas pour cette fois',
      COALESCE(NULLIF(NEW.parent_note, ''),
               '« ' || v_reward.title || ' » n''est pas disponible tout de suite. Continue, tu y es presque !'),
      '💬', '/child/rewards',
      jsonb_build_object('reward_id', v_reward.id),
      'normal', 'reward_request', NEW.id, v_child.id,
      ARRAY['in_app','push'], 'reward_ko:' || NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS reward_request_notifications ON reward_requests;
CREATE TRIGGER reward_request_notifications
  AFTER INSERT OR UPDATE OF status ON reward_requests
  FOR EACH ROW EXECUTE FUNCTION on_reward_request_change();
