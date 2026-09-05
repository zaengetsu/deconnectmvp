-- ════════════════════════════════════════════════════════════════════════════
-- Migration 025 : modèle de notification v2
--
-- Objectif : passer d'un modèle « message » (titre + corps + is_read) à un
-- modèle de notification décidable — type, priorité, entité concernée, canal,
-- programmation, déduplication, statut.
--
-- Point d'entrée unique : enqueue_notification(). Il décide s'il faut envoyer,
-- différer (quiet hours) ou supprimer (préférence désactivée, doublon), puis
-- insère. create_notification() est conservée comme façade rétro-compatible.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Modèle notifications ────────────────────────────────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type          text,
  ADD COLUMN IF NOT EXISTS category      text,
  ADD COLUMN IF NOT EXISTS priority      text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS entity_type   text,
  ADD COLUMN IF NOT EXISTS entity_id     uuid,
  ADD COLUMN IF NOT EXISTS actor_child_id uuid REFERENCES children(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channels      text[] NOT NULL DEFAULT ARRAY['in_app'],
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS scheduled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS read_at       timestamptz,
  ADD COLUMN IF NOT EXISTS dedup_key     text,
  ADD COLUMN IF NOT EXISTS group_key     text,
  ADD COLUMN IF NOT EXISTS expires_at    timestamptz;

DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_priority_check
    CHECK (priority IN ('critical','high','normal','low'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_status_check
    CHECK (status IN ('scheduled','sent','cancelled','failed','suppressed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Historique : tout ce qui existe a été envoyé immédiatement
UPDATE notifications SET sent_at = COALESCE(sent_at, created_at) WHERE sent_at IS NULL;
UPDATE notifications SET read_at = COALESCE(read_at, created_at) WHERE is_read = true AND read_at IS NULL;

-- is_read (utilisé par le front actuel) et read_at restent cohérents
CREATE OR REPLACE FUNCTION sync_notification_read_state()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_read = true AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  ELSIF NEW.read_at IS NOT NULL AND NEW.is_read = false THEN
    NEW.is_read := true;
  ELSIF NEW.is_read = false AND NEW.read_at IS NOT NULL AND TG_OP = 'UPDATE'
        AND OLD.read_at IS NOT NULL AND OLD.is_read = true THEN
    NEW.read_at := NULL;  -- « marquer comme non lu »
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notifications_read_sync ON notifications;
CREATE TRIGGER notifications_read_sync
  BEFORE INSERT OR UPDATE OF is_read, read_at ON notifications
  FOR EACH ROW EXECUTE FUNCTION sync_notification_read_state();

-- Déduplication : une seule notification vivante par clé
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_idx
  ON notifications(dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('scheduled','sent');

CREATE INDEX IF NOT EXISTS notifications_due_idx
  ON notifications(scheduled_at) WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON notifications(entity_type, entity_id) WHERE entity_id IS NOT NULL;

-- ── 2. Préférences (5.15) — on étend la table existante, pas de doublon ────
ALTER TABLE notification_preferences
  -- canaux
  ADD COLUMN IF NOT EXISTS push_enabled   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS in_app_enabled boolean NOT NULL DEFAULT true,
  -- activités
  ADD COLUMN IF NOT EXISTS activity_completed  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS activity_validation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS activity_planned    boolean NOT NULL DEFAULT true,
  -- récompenses
  ADD COLUMN IF NOT EXISTS reward_unlocked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reward_pending  boolean NOT NULL DEFAULT true,
  -- famille
  ADD COLUMN IF NOT EXISTS family_activities boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS family_invitations boolean NOT NULL DEFAULT true,
  -- progression
  ADD COLUMN IF NOT EXISTS goals           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_summary   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_summary  boolean NOT NULL DEFAULT true,
  -- temps d'écran
  ADD COLUMN IF NOT EXISTS screen_time_goal    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS screen_time_summary boolean NOT NULL DEFAULT false,
  -- communication
  ADD COLUMN IF NOT EXISTS tips         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_news boolean NOT NULL DEFAULT false,
  -- quiet hours
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Paris',
  -- surcharge fine par type, si besoin : { "reward_pending": { "push": false } }
  ADD COLUMN IF NOT EXISTS channel_overrides jsonb NOT NULL DEFAULT '{}';

-- Une ligne par destinataire : le parent (child_id NULL) ou un enfant
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_parent_idx
  ON notification_preferences(parent_id) WHERE child_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_child_idx
  ON notification_preferences(child_id) WHERE child_id IS NOT NULL;

-- Quiet hours par défaut pour les enfants : 20h30 → 7h30
COMMENT ON COLUMN notification_preferences.quiet_hours_start IS
  'Début des horaires silencieux (heure locale du fuseau `timezone`). NULL = pas de quiet hours.';

-- L'enfant lit et modifie ses propres préférences
DROP POLICY IF EXISTS "child_own_preferences" ON notification_preferences;
CREATE POLICY "child_own_preferences" ON notification_preferences
  FOR SELECT USING (child_id = current_child_id());

-- ── 3. Décision : préférence + quiet hours ────────────────────────────────

-- Préférences applicables à un destinataire (crée la ligne par défaut au besoin)
CREATE OR REPLACE FUNCTION notification_prefs_for(
  p_recipient_type text,
  p_recipient_id uuid
)
RETURNS notification_preferences AS $$
DECLARE
  v_prefs notification_preferences%ROWTYPE;
  v_parent_id uuid;
BEGIN
  IF p_recipient_type = 'child' THEN
    SELECT * INTO v_prefs FROM notification_preferences WHERE child_id = p_recipient_id;
    IF FOUND THEN RETURN v_prefs; END IF;

    SELECT parent_id INTO v_parent_id FROM children WHERE id = p_recipient_id;
    IF v_parent_id IS NULL THEN RETURN v_prefs; END IF;

    INSERT INTO notification_preferences (parent_id, child_id, quiet_hours_start, quiet_hours_end)
    VALUES (v_parent_id, p_recipient_id, '20:30', '07:30')
    ON CONFLICT DO NOTHING;

    SELECT * INTO v_prefs FROM notification_preferences WHERE child_id = p_recipient_id;
    RETURN v_prefs;
  END IF;

  SELECT * INTO v_prefs FROM notification_preferences
  WHERE parent_id = p_recipient_id AND child_id IS NULL;
  IF FOUND THEN RETURN v_prefs; END IF;

  INSERT INTO notification_preferences (parent_id) VALUES (p_recipient_id)
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_prefs FROM notification_preferences
  WHERE parent_id = p_recipient_id AND child_id IS NULL;
  RETURN v_prefs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Le type est-il autorisé par les préférences ?
CREATE OR REPLACE FUNCTION notification_type_allowed(
  p_prefs notification_preferences,
  p_type text
)
RETURNS boolean AS $$
BEGIN
  RETURN CASE p_type
    WHEN 'activity_completed'   THEN p_prefs.activity_completed
    WHEN 'activity_validated'   THEN p_prefs.activity_completed
    WHEN 'activity_validation_required' THEN p_prefs.activity_validation
    WHEN 'activity_planned'     THEN p_prefs.activity_planned
    WHEN 'activity_reminder'    THEN p_prefs.activity_planned
    WHEN 'reward_unlocked'      THEN p_prefs.reward_unlocked
    WHEN 'reward_requested'     THEN p_prefs.reward_unlocked
    WHEN 'reward_pending'       THEN p_prefs.reward_pending
    WHEN 'reward_approved'      THEN p_prefs.reward_unlocked
    WHEN 'family_activity'      THEN p_prefs.family_activities
    WHEN 'family_invitation'    THEN p_prefs.family_invitations
    WHEN 'goal_progress'        THEN p_prefs.goals
    WHEN 'goal_completed'       THEN p_prefs.goals
    WHEN 'daily_summary'        THEN p_prefs.daily_summary
    WHEN 'weekly_summary'       THEN p_prefs.weekly_summary
    WHEN 'screen_time_goal'     THEN p_prefs.screen_time_goal
    WHEN 'screen_time_summary'  THEN p_prefs.screen_time_summary
    WHEN 'tip'                  THEN p_prefs.tips
    WHEN 'product_news'         THEN p_prefs.product_news
    ELSE true   -- niveaux, badges, sécurité : toujours autorisés
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Prochaine sortie de quiet hours, ou NULL si on peut envoyer maintenant.
-- Les notifications 'critical' ne sont jamais différées.
CREATE OR REPLACE FUNCTION next_send_time(
  p_prefs notification_preferences,
  p_priority text,
  p_at timestamptz DEFAULT now()
)
RETURNS timestamptz AS $$
DECLARE
  v_tz    text := COALESCE(p_prefs.timezone, 'Europe/Paris');
  v_local timestamp;
  v_time  time;
  v_start time := p_prefs.quiet_hours_start;
  v_end   time := p_prefs.quiet_hours_end;
  v_in_quiet boolean;
BEGIN
  IF p_priority = 'critical' OR v_start IS NULL OR v_end IS NULL THEN
    RETURN NULL;
  END IF;

  v_local := p_at AT TIME ZONE v_tz;
  v_time  := v_local::time;

  -- Plage qui traverse minuit (20:30 → 07:30) ou plage simple
  v_in_quiet := CASE
    WHEN v_start > v_end THEN (v_time >= v_start OR v_time < v_end)
    ELSE (v_time >= v_start AND v_time < v_end)
  END;

  IF NOT v_in_quiet THEN RETURN NULL; END IF;

  -- Fin des quiet hours : aujourd'hui si on est avant, demain sinon
  IF v_time < v_end THEN
    RETURN (date_trunc('day', v_local) + v_end) AT TIME ZONE v_tz;
  END IF;
  RETURN (date_trunc('day', v_local) + interval '1 day' + v_end) AT TIME ZONE v_tz;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 4. Point d'entrée unique ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enqueue_notification(
  p_recipient_type text,
  p_recipient_id   uuid,
  p_type           text,
  p_title          text,
  p_body           text,
  p_icon           text DEFAULT '🔔',
  p_route          text DEFAULT NULL,
  p_data           jsonb DEFAULT '{}',
  p_priority       text DEFAULT 'normal',
  p_entity_type    text DEFAULT NULL,
  p_entity_id      uuid DEFAULT NULL,
  p_actor_child_id uuid DEFAULT NULL,
  p_channels       text[] DEFAULT ARRAY['in_app','push'],
  p_dedup_key      text DEFAULT NULL,
  p_scheduled_at   timestamptz DEFAULT NULL,
  p_group_key      text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_prefs    notification_preferences%ROWTYPE;
  v_channels text[] := p_channels;
  v_when     timestamptz := COALESCE(p_scheduled_at, now());
  v_defer    timestamptz;
  v_status   text;
  v_id       uuid;
BEGIN
  v_prefs := notification_prefs_for(p_recipient_type, p_recipient_id);

  -- Préférence désactivée → on trace en 'suppressed' (utile pour l'audit),
  -- sans jamais afficher ni pousser.
  IF v_prefs.id IS NOT NULL AND NOT notification_type_allowed(v_prefs, p_type) THEN
    v_status   := 'suppressed';
    v_channels := ARRAY[]::text[];
  ELSE
    -- Filtrage des canaux selon les préférences
    IF v_prefs.id IS NOT NULL THEN
      IF NOT v_prefs.push_enabled   THEN v_channels := array_remove(v_channels, 'push');   END IF;
      IF NOT v_prefs.email_enabled  THEN v_channels := array_remove(v_channels, 'email');  END IF;
      IF NOT v_prefs.in_app_enabled THEN v_channels := array_remove(v_channels, 'in_app'); END IF;

      IF COALESCE((v_prefs.channel_overrides -> p_type ->> 'push')::boolean, true) = false THEN
        v_channels := array_remove(v_channels, 'push');
      END IF;
      IF COALESCE((v_prefs.channel_overrides -> p_type ->> 'email')::boolean, true) = false THEN
        v_channels := array_remove(v_channels, 'email');
      END IF;
    END IF;

    -- Quiet hours → on diffère, on ne jette pas
    IF p_scheduled_at IS NULL THEN
      v_defer := next_send_time(v_prefs, p_priority, now());
      IF v_defer IS NOT NULL THEN v_when := v_defer; END IF;
    END IF;

    v_status := CASE WHEN v_when > now() THEN 'scheduled' ELSE 'sent' END;
  END IF;

  INSERT INTO notifications (
    recipient_type, recipient_id, title, body, icon, route, data,
    type, priority, entity_type, entity_id, actor_child_id,
    channels, status, scheduled_at, sent_at, dedup_key, group_key
  ) VALUES (
    p_recipient_type, p_recipient_id, p_title, p_body, p_icon, p_route, p_data,
    p_type, p_priority, p_entity_type, p_entity_id, p_actor_child_id,
    v_channels, v_status,
    CASE WHEN v_status = 'scheduled' THEN v_when END,
    CASE WHEN v_status = 'sent'      THEN now() END,
    p_dedup_key, p_group_key
  )
  ON CONFLICT DO NOTHING          -- doublon (dedup_key) → on ignore
  RETURNING id INTO v_id;

  RETURN v_id;   -- NULL si dédupliquée
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Annule les notifications programmées devenues sans objet
-- (activité terminée ou annulée, récompense remise…)
CREATE OR REPLACE FUNCTION cancel_scheduled_notifications(
  p_entity_type text,
  p_entity_id uuid,
  p_types text[] DEFAULT NULL
)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
  UPDATE notifications
  SET status = 'cancelled'
  WHERE status = 'scheduled'
    AND entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND (p_types IS NULL OR type = ANY(p_types));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Façade rétro-compatible ────────────────────────────────────────────
-- L'ancien create_notification() continue de fonctionner : il délègue à
-- enqueue_notification() en conservant son contrôle d'autorisation (024).
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
  v_caller   uuid := auth.uid();
  v_child_id uuid := current_child_id();
BEGIN
  IF v_caller IS NOT NULL THEN
    IF v_child_id IS NOT NULL THEN
      IF p_recipient_type = 'parent' AND p_recipient_id != current_child_parent_id() THEN
        RAISE EXCEPTION 'Not authorized: child can only notify its own parent';
      END IF;
      IF p_recipient_type = 'child' AND p_recipient_id != v_child_id THEN
        RAISE EXCEPTION 'Not authorized: child can only notify itself';
      END IF;
    ELSE
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

  RETURN enqueue_notification(
    p_recipient_type, p_recipient_id,
    COALESCE(p_data ->> 'type', 'generic'),
    p_title, p_body, p_icon, p_route, p_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
