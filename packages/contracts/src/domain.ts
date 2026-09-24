// Énumérations et règles métier partagées entre l'API, le mobile et les apps web.

export const USER_ROLES = ['parent', 'admin', 'partner'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CHILD_ACTIVITY_STATUSES = ['available', 'selected', 'submitted', 'validated', 'rejected'] as const;
export type ChildActivityStatus = (typeof CHILD_ACTIVITY_STATUSES)[number];

export const REWARD_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'completed'] as const;
export type RewardRequestStatus = (typeof REWARD_REQUEST_STATUSES)[number];

export const REWARD_TYPES = ['custom', 'catalog', 'partner'] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export const ACTIVITY_TYPES = ['catalog', 'custom_parent', 'partner'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// ─── Âge ─────────────────────────────────────────────────────────────────────
// Mêmes tranches pour le catalogue, les récompenses et le ton des notifications.
export const MIN_CHILD_AGE = 3;
export const MAX_CHILD_AGE = 18;
export type AgeTone = 'young' | 'kid' | 'teen';

export function ageTone(age: number | null | undefined): AgeTone {
  if (age == null) return 'kid';
  if (age <= 7) return 'young';
  if (age <= 12) return 'kid';
  return 'teen';
}

export function ageFits(age: number, minAge?: number | null, maxAge?: number | null): boolean {
  return (minAge == null || age >= minAge) && (maxAge == null || age <= maxAge);
}

// ─── Niveaux ─────────────────────────────────────────────────────────────────
export const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500] as const;

export function levelForPoints(totalPoints: number): number {
  let level = 1;
  LEVEL_THRESHOLDS.forEach((threshold, index) => {
    if (totalPoints >= threshold) level = index + 1;
  });
  return level;
}

/** Noms des niveaux (mêmes libellés que l'app mobile). */
export const LEVEL_NAMES = ['Graine', 'Pousse', 'Explorateur', 'Aventurier', 'Champion', 'Héros', 'Super Héros', 'Maître', 'Grand Maître', 'Légende'] as const;
export function levelName(level: number): string {
  return LEVEL_NAMES[Math.min(Math.max(level, 1), LEVEL_NAMES.length) - 1];
}

export const REWARD_CATEGORY_LABELS: Record<string, string> = {
  experience: 'Expériences',
  privilege: 'Privilèges',
  responsibility: 'Responsabilités',
  family: 'Moments familiaux',
  symbolic: 'Symboliques',
  partner: 'Partenaires',
};

export const CATALOG_STATUSES = ['published', 'draft', 'flagged', 'archived'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export function pointsToNextLevel(totalPoints: number): number | null {
  const next = LEVEL_THRESHOLDS.find((t) => t > totalPoints);
  return next == null ? null : next - totalPoints;
}

// ─── Notifications ───────────────────────────────────────────────────────────
export const NOTIFICATION_PRIORITIES = ['critical', 'high', 'normal', 'low'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['scheduled', 'sent', 'cancelled', 'failed', 'suppressed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export type RecipientType = 'parent' | 'child';

export const NOTIFICATION_TYPES = [
  'activity_assigned',
  'activity_completed',
  'activity_validated',
  'activity_rejected',
  'activity_validation_required',
  'activity_planned',
  'activity_reminder',
  'reward_unlocked',
  'reward_requested',
  'reward_pending',
  'reward_approved',
  'reward_rejected',
  'reward_delivered',
  'level_up',
  'badge_earned',
  'child_device_linked',
  'friend_request',
  'friend_activity_invited',
  'friend_activity_started',
  'friend_activity_completed',
  'family_activity',
  'family_invitation',
  'goal_progress',
  'goal_completed',
  'daily_summary',
  'weekly_summary',
  'screen_time_goal',
  'screen_time_summary',
  'partner_offer_unlocked',
  'billing',
  'security',
  'tip',
  'product_news',
  // Relances d'encouragement (moteur d'engagement, plafonnées : 1 par jour et 4 par semaine pour un enfant)
  'nudge_resume',
  'nudge_streak',
  'nudge_reward_close',
  'nudge_comeback',
  'nudge_idle',
  'nudge_goal',
  'streak_milestone',
  // Côté parent
  'parent_nudge_idle',
  'validation_backlog',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Relances d'encouragement : soumises au plafond et à la préférence « encouragements ». */
export const NUDGE_TYPES = ['nudge_resume', 'nudge_streak', 'nudge_reward_close', 'nudge_comeback', 'nudge_idle', 'nudge_goal', 'parent_nudge_idle'] as const satisfies readonly NotificationType[];
export type NudgeType = (typeof NUDGE_TYPES)[number];

export const PRIORITY_RANK: Record<NotificationPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

export function higherPriority(a: NotificationPriority, b: NotificationPriority): NotificationPriority {
  return PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;
}

// ─── Partenaires ─────────────────────────────────────────────────────────────
export const PARTNER_KINDS = ['brand', 'store', 'retailer', 'association', 'local_business', 'public_institution', 'cse'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const PARTNER_STATUSES = ['pending', 'onboarding', 'trial', 'active', 'suspended'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** « reception » : agent d'accueil ou de caisse, ne peut que valider des bons. */
export const PARTNER_MEMBER_ROLES = ['owner', 'editor', 'viewer', 'reception'] as const;
/** Libellés affichés (portail, emails). */
export const PARTNER_ROLE_LABELS: Record<string, string> = { owner: 'administrateur', editor: 'éditeur', viewer: 'lecteur', reception: 'accueil (validation des bons)' };
/** Type d'organisation déclaré sur la landing partenaires. */
export const PARTNER_LEAD_KINDS = ['store', 'brand', 'public_institution', 'cse'] as const;
export type PartnerLeadKind = (typeof PARTNER_LEAD_KINDS)[number];
export const PARTNER_LEAD_STATUSES = ['new', 'contacted', 'converted', 'archived'] as const;
export type PartnerLeadStatus = (typeof PARTNER_LEAD_STATUSES)[number];
export type PartnerMemberRole = (typeof PARTNER_MEMBER_ROLES)[number];

export const OFFER_KINDS = ['child_reward', 'parent_voucher', 'sponsored_activity'] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const OFFER_STATUSES = ['draft', 'pending_brand', 'pending_review', 'changes_requested', 'published', 'paused', 'expired', 'rejected'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_TRIGGERS = ['none', 'activity_validated', 'category_validated', 'goal_completed', 'level_reached', 'streak_days'] as const;
export type OfferTrigger = (typeof OFFER_TRIGGERS)[number];

/** « rekonect » : un code RK unique généré par bon (QR scanné en caisse). */
export const OFFER_CODE_MODES = ['rekonect', 'generic', 'unique_pool'] as const;
export type OfferCodeMode = (typeof OFFER_CODE_MODES)[number];

export const OFFER_CLAIM_STATUSES = ['unlocked', 'redeemed', 'expired', 'cancelled'] as const;
export type OfferClaimStatus = (typeof OFFER_CLAIM_STATUSES)[number];

/** Transitions autorisées d'une offre. La modération est la seule porte vers « published ». */
export const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  draft: ['pending_brand', 'pending_review'],
  pending_brand: ['pending_review', 'changes_requested', 'draft'],
  pending_review: ['published', 'rejected', 'changes_requested', 'draft'],
  changes_requested: ['draft', 'pending_brand', 'pending_review'],
  published: ['paused', 'expired'],
  paused: ['published', 'expired'],
  rejected: ['draft'],
  expired: [],
};

export const OFFER_TARGETS = ['national', 'radius', 'area', 'code'] as const;
export type OfferTarget = (typeof OFFER_TARGETS)[number];

export const REDEMPTION_METHODS = ['qr', 'online_code', 'reception'] as const;
export type RedemptionMethod = (typeof REDEMPTION_METHODS)[number];

/** Tranches d'âge proposées au partenaire (puces du formulaire). */
export const AGE_BANDS = [
  { id: '4-6', label: '4–6 ans', min: 4, max: 6 },
  { id: '7-9', label: '7–9 ans', min: 7, max: 9 },
  { id: '10-12', label: '10–12 ans', min: 10, max: 12 },
  { id: '13-14', label: '13–14 ans', min: 13, max: 14 },
  { id: '15+', label: '15 ans et +', min: 15, max: 18 },
] as const;

// ─── Plans & abonnements ─────────────────────────────────────────────────────
export const FAMILY_PLAN_IDS = ['free', 'family', 'family_plus'] as const;
export const PARTNER_PLAN_IDS = ['partner_local', 'partner_network', 'partner_public'] as const;
export type FamilyPlanId = (typeof FAMILY_PLAN_IDS)[number];
export type PartnerPlanId = (typeof PARTNER_PLAN_IDS)[number];
export type PlanId = FamilyPlanId | PartnerPlanId;

export interface FamilyLimits {
  maxChildren: number | null;
  maxCustomActivities: number | null;
  maxCoParents: number | null;
  weeklyStats: boolean;
  partnerOffersLocal: boolean;
  partnerOffersPremium: boolean;
}

export interface PartnerLimits {
  maxPlaces: number | null;
  maxActiveOffers: number | null;
  maxRadiusKm: number | null;
  nationalTargeting: boolean;
  parentVouchers: boolean;
  apiAccess: boolean;
  accessCodeTargeting: boolean;
  includedFamilyLicenses: number;
}

export const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'trialing', 'past_due', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statut d'accès : un paiement en échec garde les avantages pendant la période de relance. */
export function subscriptionGrantsAccess(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

/** Montant mensuel équivalent (MRR) d'un abonnement. */
export function monthlyAmountCents(amountCents: number, interval: 'month' | 'year', quantity = 1): number {
  const total = amountCents * Math.max(1, quantity);
  return interval === 'year' ? Math.round(total / 12) : total;
}

/** « 4,99 € », « 12 675 € » — format d'affichage français. */
export function formatEuros(cents: number | null | undefined, opts: { decimals?: 'auto' | 'always' } = {}): string {
  if (cents == null) return '—';
  const value = cents / 100;
  const decimals = opts.decimals === 'always' || !Number.isInteger(value) ? 2 : 0;
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/\u202f/g, ' ')} €`;
}

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

/** Seuil sous lequel une statistique partenaire est masquée (anti ré-identification). */
export const PARTNER_STATS_MIN_COUNT = 10;
