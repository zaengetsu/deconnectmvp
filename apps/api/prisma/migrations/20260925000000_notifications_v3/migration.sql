-- Notifications v3 : emails automatiques, relances d'encouragement, et fin du double moteur Supabase (phase 3).
--
-- 1. File d'emails (email_messages) + désinscriptions (email_suppressions) + préférence « encouragements ».
-- 2. Un seul moteur de notifications : seule l'API (NotificationService) peut créer une notification.
--    Les anciens triggers SQL et pg_cron de Supabase ne peuvent plus en créer (garde-fou sur la table).
-- 3. Pont Supabase → outbox : tant que l'app mobile écrit encore certaines tables via supabase-js,
--    ces écritures publient les mêmes événements métier que l'API. Notifications, bons partenaires
--    et objectifs familiaux réagissent donc de la même façon, quel que soit le chemin d'écriture.
-- 4. Les tâches pg_cron « deconnect_* » sont retirées : le worker NestJS les exécute.
-- Idempotente et sans effet si les objets Supabase (pg_cron, anciens triggers) n'existent pas.

-- ─── 1. Emails ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template text NOT NULL,
  category text NOT NULL,
  audience text NOT NULL,
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_id uuid,
  dedup_key text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'suppressed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_dedup_key ON email_messages (dedup_key);
CREATE INDEX IF NOT EXISTS email_messages_pending_idx ON email_messages (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS email_messages_to_idx ON email_messages (to_email, created_at);

CREATE TABLE IF NOT EXISTS email_suppressions (
  email text NOT NULL,
  category text NOT NULL,
  source text NOT NULL DEFAULT 'link',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, category)
);

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS encouragements boolean NOT NULL DEFAULT true;

-- ─── 2. Un seul moteur de notifications ──────────────────────────────────────
-- L'API pose rekonect.notifications = 'api' (portée transaction) juste autour de ses écritures.
CREATE OR REPLACE FUNCTION rk_notifications_writer_is_api() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('rekonect.notifications', true), '') = 'api'
$$;

CREATE OR REPLACE FUNCTION rk_notifications_gate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF rk_notifications_writer_is_api() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NULL; -- ancien moteur SQL : la notification est ignorée (l'API l'enverra via l'événement)
  END IF;
  -- Mise à jour hors API (app mobile, anciens triggers) : lu / non lu / annulation seulement,
  -- jamais de réécriture du contenu (l'ancien regroupement SQL réécrivait titre et corps).
  NEW.title := OLD.title;
  NEW.body := OLD.body;
  NEW.data := OLD.data;
  NEW.priority := OLD.priority;
  NEW.channels := OLD.channels;
  NEW.sent_at := OLD.sent_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_notifications_gate ON notifications;
CREATE TRIGGER rk_notifications_gate
  BEFORE INSERT OR UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION rk_notifications_gate();

-- Anciens déclencheurs purement « notification » (remplacés par les consommateurs de l'API)
-- et envoi push via pg_net → Edge Function (remplacé par DeliveryService).
DROP TRIGGER IF EXISTS child_activity_notifications ON child_activities;
DROP TRIGGER IF EXISTS reward_request_notifications ON reward_requests;
DROP TRIGGER IF EXISTS child_friend_notifications ON child_friends;
DROP TRIGGER IF EXISTS notification_push_dispatch ON notifications;

-- ─── 3. Pont Supabase → outbox ───────────────────────────────────────────────
-- Écriture faite par l'app via PostgREST / RPC Supabase (jeton Supabase présent dans la requête).
CREATE OR REPLACE FUNCTION rk_legacy_write() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), nullif(current_setting('request.jwt.claim.sub', true), '')) IS NOT NULL
$$;

-- Les anciens triggers qui versent des points ne doivent tourner que pour les écritures Supabase :
-- quand l'API écrit, elle verse elle-même les points (sinon ils seraient comptés deux fois).
DO $$
DECLARE
  t record;
  def text;
BEGIN
  FOR t IN
    SELECT tg.oid, tg.tgname, c.relname
    FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
    WHERE NOT tg.tgisinternal
      AND tg.tgname IN ('duo_challenge_notifications', 'ritual_occurrence_done')
  LOOP
    def := pg_get_triggerdef(t.oid);
    IF position('rk_legacy_write' IN def) = 0 THEN
      EXECUTE format('DROP TRIGGER %I ON %I', t.tgname, t.relname);
      EXECUTE replace(def, ' EXECUTE FUNCTION ', ' WHEN (rk_legacy_write()) EXECUTE FUNCTION ');
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION rk_emit(p_type text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO outbox_events (type, aggregate_type, aggregate_id, actor, payload)
  VALUES (p_type, p_aggregate_type, p_aggregate_id::text, jsonb_build_object('kind', 'system', 'id', 'supabase'), p_payload);
  PERFORM pg_notify('outbox', p_type);
END $$;

-- child_activities : planification, soumission, validation, refus, abandon, assignation.
CREATE OR REPLACE FUNCTION rk_bridge_child_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent uuid;
  v_total integer;
  v_level integer;
  v_category uuid;
  v_changed boolean := TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status;
BEGIN
  SELECT parent_id, coalesce(total_points, 0), coalesce(level, 1) INTO v_parent, v_total, v_level FROM children WHERE id = NEW.child_id;
  IF v_parent IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.assigned_by IS NOT NULL AND coalesce(NEW.assigned_by_role, 'parent') = 'parent' THEN
    PERFORM rk_emit('activity.assigned', 'child_activity', NEW.id, jsonb_build_object(
      'childActivityId', NEW.id, 'childId', NEW.child_id, 'parentId', v_parent, 'activityId', NEW.activity_id));
  END IF;

  IF NEW.status = 'selected' AND NEW.scheduled_for IS NOT NULL
     AND (v_changed OR OLD.scheduled_for IS DISTINCT FROM NEW.scheduled_for) THEN
    PERFORM rk_emit('activity.planned', 'child_activity', NEW.id, jsonb_build_object(
      'childActivityId', NEW.id, 'childId', NEW.child_id, 'scheduledFor', to_char(NEW.scheduled_for, 'YYYY-MM-DD')));
  END IF;

  IF NOT v_changed THEN RETURN NEW; END IF;

  IF NEW.status = 'submitted' THEN
    PERFORM rk_emit('activity.submitted', 'child_activity', NEW.id, jsonb_build_object(
      'childActivityId', NEW.id, 'childId', NEW.child_id, 'parentId', v_parent, 'activityId', NEW.activity_id));
  ELSIF NEW.status = 'validated' THEN
    SELECT category_id INTO v_category FROM activities WHERE id = NEW.activity_id;
    PERFORM rk_emit('activity.validated', 'child_activity', NEW.id, jsonb_build_object(
      'childActivityId', NEW.id, 'childId', NEW.child_id, 'parentId', v_parent, 'activityId', NEW.activity_id,
      'categoryId', v_category, 'points', coalesce(NEW.earned_points, 0), 'newTotal', v_total, 'newLevel', v_level,
      'levelUp', false, 'badgesAwarded', 0));
  ELSIF NEW.status = 'rejected' THEN
    PERFORM rk_emit('activity.rejected', 'child_activity', NEW.id, jsonb_build_object(
      'childActivityId', NEW.id, 'childId', NEW.child_id, 'reason', nullif(NEW.rejection_reason, '')));
  ELSIF NEW.status = 'available' AND TG_OP = 'UPDATE' THEN
    PERFORM rk_emit('activity.abandoned', 'child_activity', NEW.id, jsonb_build_object(
      'childActivityId', NEW.id, 'childId', NEW.child_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_child_activity ON child_activities;
CREATE TRIGGER rk_bridge_child_activity
  AFTER INSERT OR UPDATE OF status, scheduled_for ON child_activities
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_child_activity();

-- reward_requests : demande, validation, refus, remise.
CREATE OR REPLACE FUNCTION rk_bridge_reward_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent uuid;
  v_cost integer;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  SELECT parent_id INTO v_parent FROM children WHERE id = NEW.child_id;
  SELECT coalesce(required_points, 0) INTO v_cost FROM rewards WHERE id = NEW.reward_id;
  IF v_parent IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'pending' AND TG_OP = 'INSERT' THEN
    PERFORM rk_emit('reward.requested', 'reward_request', NEW.id, jsonb_build_object(
      'requestId', NEW.id, 'rewardId', NEW.reward_id, 'childId', NEW.child_id, 'parentId', v_parent));
  ELSIF NEW.status = 'approved' THEN
    PERFORM rk_emit('reward.approved', 'reward_request', NEW.id, jsonb_build_object(
      'requestId', NEW.id, 'rewardId', NEW.reward_id, 'childId', NEW.child_id, 'parentId', v_parent, 'pointsDeducted', coalesce(v_cost, 0)));
  ELSIF NEW.status = 'rejected' THEN
    PERFORM rk_emit('reward.rejected', 'reward_request', NEW.id, jsonb_build_object(
      'requestId', NEW.id, 'rewardId', NEW.reward_id, 'childId', NEW.child_id, 'note', nullif(NEW.parent_note, '')));
  ELSIF NEW.status = 'completed' THEN
    IF TG_OP = 'INSERT' OR OLD.status = 'pending' THEN
      PERFORM rk_emit('reward.approved', 'reward_request', NEW.id, jsonb_build_object(
        'requestId', NEW.id, 'rewardId', NEW.reward_id, 'childId', NEW.child_id, 'parentId', v_parent, 'pointsDeducted', coalesce(v_cost, 0)));
    END IF;
    PERFORM rk_emit('reward.delivered', 'reward_request', NEW.id, jsonb_build_object(
      'requestId', NEW.id, 'rewardId', NEW.reward_id, 'childId', NEW.child_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_reward_request ON reward_requests;
CREATE TRIGGER rk_bridge_reward_request
  AFTER INSERT OR UPDATE OF status ON reward_requests
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_reward_request();

-- child_friends : demande d'ami.
CREATE OR REPLACE FUNCTION rk_bridge_child_friend() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM rk_emit('friend.requested', 'child_friend', NEW.id, jsonb_build_object(
    'friendshipId', NEW.id, 'childId', NEW.child_id, 'friendChildId', NEW.friend_child_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_child_friend ON child_friends;
CREATE TRIGGER rk_bridge_child_friend
  AFTER INSERT ON child_friends
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_child_friend();

-- duo_challenges : invitation, acceptation, fin.
CREATE OR REPLACE FUNCTION rk_bridge_duo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM rk_emit('duo.invited', 'duo_challenge', NEW.id, jsonb_build_object(
      'challengeId', NEW.id, 'initiatorChildId', NEW.initiator_child_id, 'partnerChildId', NEW.partner_child_id,
      'startsAt', to_char(NEW.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'accepted' THEN
    PERFORM rk_emit('duo.accepted', 'duo_challenge', NEW.id, jsonb_build_object('challengeId', NEW.id));
  ELSIF NEW.status IN ('declined', 'cancelled', 'expired') THEN
    PERFORM rk_emit('duo.closed', 'duo_challenge', NEW.id, jsonb_build_object('challengeId', NEW.id, 'status', NEW.status));
  ELSIF NEW.status = 'completed' THEN
    PERFORM rk_emit('duo.completed', 'duo_challenge', NEW.id, jsonb_build_object('challengeId', NEW.id, 'bonusPoints', coalesce(NEW.bonus_points, 0)));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_duo ON duo_challenges;
CREATE TRIGGER rk_bridge_duo
  AFTER INSERT OR UPDATE OF status ON duo_challenges
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_duo();

-- family_ritual_occurrences : rituel fait / manqué / annulé.
CREATE OR REPLACE FUNCTION rk_bridge_ritual() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_points integer;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'done' THEN
    SELECT coalesce(points, 0) INTO v_points FROM family_rituals WHERE id = NEW.ritual_id;
    PERFORM rk_emit('ritual.done', 'ritual_occurrence', NEW.id, jsonb_build_object(
      'occurrenceId', NEW.id, 'ritualId', NEW.ritual_id, 'attendees', to_jsonb(coalesce(NEW.attendees, ARRAY[]::uuid[])), 'points', coalesce(v_points, 0)));
  ELSIF NEW.status IN ('missed', 'cancelled') THEN
    PERFORM rk_emit('ritual.closed', 'ritual_occurrence', NEW.id, jsonb_build_object('occurrenceId', NEW.id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_ritual ON family_ritual_occurrences;
CREATE TRIGGER rk_bridge_ritual
  AFTER UPDATE OF status ON family_ritual_occurrences
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_ritual();

-- child_link_tokens : appareil de l'enfant relié.
CREATE OR REPLACE FUNCTION rk_bridge_device_linked() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'linked' AND OLD.status IS DISTINCT FROM 'linked' THEN
    PERFORM rk_emit('child.device_linked', 'child', NEW.child_id, jsonb_build_object('childId', NEW.child_id, 'parentId', NEW.parent_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_device_linked ON child_link_tokens;
CREATE TRIGGER rk_bridge_device_linked
  AFTER UPDATE OF status ON child_link_tokens
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_device_linked();

-- children : profil enfant créé depuis l'app.
CREATE OR REPLACE FUNCTION rk_bridge_child_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM rk_emit('child.created', 'child', NEW.id, jsonb_build_object('childId', NEW.id, 'parentId', NEW.parent_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_child_created ON children;
CREATE TRIGGER rk_bridge_child_created
  AFTER INSERT ON children
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_child_created();

-- family_invitations / family_members : invitation d'un co-parent et arrivée dans la famille.
CREATE OR REPLACE FUNCTION rk_bridge_family_invitation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM rk_emit('family.invitation_created', 'family_invitation', NEW.id, jsonb_build_object(
    'invitationId', NEW.id, 'ownerId', NEW.owner_id, 'email', nullif(NEW.invite_email, ''), 'role', NEW.member_role));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_family_invitation ON family_invitations;
CREATE TRIGGER rk_bridge_family_invitation
  AFTER INSERT ON family_invitations
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_family_invitation();

CREATE OR REPLACE FUNCTION rk_bridge_family_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM rk_emit('family.member_joined', 'family_member', NEW.id, jsonb_build_object(
      'ownerId', NEW.owner_id, 'memberId', NEW.member_id, 'role', NEW.member_role));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_family_member ON family_members;
CREATE TRIGGER rk_bridge_family_member
  AFTER INSERT OR UPDATE OF status ON family_members
  FOR EACH ROW WHEN (rk_legacy_write()) EXECUTE FUNCTION rk_bridge_family_member();

-- profiles : compte parent créé par Supabase Auth (connexion GoTrue « supabase_auth_admin ») ou par l'app.
-- L'inscription via l'API publie déjà user.registered (et crée la ligne users avant le profil).
CREATE OR REPLACE FUNCTION rk_bridge_profile_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (session_user IN ('supabase_auth_admin', 'authenticator') OR rk_legacy_write())
     AND coalesce(NEW.role, 'parent') = 'parent' AND NEW.email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.id) THEN
    PERFORM rk_emit('user.registered', 'user', NEW.id, jsonb_build_object('userId', NEW.id, 'role', 'parent', 'email', NEW.email));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rk_bridge_profile_created ON profiles;
CREATE TRIGGER rk_bridge_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION rk_bridge_profile_created();

-- ─── 4. pg_cron : les tâches sont désormais exécutées par le worker ────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    EXECUTE $cmd$SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'deconnect\_%'$cmd$;
  END IF;
END $$;
