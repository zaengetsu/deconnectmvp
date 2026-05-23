// ─── Enums ───────────────────────────────────────────────────
export type UserRole = 'parent' | 'admin';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ActivityType = 'catalog' | 'custom_parent';
export type ActivityStatus = 'available' | 'selected' | 'submitted' | 'validated' | 'rejected';
export type RewardType = 'custom' | 'catalog';
export type RewardRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';
export type BadgeConditionType = 'activities_validated' | 'points_earned' | 'streak_days' | 'category_completed';
export type PointSourceType = 'activity_validation' | 'reward_redemption' | 'manual_adjustment' | 'bonus';
export type SubscriptionPlan = 'free' | 'premium' | 'b2b';
export type SubscriptionStatus = 'active' | 'inactive' | 'trialing' | 'past_due' | 'cancelled';

// ─── Base ────────────────────────────────────────────────────
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ─── Profiles ────────────────────────────────────────────────
export interface Profile extends BaseEntity {
  email: string;
  full_name: string | null;
  role: UserRole;
}

export type ProfileInsert = Omit<Profile, 'created_at' | 'updated_at'>;
export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;

// ─── Children ────────────────────────────────────────────────
export interface Child extends BaseEntity {
  parent_id: string;
  display_name: string;
  age: number;
  avatar_url: string | null;
  total_points: number;
  level: number;
  is_active: boolean;
  streak_days: number;
  last_activity_date: string | null;
}

export type ChildInsert = Pick<Child, 'parent_id' | 'display_name' | 'age'> & Partial<Pick<Child, 'avatar_url'>>;
export type ChildUpdate = Partial<Omit<Child, 'id' | 'parent_id' | 'created_at' | 'updated_at'>>;

// ─── Activity Categories ─────────────────────────────────────
export interface ActivityCategory extends BaseEntity {
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
}

// ─── Activities ──────────────────────────────────────────────
export interface Activity extends BaseEntity {
  category_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  points: number;
  duration_minutes: number | null;
  min_age: number;
  max_age: number;
  difficulty: Difficulty;
  activity_type: ActivityType;
  is_public: boolean;
  is_active: boolean;
  category?: ActivityCategory;
}

export type ActivityInsert = Pick<Activity, 'title' | 'points' | 'difficulty'> &
  Partial<Omit<Activity, 'id' | 'created_at' | 'updated_at' | 'category'>>;

// ─── Child Activities ────────────────────────────────────────
export interface ChildActivity extends BaseEntity {
  child_id: string;
  activity_id: string;
  status: ActivityStatus;
  submitted_at: string | null;
  validated_at: string | null;
  rejected_at: string | null;
  validated_by: string | null;
  rejection_reason: string | null;
  earned_points: number;
  child_note: string | null;
  parent_note: string | null;
  activity?: Activity;
  child?: Child;
}

export type ChildActivityInsert = Pick<ChildActivity, 'child_id' | 'activity_id'>;

// ─── Rewards ─────────────────────────────────────────────────
export interface Reward extends BaseEntity {
  parent_id: string | null;
  child_id: string | null;
  title: string;
  description: string | null;
  required_points: number;
  reward_type: RewardType;
  reward_category: string | null;
  is_active: boolean;
}

export type RewardInsert = Pick<Reward, 'title' | 'required_points'> &
  Partial<Omit<Reward, 'id' | 'created_at' | 'updated_at'>>;

// ─── Reward Requests ─────────────────────────────────────────
export interface RewardRequest extends BaseEntity {
  child_id: string;
  reward_id: string;
  status: RewardRequestStatus;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  handled_by: string | null;
  parent_note: string | null;
  reward?: Reward;
  child?: Child;
}

// ─── Badges ──────────────────────────────────────────────────
export interface Badge extends BaseEntity {
  name: string;
  description: string | null;
  icon: string | null;
  condition_type: BadgeConditionType;
  condition_value: number;
}

// ─── Child Badges ────────────────────────────────────────────
export interface ChildBadge {
  id: string;
  child_id: string;
  badge_id: string;
  earned_at: string;
  created_at: string;
  badge?: Badge;
}

// ─── Points Ledger ───────────────────────────────────────────
export interface PointsLedgerEntry {
  id: string;
  child_id: string;
  source_type: PointSourceType;
  source_id: string | null;
  points: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

// ─── Subscriptions ───────────────────────────────────────────
export interface Subscription extends BaseEntity {
  parent_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

// ─── Notification Preferences ────────────────────────────────
export interface NotificationPreferences extends BaseEntity {
  parent_id: string;
  child_id: string | null;
  activity_suggestions: boolean;
  validation_reminders: boolean;
  reward_updates: boolean;
  congratulations: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}
