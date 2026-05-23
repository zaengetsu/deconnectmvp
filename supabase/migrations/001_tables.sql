-- Deconnect MVP — Schema (Part 1: Tables)

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL, full_name text, role text NOT NULL DEFAULT 'parent',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_role_check CHECK (role IN ('parent', 'admin'))
);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL, age integer NOT NULL, avatar_url text,
  total_points integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT children_age_check CHECK (age >= 3 AND age <= 18),
  CONSTRAINT children_points_check CHECK (total_points >= 0),
  CONSTRAINT children_level_check CHECK (level >= 1)
);
CREATE TRIGGER children_updated_at BEFORE UPDATE ON children FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE activity_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE, description text, icon text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES activity_categories(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL, description text, instructions text,
  points integer NOT NULL DEFAULT 10, duration_minutes integer,
  min_age integer DEFAULT 9, max_age integer DEFAULT 14,
  difficulty text NOT NULL DEFAULT 'easy',
  activity_type text NOT NULL DEFAULT 'catalog',
  is_public boolean NOT NULL DEFAULT true, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT activities_points_check CHECK (points >= 0),
  CONSTRAINT activities_difficulty_check CHECK (difficulty IN ('easy','medium','hard')),
  CONSTRAINT activities_type_check CHECK (activity_type IN ('catalog','custom_parent'))
);

CREATE TABLE child_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available',
  submitted_at timestamptz, validated_at timestamptz, rejected_at timestamptz,
  validated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  rejection_reason text, earned_points integer DEFAULT 0,
  child_note text, parent_note text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT child_activities_status_check CHECK (status IN ('available','selected','submitted','validated','rejected'))
);

CREATE TABLE rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  title text NOT NULL, description text, required_points integer NOT NULL,
  reward_type text NOT NULL DEFAULT 'custom', is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT rewards_points_check CHECK (required_points >= 0),
  CONSTRAINT rewards_type_check CHECK (reward_type IN ('custom','catalog'))
);

CREATE TABLE reward_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz DEFAULT now(), approved_at timestamptz,
  rejected_at timestamptz, handled_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  parent_note text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT reward_requests_status_check CHECK (status IN ('pending','approved','rejected','completed'))
);

CREATE TABLE badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text, icon text,
  condition_type text NOT NULL, condition_value integer NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE child_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(),
  UNIQUE(child_id, badge_id)
);

CREATE TABLE points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  source_type text NOT NULL, source_id uuid, points integer NOT NULL,
  reason text, created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT points_ledger_source_check CHECK (source_type IN ('activity_validation','reward_redemption','manual_adjustment','bonus'))
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free', status text NOT NULL DEFAULT 'active',
  started_at timestamptz DEFAULT now(), expires_at timestamptz,
  stripe_customer_id text, stripe_subscription_id text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT subscriptions_plan_check CHECK (plan IN ('free','premium','b2b')),
  CONSTRAINT subscriptions_status_check CHECK (status IN ('active','inactive','trialing','past_due','cancelled'))
);

CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  activity_suggestions boolean NOT NULL DEFAULT true,
  validation_reminders boolean NOT NULL DEFAULT true,
  reward_updates boolean NOT NULL DEFAULT true,
  congratulations boolean NOT NULL DEFAULT true,
  quiet_hours_start time, quiet_hours_end time,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
