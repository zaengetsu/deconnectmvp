-- Migration 013: Push notification tokens + in-app notifications
-- Stores device tokens for server-side push via FCM/APNs
-- Also creates an in-app notification table for real-time feed

-- ════════════════════════════════════════════════════════════════
-- Device push tokens (for FCM/APNs push)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_tokens" ON push_tokens FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- In-app notifications (real-time feed)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type text NOT NULL CHECK (recipient_type IN ('parent', 'child')),
  recipient_id uuid NOT NULL,  -- parent profile id or child id
  title text NOT NULL,
  body text NOT NULL,
  icon text DEFAULT '🔔',
  route text,                  -- In-app route to navigate to on tap
  data jsonb DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Parents can read their own notifications
CREATE POLICY "parent_notifications" ON notifications
  FOR ALL USING (
    (recipient_type = 'parent' AND recipient_id = auth.uid())
    OR
    (recipient_type = 'child' AND EXISTS (
      SELECT 1 FROM children WHERE id = recipient_id AND parent_id = auth.uid()
    ))
  );

-- Allow child devices to read child notifications (via anon key with child_id filter)
CREATE POLICY "child_notifications_read" ON notifications
  FOR SELECT USING (recipient_type = 'child');

-- ════════════════════════════════════════════════════════════════
-- Helper: Create notification + return it
-- ════════════════════════════════════════════════════════════════
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
  v_id uuid;
BEGIN
  INSERT INTO notifications (recipient_type, recipient_id, title, body, icon, route, data)
  VALUES (p_recipient_type, p_recipient_id, p_title, p_body, p_icon, p_route, p_data)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
-- Updated: validate_child_activity — now also creates notifications
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

  -- 3) Update total points + level
  v_new_total := v_child.total_points + v_pts;
  v_new_level := calculate_child_level(v_new_total);
  v_level_up := v_new_level > v_old_level;

  UPDATE children SET total_points = v_new_total, level = v_new_level WHERE id = v_child.id;

  -- 4) Check and award badges
  v_badges_awarded := check_and_award_badges(v_child.id, v_new_total);

  -- 5) Create notification for child: activity validated
  PERFORM create_notification(
    'child', v_child.id,
    '✅ Activité validée !',
    v_act.title || ' — +' || v_pts || ' points gagnés !',
    '⭐', '/child/points',
    json_build_object('type', 'activity_validated', 'points', v_pts)::jsonb
  );

  -- 6) If level up, create level-up notification
  IF v_level_up THEN
    PERFORM create_notification(
      'child', v_child.id,
      '🎉 Niveau supérieur !',
      'Tu es passé au niveau ' || v_new_level || ' ! Continue comme ça !',
      '🏆', '/child/points',
      json_build_object('type', 'level_up', 'new_level', v_new_level)::jsonb
    );
  END IF;

  -- 7) If badges awarded, notify
  IF v_badges_awarded > 0 THEN
    PERFORM create_notification(
      'child', v_child.id,
      '🏅 Nouveau badge !',
      'Tu as gagné ' || v_badges_awarded || ' nouveau(x) badge(s) !',
      '🏅', '/child/points',
      json_build_object('type', 'badge_earned', 'count', v_badges_awarded)::jsonb
    );
  END IF;

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
