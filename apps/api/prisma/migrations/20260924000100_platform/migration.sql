-- Plateforme NestJS : identité propre, outbox événementielle, livraisons de notifications, partenaires.
-- Compatible avec la base Supabase existante (aucune colonne supprimée, uniquement des ajouts).

-- ─── Identité ────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    email text NOT NULL,
    password_hash text,
    role text DEFAULT 'parent' NOT NULL,
    full_name text,
    email_verified_at timestamptz,
    last_login_at timestamptz,
    disabled_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK (role IN ('parent', 'admin', 'partner'))
);
CREATE UNIQUE INDEX users_email_key ON users (email);

-- Sessions : un refresh token rotatif par appareil, pour un utilisateur OU un enfant.
CREATE TABLE refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    child_id uuid REFERENCES children(id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    family_id uuid NOT NULL,
    device_id text,
    user_agent text,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT refresh_tokens_subject_check CHECK ((user_id IS NULL) <> (child_id IS NULL))
);
CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX refresh_tokens_child_idx ON refresh_tokens (child_id) WHERE child_id IS NOT NULL;
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Le PIN enfant n'est plus soumis au brute-force : compteur et verrou (parité avec la migration 016).
ALTER TABLE children ADD COLUMN IF NOT EXISTS failed_pin_attempts integer DEFAULT 0 NOT NULL;
ALTER TABLE children ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;

-- Profil : le rôle « partner » existe désormais côté compte.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('parent', 'admin', 'partner'));

-- Import des comptes Supabase (hachés bcrypt conservés, re-hachés en argon2 à la prochaine connexion).
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO users (id, email, password_hash, role, full_name, email_verified_at, created_at)
    SELECT u.id, lower(u.email), u.encrypted_password, COALESCE(p.role, 'parent'), p.full_name,
           u.email_confirmed_at, COALESCE(u.created_at, now())
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.email IS NOT NULL AND COALESCE(u.is_anonymous, false) = false
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─── Événements (outbox) ─────────────────────────────────────────────────────
CREATE TABLE outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    seq bigserial NOT NULL,
    type text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    actor jsonb,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    correlation_id text,
    occurred_at timestamptz DEFAULT now() NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamptz DEFAULT now() NOT NULL,
    last_error text,
    published_at timestamptz,
    CONSTRAINT outbox_events_status_check CHECK (status IN ('pending', 'published', 'dead'))
);
CREATE INDEX outbox_events_pending_idx ON outbox_events (next_attempt_at, seq) WHERE status = 'pending';
CREATE INDEX outbox_events_aggregate_idx ON outbox_events (aggregate_type, aggregate_id);

-- Idempotence des consommateurs : un événement n'est traité qu'une fois par consommateur.
CREATE TABLE processed_events (
    event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    consumer text NOT NULL,
    processed_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (event_id, consumer)
);

-- ─── Notifications : livraisons par canal ────────────────────────────────────
CREATE TABLE notification_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel text NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamptz DEFAULT now() NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    target_count integer DEFAULT 0 NOT NULL,
    last_error text,
    delivered_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('push', 'email')),
    CONSTRAINT notification_deliveries_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);
CREATE UNIQUE INDEX notification_deliveries_notif_channel_key ON notification_deliveries (notification_id, channel);
CREATE INDEX notification_deliveries_pending_idx ON notification_deliveries (next_attempt_at) WHERE status = 'pending';

ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS environment text DEFAULT 'production' NOT NULL;
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_environment_check CHECK (environment IN ('development', 'production'));

-- Offres partenaires : consentement explicite, désactivé par défaut (RGPD).
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS partner_offers boolean DEFAULT false NOT NULL;

-- ─── Partenaires ─────────────────────────────────────────────────────────────
CREATE TABLE partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL,
    kind text DEFAULT 'brand' NOT NULL,
    description text,
    website_url text,
    logo_url text,
    contact_email text,
    status text DEFAULT 'pending' NOT NULL,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT partners_kind_check CHECK (kind IN ('brand', 'retailer', 'association', 'local_business', 'public_institution')),
    CONSTRAINT partners_status_check CHECK (status IN ('pending', 'active', 'suspended'))
);
CREATE UNIQUE INDEX partners_slug_key ON partners (slug);

CREATE TABLE partner_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text DEFAULT 'editor' NOT NULL,
    status text DEFAULT 'invited' NOT NULL,
    invite_token_hash text,
    invite_expires_at timestamptz,
    invited_at timestamptz DEFAULT now() NOT NULL,
    joined_at timestamptz,
    CONSTRAINT partner_members_role_check CHECK (role IN ('owner', 'editor', 'viewer')),
    CONSTRAINT partner_members_status_check CHECK (status IN ('invited', 'active', 'revoked'))
);
CREATE UNIQUE INDEX partner_members_partner_email_key ON partner_members (partner_id, email);
CREATE UNIQUE INDEX partner_members_invite_token_key ON partner_members (invite_token_hash) WHERE invite_token_hash IS NOT NULL;
CREATE INDEX partner_members_user_idx ON partner_members (user_id);

CREATE TABLE partner_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    kind text NOT NULL,
    title text NOT NULL,
    description text,
    image_url text,
    terms text,
    min_age integer DEFAULT 3 NOT NULL,
    max_age integer DEFAULT 18 NOT NULL,
    required_points integer,
    duration_minutes integer,
    category_id uuid REFERENCES activity_categories(id) ON DELETE SET NULL,
    trigger_type text DEFAULT 'none' NOT NULL,
    trigger_activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
    trigger_category_id uuid REFERENCES activity_categories(id) ON DELETE SET NULL,
    trigger_threshold integer DEFAULT 1 NOT NULL,
    code_mode text DEFAULT 'none' NOT NULL,
    generic_code text,
    discount_label text,
    stock_total integer,
    stock_used integer DEFAULT 0 NOT NULL,
    per_family_limit integer DEFAULT 1 NOT NULL,
    starts_at timestamptz,
    ends_at timestamptz,
    status text DEFAULT 'draft' NOT NULL,
    activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
    reward_id uuid,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason text,
    published_at timestamptz,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT partner_offers_kind_check CHECK (kind IN ('child_reward', 'parent_voucher', 'sponsored_activity')),
    CONSTRAINT partner_offers_status_check CHECK (status IN ('draft', 'pending_review', 'published', 'paused', 'expired', 'rejected')),
    CONSTRAINT partner_offers_trigger_check CHECK (trigger_type IN ('none', 'activity_validated', 'category_validated', 'goal_completed', 'level_reached')),
    CONSTRAINT partner_offers_code_mode_check CHECK (code_mode IN ('none', 'generic', 'unique_pool')),
    CONSTRAINT partner_offers_age_check CHECK (min_age >= 3 AND max_age <= 18 AND min_age <= max_age),
    CONSTRAINT partner_offers_stock_check CHECK (stock_total IS NULL OR stock_used <= stock_total),
    CONSTRAINT partner_offers_limit_check CHECK (per_family_limit >= 1 AND trigger_threshold >= 1)
);
CREATE INDEX partner_offers_partner_idx ON partner_offers (partner_id, status);
CREATE INDEX partner_offers_published_idx ON partner_offers (kind, trigger_type) WHERE status = 'published';

CREATE TABLE offer_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    offer_id uuid NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
    parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    child_id uuid REFERENCES children(id) ON DELETE SET NULL,
    reward_request_id uuid REFERENCES reward_requests(id) ON DELETE SET NULL,
    source_key text NOT NULL,
    status text DEFAULT 'unlocked' NOT NULL,
    code text,
    unlocked_at timestamptz DEFAULT now() NOT NULL,
    redeemed_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT offer_claims_status_check CHECK (status IN ('unlocked', 'redeemed', 'expired', 'cancelled'))
);
CREATE UNIQUE INDEX offer_claims_source_key ON offer_claims (offer_id, source_key);
CREATE INDEX offer_claims_parent_idx ON offer_claims (parent_id, status);

CREATE TABLE voucher_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    offer_id uuid NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
    code text NOT NULL,
    status text DEFAULT 'available' NOT NULL,
    claim_id uuid REFERENCES offer_claims(id) ON DELETE SET NULL,
    assigned_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT voucher_codes_status_check CHECK (status IN ('available', 'assigned', 'redeemed'))
);
CREATE UNIQUE INDEX voucher_codes_offer_code_key ON voucher_codes (offer_id, code);
CREATE INDEX voucher_codes_available_idx ON voucher_codes (offer_id) WHERE status = 'available';

CREATE TABLE offer_metrics_daily (
    offer_id uuid NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
    day date NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    unlocks integer DEFAULT 0 NOT NULL,
    redemptions integer DEFAULT 0 NOT NULL,
    PRIMARY KEY (offer_id, day)
);

-- Les contenus partenaires s'insèrent dans les catalogues existants (pas de système parallèle).
ALTER TABLE activities ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (activity_type IN ('catalog', 'custom_parent', 'partner'));

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS partner_offer_id uuid REFERENCES partner_offers(id) ON DELETE SET NULL;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE rewards DROP CONSTRAINT IF EXISTS rewards_type_check;
ALTER TABLE rewards ADD CONSTRAINT rewards_type_check CHECK (reward_type IN ('custom', 'catalog', 'partner'));
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE SET NULL;

-- Index manquants relevés dans l'audit (requêtes les plus fréquentes).
CREATE INDEX IF NOT EXISTS child_activities_child_status_idx ON child_activities (child_id, status);
CREATE INDEX IF NOT EXISTS reward_requests_child_status_idx ON reward_requests (child_id, status);
CREATE INDEX IF NOT EXISTS children_parent_idx ON children (parent_id);
CREATE INDEX IF NOT EXISTS points_ledger_child_idx ON points_ledger (child_id, created_at DESC);
