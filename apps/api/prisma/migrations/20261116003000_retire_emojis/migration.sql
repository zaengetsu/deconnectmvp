-- Les notifications ne portent plus d'émoji : titres et corps en texte seul, et `icon` devient
-- une clé que l'app traduit en pictogramme (activity, review, reminder, validated, message, level,
-- badge, reward, device, friend, challenge, family, streak, summary, screen, progress, voucher,
-- payment ; toute autre valeur s'affiche en cloche). Rejouable : un second passage ne change rien.

-- Le déclencheur rk_notifications_gate n'accepte de réécrire titre et corps que de la part de l'API.
SELECT set_config('rekonect.notifications', 'api', false);

UPDATE notifications SET icon = CASE
  WHEN icon = '📱' AND type = 'child_device_linked' THEN 'device'
  WHEN icon = '📱' THEN 'screen'
  WHEN icon = '🌱' AND type LIKE 'nudge%' THEN 'activity'
  WHEN type = 'nudge_comeback' THEN 'activity'
  WHEN icon IN ('✨', '💡', '▶️', '▶') THEN 'activity'
  WHEN icon IN ('👀', '✅') THEN 'review'
  WHEN icon IN ('🔔', '📌', '⏱️', '⏱') THEN 'reminder'
  WHEN icon IN ('⭐') THEN 'validated'
  WHEN icon IN ('💬') THEN 'message'
  WHEN icon IN ('🏆') THEN 'level'
  WHEN icon IN ('🏅') THEN 'badge'
  WHEN icon IN ('🎁') THEN 'reward'
  WHEN icon IN ('👥', '👋', '🙌', '🤝') THEN 'friend'
  WHEN icon IN ('🎉') THEN 'challenge'
  WHEN icon IN ('👨‍👩‍👧', '💛') THEN 'family'
  WHEN icon IN ('🔥') THEN 'streak'
  WHEN icon IN ('🌙', '📊') THEN 'summary'
  WHEN icon IN ('🌱') THEN 'progress'
  WHEN icon IN ('🎟️', '🎟') THEN 'voucher'
  WHEN icon IN ('💳') THEN 'payment'
  WHEN icon IN ('activity', 'review', 'reminder', 'validated', 'message', 'level', 'badge', 'reward', 'device',
                'friend', 'challenge', 'family', 'streak', 'summary', 'screen', 'progress', 'voucher', 'payment') THEN icon
  ELSE 'bell'
END;

-- Émojis (et sélecteurs de variante / liants) retirés des textes, espaces resserrés.
UPDATE notifications
SET title = btrim(regexp_replace(regexp_replace(title, E'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B50\u2705\u2728\u23F0-\u23FF\u25B6\uFE0F\u200D]', '', 'g'), '\s{2,}', ' ', 'g')),
    body  = btrim(regexp_replace(regexp_replace(body,  E'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B50\u2705\u2728\u23F0-\u23FF\u25B6\uFE0F\u200D]', '', 'g'), '\s{2,}', ' ', 'g'))
WHERE title ~ E'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B50\u2705\u2728\u23F0-\u23FF\u25B6\uFE0F\u200D]'
   OR body  ~ E'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B50\u2705\u2728\u23F0-\u23FF\u25B6\uFE0F\u200D]';

-- Relance « ça fait longtemps » : le titre commençait par l'identifiant de catégorie (« cuisine Ça fait longtemps ! »).
UPDATE notifications n
SET title = substr(n.title, length(split_part(n.title, ' ', 1)) + 2)
WHERE n.type = 'nudge_comeback'
  AND split_part(n.title, ' ', 1) IN (SELECT c.icon FROM activity_categories c WHERE c.icon IS NOT NULL);

ALTER TABLE notifications ALTER COLUMN icon SET DEFAULT 'bell';

SELECT set_config('rekonect.notifications', '', false);
