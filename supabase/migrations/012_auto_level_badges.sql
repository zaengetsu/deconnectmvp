-- Migration 012: Auto-level & auto-badge system
-- Updates validate_child_activity to:
--   1) Update child level based on new total_points
--   2) Auto-award badges when conditions are met

-- ════════════════════════════════════════════════════════════════
-- Helper: Calculate level from points
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION calculate_child_level(p_total_points integer)
RETURNS integer AS $$
DECLARE
  thresholds integer[] := ARRAY[0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];
  v_level integer := 1;
BEGIN
  FOR i IN 1..array_length(thresholds, 1) LOOP
    IF p_total_points >= thresholds[i] THEN
      v_level := i;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  RETURN v_level;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ════════════════════════════════════════════════════════════════
-- Helper: Auto-award badges for a child
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_and_award_badges(p_child_id uuid, p_total_points integer)
RETURNS integer AS $$
DECLARE
  v_activities_count integer;
  v_badge RECORD;
  v_awarded integer := 0;
BEGIN
  -- Count validated activities
  SELECT count(*) INTO v_activities_count
  FROM child_activities
  WHERE child_id = p_child_id AND status = 'validated';

  -- Check each badge
  FOR v_badge IN SELECT * FROM badges LOOP
    -- Skip if already earned
    IF EXISTS (SELECT 1 FROM child_badges WHERE child_id = p_child_id AND badge_id = v_badge.id) THEN
      CONTINUE;
    END IF;

    -- Check condition
    IF (v_badge.condition_type = 'activities_validated' AND v_activities_count >= v_badge.condition_value)
    OR (v_badge.condition_type = 'points_earned' AND p_total_points >= v_badge.condition_value)
    THEN
      INSERT INTO child_badges (child_id, badge_id)
      VALUES (p_child_id, v_badge.id)
      ON CONFLICT DO NOTHING;
      v_awarded := v_awarded + 1;
    END IF;
  END LOOP;

  RETURN v_awarded;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- Updated: validate_child_activity with auto-level + auto-badge
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_child_activity(
  p_child_activity_id uuid,
  p_parent_id uuid,
  p_parent_note text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_ca child_activities%ROWTYPE;
  v_child children%ROWTYPE;
  v_act activities%ROWTYPE;
  v_pts integer;
  v_new_total integer;
  v_new_level integer;
  v_old_level integer;
  v_badges_awarded integer;
  v_level_up boolean := false;
BEGIN
  SELECT * INTO v_ca FROM child_activities WHERE id = p_child_activity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_ca.status != 'submitted' THEN RAISE EXCEPTION 'Not submitted'; END IF;

  SELECT * INTO v_child FROM children WHERE id = v_ca.child_id;
  IF v_child.parent_id != p_parent_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_act FROM activities WHERE id = v_ca.activity_id;
  v_pts := v_act.points;
  v_old_level := v_child.level;

  -- 1) Mark activity as validated
  UPDATE child_activities
  SET status = 'validated', validated_at = now(), validated_by = p_parent_id,
      earned_points = v_pts, parent_note = p_parent_note
  WHERE id = p_child_activity_id;

  -- 2) Add points to ledger
  INSERT INTO points_ledger (child_id, source_type, source_id, points, reason, created_by)
  VALUES (v_child.id, 'activity_validation', p_child_activity_id, v_pts, v_act.title, p_parent_id);

  -- 3) Update total points
  v_new_total := v_child.total_points + v_pts;
  
  -- 4) Calculate new level
  v_new_level := calculate_child_level(v_new_total);
  v_level_up := v_new_level > v_old_level;

  -- 5) Update child record
  UPDATE children
  SET total_points = v_new_total, level = v_new_level
  WHERE id = v_child.id;

  -- 6) Check and award badges
  v_badges_awarded := check_and_award_badges(v_child.id, v_new_total);

  RETURN json_build_object(
    'success', true,
    'points_awarded', v_pts,
    'new_total', v_new_total,
    'new_level', v_new_level,
    'level_up', v_level_up,
    'badges_awarded', v_badges_awarded
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
-- Seed more badges (category-specific + streak + level-based)
-- ════════════════════════════════════════════════════════════════
INSERT INTO badges (name, description, icon, condition_type, condition_value) VALUES
-- Level-based
('Débutant', 'Atteins le niveau 2', '🌿', 'points_earned', 50),
('Apprenti', 'Atteins le niveau 3', '🌳', 'points_earned', 150),
('Expert', 'Atteins le niveau 5', '🏅', 'points_earned', 500),
('Grand Maître', 'Atteins le niveau 7', '💫', 'points_earned', 1200),
('Légende Ultime', 'Atteins le niveau 10', '🌈', 'points_earned', 3500),
-- Activities milestones
('Déterminé', 'Termine 3 activités', '💪', 'activities_validated', 3),
('Infatigable', 'Termine 15 activités', '🚀', 'activities_validated', 15),
('Centurion', 'Termine 100 activités', '🎖️', 'activities_validated', 100)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- Retroactive: Award missing badges to existing children
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_child RECORD;
  v_count integer;
BEGIN
  FOR v_child IN SELECT id, total_points, level FROM children WHERE is_active = true LOOP
    -- Update level
    UPDATE children SET level = calculate_child_level(v_child.total_points) WHERE id = v_child.id;
    -- Award badges
    PERFORM check_and_award_badges(v_child.id, v_child.total_points);
  END LOOP;
END;
$$;
