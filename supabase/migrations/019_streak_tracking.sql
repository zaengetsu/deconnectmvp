-- Migration 019: Add streak tracking to children
-- The brief mentions streaks as a core gamification mechanic:
-- "L'utilisateur gagne des bonus lorsqu'il enchaîne plusieurs jours d'activités."

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS streak_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date date;

-- Function to update streak when an activity is validated
CREATE OR REPLACE FUNCTION update_child_streak(p_child_id uuid)
RETURNS void AS $$
DECLARE
  v_last_date date;
  v_today     date := current_date;
BEGIN
  SELECT last_activity_date INTO v_last_date FROM children WHERE id = p_child_id;

  IF v_last_date IS NULL THEN
    -- First ever activity
    UPDATE children SET streak_days = 1, last_activity_date = v_today WHERE id = p_child_id;

  ELSIF v_last_date = v_today THEN
    -- Already did something today, no change
    NULL;

  ELSIF v_last_date = v_today - 1 THEN
    -- Consecutive day → increment streak
    UPDATE children SET streak_days = streak_days + 1, last_activity_date = v_today WHERE id = p_child_id;

  ELSE
    -- Streak broken → reset to 1
    UPDATE children SET streak_days = 1, last_activity_date = v_today WHERE id = p_child_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: call update_child_streak when an activity is validated
CREATE OR REPLACE FUNCTION trigger_update_streak_on_validation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'validated' AND (OLD.status IS DISTINCT FROM 'validated') THEN
    PERFORM update_child_streak(NEW.child_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS child_streak_on_validation ON child_activities;
CREATE TRIGGER child_streak_on_validation
  AFTER UPDATE ON child_activities
  FOR EACH ROW EXECUTE FUNCTION trigger_update_streak_on_validation();
