-- Rattrapage de la baseline : sur la base Supabase d'origine, 20260924000000_baseline a été
-- marquée appliquée sans être jouée, et trois éléments qu'elle déclare n'y ont jamais été créés.
-- Conséquences en production : GET /v1/children en 500 pour tous les parents (device_linked_at)
-- et liaison d'un appareil enfant par code court impossible (short_code). Rejouable sans effet.

ALTER TABLE children ADD COLUMN IF NOT EXISTS device_linked_at timestamp with time zone;

ALTER TABLE child_link_tokens ADD COLUMN IF NOT EXISTS short_code text;

CREATE UNIQUE INDEX IF NOT EXISTS child_link_tokens_short_code_pending_idx ON child_link_tokens USING btree (short_code) WHERE (status = 'pending'::text);
