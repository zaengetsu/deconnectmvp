// DTO d'entrée de l'API, partagés par les clients. Une seule source de vérité pour la validation.
import { z } from 'zod';
import {
  DIFFICULTIES,
  OFFER_TARGETS,
  REDEMPTION_METHODS,
  MAX_CHILD_AGE,
  MIN_CHILD_AGE,
  NOTIFICATION_TYPES,
  OFFER_CODE_MODES,
  OFFER_KINDS,
  OFFER_TRIGGERS,
  PARTNER_KINDS,
  PARTNER_MEMBER_ROLES,
  PARTNER_STATUSES,
} from './domain';

const uuid = z.uuid();
const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(8, 'Au moins 8 caractères').max(128);
const pin = z.string().regex(/^[0-9]{4}$/, 'Le code PIN doit contenir 4 chiffres');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM');
const url = z.url();

// ─── Pagination ──────────────────────────────────────────────────────────────
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

// ─── Auth ────────────────────────────────────────────────────────────────────
export const RegisterInput = z.object({
  email,
  password,
  fullName: z.string().trim().min(1).max(120),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({ email, password: z.string().min(1) });
export type LoginInput = z.infer<typeof LoginInput>;

export const RefreshInput = z.object({ refreshToken: z.string().min(20) });
export type RefreshInput = z.infer<typeof RefreshInput>;

export const ForgotPasswordInput = z.object({ email });
export const ResetPasswordInput = z.object({ token: z.string().min(20), password });
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

export const ChildLinkInput = z.object({
  code: z.string().trim().min(6).max(64),
  pin,
  deviceId: z.string().max(200).optional(),
});
export type ChildLinkInput = z.infer<typeof ChildLinkInput>;

export const ChildPinLoginInput = z.object({ childId: uuid, pin, deviceId: z.string().max(200).optional() });
export type ChildPinLoginInput = z.infer<typeof ChildPinLoginInput>;

export const AcceptPartnerInvitationInput = z.object({
  token: z.string().min(20),
  fullName: z.string().trim().min(1).max(120),
  password,
});
export type AcceptPartnerInvitationInput = z.infer<typeof AcceptPartnerInvitationInput>;

// ─── Familles ────────────────────────────────────────────────────────────────
export const CreateChildInput = z.object({
  displayName: z.string().trim().min(1).max(40),
  age: z.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE),
  avatarUrl: url.optional(),
});
export type CreateChildInput = z.infer<typeof CreateChildInput>;

export const UpdateChildInput = CreateChildInput.partial();
export type UpdateChildInput = z.infer<typeof UpdateChildInput>;

export const UpdateProfileInput = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  parentRole: z.enum(['maman', 'papa', 'educateur', 'tuteur', 'parent']).optional(),
  city: z.string().max(120).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().length(2).optional(),
  /** Position approximative, fournie avec consentement : sert au ciblage local, jamais transmise aux partenaires. */
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const CreateFamilyInvitationInput = z.object({
  memberRole: z.enum(['co_parent', 'educator', 'grandparent', 'babysitter']).default('co_parent'),
  email: email.optional(),
});
export type CreateFamilyInvitationInput = z.infer<typeof CreateFamilyInvitationInput>;

export const AcceptFamilyInvitationInput = z.object({ token: z.string().min(10) });

// ─── Activités ───────────────────────────────────────────────────────────────
export const ActivityQuery = z.object({
  categoryId: uuid.optional(),
  age: z.coerce.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE).optional(),
  q: z.string().max(100).optional(),
  origin: z.enum(['all', 'catalog', 'custom', 'partner']).default('all'),
});
export type ActivityQuery = z.infer<typeof ActivityQuery>;

export const CreateActivityInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(4000).optional(),
  categoryId: uuid.optional(),
  points: z.number().int().min(0).max(1000).default(10),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  minAge: z.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE).optional(),
  maxAge: z.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE).optional(),
  difficulty: z.enum(DIFFICULTIES).default('easy'),
});
export type CreateActivityInput = z.infer<typeof CreateActivityInput>;

export const UpdateActivityInput = CreateActivityInput.partial().extend({ isActive: z.boolean().optional() });
export type UpdateActivityInput = z.infer<typeof UpdateActivityInput>;

export const AssignActivityInput = z.object({
  activityId: uuid,
  scheduledFor: isoDate.optional(),
  expiresAt: z.iso.datetime().optional(),
});
export type AssignActivityInput = z.infer<typeof AssignActivityInput>;

export const SubmitActivityInput = z.object({
  note: z.string().max(1000).optional(),
  proofUrl: url.optional(),
  proofType: z.enum(['photo', 'text']).optional(),
});
export type SubmitActivityInput = z.infer<typeof SubmitActivityInput>;

export const SelectActivityInput = z.object({ scheduledFor: isoDate.optional() });
export const ValidateActivityInput = z.object({ note: z.string().max(1000).optional() });
export const RejectActivityInput = z.object({ reason: z.string().max(1000).optional() });

// ─── Récompenses ─────────────────────────────────────────────────────────────
export const CreateRewardInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  requiredPoints: z.number().int().min(0).max(100000),
  childId: uuid.optional(),
  rewardCategory: z.string().max(40).optional(),
});
export type CreateRewardInput = z.infer<typeof CreateRewardInput>;

export const UpdateRewardInput = CreateRewardInput.partial().extend({ isActive: z.boolean().optional() });
export type UpdateRewardInput = z.infer<typeof UpdateRewardInput>;

export const HandleRewardRequestInput = z.object({ note: z.string().max(1000).optional() });

// ─── Social & rituels ────────────────────────────────────────────────────────
export const FriendRequestInput = z.object({ friendChildId: uuid });
export const CreateDuoInput = z.object({
  activityId: uuid,
  partnerChildId: uuid,
  startsAt: z.iso.datetime().optional(),
});
export type CreateDuoInput = z.infer<typeof CreateDuoInput>;

export const CreateRitualInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  activityId: uuid.optional(),
  weekday: z.number().int().min(0).max(6),
  startTime: hhmm,
  durationMinutes: z.number().int().min(5).max(600).default(60),
  points: z.number().int().min(0).max(500).default(20),
});
export type CreateRitualInput = z.infer<typeof CreateRitualInput>;

export const UpdateRitualInput = CreateRitualInput.partial().extend({ isActive: z.boolean().optional() });
export type UpdateRitualInput = z.infer<typeof UpdateRitualInput>;

export const ConfirmOccurrenceInput = z.object({ attendees: z.array(uuid).max(20) });
export const SetFamilyGoalInput = z.object({ targetActivities: z.number().int().min(1).max(100) });

export const RecordScreenTimeInput = z.object({
  day: isoDate.optional(),
  minutes: z.number().int().min(0).max(24 * 60),
  goalMinutes: z.number().int().min(0).max(24 * 60).optional(),
});
export type RecordScreenTimeInput = z.infer<typeof RecordScreenTimeInput>;

// ─── Notifications ───────────────────────────────────────────────────────────
export const NotificationListQuery = PageQuery.extend({
  unread: z.coerce.boolean().optional(),
  category: z.enum(['action', 'activity', 'reward', 'family', 'progress', 'other']).optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;

export const RegisterPushTokenInput = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(['ios', 'android', 'web']),
  environment: z.enum(['development', 'production']).default('production'),
});
export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenInput>;

const channelToggle = z.object({ push: z.boolean().optional(), email: z.boolean().optional() });

export const UpdatePreferencesInput = z
  .object({
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
    activityCompleted: z.boolean(),
    activityValidation: z.boolean(),
    activityPlanned: z.boolean(),
    rewardUnlocked: z.boolean(),
    rewardPending: z.boolean(),
    familyActivities: z.boolean(),
    familyInvitations: z.boolean(),
    goals: z.boolean(),
    dailySummary: z.boolean(),
    weeklySummary: z.boolean(),
    screenTimeGoal: z.boolean(),
    screenTimeSummary: z.boolean(),
    tips: z.boolean(),
    productNews: z.boolean(),
    partnerOffers: z.boolean(),
    quietHoursStart: hhmm.nullable(),
    quietHoursEnd: hhmm.nullable(),
    timezone: z.string().min(3).max(64),
    channelOverrides: z.partialRecord(z.enum(NOTIFICATION_TYPES), channelToggle),
  })
  .partial();
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesInput>;

// ─── Partenaires ─────────────────────────────────────────────────────────────
export const CreatePartnerInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(PARTNER_KINDS).default('brand'),
  description: z.string().max(2000).optional(),
  websiteUrl: url.optional(),
  logoUrl: url.optional(),
  contactEmail: email.optional(),
  ownerEmail: email,
});
export type CreatePartnerInput = z.infer<typeof CreatePartnerInput>;

export const UpdatePartnerInput = CreatePartnerInput.omit({ ownerEmail: true }).partial();
export type UpdatePartnerInput = z.infer<typeof UpdatePartnerInput>;

export const SetPartnerStatusInput = z.object({ status: z.enum(PARTNER_STATUSES) });

export const InvitePartnerMemberInput = z.object({ email, role: z.enum(PARTNER_MEMBER_ROLES).default('editor') });
export type InvitePartnerMemberInput = z.infer<typeof InvitePartnerMemberInput>;

const offerBase = z.object({
  kind: z.enum(OFFER_KINDS),
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  imageUrl: url.optional(),
  terms: z.string().max(4000).optional(),
  minAge: z.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE).default(MIN_CHILD_AGE),
  maxAge: z.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE).default(MAX_CHILD_AGE),
  requiredPoints: z.number().int().min(1).max(100000).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  categoryId: uuid.optional(),
  triggerType: z.enum(OFFER_TRIGGERS).default('none'),
  triggerActivityId: uuid.optional(),
  triggerCategoryId: uuid.optional(),
  triggerThreshold: z.number().int().min(1).max(100).default(1),
  codeMode: z.enum(OFFER_CODE_MODES).default('rekonect'),
  genericCode: z.string().trim().min(3).max(64).optional(),
  discountLabel: z.string().max(80).optional(),
  stockTotal: z.number().int().min(1).max(1_000_000).optional(),
  perFamilyLimit: z.number().int().min(1).max(50).default(1),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  triggerWindowDays: z.number().int().min(1).max(365).optional(),
  targetType: z.enum(OFFER_TARGETS).default('national'),
  targetPlaceId: uuid.optional(),
  targetRadiusKm: z.number().int().min(1).max(200).optional(),
  targetPostalCodes: z.array(z.string().regex(/^[0-9AB]{5}$/, 'Code postal invalide')).max(500).default([]),
  targetPromoCodeId: uuid.optional(),
  redemptionMethod: z.enum(REDEMPTION_METHODS).default('qr'),
});

/** Règles de cohérence d'une offre, réutilisées à la création et à la soumission. */
export function offerIssues(o: Partial<z.infer<typeof offerBase>>): string[] {
  const issues: string[] = [];
  if (o.minAge != null && o.maxAge != null && o.minAge > o.maxAge) issues.push("L'âge minimum dépasse l'âge maximum");
  if (o.kind === 'child_reward' && !o.requiredPoints && (!o.triggerType || o.triggerType === 'none'))
    issues.push('Une récompense enfant s’obtient contre des points ou après des activités');
  if (o.kind === 'parent_voucher' && (!o.triggerType || o.triggerType === 'none'))
    issues.push('Un bon parent doit préciser ce qui le débloque');
  if (o.triggerType === 'activity_validated' && !o.triggerActivityId) issues.push("Choisissez l'activité déclencheuse");
  if (o.triggerType === 'category_validated' && !o.triggerCategoryId) issues.push('Choisissez la catégorie déclencheuse');
  if (o.codeMode === 'generic' && !o.genericCode) issues.push('Renseignez le code générique');
  if (o.startsAt && o.endsAt && new Date(o.startsAt) >= new Date(o.endsAt)) issues.push('La date de fin précède le début');
  if (o.triggerType === 'streak_days' && (!o.triggerThreshold || o.triggerThreshold < 2)) issues.push('Indiquez le nombre de jours d’affilée');
  if (o.targetType === 'radius' && (!o.targetPlaceId || !o.targetRadiusKm)) issues.push('Choisissez le lieu et le rayon de ciblage');
  if (o.targetType === 'area' && !(o.targetPostalCodes?.length)) issues.push('Ajoutez au moins un code postal');
  if (o.targetType === 'code' && !o.targetPromoCodeId) issues.push("Choisissez le code d'accès");
  return issues;
}

export const CreateOfferInput = offerBase.superRefine((o, ctx) => {
  for (const message of offerIssues(o)) ctx.addIssue({ code: 'custom', message });
});
export type CreateOfferInput = z.infer<typeof CreateOfferInput>;

export const UpdateOfferInput = offerBase.omit({ kind: true }).partial();
export type UpdateOfferInput = z.infer<typeof UpdateOfferInput>;

export const ImportCodesInput = z.object({ codes: z.array(z.string().trim().min(3).max(64)).min(1).max(10000) });
export const VerifyCodeInput = z.object({
  code: z.string().trim().min(3).max(64),
  /** false = simple vérification, true = marquer comme utilisé. */
  redeem: z.boolean().default(true),
  placeId: uuid.optional(),
  basketAmountCents: z.number().int().min(0).max(1_000_000).optional(),
});
export type VerifyCodeInput = z.infer<typeof VerifyCodeInput>;
export const RequestChangesInput = z.object({ note: z.string().trim().min(3).max(1000) });
export const PlaceInput = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().max(200).optional(),
  postalCode: z.string().max(10).optional(),
  city: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  managerName: z.string().max(120).optional(),
  accessLevel: z.enum(['admin', 'delegated', 'read', 'reception']).default('delegated'),
});
export type PlaceInput = z.infer<typeof PlaceInput>;
export const UpdatePlaceInput = PlaceInput.partial().extend({ isActive: z.boolean().optional() });
export const AudienceQuery = z.object({
  targetType: z.enum(OFFER_TARGETS).default('national'),
  placeId: uuid.optional(),
  radiusKm: z.coerce.number().int().min(1).max(200).optional(),
  postalCodes: z.string().max(4000).optional(),
  promoCodeId: uuid.optional(),
  minAge: z.coerce.number().int().min(3).max(18).optional(),
  maxAge: z.coerce.number().int().min(3).max(18).optional(),
});
export type AudienceQuery = z.infer<typeof AudienceQuery>;
export const RangeQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d), 'Période invalide').default(30) });

// ─── Abonnements ─────────────────────────────────────────────────────────────
export const CheckoutInput = z.object({
  planId: z.string().min(2).max(40),
  interval: z.enum(['month', 'year']).default('month'),
  promoCode: z.string().trim().max(40).optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;
export const RedeemPromoInput = z.object({ code: z.string().trim().min(3).max(40) });
export const UpdatePlanInput = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  tagline: z.string().max(120).nullable().optional(),
  tag: z.string().max(40).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  monthlyPriceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  annualPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  limits: z.record(z.string(), z.union([z.number().int().min(0), z.boolean(), z.null()])).optional(),
  features: z.array(z.string().max(120)).max(12).optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});
export type UpdatePlanInput = z.infer<typeof UpdatePlanInput>;
export const CreatePromoCodeInput = z
  .object({
    code: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{3,40}$/, 'Lettres, chiffres et tirets uniquement')),
    description: z.string().trim().min(3).max(200),
    kind: z.enum(['percent', 'amount', 'free_months', 'sponsored']),
    percentOff: z.number().int().min(1).max(100).optional(),
    amountOffCents: z.number().int().min(1).optional(),
    durationMonths: z.number().int().min(1).max(36).optional(),
    planId: z.string().optional(),
    sponsorPartnerId: uuid.optional(),
    maxRedemptions: z.number().int().min(1).optional(),
    startsAt: z.iso.datetime().optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.kind === 'percent' && !p.percentOff) ctx.addIssue({ code: 'custom', message: 'Indiquez le pourcentage' });
    if (p.kind === 'amount' && !p.amountOffCents) ctx.addIssue({ code: 'custom', message: 'Indiquez le montant' });
    if ((p.kind === 'free_months' || p.kind === 'sponsored') && !p.durationMonths) ctx.addIssue({ code: 'custom', message: 'Indiquez la durée' });
    if (p.kind === 'sponsored' && !p.sponsorPartnerId) ctx.addIssue({ code: 'custom', message: 'Choisissez le partenaire qui finance' });
  });
export type CreatePromoCodeInput = z.infer<typeof CreatePromoCodeInput>;
export const GiftMonthsInput = z.object({ months: z.number().int().min(1).max(12).default(1), planId: z.string().default('family') });
export const ReportActivityInput = z.object({
  reason: z.enum(['duplicate', 'unclear', 'unsafe', 'inappropriate', 'other']),
  details: z.string().max(1000).optional(),
});
export const RejectOfferInput = z.object({ reason: z.string().trim().min(3).max(1000) });

// ─── Admin ───────────────────────────────────────────────────────────────────
export const AdminFamilyQuery = PageQuery.extend({
  q: z.string().max(120).optional(),
  plan: z.enum(['free', 'family', 'family_plus']).optional(),
  status: z.enum(['active', 'past_due', 'inactive']).optional(),
});
export const AdminNotificationQuery = PageQuery.extend({
  status: z.enum(['scheduled', 'sent', 'cancelled', 'failed', 'suppressed']).optional(),
  type: z.string().max(60).optional(),
});
export const AdminEventQuery = PageQuery.extend({ status: z.enum(['pending', 'published', 'dead']).optional() });
export const CreateAdminInput = z.object({ email, fullName: z.string().trim().min(1).max(120), password });
export const CreateCategoryInput = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(60),
  description: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
});
export const CreateBadgeInput = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
  conditionType: z.enum(['activities_validated', 'points_earned']),
  conditionValue: z.number().int().min(1).max(1_000_000),
});
export const CreateCatalogRewardInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  requiredPoints: z.number().int().min(0).max(100000),
  rewardCategory: z.string().max(40).optional(),
});
export const TestNotificationInput = z.object({
  recipientType: z.enum(['parent', 'child']),
  recipientId: uuid,
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});
