-- Deconnect MVP — RLS Policies + RPC Functions

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "own_profile_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own_profile_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own_profile_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Children
CREATE POLICY "parent_children_select" ON children FOR SELECT USING (auth.uid() = parent_id);
CREATE POLICY "parent_children_insert" ON children FOR INSERT WITH CHECK (auth.uid() = parent_id);
CREATE POLICY "parent_children_update" ON children FOR UPDATE USING (auth.uid() = parent_id);

-- Categories (public read)
CREATE POLICY "categories_public_read" ON activity_categories FOR SELECT USING (true);

-- Activities
CREATE POLICY "public_activities_read" ON activities FOR SELECT USING (is_public = true OR auth.uid() = created_by);
CREATE POLICY "parent_activities_insert" ON activities FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "parent_activities_update" ON activities FOR UPDATE USING (auth.uid() = created_by);

-- Child Activities
CREATE POLICY "parent_child_activities" ON child_activities FOR ALL
  USING (EXISTS (SELECT 1 FROM children WHERE children.id = child_activities.child_id AND children.parent_id = auth.uid()));

-- Rewards
CREATE POLICY "parent_rewards_select" ON rewards FOR SELECT USING (auth.uid() = parent_id);
CREATE POLICY "parent_rewards_insert" ON rewards FOR INSERT WITH CHECK (auth.uid() = parent_id);
CREATE POLICY "parent_rewards_update" ON rewards FOR UPDATE USING (auth.uid() = parent_id);

-- Reward Requests
CREATE POLICY "parent_reward_requests" ON reward_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM children WHERE children.id = reward_requests.child_id AND children.parent_id = auth.uid()));

-- Child Badges
CREATE POLICY "parent_child_badges" ON child_badges FOR SELECT
  USING (EXISTS (SELECT 1 FROM children WHERE children.id = child_badges.child_id AND children.parent_id = auth.uid()));

-- Points Ledger
CREATE POLICY "parent_points" ON points_ledger FOR SELECT
  USING (EXISTS (SELECT 1 FROM children WHERE children.id = points_ledger.child_id AND children.parent_id = auth.uid()));

-- Subscriptions & Notifications
CREATE POLICY "own_sub" ON subscriptions FOR ALL USING (auth.uid() = parent_id);
CREATE POLICY "own_notif" ON notification_preferences FOR ALL USING (auth.uid() = parent_id);

-- ═══ RPC: validate_child_activity ═══
CREATE OR REPLACE FUNCTION validate_child_activity(p_child_activity_id uuid, p_parent_id uuid, p_parent_note text DEFAULT NULL)
RETURNS json AS $$
DECLARE v_ca child_activities%ROWTYPE; v_child children%ROWTYPE; v_act activities%ROWTYPE; v_pts integer;
BEGIN
  SELECT * INTO v_ca FROM child_activities WHERE id = p_child_activity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_ca.status != 'submitted' THEN RAISE EXCEPTION 'Not submitted'; END IF;
  SELECT * INTO v_child FROM children WHERE id = v_ca.child_id;
  IF v_child.parent_id != p_parent_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_act FROM activities WHERE id = v_ca.activity_id;
  v_pts := v_act.points;
  UPDATE child_activities SET status='validated', validated_at=now(), validated_by=p_parent_id, earned_points=v_pts, parent_note=p_parent_note WHERE id=p_child_activity_id;
  INSERT INTO points_ledger(child_id,source_type,source_id,points,reason,created_by) VALUES(v_child.id,'activity_validation',p_child_activity_id,v_pts,v_act.title,p_parent_id);
  UPDATE children SET total_points=total_points+v_pts WHERE id=v_child.id;
  RETURN json_build_object('success',true,'points_awarded',v_pts);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ RPC: approve_reward_request ═══
CREATE OR REPLACE FUNCTION approve_reward_request(p_request_id uuid, p_parent_id uuid)
RETURNS json AS $$
DECLARE v_req reward_requests%ROWTYPE; v_rew rewards%ROWTYPE; v_child children%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM reward_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_req.status != 'pending' THEN RAISE EXCEPTION 'Invalid request'; END IF;
  SELECT * INTO v_rew FROM rewards WHERE id = v_req.reward_id;
  SELECT * INTO v_child FROM children WHERE id = v_req.child_id;
  IF v_child.parent_id != p_parent_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_child.total_points < v_rew.required_points THEN RAISE EXCEPTION 'Not enough points'; END IF;
  UPDATE reward_requests SET status='approved',approved_at=now(),handled_by=p_parent_id WHERE id=p_request_id;
  INSERT INTO points_ledger(child_id,source_type,source_id,points,reason,created_by) VALUES(v_child.id,'reward_redemption',p_request_id,-v_rew.required_points,v_rew.title,p_parent_id);
  UPDATE children SET total_points=total_points-v_rew.required_points WHERE id=v_child.id;
  RETURN json_build_object('success',true,'points_deducted',v_rew.required_points);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
