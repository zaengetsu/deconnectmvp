-- ════════════════════════════════════════════════════════════════════════════
-- Migration 029 : deux fonctionnalités qui manquaient de modèle
--
--  A. « Défi Duo »      — deux enfants relèvent la même activité ensemble.
--                          Une amitié n'existe que si LES DEUX parents l'ont
--                          approuvée : c'est ce qui rend le social acceptable
--                          dans une app pour enfants.
--  B. « Rituel Famille » — un rendez-vous récurrent hors écran (mardi 19h,
--                          « dîner sans écran »), avec présence confirmée et
--                          objectif familial de la semaine.
--
-- Les deux alimentent le système de notifications existant
-- (enqueue_notification), sans créer de canal parallèle.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- A. DÉFI DUO
-- ══════════════════════════════════════════════════════════════════════════

-- Amitié entre deux enfants — double approbation parentale obligatoire
CREATE TABLE IF NOT EXISTS child_friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  friend_child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'blocked')),
  -- NULL tant que le parent concerné n'a pas tranché
  approved_by_initiator_parent boolean NOT NULL DEFAULT false,
  approved_by_friend_parent    boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT child_friends_distinct CHECK (child_id <> friend_child_id),
  UNIQUE (child_id, friend_child_id)
);

ALTER TABLE child_friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_manages_friendships" ON child_friends;
CREATE POLICY "parent_manages_friendships" ON child_friends FOR ALL
  USING (EXISTS (
    SELECT 1 FROM children c
    WHERE c.id IN (child_friends.child_id, child_friends.friend_child_id)
      AND c.parent_id = auth.uid()
  ));

DROP POLICY IF EXISTS "child_reads_own_friendships" ON child_friends;
CREATE POLICY "child_reads_own_friendships" ON child_friends FOR SELECT
  USING (current_child_id() IN (child_id, friend_child_id));

CREATE INDEX IF NOT EXISTS child_friends_child_idx  ON child_friends(child_id);
CREATE INDEX IF NOT EXISTS child_friends_friend_idx ON child_friends(friend_child_id);

-- Une amitié n'est active que si les deux parents ont dit oui
CREATE OR REPLACE FUNCTION sync_friendship_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'blocked' AND NEW.status <> 'declined' THEN
    NEW.status := CASE
      WHEN NEW.approved_by_initiator_parent AND NEW.approved_by_friend_parent THEN 'approved'
      ELSE 'pending'
    END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS child_friends_status_sync ON child_friends;
CREATE TRIGGER child_friends_status_sync
  BEFORE INSERT OR UPDATE ON child_friends
  FOR EACH ROW EXECUTE FUNCTION sync_friendship_status();

-- Deux enfants peuvent-ils faire un défi ensemble ?
-- Frère/sœur (même parent) : oui d'office. Sinon : amitié approuvée.
CREATE OR REPLACE FUNCTION children_can_duo(p_a uuid, p_b uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM children ca, children cb
    WHERE ca.id = p_a AND cb.id = p_b AND ca.parent_id = cb.parent_id
  ) OR EXISTS (
    SELECT 1 FROM child_friends f
    WHERE f.status = 'approved'
      AND ((f.child_id = p_a AND f.friend_child_id = p_b)
        OR (f.child_id = p_b AND f.friend_child_id = p_a))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS duo_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id        uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  initiator_child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  partner_child_id   uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','accepted','declined','active','completed','expired','cancelled')),
  starts_at  timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  -- Le bonus n'est versé que si les DEUX terminent : c'est ce qui fait
  -- du défi une coopération et non une course.
  bonus_points integer NOT NULL DEFAULT 20 CHECK (bonus_points >= 0),
  initiator_done_at timestamptz,
  partner_done_at   timestamptz,
  completed_at      timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT duo_distinct CHECK (initiator_child_id <> partner_child_id)
);

ALTER TABLE duo_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_reads_duo" ON duo_challenges;
CREATE POLICY "parent_reads_duo" ON duo_challenges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM children c
    WHERE c.id IN (duo_challenges.initiator_child_id, duo_challenges.partner_child_id)
      AND c.parent_id = auth.uid()
  ));

DROP POLICY IF EXISTS "child_own_duo" ON duo_challenges;
CREATE POLICY "child_own_duo" ON duo_challenges FOR SELECT
  USING (current_child_id() IN (initiator_child_id, partner_child_id));

CREATE INDEX IF NOT EXISTS duo_status_idx ON duo_challenges(status, expires_at);

-- Créer un défi (refuse si le lien n'est pas approuvé)
CREATE OR REPLACE FUNCTION create_duo_challenge(
  p_activity_id uuid,
  p_partner_child_id uuid,
  p_starts_at timestamptz DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_child_id uuid := current_child_id();
  v_id uuid;
BEGIN
  IF v_child_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session enfant requise');
  END IF;

  IF NOT children_can_duo(v_child_id, p_partner_child_id) THEN
    RETURN json_build_object('success', false, 'error', 'Vous n''êtes pas encore amis — demandez à vos parents');
  END IF;

  INSERT INTO duo_challenges (activity_id, initiator_child_id, partner_child_id, starts_at)
  VALUES (p_activity_id, v_child_id, p_partner_child_id, p_starts_at)
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'challenge_id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Un enfant déclare avoir fait sa part
CREATE OR REPLACE FUNCTION complete_duo_part(p_challenge_id uuid)
RETURNS json AS $$
DECLARE
  v_child_id uuid := current_child_id();
  v_duo duo_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_duo FROM duo_challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Défi introuvable'); END IF;
  IF v_child_id NOT IN (v_duo.initiator_child_id, v_duo.partner_child_id) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorisé');
  END IF;

  IF v_child_id = v_duo.initiator_child_id THEN
    UPDATE duo_challenges SET initiator_done_at = now(), updated_at = now() WHERE id = p_challenge_id;
  ELSE
    UPDATE duo_challenges SET partner_done_at = now(), updated_at = now() WHERE id = p_challenge_id;
  END IF;

  SELECT * INTO v_duo FROM duo_challenges WHERE id = p_challenge_id;

  IF v_duo.initiator_done_at IS NOT NULL AND v_duo.partner_done_at IS NOT NULL
     AND v_duo.status <> 'completed' THEN
    UPDATE duo_challenges
       SET status = 'completed', completed_at = now()
     WHERE id = p_challenge_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notifications du défi duo
CREATE OR REPLACE FUNCTION on_duo_challenge_change()
RETURNS trigger AS $$
DECLARE
  v_init    children%ROWTYPE;
  v_partner children%ROWTYPE;
  v_act     activities%ROWTYPE;
BEGIN
  SELECT * INTO v_init    FROM children   WHERE id = NEW.initiator_child_id;
  SELECT * INTO v_partner FROM children   WHERE id = NEW.partner_child_id;
  SELECT * INTO v_act     FROM activities WHERE id = NEW.activity_id;
  IF v_init.id IS NULL OR v_partner.id IS NULL THEN RETURN NEW; END IF;

  -- Invitation
  IF TG_OP = 'INSERT' THEN
    PERFORM enqueue_notification(
      'child', v_partner.id, 'friend_activity_invited',
      '👋 ' || v_init.display_name || ' t''invite',
      'Faire « ' || v_act.title || ' » ensemble, ça te dit ?',
      '👋', '/child/activities',
      jsonb_build_object('challenge_id', NEW.id),
      'normal', 'duo_challenge', NEW.id, v_init.id,
      ARRAY['in_app','push'], 'duo_inv:' || NEW.id::text
    );

    IF NEW.starts_at IS NOT NULL THEN
      PERFORM enqueue_notification(
        'child', v_partner.id, 'friend_activity_started',
        '⏱️ Votre défi commence bientôt',
        '« ' || v_act.title || ' » avec ' || v_init.display_name || ' dans 10 minutes.',
        '⏱️', '/child/activities',
        jsonb_build_object('challenge_id', NEW.id),
        'normal', 'duo_challenge', NEW.id, v_init.id,
        ARRAY['in_app','push'], 'duo_start_p:' || NEW.id::text,
        NEW.starts_at - interval '10 minutes'
      );
      PERFORM enqueue_notification(
        'child', v_init.id, 'friend_activity_started',
        '⏱️ Votre défi commence bientôt',
        '« ' || v_act.title || ' » avec ' || v_partner.display_name || ' dans 10 minutes.',
        '⏱️', '/child/activities',
        jsonb_build_object('challenge_id', NEW.id),
        'normal', 'duo_challenge', NEW.id, v_partner.id,
        ARRAY['in_app','push'], 'duo_start_i:' || NEW.id::text,
        NEW.starts_at - interval '10 minutes'
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Accepté
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    PERFORM enqueue_notification(
      'child', v_init.id, 'friend_activity_invited',
      '🙌 ' || v_partner.display_name || ' est partant !',
      'Votre défi « ' || v_act.title || ' » est lancé.',
      '🙌', '/child/activities',
      jsonb_build_object('challenge_id', NEW.id),
      'normal', 'duo_challenge', NEW.id, v_partner.id,
      ARRAY['in_app','push'], 'duo_acc:' || NEW.id::text
    );
  END IF;

  -- Refusé / annulé → on coupe tous les rappels programmés
  IF NEW.status IN ('declined','cancelled','expired') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM cancel_scheduled_notifications('duo_challenge', NEW.id);
  END IF;

  -- Terminé par les deux → bonus versé et tout le monde est prévenu
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM cancel_scheduled_notifications('duo_challenge', NEW.id);

    INSERT INTO points_ledger (child_id, source_type, source_id, points, reason)
    VALUES (v_init.id,    'bonus', NEW.id, NEW.bonus_points, 'Défi duo : ' || v_act.title),
           (v_partner.id, 'bonus', NEW.id, NEW.bonus_points, 'Défi duo : ' || v_act.title);

    UPDATE children SET total_points = total_points + NEW.bonus_points
     WHERE id IN (v_init.id, v_partner.id);

    PERFORM enqueue_notification(
      'child', v_init.id, 'friend_activity_completed',
      '🎉 Défi terminé !',
      'Vous avez tous les deux gagné ' || NEW.bonus_points || ' points.',
      '🎉', '/child/points',
      jsonb_build_object('challenge_id', NEW.id, 'bonus', NEW.bonus_points),
      'normal', 'duo_challenge', NEW.id, v_partner.id,
      ARRAY['in_app','push'], 'duo_done_i:' || NEW.id::text
    );
    PERFORM enqueue_notification(
      'child', v_partner.id, 'friend_activity_completed',
      '🎉 Défi terminé !',
      'Vous avez tous les deux gagné ' || NEW.bonus_points || ' points.',
      '🎉', '/child/points',
      jsonb_build_object('challenge_id', NEW.id, 'bonus', NEW.bonus_points),
      'normal', 'duo_challenge', NEW.id, v_init.id,
      ARRAY['in_app','push'], 'duo_done_p:' || NEW.id::text
    );

    -- Le parent voit passer le duo, en in-app seulement
    PERFORM enqueue_notification(
      'parent', v_init.parent_id, 'activity_completed',
      '🤝 Défi à deux réussi',
      v_init.display_name || ' et ' || v_partner.display_name || ' ont terminé « ' || v_act.title || ' ».',
      '🤝', '/parent/children/' || v_init.id::text,
      jsonb_build_object('challenge_id', NEW.id),
      'normal', 'duo_challenge', NEW.id, v_init.id,
      ARRAY['in_app'], 'duo_parent:' || NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS duo_challenge_notifications ON duo_challenges;
CREATE TRIGGER duo_challenge_notifications
  AFTER INSERT OR UPDATE OF status ON duo_challenges
  FOR EACH ROW EXECUTE FUNCTION on_duo_challenge_change();

-- Demande d'amitié → les deux parents sont sollicités
CREATE OR REPLACE FUNCTION on_child_friend_request()
RETURNS trigger AS $$
DECLARE
  v_a children%ROWTYPE;
  v_b children%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  SELECT * INTO v_a FROM children WHERE id = NEW.child_id;
  SELECT * INTO v_b FROM children WHERE id = NEW.friend_child_id;
  IF v_a.id IS NULL OR v_b.id IS NULL OR v_a.parent_id = v_b.parent_id THEN RETURN NEW; END IF;

  PERFORM enqueue_notification(
    'parent', v_a.parent_id, 'family_invitation',
    '👥 Demande d''ami',
    v_a.display_name || ' souhaite ajouter ' || v_b.display_name || ' en ami. Votre accord est nécessaire.',
    '👥', '/parent/children/' || v_a.id::text,
    jsonb_build_object('friendship_id', NEW.id),
    'high', 'child_friend', NEW.id, v_a.id,
    ARRAY['in_app','push'], 'friend_a:' || NEW.id::text
  );

  PERFORM enqueue_notification(
    'parent', v_b.parent_id, 'family_invitation',
    '👥 Demande d''ami',
    v_a.display_name || ' souhaite ajouter ' || v_b.display_name || ' en ami. Votre accord est nécessaire.',
    '👥', '/parent/children/' || v_b.id::text,
    jsonb_build_object('friendship_id', NEW.id),
    'high', 'child_friend', NEW.id, v_b.id,
    ARRAY['in_app','push'], 'friend_b:' || NEW.id::text
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS child_friend_notifications ON child_friends;
CREATE TRIGGER child_friend_notifications
  AFTER INSERT ON child_friends
  FOR EACH ROW EXECUTE FUNCTION on_child_friend_request();

-- ══════════════════════════════════════════════════════════════════════════
-- B. RITUEL FAMILLE
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS family_rituals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  -- 0 = dimanche … 6 = samedi (compatible EXTRACT(dow))
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  points integer NOT NULL DEFAULT 20 CHECK (points >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE family_rituals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_rituals" ON family_rituals;
CREATE POLICY "parent_rituals" ON family_rituals FOR ALL USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "child_reads_rituals" ON family_rituals;
CREATE POLICY "child_reads_rituals" ON family_rituals FOR SELECT
  USING (parent_id = current_child_parent_id());

CREATE TABLE IF NOT EXISTS family_ritual_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_id uuid NOT NULL REFERENCES family_rituals(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','done','missed','cancelled')),
  done_at timestamptz,
  -- Enfants ayant confirmé leur présence
  attendees uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz DEFAULT now(),
  UNIQUE (ritual_id, scheduled_at)
);

ALTER TABLE family_ritual_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_occurrences" ON family_ritual_occurrences;
CREATE POLICY "parent_occurrences" ON family_ritual_occurrences FOR ALL
  USING (EXISTS (SELECT 1 FROM family_rituals r WHERE r.id = ritual_id AND r.parent_id = auth.uid()));

DROP POLICY IF EXISTS "child_occurrences" ON family_ritual_occurrences;
CREATE POLICY "child_occurrences" ON family_ritual_occurrences FOR SELECT
  USING (EXISTS (SELECT 1 FROM family_rituals r WHERE r.id = ritual_id AND r.parent_id = current_child_parent_id()));

CREATE INDEX IF NOT EXISTS ritual_occurrences_due_idx
  ON family_ritual_occurrences(scheduled_at) WHERE status = 'planned';

-- Objectif familial de la semaine (5.6 / 5.7)
CREATE TABLE IF NOT EXISTS family_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  target_activities integer NOT NULL DEFAULT 5 CHECK (target_activities > 0),
  achieved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (parent_id, week_start)
);

ALTER TABLE family_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_goals" ON family_goals;
CREATE POLICY "parent_goals" ON family_goals FOR ALL USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "child_reads_goals" ON family_goals;
CREATE POLICY "child_reads_goals" ON family_goals FOR SELECT
  USING (parent_id = current_child_parent_id());

-- Génère les occurrences des 14 prochains jours et programme les rappels
CREATE OR REPLACE FUNCTION generate_ritual_occurrences()
RETURNS integer AS $$
DECLARE
  v_ritual family_rituals%ROWTYPE;
  v_date   date;
  v_at     timestamptz;
  v_id     uuid;
  v_child  record;
  v_created integer := 0;
BEGIN
  FOR v_ritual IN SELECT * FROM family_rituals WHERE is_active = true LOOP
    FOR i IN 0..13 LOOP
      v_date := current_date + i;
      CONTINUE WHEN EXTRACT(dow FROM v_date)::integer <> v_ritual.weekday;

      v_at := (v_date + v_ritual.start_time) AT TIME ZONE 'Europe/Paris';
      CONTINUE WHEN v_at <= now();

      INSERT INTO family_ritual_occurrences (ritual_id, scheduled_at)
      VALUES (v_ritual.id, v_at)
      ON CONFLICT (ritual_id, scheduled_at) DO NOTHING
      RETURNING id INTO v_id;

      CONTINUE WHEN v_id IS NULL;
      v_created := v_created + 1;

      -- Parent : la veille
      PERFORM enqueue_notification(
        'parent', v_ritual.parent_id, 'family_activity',
        '👨‍👩‍👧 ' || v_ritual.title,
        'C''est demain à ' || to_char(v_ritual.start_time, 'HH24hMI') || '.',
        '👨‍👩‍👧', '/parent/dashboard',
        jsonb_build_object('ritual_id', v_ritual.id, 'occurrence_id', v_id),
        'low', 'ritual_occurrence', v_id, NULL,
        ARRAY['in_app','push'], 'ritual_p1:' || v_id::text,
        v_at - interval '1 day'
      );

      -- Enfants : une heure avant
      FOR v_child IN SELECT id, display_name FROM children WHERE parent_id = v_ritual.parent_id AND is_active = true LOOP
        PERFORM enqueue_notification(
          'child', v_child.id, 'family_activity',
          '👨‍👩‍👧 ' || v_ritual.title,
          'Ça commence à ' || to_char(v_ritual.start_time, 'HH24hMI') || ' — on compte sur toi !',
          '👨‍👩‍👧', '/child/home',
          jsonb_build_object('ritual_id', v_ritual.id, 'occurrence_id', v_id),
          'normal', 'ritual_occurrence', v_id, v_child.id,
          ARRAY['in_app','push'], 'ritual_c:' || v_id::text || ':' || v_child.id::text,
          v_at - interval '1 hour'
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Une occurrence passée sans confirmation devient 'missed', sans reproche :
-- aucune notification n'est envoyée pour un rituel manqué.
CREATE OR REPLACE FUNCTION close_past_ritual_occurrences()
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
  UPDATE family_ritual_occurrences o
     SET status = 'missed'
    FROM family_rituals r
   WHERE o.ritual_id = r.id
     AND o.status = 'planned'
     AND o.scheduled_at + (r.duration_minutes || ' minutes')::interval < now() - interval '2 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Un rituel annulé ne doit plus rappeler quoi que ce soit
  PERFORM cancel_scheduled_notifications('ritual_occurrence', id)
    FROM family_ritual_occurrences WHERE status IN ('cancelled','missed','done');

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rituel confirmé → points pour les participants + mot au parent
CREATE OR REPLACE FUNCTION on_ritual_occurrence_done()
RETURNS trigger AS $$
DECLARE
  v_ritual family_rituals%ROWTYPE;
  v_child  uuid;
BEGIN
  IF NEW.status <> 'done' OR OLD.status = 'done' THEN RETURN NEW; END IF;

  SELECT * INTO v_ritual FROM family_rituals WHERE id = NEW.ritual_id;
  PERFORM cancel_scheduled_notifications('ritual_occurrence', NEW.id);

  FOREACH v_child IN ARRAY NEW.attendees LOOP
    INSERT INTO points_ledger (child_id, source_type, source_id, points, reason)
    VALUES (v_child, 'bonus', NEW.id, v_ritual.points, 'Rituel famille : ' || v_ritual.title);

    UPDATE children SET total_points = total_points + v_ritual.points WHERE id = v_child;

    PERFORM enqueue_notification(
      'child', v_child, 'family_activity',
      '💛 Merci d''y avoir été',
      '+' || v_ritual.points || ' points pour « ' || v_ritual.title || ' ».',
      '💛', '/child/points',
      jsonb_build_object('ritual_id', v_ritual.id),
      'normal', 'ritual_occurrence', NEW.id, v_child,
      ARRAY['in_app','push'], 'ritual_done:' || NEW.id::text || ':' || v_child::text
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ritual_occurrence_done ON family_ritual_occurrences;
CREATE TRIGGER ritual_occurrence_done
  AFTER UPDATE OF status ON family_ritual_occurrences
  FOR EACH ROW EXECUTE FUNCTION on_ritual_occurrence_done();

-- Objectif familial : « plus qu'une activité » (5.6)
CREATE OR REPLACE FUNCTION check_family_goals()
RETURNS integer AS $$
DECLARE
  v_goal family_goals%ROWTYPE;
  v_done integer;
  v_sent integer := 0;
BEGIN
  FOR v_goal IN
    SELECT * FROM family_goals
    WHERE week_start = date_trunc('week', current_date)::date
      AND achieved_at IS NULL
  LOOP
    SELECT count(*) INTO v_done
    FROM child_activities ca
    JOIN children c ON c.id = ca.child_id
    WHERE c.parent_id = v_goal.parent_id
      AND ca.status = 'validated'
      AND ca.validated_at >= v_goal.week_start;

    IF v_done >= v_goal.target_activities THEN
      UPDATE family_goals SET achieved_at = now() WHERE id = v_goal.id;

      PERFORM enqueue_notification(
        'parent', v_goal.parent_id, 'goal_completed',
        '🔥 Objectif de la semaine atteint',
        'Votre famille a réalisé ' || v_done || ' activités hors écran cette semaine.',
        '🔥', '/parent/dashboard',
        jsonb_build_object('goal_id', v_goal.id, 'done', v_done),
        'normal', 'family_goal', v_goal.id, NULL,
        ARRAY['in_app','push'], 'goal_done:' || v_goal.id::text
      );
      v_sent := v_sent + 1;

    ELSIF v_goal.target_activities - v_done = 1 THEN
      PERFORM enqueue_notification(
        'parent', v_goal.parent_id, 'goal_progress',
        '🔥 Plus qu''une activité',
        'Une seule activité et l''objectif familial de la semaine est atteint.',
        '🔥', '/parent/dashboard',
        jsonb_build_object('goal_id', v_goal.id, 'remaining', 1),
        'low', 'family_goal', v_goal.id, NULL,
        ARRAY['in_app','push'],
        'goal_almost:' || v_goal.id::text
      );
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Planification ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron absent : planifier generate_ritual_occurrences(), close_past_ritual_occurrences() et check_family_goals() depuis un worker externe.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('deconnect_rituals', 'deconnect_rituals_close', 'deconnect_family_goals');

  PERFORM cron.schedule('deconnect_rituals', '0 4 * * *',
    $cmd$ SELECT generate_ritual_occurrences(); $cmd$);
  PERFORM cron.schedule('deconnect_rituals_close', '0 * * * *',
    $cmd$ SELECT close_past_ritual_occurrences(); $cmd$);
  PERFORM cron.schedule('deconnect_family_goals', '0 18 * * *',
    $cmd$ SELECT check_family_goals(); $cmd$);
END $$;
