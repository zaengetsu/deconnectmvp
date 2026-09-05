-- ════════════════════════════════════════════════════════════════════════════
-- Migration 027 : branchement du push + scheduler
--
-- Jusqu'ici l'Edge Function send-push-notification n'était appelée par
-- personne : une notification n'existait que dans la table, et n'atteignait
-- l'utilisateur que si l'app était ouverte (Realtime).
--
-- Ici : INSERT d'une notification 'sent' avec le canal 'push' → appel de
-- l'Edge Function via pg_net. Et un job pg_cron libère les notifications
-- programmées arrivées à échéance, après re-vérification de leur pertinence.
--
-- La migration ne casse rien si pg_net / pg_cron ne sont pas disponibles :
-- les fonctions existent, elles ne font simplement rien (log NOTICE).
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS private;

-- Config serveur (jamais exposée au client)
CREATE TABLE IF NOT EXISTS private.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE private.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_client_access" ON private.app_config;
CREATE POLICY "no_client_access" ON private.app_config FOR ALL USING (false);

COMMENT ON TABLE private.app_config IS
  'À renseigner une fois après déploiement :
   insert into private.app_config(key,value) values
     (''supabase_url'', ''https://<ref>.supabase.co''),
     (''service_role_key'', ''<clé service_role>'')
   on conflict (key) do update set value = excluded.value, updated_at = now();';

CREATE OR REPLACE FUNCTION private.config(p_key text)
RETURNS text AS $$
  SELECT value FROM private.app_config WHERE key = p_key;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Envoi du push pour une notification ───────────────────────────────────
CREATE OR REPLACE FUNCTION dispatch_push(p_notification_id uuid)
RETURNS void AS $$
DECLARE
  v_url text := private.config('supabase_url');
  v_key text := private.config('service_role_key');
BEGIN
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'dispatch_push: private.app_config incomplet — push non envoyé';
    RETURN;
  END IF;

  IF to_regnamespace('net') IS NULL THEN
    RAISE NOTICE 'dispatch_push: extension pg_net absente — push non envoyé';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('notification_id', p_notification_id),
    timeout_milliseconds := 8000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger : toute notification envoyée part aussi en push ───────────────
CREATE OR REPLACE FUNCTION on_notification_sent()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'sent' AND 'push' = ANY(NEW.channels) THEN
    PERFORM dispatch_push(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notification_push_dispatch ON notifications;
CREATE TRIGGER notification_push_dispatch
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION on_notification_sent();

-- ── Pertinence d'un rappel au moment de l'envoi (5.9) ─────────────────────
-- Une notification programmée il y a 6 h peut être devenue absurde :
-- activité déjà terminée, récompense déjà remise, demande annulée.
CREATE OR REPLACE FUNCTION notification_still_relevant(p_notif notifications)
RETURNS boolean AS $$
DECLARE
  v_status text;
BEGIN
  IF p_notif.entity_id IS NULL THEN RETURN true; END IF;

  IF p_notif.entity_type = 'child_activity' THEN
    SELECT status INTO v_status FROM child_activities WHERE id = p_notif.entity_id;
    IF v_status IS NULL THEN RETURN false; END IF;
    -- Un rappel n'a de sens que si l'activité est encore à faire
    IF p_notif.type IN ('activity_reminder','activity_planned') THEN
      RETURN v_status = 'selected';
    END IF;
    RETURN v_status NOT IN ('validated','rejected');
  END IF;

  IF p_notif.entity_type = 'reward_request' THEN
    SELECT status INTO v_status FROM reward_requests WHERE id = p_notif.entity_id;
    IF v_status IS NULL THEN RETURN false; END IF;
    IF p_notif.type = 'reward_pending' THEN
      RETURN v_status = 'pending';
    END IF;
    RETURN true;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── Libération des notifications programmées ──────────────────────────────
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
    -- Devenue sans objet → annulée, jamais envoyée
    IF NOT notification_still_relevant(v_notif) THEN
      UPDATE notifications SET status = 'cancelled' WHERE id = v_notif.id;
      v_cancelled := v_cancelled + 1;
      CONTINUE;
    END IF;

    -- Toujours dans les quiet hours (échéance tombée la nuit) → on re-diffère
    v_prefs := notification_prefs_for(v_notif.recipient_type, v_notif.recipient_id);
    v_defer := next_send_time(v_prefs, v_notif.priority, now());
    IF v_defer IS NOT NULL THEN
      UPDATE notifications SET scheduled_at = v_defer WHERE id = v_notif.id;
      CONTINUE;
    END IF;

    UPDATE notifications
    SET status = 'sent', sent_at = now()
    WHERE id = v_notif.id;

    IF 'push' = ANY(v_notif.channels) THEN
      PERFORM dispatch_push(v_notif.id);
    END IF;

    v_released := v_released + 1;
  END LOOP;

  RETURN QUERY SELECT v_released, v_cancelled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Résumé quotidien parent (5.7) ─────────────────────────────────────────
-- N'envoie rien s'il n'y a rien à raconter : pas de notification vide.
CREATE OR REPLACE FUNCTION send_daily_parent_summaries()
RETURNS integer AS $$
DECLARE
  v_parent record;
  v_done   integer;
  v_pending integer;
  v_sent   integer := 0;
  v_lines  text;
BEGIN
  FOR v_parent IN
    SELECT p.id, p.full_name
    FROM profiles p
    JOIN notification_preferences np ON np.parent_id = p.id AND np.child_id IS NULL
    WHERE np.daily_summary = true
  LOOP
    SELECT count(*) INTO v_done
    FROM child_activities ca
    JOIN children c ON c.id = ca.child_id
    WHERE c.parent_id = v_parent.id
      AND ca.status = 'validated'
      AND ca.validated_at >= current_date;

    SELECT count(*) INTO v_pending
    FROM reward_requests rr
    JOIN children c ON c.id = rr.child_id
    WHERE c.parent_id = v_parent.id AND rr.status = 'pending';

    CONTINUE WHEN v_done = 0 AND v_pending = 0;

    SELECT string_agg(c.display_name || ' : ' || cnt || ' activité' || CASE WHEN cnt > 1 THEN 's' ELSE '' END, E'\n')
    INTO v_lines
    FROM (
      SELECT ca.child_id, count(*) AS cnt
      FROM child_activities ca
      JOIN children c2 ON c2.id = ca.child_id
      WHERE c2.parent_id = v_parent.id AND ca.status = 'validated' AND ca.validated_at >= current_date
      GROUP BY ca.child_id
    ) t
    JOIN children c ON c.id = t.child_id;

    PERFORM enqueue_notification(
      'parent', v_parent.id, 'daily_summary',
      '🌙 Aujourd''hui avec Deconnect',
      COALESCE(v_lines, '') ||
        CASE WHEN v_pending > 0
             THEN E'\n' || v_pending || ' récompense' || CASE WHEN v_pending > 1 THEN 's' ELSE '' END || ' à valider'
             ELSE '' END,
      '🌙', '/parent',
      jsonb_build_object('activities', v_done, 'pending_rewards', v_pending),
      'low', NULL, NULL, NULL,
      ARRAY['in_app','push'],
      'daily_summary:' || v_parent.id::text || ':' || current_date::text
    );

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Planification (pg_cron si disponible) ─────────────────────────────────
DO $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron absent : planifier release_due_notifications() depuis un worker externe (toutes les 5 min).';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('deconnect_release_notifications', 'deconnect_daily_summary');

  PERFORM cron.schedule(
    'deconnect_release_notifications', '*/5 * * * *',
    $cmd$ SELECT release_due_notifications(); $cmd$
  );

  -- 19h30 Europe/Paris ≈ 17h30 UTC (été) — la fonction respecte les quiet hours
  PERFORM cron.schedule(
    'deconnect_daily_summary', '30 17 * * *',
    $cmd$ SELECT send_daily_parent_summaries(); $cmd$
  );
END $$;
