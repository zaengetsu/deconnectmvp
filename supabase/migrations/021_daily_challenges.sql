-- Migration 021: Défis journaliers
-- RPC qui retourne 3 activités aléatoires par jour pour un enfant
-- La sélection est déterministe par jour (même seed = mêmes résultats)
-- Exclut les activités déjà complétées/soumises aujourd'hui

CREATE OR REPLACE FUNCTION get_daily_challenges(p_child_id uuid)
RETURNS SETOF activities
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seed double precision;
BEGIN
  -- Seed déterministe basé sur la date + child_id (même défis toute la journée)
  v_seed := abs(hashtext(p_child_id::text || current_date::text)) / 2147483647.0;
  PERFORM setseed(v_seed);

  RETURN QUERY
    SELECT a.*
    FROM activities a
    WHERE a.is_active = true
      AND a.is_public = true
      AND a.activity_type = 'catalog'
      -- Exclure les activités déjà soumises/validées aujourd'hui
      AND a.id NOT IN (
        SELECT ca.activity_id
        FROM child_activities ca
        WHERE ca.child_id = p_child_id
          AND ca.created_at::date = current_date
      )
    ORDER BY random()
    LIMIT 3;
END;
$$;
