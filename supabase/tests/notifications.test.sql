-- ════════════════════════════════════════════════════════════════════════════
-- Tests du système de notifications (5.19)
--
-- Lancement :  psql "$DATABASE_URL" -f supabase/tests/notifications.test.sql
--          ou  supabase db execute --file supabase/tests/notifications.test.sql
--
-- Tout se déroule dans une transaction annulée à la fin : aucune donnée
-- n'est laissée derrière. Chaque test échoue bruyamment (ASSERT) au premier
-- écart, avec le nom du cas.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_parent   uuid := gen_random_uuid();
  v_child_a  uuid;
  v_child_b  uuid;
  v_activity uuid;
  v_ca       uuid;
  v_ca2      uuid;
  v_reward   uuid;
  v_request  uuid;
  v_count    integer;
  v_status   text;
  v_route    text;
  v_prefs    notification_preferences%ROWTYPE;
  v_next     timestamptz;
  v_id1      uuid;
  v_id2      uuid;
BEGIN
  -- ── Fixtures ────────────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES (v_parent, 'test-notif@example.com');
  INSERT INTO profiles (id, email, full_name) VALUES (v_parent, 'test-notif@example.com', 'Parent Test');

  INSERT INTO children (parent_id, display_name, age)
  VALUES (v_parent, 'Léa', 9) RETURNING id INTO v_child_a;

  INSERT INTO children (parent_id, display_name, age)
  VALUES (v_parent, 'Noah', 15) RETURNING id INTO v_child_b;

  INSERT INTO activities (title, points, created_by, is_public)
  VALUES ('30 minutes de vélo', 40, v_parent, false) RETURNING id INTO v_activity;

  -- Pas de quiet hours pendant les tests, sauf là où on les teste
  PERFORM notification_prefs_for('parent', v_parent);
  UPDATE notification_preferences
     SET quiet_hours_start = NULL, quiet_hours_end = NULL
   WHERE parent_id = v_parent AND child_id IS NULL;

  PERFORM notification_prefs_for('child', v_child_a);
  UPDATE notification_preferences
     SET quiet_hours_start = NULL, quiet_hours_end = NULL
   WHERE child_id = v_child_a;

  -- ══ 1. Activité soumise → le parent doit valider ═══════════════════════
  INSERT INTO child_activities (child_id, activity_id, status, submitted_at)
  VALUES (v_child_a, v_activity, 'submitted', now()) RETURNING id INTO v_ca;

  SELECT count(*) INTO v_count FROM notifications
   WHERE recipient_type = 'parent' AND recipient_id = v_parent
     AND type = 'activity_validation_required' AND entity_id = v_ca;
  ASSERT v_count = 1, '1. activité soumise → notification parent manquante';

  SELECT priority, route INTO v_status, v_route FROM notifications
   WHERE type = 'activity_validation_required' AND entity_id = v_ca;
  ASSERT v_status = 'high',  '1b. une action parent attendue doit être en priorité high';
  ASSERT v_route IS NOT NULL, '1c. deep link absent : la notification ouvrirait le dashboard';

  -- ══ 2. Validation → enfant ET parent notifiés ══════════════════════════
  PERFORM validate_child_activity(v_ca, v_parent);

  SELECT count(*) INTO v_count FROM notifications
   WHERE recipient_type = 'child' AND recipient_id = v_child_a AND type = 'activity_validated';
  ASSERT v_count = 1, '2. activité validée → notification enfant manquante';

  SELECT count(*) INTO v_count FROM notifications
   WHERE recipient_type = 'parent' AND recipient_id = v_parent AND type = 'activity_completed';
  ASSERT v_count = 1, '2b. activité validée → notification parent manquante';

  -- Le parent reçoit l'info en in-app seulement : pas d'email par activité (5.14)
  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'activity_completed' AND 'email' = ANY(channels);
  ASSERT v_count = 0, '2c. une activité terminée ne doit pas déclencher d''email';

  -- ══ 3. Aucun rappel ne survit à une activité terminée ══════════════════
  INSERT INTO child_activities (child_id, activity_id, status, scheduled_for)
  VALUES (v_child_a, v_activity, 'selected', current_date) RETURNING id INTO v_ca2;

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'activity_reminder' AND entity_id = v_ca2 AND status = 'scheduled';
  ASSERT v_count = 1, '3. activité planifiée → rappel non programmé';

  UPDATE child_activities SET status = 'submitted', submitted_at = now() WHERE id = v_ca2;

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'activity_reminder' AND entity_id = v_ca2 AND status = 'scheduled';
  ASSERT v_count = 0, '3b. rappel encore programmé alors que l''activité est terminée';

  -- ══ 4. Aucun rappel après annulation ═══════════════════════════════════
  INSERT INTO child_activities (child_id, activity_id, status, scheduled_for)
  VALUES (v_child_a, v_activity, 'selected', current_date + 1) RETURNING id INTO v_ca2;

  UPDATE child_activities SET status = 'available' WHERE id = v_ca2;

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'activity_reminder' AND entity_id = v_ca2 AND status = 'scheduled';
  ASSERT v_count = 0, '4. rappel maintenu après annulation de l''activité';

  -- ══ 5. Anti-duplication ════════════════════════════════════════════════
  v_id1 := enqueue_notification('parent', v_parent, 'tip', 'Conseil', 'Corps', '💡', '/parent',
                                '{}', 'low', NULL, NULL, NULL, ARRAY['in_app'], 'dedup-test');
  v_id2 := enqueue_notification('parent', v_parent, 'tip', 'Conseil', 'Corps', '💡', '/parent',
                                '{}', 'low', NULL, NULL, NULL, ARRAY['in_app'], 'dedup-test');
  ASSERT v_id1 IS NOT NULL, '5. première notification non créée';
  ASSERT v_id2 IS NULL,     '5b. doublon créé malgré la clé de déduplication';

  -- ══ 6. Quiet hours : différé, pas jeté ═════════════════════════════════
  UPDATE notification_preferences
     SET quiet_hours_start = (now() AT TIME ZONE 'Europe/Paris')::time - interval '1 hour',
         quiet_hours_end   = (now() AT TIME ZONE 'Europe/Paris')::time + interval '2 hours',
         timezone = 'Europe/Paris'
   WHERE child_id = v_child_a;

  v_id1 := enqueue_notification('child', v_child_a, 'activity_reminder', 'Rappel', 'Corps',
                                '🔔', '/child/activities', '{}', 'low');
  SELECT status INTO v_status FROM notifications WHERE id = v_id1;
  ASSERT v_status = 'scheduled', '6. notification envoyée pendant les quiet hours';

  -- ... sauf une notification critique
  v_id2 := enqueue_notification('child', v_child_a, 'security', 'Sécurité', 'Corps',
                                '🔒', '/child', '{}', 'critical');
  SELECT status INTO v_status FROM notifications WHERE id = v_id2;
  ASSERT v_status = 'sent', '6b. une notification critical ne doit jamais être différée';

  UPDATE notification_preferences SET quiet_hours_start = NULL, quiet_hours_end = NULL
   WHERE child_id = v_child_a;

  -- ══ 7. Préférences utilisateur respectées ══════════════════════════════
  UPDATE notification_preferences SET weekly_summary = false
   WHERE parent_id = v_parent AND child_id IS NULL;

  v_id1 := enqueue_notification('parent', v_parent, 'weekly_summary', 'Bilan', 'Corps', '📊', '/parent');
  SELECT status INTO v_status FROM notifications WHERE id = v_id1;
  ASSERT v_status = 'suppressed', '7. préférence désactivée mais notification envoyée';

  SELECT count(*) INTO v_count FROM notifications WHERE id = v_id1 AND channels = ARRAY[]::text[];
  ASSERT v_count = 1, '7b. une notification supprimée ne doit partir sur aucun canal';

  -- Canal désactivé mais type autorisé → in-app conservé, push retiré
  UPDATE notification_preferences SET push_enabled = false
   WHERE parent_id = v_parent AND child_id IS NULL;

  v_id1 := enqueue_notification('parent', v_parent, 'goal_progress', 'Objectif', 'Corps', '🔥', '/parent',
                                '{}', 'normal', NULL, NULL, NULL, ARRAY['in_app','push']);
  SELECT count(*) INTO v_count FROM notifications
   WHERE id = v_id1 AND 'push' <> ALL(channels) AND 'in_app' = ANY(channels);
  ASSERT v_count = 1, '7c. push envoyé alors que le canal est désactivé';

  UPDATE notification_preferences SET push_enabled = true, weekly_summary = true
   WHERE parent_id = v_parent AND child_id IS NULL;

  -- ══ 8. Récompense : demande, relances, remise (5.5 / 5.10) ═════════════
  INSERT INTO rewards (parent_id, child_id, title, required_points)
  VALUES (v_parent, v_child_a, 'Choisir le dessert', 100) RETURNING id INTO v_reward;

  INSERT INTO reward_requests (child_id, reward_id, status)
  VALUES (v_child_a, v_reward, 'pending') RETURNING id INTO v_request;

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'reward_requested' AND entity_id = v_request AND status = 'sent';
  ASSERT v_count = 1, '8. demande de récompense → notification parent immédiate manquante';

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'reward_pending' AND entity_id = v_request AND status = 'scheduled';
  ASSERT v_count = 2, '8b. relances 24h/48h non programmées';

  UPDATE reward_requests SET status = 'approved', approved_at = now() WHERE id = v_request;

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'reward_pending' AND entity_id = v_request AND status = 'scheduled';
  ASSERT v_count = 0, '8c. relances maintenues après remise de la récompense';

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'reward_approved' AND recipient_id = v_child_a;
  ASSERT v_count = 1, '8d. l''enfant n''est pas prévenu que sa récompense est validée';

  -- ══ 9. Pertinence au moment de l'envoi ════════════════════════════════
  INSERT INTO child_activities (child_id, activity_id, status, scheduled_for)
  VALUES (v_child_a, v_activity, 'selected', current_date) RETURNING id INTO v_ca2;

  UPDATE notifications SET scheduled_at = now() - interval '1 minute'
   WHERE type = 'activity_reminder' AND entity_id = v_ca2;

  -- L'activité est validée entre-temps → le rappel doit être annulé, pas envoyé
  UPDATE child_activities SET status = 'validated', validated_at = now() WHERE id = v_ca2;
  PERFORM release_due_notifications();

  SELECT status INTO v_status FROM notifications
   WHERE type = 'activity_reminder' AND entity_id = v_ca2;
  ASSERT v_status = 'cancelled', '9. rappel envoyé alors que l''activité venait d''être faite';

  -- ══ 10. Multi-enfants : pas de fuite entre profils ═════════════════════
  SELECT count(*) INTO v_count FROM notifications
   WHERE recipient_type = 'child' AND recipient_id = v_child_b;
  ASSERT v_count = 0, '10. Noah a reçu des notifications destinées à Léa';

  -- ══ 11. Ton selon l'âge (5.17) ════════════════════════════════════════
  ASSERT child_tone(5)  = 'young', '11. tranche 3-7 incorrecte';
  ASSERT child_tone(9)  = 'kid',   '11b. tranche 8-12 incorrecte';
  ASSERT child_tone(15) = 'teen',  '11c. tranche 13-18 incorrecte';

  -- ══ 12. Fuseau horaire ════════════════════════════════════════════════
  SELECT * INTO v_prefs FROM notification_preferences WHERE child_id = v_child_a;
  v_prefs.quiet_hours_start := '22:00';
  v_prefs.quiet_hours_end   := '07:00';
  v_prefs.timezone          := 'Europe/Paris';
  v_next := next_send_time(v_prefs, 'normal', '2026-09-04T21:00:00Z');  -- 23h à Paris
  ASSERT v_next IS NOT NULL, '12. quiet hours ignorées à 23h heure de Paris';

  v_prefs.timezone := 'America/New_York';                                -- 17h à New York
  v_next := next_send_time(v_prefs, 'normal', '2026-09-04T21:00:00Z');
  ASSERT v_next IS NULL, '12b. quiet hours appliquées à tort à 17h heure de New York';

  -- ══ 13. Regroupement (5.18) ═══════════════════════════════════════════
  -- Trois activités terminées le même jour → une seule notification agrégée
  v_id1 := enqueue_notification('parent', v_parent, 'activity_completed', 'A terminé', 'Corps',
                                '✅', '/parent', '{}', 'normal', NULL, NULL, NULL,
                                ARRAY['in_app'], NULL, NULL, 'grp-test');
  v_id2 := enqueue_notification('parent', v_parent, 'activity_completed', 'B terminé', 'Corps',
                                '✅', '/parent', '{}', 'normal', NULL, NULL, NULL,
                                ARRAY['in_app'], NULL, NULL, 'grp-test');
  ASSERT v_id1 = v_id2, '13. deuxième notification créée au lieu d''être fusionnée';

  SELECT count(*) INTO v_count FROM notifications WHERE group_key = 'grp-test' AND status = 'sent';
  ASSERT v_count = 1, '13b. le groupe contient plus d''une notification vivante';

  SELECT (data ->> 'group_count')::integer INTO v_count FROM notifications WHERE id = v_id1;
  ASSERT v_count = 2, '13c. compteur de groupe non incrémenté';

  SELECT title INTO v_status FROM notifications WHERE id = v_id1;
  ASSERT v_status LIKE '%Belle journée%', '13d. le texte agrégé n''a pas remplacé le texte unitaire';

  -- Une notification lue n'absorbe plus : le groupe suivant repart à zéro
  UPDATE notifications SET is_read = true WHERE id = v_id1;
  v_id2 := enqueue_notification('parent', v_parent, 'activity_completed', 'C terminé', 'Corps',
                                '✅', '/parent', '{}', 'normal', NULL, NULL, NULL,
                                ARRAY['in_app'], NULL, NULL, 'grp-test');
  ASSERT v_id2 <> v_id1, '13e. une notification déjà lue ne doit pas être réécrite';

  -- ══ 14. Résumé hebdomadaire (5.7) ═════════════════════════════════════
  SELECT send_weekly_parent_summaries() INTO v_count;
  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'weekly_summary' AND recipient_id = v_parent;
  ASSERT v_count >= 1, '14. résumé hebdomadaire non produit alors qu''une activité a été validée';

  -- Le récapitulatif est un des rares cas qui mérite un email (5.14)
  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'weekly_summary' AND recipient_id = v_parent AND 'email' = ANY(channels);
  ASSERT v_count >= 1, '14b. le résumé hebdomadaire devrait aussi partir par email';

  -- ══ 15. Temps d'écran : encourager, jamais sanctionner (5.8) ══════════
  INSERT INTO screen_time_daily (child_id, day, minutes, goal_minutes)
  VALUES (v_child_a, current_date - 1, 45, 60);

  PERFORM send_screen_time_notifications();

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'screen_time_goal' AND recipient_id = v_parent;
  ASSERT v_count = 1, '15. objectif de temps d''écran respecté → notification manquante';

  -- Objectif dépassé : aucune notification ne doit être créée
  INSERT INTO screen_time_daily (child_id, day, minutes, goal_minutes)
  VALUES (v_child_b, current_date - 1, 240, 60);

  PERFORM send_screen_time_notifications();

  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'screen_time_goal' AND actor_child_id = v_child_b;
  ASSERT v_count = 0, '15b. objectif dépassé → le produit ne doit pas envoyer de notification';

  -- ══ 16. Relance contextuelle parent (5.6) ═════════════════════════════
  INSERT INTO child_activities (child_id, activity_id, status, scheduled_for)
  VALUES (v_child_a, v_activity, 'selected', current_date) RETURNING id INTO v_ca2;

  PERFORM send_parent_context_reminders();
  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'activity_planned' AND recipient_id = v_parent AND entity_id = v_ca2;
  ASSERT v_count = 1, '16. relance parent « activité prévue » manquante';

  -- Deux passages du cron dans la journée ne doivent pas doubler la relance
  PERFORM send_parent_context_reminders();
  SELECT count(*) INTO v_count FROM notifications
   WHERE type = 'activity_planned' AND recipient_id = v_parent AND entity_id = v_ca2;
  ASSERT v_count = 1, '16b. relance parent envoyée deux fois le même jour';

  RAISE NOTICE '✅ Tous les tests notifications sont passés';
END $$;

ROLLBACK;
