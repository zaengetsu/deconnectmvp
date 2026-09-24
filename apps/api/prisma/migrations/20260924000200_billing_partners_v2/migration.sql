-- Plans & abonnements (Stripe), partenaires v2 (réseau, lieux, ciblage, mesure), catalogue v2 (statuts, signalements).

-- ═══ Plans ════════════════════════════════════════════════════════════════════
CREATE TABLE plans (
    id text NOT NULL PRIMARY KEY,
    audience text NOT NULL,
    name text NOT NULL,
    tagline text,
    tag text,
    color text DEFAULT '#3C41A8' NOT NULL,
    monthly_price_cents integer,
    annual_price_cents integer,
    currency text DEFAULT 'eur' NOT NULL,
    stripe_product_id text,
    stripe_monthly_price_id text,
    stripe_annual_price_id text,
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    features text[] DEFAULT ARRAY[]::text[] NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT plans_audience_check CHECK (audience IN ('family', 'partner'))
);

-- Limites : null = illimité. Données de référence (modifiables depuis l'admin).
INSERT INTO plans (id, audience, name, tagline, tag, color, monthly_price_cents, annual_price_cents, limits, features, sort_order) VALUES
 ('free', 'family', 'Gratuit', 'Pour découvrir', NULL, '#B9BCE8', 0, 0,
  '{"maxChildren":1,"maxCustomActivities":5,"maxCoParents":0,"weeklyStats":false,"partnerOffersLocal":true,"partnerOffersPremium":false}',
  ARRAY['1 enfant','Catalogue natif complet','5 activités personnalisées','1 parent'], 1),
 ('family', 'family', 'Famille', 'ou 49 € / an', 'LE PLUS CHOISI', '#3C41A8', 499, 4900,
  '{"maxChildren":4,"maxCustomActivities":null,"maxCoParents":1,"weeklyStats":true,"partnerOffersLocal":true,"partnerOffersPremium":false}',
  ARRAY['Jusqu''à 4 enfants','Activités personnalisées illimitées','1 co-parent','Statistiques hebdomadaires'], 2),
 ('family_plus', 'family', 'Famille+', 'ou 79 € / an', NULL, '#FF9469', 799, 7900,
  '{"maxChildren":6,"maxCustomActivities":null,"maxCoParents":null,"weeklyStats":true,"partnerOffersLocal":true,"partnerOffersPremium":true}',
  ARRAY['Jusqu''à 6 enfants','Co-parents et éducateurs illimités','Statistiques avancées et export','Offres partenaires premium'], 3),
 ('partner_local', 'partner', 'Partenaire local', 'Commerce, club, magasin', NULL, '#5CB88F', 2900, 29000,
  '{"maxPlaces":1,"maxActiveOffers":3,"maxRadiusKm":20,"nationalTargeting":false,"parentVouchers":true,"apiAccess":false,"accessCodeTargeting":false,"includedFamilyLicenses":0}',
  ARRAY['1 point de vente','3 offres actives','Ciblage jusqu''à 20 km','Statistiques d''échange'], 1),
 ('partner_network', 'partner', 'Réseau', 'Enseignes multi-magasins', 'ENSEIGNES', '#3C41A8', 29000, 290000,
  '{"maxPlaces":null,"maxActiveOffers":null,"maxRadiusKm":null,"nationalTargeting":true,"parentVouchers":true,"apiAccess":true,"accessCodeTargeting":false,"includedFamilyLicenses":0}',
  ARRAY['Points de vente illimités','Offres illimitées, locales et nationales','Défis sponsorisés','Accès API et export'], 2),
 ('partner_public', 'partner', 'Collectivité & CSE', 'Mairies, comités d''entreprise', NULL, '#7C6BD4', NULL, NULL,
  '{"maxPlaces":null,"maxActiveOffers":null,"maxRadiusKm":null,"nationalTargeting":false,"parentVouchers":true,"apiAccess":false,"accessCodeTargeting":true,"includedFamilyLicenses":800}',
  ARRAY['Accès par code (habitants, salariés)','Abonnements Famille offerts en volume','Équipements publics comme lieux','Rapport d''impact annuel'], 3);

-- ═══ Partenaires v2 (avant les abonnements qui les référencent) ═══════════════
ALTER TABLE partners ADD COLUMN IF NOT EXISTS parent_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS color text DEFAULT '#3C41A8' NOT NULL;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS subtitle text;
ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_kind_check;
ALTER TABLE partners ADD CONSTRAINT partners_kind_check CHECK (kind IN ('brand', 'store', 'retailer', 'association', 'local_business', 'public_institution', 'cse'));
ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_status_check;
ALTER TABLE partners ADD CONSTRAINT partners_status_check CHECK (status IN ('pending', 'onboarding', 'trial', 'active', 'suspended'));
CREATE INDEX partners_parent_idx ON partners (parent_partner_id);

ALTER TABLE partner_members DROP CONSTRAINT IF EXISTS partner_members_role_check;
ALTER TABLE partner_members ADD CONSTRAINT partner_members_role_check CHECK (role IN ('owner', 'editor', 'viewer', 'reception'));
ALTER TABLE partner_members ADD COLUMN IF NOT EXISTS title text;

CREATE TABLE partner_places (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    linked_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
    name text NOT NULL,
    address text,
    postal_code text,
    city text,
    latitude double precision,
    longitude double precision,
    manager_name text,
    access_level text DEFAULT 'delegated' NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT partner_places_access_check CHECK (access_level IN ('admin', 'delegated', 'read', 'reception'))
);
CREATE INDEX partner_places_partner_idx ON partner_places (partner_id);

-- ═══ Abonnements ══════════════════════════════════════════════════════════════
UPDATE subscriptions SET plan = 'family' WHERE plan = 'premium';
UPDATE subscriptions SET plan = 'partner_public' WHERE plan = 'b2b';
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_fkey FOREIGN KEY (plan) REFERENCES plans(id);
ALTER TABLE subscriptions ALTER COLUMN parent_id DROP NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'month' NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount_cents integer DEFAULT 0 NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'eur' NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS comp_plan text REFERENCES plans(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS comp_until timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1 NOT NULL;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_owner_check CHECK ((parent_id IS NULL) <> (partner_id IS NULL));
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_interval_check CHECK (billing_interval IN ('month', 'year'));
-- Un seul abonnement par famille : on garde le plus récent si l'historique en contient plusieurs.
DELETE FROM subscriptions s USING subscriptions t
 WHERE s.parent_id IS NOT NULL AND s.parent_id = t.parent_id
   AND (s.created_at, s.ctid) < (t.created_at, t.ctid);
CREATE UNIQUE INDEX subscriptions_parent_key ON subscriptions (parent_id) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_partner_key ON subscriptions (partner_id) WHERE partner_id IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_stripe_sub_key ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX subscriptions_customer_idx ON subscriptions (stripe_customer_id);

CREATE TABLE subscription_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
    parent_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    partner_id uuid REFERENCES partners(id) ON DELETE CASCADE,
    type text NOT NULL,
    description text NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    plan text,
    stripe_event_id text,
    occurred_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT subscription_events_type_check CHECK (type IN ('created', 'upgraded', 'downgraded', 'renewed', 'payment_succeeded', 'payment_failed', 'canceled', 'cancel_scheduled', 'reactivated', 'trial_started', 'comp_granted', 'licenses_purchased', 'promo_redeemed'))
);
CREATE UNIQUE INDEX subscription_events_stripe_key ON subscription_events (stripe_event_id, type) WHERE stripe_event_id IS NOT NULL;
CREATE INDEX subscription_events_time_idx ON subscription_events (occurred_at DESC);

CREATE TABLE invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    parent_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    partner_id uuid REFERENCES partners(id) ON DELETE CASCADE,
    stripe_invoice_id text,
    number text,
    label text NOT NULL,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'eur' NOT NULL,
    status text NOT NULL,
    hosted_url text,
    pdf_url text,
    period_start timestamptz,
    period_end timestamptz,
    issued_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
    CONSTRAINT invoices_owner_check CHECK ((parent_id IS NULL) <> (partner_id IS NULL))
);
CREATE UNIQUE INDEX invoices_stripe_key ON invoices (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

CREATE TABLE stripe_webhook_events (
    id text NOT NULL PRIMARY KEY,
    type text NOT NULL,
    received_at timestamptz DEFAULT now() NOT NULL
);

-- Codes promo : remises Stripe (RENTREE26), mois offerts (NOEL25) ou licences payées par un partenaire (CSE-AIRBUS).
CREATE TABLE promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    code text NOT NULL,
    description text NOT NULL,
    kind text NOT NULL,
    percent_off integer,
    amount_off_cents integer,
    duration_months integer,
    plan_id text REFERENCES plans(id),
    sponsor_partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
    max_redemptions integer,
    redemptions integer DEFAULT 0 NOT NULL,
    starts_at timestamptz,
    expires_at timestamptz,
    is_active boolean DEFAULT true NOT NULL,
    stripe_coupon_id text,
    stripe_promotion_code_id text,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT promo_codes_kind_check CHECK (kind IN ('percent', 'amount', 'free_months', 'sponsored')),
    CONSTRAINT promo_codes_redemptions_check CHECK (max_redemptions IS NULL OR redemptions <= max_redemptions)
);
CREATE UNIQUE INDEX promo_codes_code_key ON promo_codes (code);

CREATE TABLE promo_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    redeemed_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX promo_redemptions_key ON promo_redemptions (promo_code_id, parent_id);
CREATE INDEX promo_redemptions_parent_idx ON promo_redemptions (parent_id);

-- ═══ Localisation des familles (ciblage géographique, jamais transmise aux partenaires) ═══
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude double precision;

-- ═══ Offres v2 ════════════════════════════════════════════════════════════════
ALTER TABLE partner_offers DROP CONSTRAINT IF EXISTS partner_offers_status_check;
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_status_check CHECK (status IN ('draft', 'pending_brand', 'pending_review', 'changes_requested', 'published', 'paused', 'expired', 'rejected'));
ALTER TABLE partner_offers DROP CONSTRAINT IF EXISTS partner_offers_trigger_check;
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_trigger_check CHECK (trigger_type IN ('none', 'activity_validated', 'category_validated', 'goal_completed', 'level_reached', 'streak_days'));
ALTER TABLE partner_offers DROP CONSTRAINT IF EXISTS partner_offers_code_mode_check;
UPDATE partner_offers SET code_mode = 'rekonect' WHERE code_mode = 'none';
ALTER TABLE partner_offers ALTER COLUMN code_mode SET DEFAULT 'rekonect';
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_code_mode_check CHECK (code_mode IN ('rekonect', 'generic', 'unique_pool'));
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS trigger_window_days integer;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'national' NOT NULL;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS target_place_id uuid REFERENCES partner_places(id) ON DELETE SET NULL;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS target_radius_km integer;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS target_postal_codes text[] DEFAULT ARRAY[]::text[] NOT NULL;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS target_promo_code_id uuid REFERENCES promo_codes(id) ON DELETE SET NULL;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS redemption_method text DEFAULT 'qr' NOT NULL;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS brand_reviewed_at timestamptz;
ALTER TABLE partner_offers ADD COLUMN IF NOT EXISTS brand_reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_target_check CHECK (target_type IN ('national', 'radius', 'area', 'code'));
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_redemption_check CHECK (redemption_method IN ('qr', 'online_code', 'reception'));

ALTER TABLE offer_claims ADD COLUMN IF NOT EXISTS redeemed_place_id uuid REFERENCES partner_places(id) ON DELETE SET NULL;
ALTER TABLE offer_claims ADD COLUMN IF NOT EXISTS redeemed_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE offer_claims ADD COLUMN IF NOT EXISTS basket_amount_cents integer;
CREATE INDEX offer_claims_code_idx ON offer_claims (code) WHERE code IS NOT NULL;

-- Vues d'une offre, par personne et par jour : sert à compter les « enfants touchés » sans rien exposer.
CREATE TABLE offer_impressions (
    offer_id uuid NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
    viewer_key text NOT NULL,
    day date NOT NULL,
    PRIMARY KEY (offer_id, viewer_key, day)
);

-- ═══ Catalogue v2 ═════════════════════════════════════════════════════════════
ALTER TABLE activities ADD COLUMN IF NOT EXISTS catalog_status text DEFAULT 'published' NOT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS proof_required boolean DEFAULT false NOT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS partner_eligible boolean DEFAULT true NOT NULL;
ALTER TABLE activities ADD CONSTRAINT activities_catalog_status_check CHECK (catalog_status IN ('published', 'draft', 'flagged', 'archived'));
UPDATE activities SET catalog_status = 'archived' WHERE activity_type = 'catalog' AND is_active = false;

CREATE TABLE activity_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    reason text NOT NULL,
    details text,
    created_at timestamptz DEFAULT now() NOT NULL,
    resolved_at timestamptz,
    resolution text
);
CREATE INDEX activity_reports_open_idx ON activity_reports (activity_id) WHERE resolved_at IS NULL;

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS source_reward_id uuid REFERENCES rewards(id) ON DELETE SET NULL;
CREATE INDEX rewards_source_idx ON rewards (source_reward_id) WHERE source_reward_id IS NOT NULL;

-- Notifications de facturation.
CREATE INDEX IF NOT EXISTS child_activities_validated_idx ON child_activities (validated_at) WHERE status = 'validated';
