-- ════════════════════════════════════════════════════════════════════════════
-- Migration 028 : regroupement, résumés, relances parent, temps d'écran, emails
--
--  • 5.18  plusieurs notifications de même nature fusionnent au lieu de
--          s'empiler : « Vos enfants ont terminé 3 activités aujourd'hui »
--  • 5.7   résumé hebdomadaire parent
--  • 5.6   relances contextuelles parent (activité prévue non faite)
--  • 5.8   temps d'écran : source de données minimale + notifications
--          encourageantes (jamais de sanction)
--  • 5.14  canal email piloté depuis la base, en complément du push
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Regroupement (5.18) ────────────────────────────────────────────────
-- Texte agrégé pour un groupe. Une seule notification vivante par group_key :
-- la deuxième occurrence réécrit la première au lieu d'en créer une nouvelle.
CREATE OR REPLACE FUNCTION group_summary_text(p_type text, p_count integer)
RETURNS TABLE(title text, body text) AS $$
BEGIN
  IF p_type = 'activity_completed' THEN
    RETURN QUERY SELECT
      '🎉 Belle journée'::text,
      ('Vos enfants ont terminé ' || p_count || ' activités aujourd''hui.')::text;
  ELSIF p_type = 'activity_validation_required' THEN
    RETURN QUERY SELECT
      '👀 ' || p_count || ' activités à valider',
      'Vos enfants attendent votre validation.'::text;
  ELSE
    RETURN QUERY SELECT
      (p_count || ' nouvelles notifications')::text,
      ''::text;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- enqueue_notification, version regroupante.
-- Signature inchangée : tout le reste du système continue d'appeler la même
-- fonction.
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
  v_group    notifications%ROWTYPE;
  v_count    integer;
  v_agg      record;
BEGIN
  v_prefs := notification_prefs_for(p_recipient_type, p_recipient_id);

  IF v_prefs.id IS NOT NULL AND NOT notification_type_allowed(v_prefs, p_type) THEN
    v_status   := 'suppressed';
    v_channels := ARRAY[]::text[];
  ELSE
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

    IF p_scheduled_at IS NULL THEN
      v_defer := next_send_time(v_prefs, p_priority, now());
      IF v_defer IS NOT NULL THEN v_when := v_defer; END IF;
    END IF;

    v_status := CASE WHEN v_when > now() THEN 'scheduled' ELSE 'sent' END;
  END IF;

  -- ── Regroupement : une notification vivante et non lue partage ce group_key
  IF p_group_key IS NOT NULL AND v_status = 'sent' THEN
    SELECT * INTO v_group FROM notifications
     WHERE group_key = p_group_key
       AND status = 'sent'
       AND is_read = false
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      v_count := COALESCE((v_group.data ->> 'group_count')::integer, 1) + 1;
      SELECT * INTO v_agg FROM group_summary_text(p_type, v_count);

      UPDATE notifications
         SET title   = v_agg.title,
             body    = v_agg.body,
             data    = v_group.data || jsonb_build_object('group_count', v_count),
             sent_at = now(),
             -- la plus importante des deux l'emporte
             priority = CASE
               WHEN v_group.priority = 'critical' OR p_priority = 'critical' THEN 'critical'
               WHEN v_group.priority = 'high'     OR p_priority = 'high'     THEN 'high'
               WHEN v_group.priority = 'normal'   OR p_priority = 'normal'   THEN 'normal'
               ELSE 'low' END
       WHERE id = v_group.id;

      RETURN v_group.id;   -- pas de nouvelle ligne : on a fusionné
    END IF;
  END IF;

  INSERT INTO notifications (
    recipient_type, recipient_id, title, body, icon, route, data,
    type, priority, entity_type, entity_id, actor_child_id,
    channels, status, scheduled_at, sent_at, dedup_key, group_key
  ) VALUES (
    p_recipient_type, p_recipient_id, p_title, p_body, p_icon, p_route,
    p_data || CASE WHEN p_group_key IS NOT NULL THEN '{"group_count":1}'::jsonb ELSE '{}'::jsonb END,
    p_type, p_priority, p_entity_type, p_entity_id, p_actor_child_id,
    v_channels, v_status,
    CASE WHEN v_status = 'scheduled' THEN v_when END,
    CASE WHEN v_status = 'sent'      THEN now() END,
    p_dedup_key, p_group_key
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Résumé hebdomadaire parent (5.7) ───────────────────────────────────
CREATE OR REPLACE FUNCTION send_weekly_parent_summaries()
RETURNS integer AS $$
DECLARE
  v_parent  record;
  v_count   integer;
  v_minutes integer;
  v_sent    integer := 0;
BEGIN
  FOR v_parent IN
    SELECT p.id, p.full_name, p.email
    FROM profiles p
    JOIN notification_preferences np ON np.parent_id = p.id AND np.child_id IS NULL
    WHERE np.weekly_summary = true
  LOOP
    SELECT count(*), COALESCE(sum(a.duration_minutes), 0)
      INTO v_count, v_minutes
    FROM child_activities ca
    JOIN children c   ON c.id = ca.child_id
    JOIN activities a ON a.id = ca.activity_id
    WHERE c.parent_id = v_parent.id
      AND ca.status = 'validated'
      AND ca.validated_at >= current_date - 7;

    CONTINUE WHEN v_count = 0;

    PERFORM enqueue_notification(
      'parent', v_parent.id, 'weekly_summary',
      '📊 Votre semaine avec Deconnect',
      'Vos enfants ont réalisé ' || v_count || ' activité' || CASE WHEN v_count > 1 THEN 's' ELSE '' END ||
      CASE WHEN v_minutes > 0
           THEN ' et passé ' || (v_minutes / 60) || 'h' || lpad((v_minutes % 60)::text, 2, '0') || ' hors écran.'
           ELSE '.' END,
      '📊', '/parent/dashboard',
      jsonb_build_object('activities', v_count, 'minutes', v_minutes),
      'low', NULL, NULL, NULL,
      -- Le récapitulatif est exactement le type d'événement qui mérite un email (5.14)
      ARRAY['in_app','push','email'],
      'weekly:' || v_parent.id::text || ':' || to_char(current_date, 'IYYY-IW')
    );

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Relances contextuelles parent (5.6) ────────────────────────────────
-- « Lucas avait prévu 30 minutes de vélo cet après-midi. »
-- Une seule fois par activité et par jour, et seulement si elle est encore à faire.
CREATE OR REPLACE FUNCTION send_parent_context_reminders()
RETURNS integer AS $$
DECLARE
  v_row  record;
  v_sent integer := 0;
BEGIN
  FOR v_row IN
    SELECT ca.id AS ca_id, c.id AS child_id, c.parent_id, c.display_name, a.title
    FROM child_activities ca
    JOIN children c   ON c.id = ca.child_id
    JOIN activities a ON a.id = ca.activity_id
    WHERE ca.status = 'selected'
      AND ca.scheduled_for = current_date
  LOOP
    PERFORM enqueue_notification(
      'parent', v_row.parent_id, 'activity_planned',
      '📌 Petit rappel',
      v_row.display_name || ' avait prévu « ' || v_row.title || ' » aujourd''hui.',
      '📌', '/parent/children/' || v_row.child_id::text,
      jsonb_build_object('child_id', v_row.child_id, 'child_activity_id', v_row.ca_id),
      'low', 'child_activity', v_row.ca_id, v_row.child_id,
      ARRAY['in_app','push'],
      'parent_ctx:' || v_row.ca_id::text || ':' || current_date::text
    );
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Temps d'écran (5.8) ────────────────────────────────────────────────
-- Source de données minimale : l'app remonte une mesure par enfant et par jour.
-- Le produit encourage, il ne sanctionne pas : aucune notification n'est émise
-- quand l'objectif est dépassé.
CREATE TABLE IF NOT EXISTS screen_time_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  minutes integer NOT NULL CHECK (minutes >= 0),
  goal_minutes integer CHECK (goal_minutes IS NULL OR goal_minutes >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (child_id, day)
);

ALTER TABLE screen_time_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_screen_time" ON screen_time_daily;
CREATE POLICY "parent_screen_time" ON screen_time_daily FOR ALL
  USING (EXISTS (SELECT 1 FROM children c WHERE c.id = screen_time_daily.child_id AND c.parent_id = auth.uid()));

DROP POLICY IF EXISTS "child_own_screen_time" ON screen_time_daily;
CREATE POLICY "child_own_screen_time" ON screen_time_daily FOR ALL
  USING (child_id = current_child_id())
  WITH CHECK (child_id = current_child_id());

CREATE INDEX IF NOT EXISTS screen_time_child_day_idx ON screen_time_daily(child_id, day DESC);

-- L'appareil enfant remonte sa mesure du jour
CREATE OR REPLACE FUNCTION record_screen_time(
  p_child_id uuid,
  p_minutes integer,
  p_day date DEFAULT current_date
)
RETURNS void AS $$
BEGIN
  INSERT INTO screen_time_daily (child_id, day, minutes)
  VALUES (p_child_id, p_day, p_minutes)
  ON CONFLICT (child_id, day)
  DO UPDATE SET minutes = EXCLUDED.minutes, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Objectif respecté hier + progression hebdomadaire → uniquement du positif
CREATE OR REPLACE FUNCTION send_screen_time_notifications()
RETURNS integer AS $$
DECLARE
  v_row  record;
  v_prev integer;
  v_curr integer;
  v_drop integer;
  v_sent integer := 0;
BEGIN
  -- Objectif atteint hier
  FOR v_row IN
    SELECT st.child_id, st.minutes, st.goal_minutes, c.parent_id, c.display_name
    FROM screen_time_daily st
    JOIN children c ON c.id = st.child_id
    WHERE st.day = current_date - 1
      AND st.goal_minutes IS NOT NULL
      AND st.minutes <= st.goal_minutes
  LOOP
    PERFORM enqueue_notification(
      'parent', v_row.parent_id, 'screen_time_goal',
      '📱 Objectif atteint',
      v_row.display_name || ' a respecté son objectif de temps d''écran hier.',
      '📱', '/parent/children/' || v_row.child_id::text,
      jsonb_build_object('child_id', v_row.child_id, 'minutes', v_row.minutes),
      'low', 'child', v_row.child_id, v_row.child_id,
      ARRAY['in_app','push'],
      'st_goal:' || v_row.child_id::text || ':' || (current_date - 1)::text
    );
    v_sent := v_sent + 1;
  END LOOP;

  -- Progression sur 7 jours (uniquement si elle est bonne)
  FOR v_row IN SELECT id, parent_id, display_name FROM children WHERE is_active = true
  LOOP
    SELECT COALESCE(sum(minutes), 0) INTO v_prev FROM screen_time_daily
     WHERE child_id = v_row.id AND day >= current_date - 14 AND day < current_date - 7;
    SELECT COALESCE(sum(minutes), 0) INTO v_curr FROM screen_time_daily
     WHERE child_id = v_row.id AND day >= current_date - 7;

    CONTINUE WHEN v_prev = 0 OR v_curr >= v_prev;

    v_drop := round(((v_prev - v_curr)::numeric / v_prev) * 100);
    CONTINUE WHEN v_drop < 10;   -- en dessous, ce n'est pas un signal

    PERFORM enqueue_notification(
      'parent', v_row.parent_id, 'screen_time_summary',
      '🌱 Belle progression',
      v_row.display_name || ' a réduit son temps d''écran de ' || v_drop || ' % cette semaine.',
      '🌱', '/parent/children/' || v_row.id::text,
      jsonb_build_object('child_id', v_row.id, 'drop_percent', v_drop),
      'low', 'child', v_row.id, v_row.id,
      ARRAY['in_app'],
      'st_week:' || v_row.id::text || ':' || to_char(current_date, 'IYYY-IW')
    );
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Canal email piloté depuis la base (5.14) ───────────────────────────
CREATE OR REPLACE FUNCTION dispatch_email(p_notification_id uuid)
RETURNS void AS $$
DECLARE
  v_url   text := private.config('supabase_url');
  v_key   text := private.config('service_role_key');
  v_notif notifications%ROWTYPE;
  v_email text;
  v_name  text;
BEGIN
  IF v_url IS NULL OR v_key IS NULL OR to_regnamespace('net') IS NULL THEN
    RAISE NOTICE 'dispatch_email: configuration incomplète — email non envoyé';
    RETURN;
  END IF;

  SELECT * INTO v_notif FROM notifications WHERE id = p_notification_id;
  IF NOT FOUND OR v_notif.recipient_type <> 'parent' THEN RETURN; END IF;

  SELECT email, full_name INTO v_email, v_name FROM profiles WHERE id = v_notif.recipient_id;
  IF v_email IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/send-email',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'event_type', 'notification',
                 'recipient_email', v_email,
                 'recipient_name', v_name,
                 'data', jsonb_build_object(
                   'title', v_notif.title,
                   'body',  v_notif.body,
                   'route', COALESCE(v_notif.route, ''),
                   'type',  v_notif.type
                 )
               ),
    timeout_milliseconds := 8000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Le trigger d'envoi couvre désormais les deux canaux sortants
CREATE OR REPLACE FUNCTION on_notification_sent()
RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'sent' THEN RETURN NEW; END IF;
  IF 'push'  = ANY(NEW.channels) THEN PERFORM dispatch_push(NEW.id);  END IF;
  IF 'email' = ANY(NEW.channels) THEN PERFORM dispatch_email(NEW.id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- release_due_notifications doit envoyer les emails différés, elle aussi
CREATE OR REPLACE FUNCTION release_due_notifications(p_limit integer DEFAULT 200)
RETURNS TABLE(released integer, cancelled integer) AS $$
DECLARE
  v_notif notifications%ROWTYPE;
  v_released  integer := 0;
  v_cancelled integer := 0;
  v_prefs notification_preferences%ROWTYPE;
  v_defer timestamptz;
BEGIN
  FOR v_notif IN
    SELECT * FROM notifications
    WHERE status = 'scheduled' AND scheduled_at <= now()
    ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT notification_still_relevant(v_notif) THEN
      UPDATE notifications SET status = 'cancelled' WHERE id = v_notif.id;
      v_cancelled := v_cancelled + 1;
      CONTINUE;
    END IF;

    v_prefs := notification_prefs_for(v_notif.recipient_type, v_notif.recipient_id);
    v_defer := next_send_time(v_prefs, v_notif.priority, now());
    IF v_defer IS NOT NULL THEN
      UPDATE notifications SET scheduled_at = v_defer WHERE id = v_notif.id;
      CONTINUE;
    END IF;

    UPDATE notifications SET status = 'sent', sent_at = now() WHERE id = v_notif.id;

    IF 'push'  = ANY(v_notif.channels) THEN PERFORM dispatch_push(v_notif.id);  END IF;
    IF 'email' = ANY(v_notif.channels) THEN PERFORM dispatch_email(v_notif.id); END IF;

    v_released := v_released + 1;
  END LOOP;

  RETURN QUERY SELECT v_released, v_cancelled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Planification ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron absent : planifier send_weekly_parent_summaries(), send_parent_context_reminders() et send_screen_time_notifications() depuis un worker externe.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('deconnect_weekly_summary', 'deconnect_parent_reminders', 'deconnect_screen_time');

  -- Dimanche 18h00 Paris (16h UTC en été)
  PERFORM cron.schedule('deconnect_weekly_summary', '0 16 * * 0',
    $cmd$ SELECT send_weekly_parent_summaries(); $cmd$);

  -- 17h30 Paris : l'après-midi est passé, l'activité prévue ne l'est pas
  PERFORM cron.schedule('deconnect_parent_reminders', '30 15 * * *',
    $cmd$ SELECT send_parent_context_reminders(); $cmd$);

  -- 9h00 Paris
  PERFORM cron.schedule('deconnect_screen_time', '0 7 * * *',
    $cmd$ SELECT send_screen_time_notifications(); $cmd$);
END $$;
