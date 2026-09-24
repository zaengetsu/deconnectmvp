import { Injectable } from '@nestjs/common';
import { type FamilyLimits, type PartnerLimits, subscriptionGrantsAccess } from '@rekonect/contracts';
import { Clock } from '../../platform/clock';
import { forbidden } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';

type Db = Tx | PrismaService;

const FAMILY_RANK: Record<string, number> = { free: 0, family: 1, family_plus: 2 };

export const DEFAULT_FAMILY_LIMITS: FamilyLimits = {
  maxChildren: 1,
  maxCustomActivities: 5,
  maxCoParents: 0,
  weeklyStats: false,
  partnerOffersLocal: true,
  partnerOffersPremium: false,
};

export const DEFAULT_PARTNER_LIMITS: PartnerLimits = {
  maxPlaces: 1,
  maxActiveOffers: 3,
  maxRadiusKm: 20,
  nationalTargeting: false,
  parentVouchers: true,
  apiAccess: false,
  accessCodeTargeting: false,
  includedFamilyLicenses: 0,
};

/** Offres comptées dans le quota « offres actives » d'un partenaire. */
export const ACTIVE_OFFER_STATUSES = ['pending_brand', 'pending_review', 'published', 'paused'];

export interface EffectivePlan<L> {
  planId: string;
  planName: string;
  limits: L;
  source: 'subscription' | 'comp' | 'default' | 'network';
  status: string;
}

export function withinLimit(limit: number | null | undefined, current: number): boolean {
  return limit == null || current < limit;
}

/**
 * Droits d'usage liés au plan. Règle produit : une baisse de plan ne supprime rien,
 * les éléments au-delà de la limite passent en lecture seule.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  private async planRow(db: Db, id: string) {
    return db.plan.findUnique({ where: { id } });
  }

  async familyPlan(parentId: string, db: Db = this.prisma): Promise<EffectivePlan<FamilyLimits>> {
    const sub = await db.subscription.findFirst({ where: { parentId } });
    const now = this.clock.now();
    const paid = sub && subscriptionGrantsAccess(sub.status) && sub.plan !== 'free' ? sub.plan : null;
    const comp = sub?.compPlan && sub.compUntil && sub.compUntil > now ? sub.compPlan : null;
    // Plan payé et plan offert coexistent : le plus avantageux l'emporte.
    let planId = 'free';
    let source: EffectivePlan<FamilyLimits>['source'] = 'default';
    if (paid && (!comp || FAMILY_RANK[paid] >= FAMILY_RANK[comp])) [planId, source] = [paid, 'subscription'];
    else if (comp) [planId, source] = [comp, 'comp'];
    const plan = await this.planRow(db, planId);
    return {
      planId,
      planName: plan?.name ?? 'Gratuit',
      limits: { ...DEFAULT_FAMILY_LIMITS, ...((plan?.limits as Partial<FamilyLimits>) ?? {}) },
      source,
      status: sub?.status ?? 'active',
    };
  }

  /** Un magasin rattaché hérite des droits de son enseigne (« Inclus dans Réseau »). */
  async partnerPlan(partnerId: string, db: Db = this.prisma): Promise<EffectivePlan<PartnerLimits>> {
    const partner = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
    const ownerId = partner.parentPartnerId ?? partner.id;
    const sub = await db.subscription.findFirst({ where: { partnerId: ownerId } });
    const planId = sub && subscriptionGrantsAccess(sub.status) ? sub.plan : 'partner_local';
    const plan = await this.planRow(db, planId);
    return {
      planId,
      planName: plan?.name ?? 'Partenaire local',
      limits: { ...DEFAULT_PARTNER_LIMITS, ...((plan?.limits as Partial<PartnerLimits>) ?? {}) },
      source: partner.parentPartnerId ? 'network' : sub ? 'subscription' : 'default',
      status: sub?.status ?? 'trialing',
    };
  }

  // ─── Familles ──────────────────────────────────────────────────────────────

  async familyUsage(parentId: string, db: Db = this.prisma) {
    const [children, customActivities, coParents] = await Promise.all([
      db.child.count({ where: { parentId, isActive: true } }),
      db.activity.count({ where: { createdBy: parentId, activityType: 'custom_parent', isActive: true } }),
      db.familyMember.count({ where: { ownerId: parentId, status: 'active' } }),
    ]);
    return { children, customActivities, coParents };
  }

  async assertCanAddChild(parentId: string, db: Db = this.prisma) {
    const [{ limits, planName }, usage] = await Promise.all([this.familyPlan(parentId, db), this.familyUsage(parentId, db)]);
    if (!withinLimit(limits.maxChildren, usage.children)) {
      throw forbidden('PLAN_LIMIT_CHILDREN', `Votre plan ${planName} permet ${limits.maxChildren} profil${limits.maxChildren! > 1 ? 's' : ''} enfant. Passez au plan supérieur pour en ajouter.`);
    }
  }

  async assertCanAddCustomActivity(parentId: string, db: Db = this.prisma) {
    const [{ limits, planName }, usage] = await Promise.all([this.familyPlan(parentId, db), this.familyUsage(parentId, db)]);
    if (!withinLimit(limits.maxCustomActivities, usage.customActivities)) {
      throw forbidden('PLAN_LIMIT_ACTIVITIES', `Votre plan ${planName} permet ${limits.maxCustomActivities} activités personnalisées.`);
    }
  }

  async assertCanAddCoParent(ownerId: string, db: Db = this.prisma) {
    const [{ limits, planName }, usage] = await Promise.all([this.familyPlan(ownerId, db), this.familyUsage(ownerId, db)]);
    if (!withinLimit(limits.maxCoParents, usage.coParents)) {
      throw forbidden('PLAN_LIMIT_COPARENTS', limits.maxCoParents === 0 ? `Le plan ${planName} ne permet pas d'inviter un co-parent.` : `Votre plan ${planName} permet ${limits.maxCoParents} co-parent.`);
    }
  }

  /** Profils enfants modifiables : les N premiers (par ancienneté), les suivants sont en lecture seule. */
  async writableChildIds(parentId: string, db: Db = this.prisma): Promise<Set<string>> {
    const { limits } = await this.familyPlan(parentId, db);
    const children = await db.child.findMany({ where: { parentId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const allowed = limits.maxChildren == null ? children : children.slice(0, limits.maxChildren);
    return new Set(allowed.map((c) => c.id));
  }

  async assertChildWritable(parentId: string, childId: string, db: Db = this.prisma) {
    if (!(await this.writableChildIds(parentId, db)).has(childId)) {
      throw forbidden('CHILD_READ_ONLY', 'Ce profil est en lecture seule avec le plan actuel de la famille.');
    }
  }

  // ─── Partenaires ───────────────────────────────────────────────────────────

  async assertCanAddPlace(partnerId: string, db: Db = this.prisma) {
    const { limits, planName } = await this.partnerPlan(partnerId, db);
    const count = await db.partnerPlace.count({ where: { partnerId, isActive: true } });
    if (!withinLimit(limits.maxPlaces, count)) throw forbidden('PLAN_LIMIT_PLACES', `Le plan ${planName} permet ${limits.maxPlaces} lieu${limits.maxPlaces! > 1 ? 'x' : ''}.`);
  }

  async assertCanActivateOffer(partnerId: string, excludeOfferId: string | null, db: Db = this.prisma) {
    const { limits, planName } = await this.partnerPlan(partnerId, db);
    const count = await db.partnerOffer.count({
      where: { partnerId, status: { in: ACTIVE_OFFER_STATUSES }, ...(excludeOfferId ? { id: { not: excludeOfferId } } : {}) },
    });
    if (!withinLimit(limits.maxActiveOffers, count)) {
      throw forbidden('PLAN_LIMIT_OFFERS', `Le plan ${planName} permet ${limits.maxActiveOffers} offres actives. Mettez une offre en pause ou changez de plan.`);
    }
  }

  async assertTargetingAllowed(
    partnerId: string,
    offer: { kind: string; targetType: string; targetRadiusKm?: number | null },
    db: Db = this.prisma,
  ) {
    const { limits, planName } = await this.partnerPlan(partnerId, db);
    if (offer.targetType === 'national' && !limits.nationalTargeting) throw forbidden('PLAN_TARGETING', `Le ciblage national n'est pas inclus dans le plan ${planName}.`);
    if (offer.targetType === 'code' && !limits.accessCodeTargeting) throw forbidden('PLAN_TARGETING', `Le ciblage par code d'accès n'est pas inclus dans le plan ${planName}.`);
    if (offer.targetType === 'radius' && limits.maxRadiusKm != null && (offer.targetRadiusKm ?? 0) > limits.maxRadiusKm) {
      throw forbidden('PLAN_TARGETING', `Le rayon maximal du plan ${planName} est de ${limits.maxRadiusKm} km.`);
    }
    if (offer.kind === 'parent_voucher' && !limits.parentVouchers) throw forbidden('PLAN_TARGETING', `Les bons parents ne sont pas inclus dans le plan ${planName}.`);
  }
}
