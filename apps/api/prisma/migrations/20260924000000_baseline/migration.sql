-- Baseline : schéma existant de la base Supabase (migrations 001 → 031), sans RLS, fonctions, triggers ni dépendance au schéma auth.
-- Sur la base Supabase existante, cette migration est marquée comme appliquée :
--   pnpm prisma migrate resolve --applied 20260924000000_baseline

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    created_by uuid,
    title text NOT NULL,
    description text,
    instructions text,
    points integer DEFAULT 10 NOT NULL,
    duration_minutes integer,
    min_age integer DEFAULT 9,
    max_age integer DEFAULT 14,
    difficulty text DEFAULT 'easy'::text NOT NULL,
    activity_type text DEFAULT 'catalog'::text NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT activities_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
    CONSTRAINT activities_points_check CHECK ((points >= 0)),
    CONSTRAINT activities_type_check CHECK ((activity_type = ANY (ARRAY['catalog'::text, 'custom_parent'::text])))
);

CREATE TABLE notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    child_id uuid,
    activity_suggestions boolean DEFAULT true NOT NULL,
    validation_reminders boolean DEFAULT true NOT NULL,
    reward_updates boolean DEFAULT true NOT NULL,
    congratulations boolean DEFAULT true NOT NULL,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    push_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    activity_completed boolean DEFAULT true NOT NULL,
    activity_validation boolean DEFAULT true NOT NULL,
    activity_planned boolean DEFAULT true NOT NULL,
    reward_unlocked boolean DEFAULT true NOT NULL,
    reward_pending boolean DEFAULT true NOT NULL,
    family_activities boolean DEFAULT true NOT NULL,
    family_invitations boolean DEFAULT true NOT NULL,
    goals boolean DEFAULT true NOT NULL,
    daily_summary boolean DEFAULT false NOT NULL,
    weekly_summary boolean DEFAULT true NOT NULL,
    screen_time_goal boolean DEFAULT true NOT NULL,
    screen_time_summary boolean DEFAULT false NOT NULL,
    tips boolean DEFAULT true NOT NULL,
    product_news boolean DEFAULT false NOT NULL,
    timezone text DEFAULT 'Europe/Paris'::text NOT NULL,
    channel_overrides jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_type text NOT NULL,
    recipient_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    icon text DEFAULT '🔔'::text,
    route text,
    data jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    type text,
    category text,
    priority text DEFAULT 'normal'::text NOT NULL,
    entity_type text,
    entity_id uuid,
    actor_child_id uuid,
    channels text[] DEFAULT ARRAY['in_app'::text] NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    read_at timestamp with time zone,
    dedup_key text,
    group_key text,
    expires_at timestamp with time zone,
    CONSTRAINT notifications_priority_check CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'normal'::text, 'low'::text]))),
    CONSTRAINT notifications_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['parent'::text, 'child'::text]))),
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'sent'::text, 'cancelled'::text, 'failed'::text, 'suppressed'::text])))
);

CREATE TABLE activity_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    icon text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    condition_type text NOT NULL,
    condition_value integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE child_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    submitted_at timestamp with time zone,
    validated_at timestamp with time zone,
    rejected_at timestamp with time zone,
    validated_by uuid,
    rejection_reason text,
    earned_points integer DEFAULT 0,
    child_note text,
    parent_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    proof_url text,
    proof_type text,
    assigned_by uuid,
    assigned_by_role text,
    scheduled_for date,
    expires_at timestamp with time zone,
    recurrence_type text DEFAULT 'none'::text,
    recurrence_days integer[],
    CONSTRAINT child_activities_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text, 'custom'::text]))),
    CONSTRAINT child_activities_status_check CHECK ((status = ANY (ARRAY['available'::text, 'selected'::text, 'submitted'::text, 'validated'::text, 'rejected'::text])))
);

CREATE TABLE child_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    badge_id uuid NOT NULL,
    earned_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE child_friends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    friend_child_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by_initiator_parent boolean DEFAULT false NOT NULL,
    approved_by_friend_parent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT child_friends_distinct CHECK ((child_id <> friend_child_id)),
    CONSTRAINT child_friends_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'blocked'::text])))
);

CREATE TABLE child_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    parent_id uuid NOT NULL,
    method text NOT NULL,
    recipient text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT child_invitations_method_check CHECK ((method = ANY (ARRAY['email'::text, 'phone'::text]))),
    CONSTRAINT child_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])))
);

CREATE TABLE child_link_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    parent_id uuid NOT NULL,
    token text NOT NULL,
    pin_hash text,
    device_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    linked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    short_code text,
    CONSTRAINT child_link_tokens_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'linked'::text, 'expired'::text])))
);

CREATE TABLE children (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    display_name text NOT NULL,
    age integer NOT NULL,
    avatar_url text,
    total_points integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pin_hash text,
    streak_days integer DEFAULT 0 NOT NULL,
    last_activity_date date,
    auth_user_id uuid,
    device_linked_at timestamp with time zone,
    CONSTRAINT children_age_check CHECK (((age >= 3) AND (age <= 18))),
    CONSTRAINT children_level_check CHECK ((level >= 1)),
    CONSTRAINT children_points_check CHECK ((total_points >= 0))
);

CREATE TABLE duo_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    initiator_child_id uuid NOT NULL,
    partner_child_id uuid NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    bonus_points integer DEFAULT 20 NOT NULL,
    initiator_done_at timestamp with time zone,
    partner_done_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT duo_challenges_bonus_points_check CHECK ((bonus_points >= 0)),
    CONSTRAINT duo_challenges_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text, 'active'::text, 'completed'::text, 'expired'::text, 'cancelled'::text]))),
    CONSTRAINT duo_distinct CHECK ((initiator_child_id <> partner_child_id))
);

CREATE TABLE email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_email text NOT NULL,
    event_type text NOT NULL,
    payload jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT email_events_type_check CHECK ((event_type = ANY (ARRAY['welcome'::text, 'email_confirmation'::text, 'password_reset'::text, 'password_changed'::text, 'activity_validated'::text, 'activity_rejected'::text, 'reward_requested'::text, 'reward_approved'::text, 'reward_rejected'::text, 'activity_submitted'::text])))
);

CREATE TABLE family_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    week_start date NOT NULL,
    target_activities integer DEFAULT 5 NOT NULL,
    achieved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT family_goals_target_activities_check CHECK ((target_activities > 0))
);

CREATE TABLE family_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    member_role text DEFAULT 'co_parent'::text NOT NULL,
    invite_email text,
    token text DEFAULT encode(gen_random_bytes(20), 'hex'::text) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT family_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text])))
);

CREATE TABLE family_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    member_id uuid,
    member_email text NOT NULL,
    member_role text DEFAULT 'co_parent'::text NOT NULL,
    child_ids uuid[],
    status text DEFAULT 'pending'::text NOT NULL,
    invited_at timestamp with time zone DEFAULT now(),
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT family_members_member_role_check CHECK ((member_role = ANY (ARRAY['co_parent'::text, 'educator'::text, 'grandparent'::text, 'babysitter'::text]))),
    CONSTRAINT family_members_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'revoked'::text])))
);

CREATE TABLE family_ritual_occurrences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ritual_id uuid NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    done_at timestamp with time zone,
    attendees uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT family_ritual_occurrences_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'done'::text, 'missed'::text, 'cancelled'::text])))
);

CREATE TABLE family_rituals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    activity_id uuid,
    title text NOT NULL,
    description text,
    weekday integer NOT NULL,
    start_time time without time zone NOT NULL,
    duration_minutes integer DEFAULT 60 NOT NULL,
    points integer DEFAULT 20 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT family_rituals_duration_minutes_check CHECK ((duration_minutes > 0)),
    CONSTRAINT family_rituals_points_check CHECK ((points >= 0)),
    CONSTRAINT family_rituals_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

CREATE TABLE password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE points_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    points integer NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT points_ledger_source_check CHECK ((source_type = ANY (ARRAY['activity_validation'::text, 'reward_redemption'::text, 'manual_adjustment'::text, 'bonus'::text])))
);

CREATE TABLE profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'parent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    parent_role text DEFAULT 'parent'::text,
    avatar_emoji text DEFAULT '👤'::text,
    country text DEFAULT 'FR'::text,
    city text,
    postal_code text,
    region text,
    CONSTRAINT profiles_parent_role_check CHECK ((parent_role = ANY (ARRAY['maman'::text, 'papa'::text, 'educateur'::text, 'tuteur'::text, 'parent'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['parent'::text, 'admin'::text])))
);

CREATE TABLE push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    child_id uuid,
    token text NOT NULL,
    platform text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);

CREATE TABLE reward_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    reward_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    handled_by uuid,
    parent_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reward_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text])))
);

CREATE TABLE rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    child_id uuid,
    title text NOT NULL,
    description text,
    required_points integer NOT NULL,
    reward_type text DEFAULT 'custom'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reward_category text,
    CONSTRAINT rewards_points_check CHECK ((required_points >= 0)),
    CONSTRAINT rewards_type_check CHECK ((reward_type = ANY (ARRAY['custom'::text, 'catalog'::text])))
);

CREATE TABLE screen_time_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child_id uuid NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    minutes integer NOT NULL,
    goal_minutes integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT screen_time_daily_goal_minutes_check CHECK (((goal_minutes IS NULL) OR (goal_minutes >= 0))),
    CONSTRAINT screen_time_daily_minutes_check CHECK ((minutes >= 0))
);

CREATE TABLE subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    stripe_customer_id text,
    stripe_subscription_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscriptions_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'premium'::text, 'b2b'::text]))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'trialing'::text, 'past_due'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY activity_categories
    ADD CONSTRAINT activity_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY activity_categories
    ADD CONSTRAINT activity_categories_slug_key UNIQUE (slug);

ALTER TABLE ONLY badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY child_activities
    ADD CONSTRAINT child_activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY child_badges
    ADD CONSTRAINT child_badges_child_id_badge_id_key UNIQUE (child_id, badge_id);

ALTER TABLE ONLY child_badges
    ADD CONSTRAINT child_badges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY child_friends
    ADD CONSTRAINT child_friends_child_id_friend_child_id_key UNIQUE (child_id, friend_child_id);

ALTER TABLE ONLY child_friends
    ADD CONSTRAINT child_friends_pkey PRIMARY KEY (id);

ALTER TABLE ONLY child_invitations
    ADD CONSTRAINT child_invitations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY child_invitations
    ADD CONSTRAINT child_invitations_token_key UNIQUE (token);

ALTER TABLE ONLY child_link_tokens
    ADD CONSTRAINT child_link_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY child_link_tokens
    ADD CONSTRAINT child_link_tokens_token_key UNIQUE (token);

ALTER TABLE ONLY children
    ADD CONSTRAINT children_pkey PRIMARY KEY (id);

ALTER TABLE ONLY duo_challenges
    ADD CONSTRAINT duo_challenges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY family_goals
    ADD CONSTRAINT family_goals_parent_id_week_start_key UNIQUE (parent_id, week_start);

ALTER TABLE ONLY family_goals
    ADD CONSTRAINT family_goals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY family_invitations
    ADD CONSTRAINT family_invitations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY family_invitations
    ADD CONSTRAINT family_invitations_token_key UNIQUE (token);

ALTER TABLE ONLY family_members
    ADD CONSTRAINT family_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY family_ritual_occurrences
    ADD CONSTRAINT family_ritual_occurrences_pkey PRIMARY KEY (id);

ALTER TABLE ONLY family_ritual_occurrences
    ADD CONSTRAINT family_ritual_occurrences_ritual_id_scheduled_at_key UNIQUE (ritual_id, scheduled_at);

ALTER TABLE ONLY family_rituals
    ADD CONSTRAINT family_rituals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);

ALTER TABLE ONLY notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);

ALTER TABLE ONLY points_ledger
    ADD CONSTRAINT points_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY push_tokens
    ADD CONSTRAINT push_tokens_token_key UNIQUE (token);

ALTER TABLE ONLY reward_requests
    ADD CONSTRAINT reward_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY rewards
    ADD CONSTRAINT rewards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY screen_time_daily
    ADD CONSTRAINT screen_time_daily_child_id_day_key UNIQUE (child_id, day);

ALTER TABLE ONLY screen_time_daily
    ADD CONSTRAINT screen_time_daily_pkey PRIMARY KEY (id);

ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

CREATE INDEX child_friends_child_idx ON child_friends USING btree (child_id);

CREATE INDEX child_friends_friend_idx ON child_friends USING btree (friend_child_id);

CREATE UNIQUE INDEX child_link_tokens_short_code_pending_idx ON child_link_tokens USING btree (short_code) WHERE (status = 'pending'::text);

CREATE UNIQUE INDEX children_auth_user_id_key ON children USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

CREATE INDEX duo_status_idx ON duo_challenges USING btree (status, expires_at);

CREATE UNIQUE INDEX notification_preferences_child_idx ON notification_preferences USING btree (child_id) WHERE (child_id IS NOT NULL);

CREATE UNIQUE INDEX notification_preferences_parent_idx ON notification_preferences USING btree (parent_id) WHERE (child_id IS NULL);

CREATE UNIQUE INDEX notifications_dedup_key_idx ON notifications USING btree (dedup_key) WHERE ((dedup_key IS NOT NULL) AND (status = ANY (ARRAY['scheduled'::text, 'sent'::text])));

CREATE INDEX notifications_due_idx ON notifications USING btree (scheduled_at) WHERE (status = 'scheduled'::text);

CREATE INDEX notifications_entity_idx ON notifications USING btree (entity_type, entity_id) WHERE (entity_id IS NOT NULL);

CREATE INDEX notifications_recipient_idx ON notifications USING btree (recipient_type, recipient_id, created_at DESC);

CREATE INDEX notifications_unread_idx ON notifications USING btree (recipient_type, recipient_id) WHERE (is_read = false);

CREATE INDEX push_tokens_child_idx ON push_tokens USING btree (child_id) WHERE (child_id IS NOT NULL);

CREATE INDEX push_tokens_user_idx ON push_tokens USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX ritual_occurrences_due_idx ON family_ritual_occurrences USING btree (scheduled_at) WHERE (status = 'planned'::text);

CREATE INDEX screen_time_child_day_idx ON screen_time_daily USING btree (child_id, day DESC);

ALTER TABLE ONLY activities
    ADD CONSTRAINT activities_category_id_fkey FOREIGN KEY (category_id) REFERENCES activity_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY activities
    ADD CONSTRAINT activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY child_activities
    ADD CONSTRAINT child_activities_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_activities
    ADD CONSTRAINT child_activities_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY child_activities
    ADD CONSTRAINT child_activities_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_activities
    ADD CONSTRAINT child_activities_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY child_badges
    ADD CONSTRAINT child_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_badges
    ADD CONSTRAINT child_badges_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_friends
    ADD CONSTRAINT child_friends_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_friends
    ADD CONSTRAINT child_friends_friend_child_id_fkey FOREIGN KEY (friend_child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_invitations
    ADD CONSTRAINT child_invitations_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_invitations
    ADD CONSTRAINT child_invitations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_link_tokens
    ADD CONSTRAINT child_link_tokens_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY child_link_tokens
    ADD CONSTRAINT child_link_tokens_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY children
    ADD CONSTRAINT children_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY duo_challenges
    ADD CONSTRAINT duo_challenges_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;

ALTER TABLE ONLY duo_challenges
    ADD CONSTRAINT duo_challenges_initiator_child_id_fkey FOREIGN KEY (initiator_child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY duo_challenges
    ADD CONSTRAINT duo_challenges_partner_child_id_fkey FOREIGN KEY (partner_child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY family_goals
    ADD CONSTRAINT family_goals_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY family_invitations
    ADD CONSTRAINT family_invitations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY family_members
    ADD CONSTRAINT family_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY family_members
    ADD CONSTRAINT family_members_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY family_ritual_occurrences
    ADD CONSTRAINT family_ritual_occurrences_ritual_id_fkey FOREIGN KEY (ritual_id) REFERENCES family_rituals(id) ON DELETE CASCADE;

ALTER TABLE ONLY family_rituals
    ADD CONSTRAINT family_rituals_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL;

ALTER TABLE ONLY family_rituals
    ADD CONSTRAINT family_rituals_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY notification_preferences
    ADD CONSTRAINT notification_preferences_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY notification_preferences
    ADD CONSTRAINT notification_preferences_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY notifications
    ADD CONSTRAINT notifications_actor_child_id_fkey FOREIGN KEY (actor_child_id) REFERENCES children(id) ON DELETE SET NULL;

ALTER TABLE ONLY points_ledger
    ADD CONSTRAINT points_ledger_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY points_ledger
    ADD CONSTRAINT points_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY push_tokens
    ADD CONSTRAINT push_tokens_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY reward_requests
    ADD CONSTRAINT reward_requests_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY reward_requests
    ADD CONSTRAINT reward_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY reward_requests
    ADD CONSTRAINT reward_requests_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE;

ALTER TABLE ONLY rewards
    ADD CONSTRAINT rewards_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY rewards
    ADD CONSTRAINT rewards_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY screen_time_daily
    ADD CONSTRAINT screen_time_daily_child_id_fkey FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;
