// Formes des réponses de l'API consommées par les apps web. Les dates arrivent en ISO (string).
export type ISODate = string;
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface Delta {
  value: number | null;
  delta: number | null;
}

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: 'parent' | 'admin' | 'partner';
}
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: Me;
}

// ─── Admin : pilotage ────────────────────────────────────────────────────────
export interface AdminOverview {
  environment: 'development' | 'staging' | 'production' | string;
  asOf: ISODate;
  days: number;
  alerts: { pendingOffers: number; oldestPendingAt: ISODate | null; failedPayments: number; flaggedActivities: number; flagReasons: string[] };
  kpis: {
    activeFamilies: { value: number; delta: number | null; newFamilies: number };
    children: { value: number; delta: number | null; perFamily: number };
    validatedActivities: { value: number; delta: number | null; perActiveChild: number };
    mrr: { valueCents: number; delta: number | null; partnerCents: number };
  };
  health: { avgValidationDelaySeconds: number | null; refusalRate: number | null; streaks7Plus: number; notificationsEnabledRate: number | null };
}
export interface ActiveFamiliesMonth {
  label: string;
  month: string;
  paid: number;
  free: number;
}
export interface TopActivity {
  id: string;
  title: string;
  category: string | null;
  categorySlug: string | null;
  validated: number;
  validationRate: number | null;
}
export interface TopReward {
  rank: string;
  title: string;
  source: string;
  partner: boolean;
  exchanges: number;
}
export interface BillingOverview {
  mrrCents: number;
  familyMrrCents: number;
  partnerMrrCents: number;
  families: number;
  payingFamilies: number;
  compFamilies: number;
  conversionRate: number;
  churnRate: number;
  failedPayments: number;
  distribution: { planId: string; name: string; color: string; count: number; percent: number }[];
}

// ─── Admin : catalogue ───────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  description?: string | null;
}
export type Difficulty = 'easy' | 'medium' | 'hard';
export type CatalogStatus = 'published' | 'draft' | 'flagged' | 'archived';
export interface AdminActivity {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  categoryId: string | null;
  category: Category | null;
  points: number;
  durationMinutes: number | null;
  minAge: number;
  maxAge: number;
  difficulty: Difficulty;
  catalogStatus: CatalogStatus;
  proofRequired: boolean;
  partnerEligible: boolean;
  isActive: boolean;
  activityType: string;
  partner: { id: string; name: string } | null;
  openReports: number;
  assigned30d: number;
  validated: number;
  validationRate: number | null;
  families: number;
}
export interface AdminActivityList extends Page<AdminActivity> {
  total: number;
  published: number;
  categories: (Category & { count: number })[];
}
export interface ActivityReport {
  id: string;
  activityId: string;
  reason: string;
  details: string | null;
  createdAt: ISODate;
  activity: { id: string; title: string; catalogStatus: CatalogStatus };
}
export interface AdminActivityDetail extends Omit<AdminActivity, 'openReports' | 'validated'> {
  reports: ActivityReport[];
}
export interface AdminActivityInput {
  title: string;
  description?: string | null;
  instructions?: string | null;
  categoryId?: string | null;
  points: number;
  durationMinutes?: number | null;
  minAge: number;
  maxAge: number;
  difficulty: Difficulty;
  catalogStatus?: CatalogStatus;
  proofRequired?: boolean;
  partnerEligible?: boolean;
}
export interface CatalogReward {
  id: string;
  title: string;
  description: string | null;
  requiredPoints: number;
  rewardCategory: string | null;
  categoryLabel: string;
  isActive: boolean;
  families: number;
  exchanges30d: number;
}
export interface CatalogRewards {
  items: CatalogReward[];
  categories: { key: string; label: string; ideas: number; share: number }[];
}

// ─── Admin : familles ────────────────────────────────────────────────────────
export type FamilyStatus = 'active' | 'past_due' | 'inactive';
export interface AdminFamilyRow {
  id: string;
  name: string;
  parentName: string;
  email: string;
  city: string | null;
  children: number;
  plan: string;
  planName: string;
  createdAt: ISODate;
  lastActivityAt: ISODate | null;
  status: FamilyStatus;
  statusLabel: string;
}
export interface FamilyStats {
  families: number;
  children: number;
  newFamilies30d: number;
  childrenPerFamily: number;
  deviceLinkedRate: number | null;
  inactive30d: number;
}
export interface AdminFamilyDetail {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  createdAt: ISODate;
  plan: string;
  planName: string;
  subscription: { status: string; compUntil: ISODate | null; currentPeriodEnd: ISODate | null; cancelAtPeriodEnd: boolean } | null;
  status: FamilyStatus;
  statusLabel: string;
  parents: { name: string; email: string; role: string }[];
  children: { id: string; displayName: string; age: number; level: number; levelName: string; totalPoints: number; streakDays: number; avatarUrl: string | null; deviceLinkedAt: ISODate | null }[];
  lastLoginAt: ISODate | null;
  disabledAt: ISODate | null;
  activity30d: number;
}
export interface Invoice {
  id: string;
  number: string | null;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  status: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
  periodStart: ISODate | null;
  periodEnd: ISODate | null;
  issuedAt: ISODate;
  label?: string;
}
export interface SubscriptionEventRow {
  id: string;
  type: string;
  description: string | null;
  amountCents: number | null;
  occurredAt: ISODate;
  plan: string | null;
  who?: string;
}

// ─── Admin : plans ───────────────────────────────────────────────────────────
export interface Plan {
  id: string;
  audience: 'family' | 'partner';
  name: string;
  tagline: string | null;
  tag: string | null;
  color: string;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  limits: Record<string, number | boolean | null>;
  features: string[];
  sortOrder: number;
  isPublic: boolean;
  isActive: boolean;
}
export interface AdminPlan extends Plan {
  subscribers: number;
  compedSubscribers: number;
  mrrCents: number;
}
export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  kind: 'percent' | 'amount' | 'free_months' | 'sponsored';
  percentOff: number | null;
  amountOffCents: number | null;
  durationMonths: number | null;
  planId: string | null;
  maxRedemptions: number | null;
  redemptions: number;
  expiresAt: ISODate | null;
  isActive: boolean;
  sponsor: { id: string; name: string } | null;
  state: 'active' | 'expired';
}

// ─── Partenaires ─────────────────────────────────────────────────────────────
export type PartnerRole = 'owner' | 'editor' | 'viewer' | 'reception';
// ─── Landing partenaires ─────────────────────────────────────────────────────
export type PartnerLeadKind = 'store' | 'brand' | 'public_institution' | 'cse';
export type PartnerLeadStatus = 'new' | 'contacted' | 'converted' | 'archived';
export interface PartnerLeadInput {
  fullName: string;
  organization: string;
  email: string;
  kind: PartnerLeadKind;
  message?: string;
  /** Piège à robots : toujours vide. */
  website?: string;
}
export interface PartnerLead {
  id: string;
  fullName: string;
  organization: string;
  email: string;
  kind: PartnerLeadKind;
  kindLabel: string;
  message: string | null;
  source: string;
  status: PartnerLeadStatus;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}
export interface PartnerLeadList {
  items: PartnerLead[];
  counts: Partial<Record<PartnerLeadStatus, number>>;
}

export interface AdminPartnerRow {
  id: string;
  name: string;
  subtitle: string;
  initials: string;
  color: string;
  kind: string;
  kindLabel: string;
  status: 'pending' | 'onboarding' | 'trial' | 'active' | 'suspended';
  parentPartnerId: string | null;
  depth: number;
  plan: string;
  places: number;
  activeOffers: number;
  members: number;
  kidsReached30d: number;
}
export interface PartnerStats {
  accounts: number;
  activeOffers: number;
  vouchersUsed30d: number;
  partnerMrrCents: number;
}
export interface PartnerAccount {
  id: string;
  name: string;
  kindLabel: string;
  subtitle: string | null;
  color: string;
  initials: string;
  role: PartnerRole;
  via: 'direct' | 'network';
}
export interface PartnerMember {
  id: string;
  email: string;
  role: PartnerRole;
  title: string | null;
  status: 'invited' | 'active' | 'revoked';
  fullName: string | null;
  initials: string;
}
export interface PartnerDetail {
  id: string;
  name: string;
  slug: string;
  kind: string;
  kindLabel: string;
  subtitle: string | null;
  color: string;
  initials: string;
  status: string;
  city: string | null;
  parentPartnerId: string | null;
  parentPartner: { id: string; name: string } | null;
  stores: { id: string; name: string; status: string }[];
  myRole: PartnerRole;
  plan: { id: string; name: string; limits: Record<string, number | boolean | null>; source: string };
  members: PartnerMember[];
  _count: { offers: number; places: number };
}
export type OfferKind = 'child_reward' | 'parent_voucher' | 'sponsored_activity';
export type DisplayStatus = 'draft' | 'in_review' | 'changes_requested' | 'scheduled' | 'active' | 'paused' | 'ended' | 'rejected';
export interface Offer {
  id: string;
  partnerId: string;
  kind: OfferKind;
  kindLabel: string;
  status: string;
  displayStatus: DisplayStatus;
  displayStatusLabel: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  terms: string | null;
  minAge: number;
  maxAge: number;
  requiredPoints: number | null;
  durationMinutes: number | null;
  categoryId: string | null;
  triggerType: string;
  triggerActivityId: string | null;
  triggerCategoryId: string | null;
  triggerThreshold: number;
  triggerWindowDays: number | null;
  codeMode: string;
  discountLabel: string | null;
  stockTotal: number | null;
  stockUsed: number;
  perFamilyLimit: number;
  startsAt: ISODate | null;
  endsAt: ISODate | null;
  targetType: 'national' | 'radius' | 'area' | 'code';
  targetPlaceId: string | null;
  targetRadiusKm: number | null;
  targetPostalCodes: string[];
  targetPromoCodeId: string | null;
  redemptionMethod: 'qr' | 'online_code' | 'reception';
  reviewNote: string | null;
  rejectionReason?: string | null;
  submittedAt: ISODate | null;
  publishedAt: ISODate | null;
  condition: string;
  scope: string;
  stockPeriod: string;
  stockLeft: number | null;
  usage: { used: number; total: number | null; percent: number | null };
  partner?: { id: string; name: string; color: string; parentPartnerId?: string | null };
  targetPlace?: { id: string; name: string; city: string | null } | null;
  triggerCategory?: { id: string; name: string; slug: string } | null;
  triggerActivity?: { id: string; title: string } | null;
}
export interface ModerationItem extends Offer {
  partner: { id: string; name: string; color: string; parentPartnerId: string | null };
  partnerInitials: string;
  decided: boolean;
}
export interface OfferInput {
  kind: OfferKind;
  title: string;
  description?: string;
  imageUrl?: string;
  minAge?: number;
  maxAge?: number;
  requiredPoints?: number;
  durationMinutes?: number;
  categoryId?: string;
  triggerType?: string;
  triggerActivityId?: string;
  triggerCategoryId?: string;
  triggerThreshold?: number;
  triggerWindowDays?: number;
  discountLabel?: string;
  stockTotal?: number;
  perFamilyLimit?: number;
  startsAt?: string;
  endsAt?: string;
  targetType?: 'national' | 'radius' | 'area' | 'code';
  targetPlaceId?: string;
  targetRadiusKm?: number;
  targetPostalCodes?: string[];
  targetPromoCodeId?: string;
  redemptionMethod?: 'qr' | 'online_code' | 'reception';
}
export interface PartnerDashboard {
  days: number;
  kpis: {
    kidsReached: Delta;
    rewardsObtained: Delta;
    vouchersUsed: Delta & { rate: number | null };
    averageBasketCents: Delta;
  };
  funnel: { key: 'seen' | 'started' | 'obtained' | 'used'; value: number | null }[];
  triggers: { label: string; categorySlug: string | null; percent: number }[];
  activeOffers: Offer[];
  offerCounts: Partial<Record<DisplayStatus, number>>;
}
export interface Place {
  id: string;
  partnerId: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  managerName: string | null;
  accessLevel: 'admin' | 'delegated' | 'read' | 'reception';
  linkedPartnerId: string | null;
  localOffers?: number;
  kidsWithin10km?: number | null;
  vouchersUsed?: number;
}
export interface AudienceCounts {
  kids: number | null;
  families: number | null;
  activeFamilies: number | null;
  masked: boolean;
}
export interface AudienceZones {
  radiusKm: number;
  zones: (AudienceCounts & { placeId: string; name: string; city: string | null; latitude: number | null; longitude: number | null })[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  ages: { masked: boolean; bands: { id: string; label: string; percent: number | null }[] };
}
export interface Redemption {
  id: string;
  at: ISODate;
  code: string;
  offerTitle: string;
  place: string | null;
  status: string;
  statusLabel: string;
}
export interface VerifyResult {
  valid: boolean;
  reason?: 'already_redeemed' | 'expired';
  redeemed?: boolean;
  claimId: string;
  offer: { id: string; title: string; discountLabel: string | null; endsAt: ISODate | null };
  unlockedAt: ISODate;
  expiresAt: ISODate | null;
  redeemedAt?: ISODate | null;
}
export interface BillingSummary {
  plan: { id: string; name: string; color: string; monthlyPriceCents: number | null; annualPriceCents: number | null; features: string[] };
  limits: Record<string, number | boolean | null>;
  usage: Record<string, number>;
  source: string;
  status: string;
  interval: 'month' | 'year' | null;
  amountCents: number;
  monthlyAmountCents: number;
  currentPeriodEnd: ISODate | null;
  cancelAtPeriodEnd: boolean;
  compUntil: ISODate | null;
  hasPaymentMethod: boolean;
  paymentsEnabled: boolean;
  invoices?: Invoice[];
}
export interface SearchResults {
  families: { id: string; name: string; subtitle: string }[];
  activities: { id: string; title: string; catalogStatus: CatalogStatus }[];
  partners: { id: string; name: string; kind: string; status: string }[];
}
