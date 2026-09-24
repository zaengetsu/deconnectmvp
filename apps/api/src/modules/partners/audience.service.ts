import { Injectable } from '@nestjs/common';
import { AGE_BANDS } from '@rekonect/contracts';
import { Clock } from '../../platform/clock';
import { Prisma, PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { AUDIENCE_MIN_FAMILIES, distanceKm, roundTen } from './offer-rules';

type Db = Tx | PrismaService;

export interface Targeting {
  targetType: string;
  targetPlaceId?: string | null;
  targetRadiusKm?: number | null;
  targetPostalCodes?: string[];
  targetPromoCodeId?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
}

export interface AudienceCounts {
  kids: number | null;
  families: number | null;
  activeFamilies: number | null;
  masked: boolean;
}

/** Distance (km) en SQL, sans extension PostGIS : formule haversine. */
const distanceSql = (lat: number, lng: number) => Prisma.sql`
  (2 * 6371 * asin(sqrt(
    power(sin(radians(p.latitude - ${lat}) / 2), 2) +
    cos(radians(${lat})) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - ${lng}) / 2), 2)
  )))`;

/**
 * Qui peut voir une offre. Règles, dans l'ordre :
 *  1. la famille a consenti aux offres partenaires ;
 *  2. son plan inclut ce type d'offre (locales pour tous, nationales = « offres premium ») ;
 *  3. elle est dans la zone ciblée (rayon, codes postaux, code d'accès) ;
 *  4. au moins un enfant est dans la tranche d'âge.
 * Les partenaires ne reçoivent que des volumes arrondis, jamais d'identité.
 */
@Injectable()
export class AudienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  private async premiumPlans(db: Db): Promise<string[]> {
    const plans = await db.plan.findMany({ where: { audience: 'family' }, select: { id: true, limits: true } });
    return plans.filter((p) => (p.limits as { partnerOffersPremium?: boolean }).partnerOffersPremium).map((p) => p.id);
  }

  /** Conditions SQL sur le profil parent « p » pour un ciblage donné. */
  private async familyFilter(db: Db, t: Targeting): Promise<Prisma.Sql> {
    const now = this.clock.now();
    const parts: Prisma.Sql[] = [
      Prisma.sql`p.role = 'parent'`,
      Prisma.sql`EXISTS (SELECT 1 FROM notification_preferences np WHERE np.parent_id = p.id AND np.child_id IS NULL AND np.partner_offers = true)`,
    ];
    if (t.targetType === 'national') {
      const premium = await this.premiumPlans(db);
      parts.push(
        premium.length
          ? Prisma.sql`EXISTS (SELECT 1 FROM subscriptions s WHERE s.parent_id = p.id AND (
              (s.plan IN (${Prisma.join(premium)}) AND s.status IN ('active','trialing','past_due'))
              OR (s.comp_plan IN (${Prisma.join(premium)}) AND s.comp_until > ${now})))`
          : Prisma.sql`false`,
      );
    }
    if (t.targetType === 'radius') {
      const place = t.targetPlaceId ? await db.partnerPlace.findUnique({ where: { id: t.targetPlaceId } }) : null;
      if (!place || place.latitude == null || place.longitude == null || !t.targetRadiusKm) parts.push(Prisma.sql`false`);
      else parts.push(Prisma.sql`p.latitude IS NOT NULL AND ${distanceSql(place.latitude, place.longitude)} <= ${t.targetRadiusKm}`);
    }
    if (t.targetType === 'area') {
      parts.push(t.targetPostalCodes?.length ? Prisma.sql`p.postal_code IN (${Prisma.join(t.targetPostalCodes)})` : Prisma.sql`false`);
    }
    if (t.targetType === 'code') {
      parts.push(
        t.targetPromoCodeId
          ? Prisma.sql`EXISTS (SELECT 1 FROM promo_redemptions pr WHERE pr.parent_id = p.id AND pr.promo_code_id = ${t.targetPromoCodeId}::uuid)`
          : Prisma.sql`false`,
      );
    }
    return Prisma.join(parts, ' AND ');
  }

  private ageSql(t: Targeting): Prisma.Sql {
    return Prisma.sql`c.age BETWEEN ${t.minAge ?? 3} AND ${t.maxAge ?? 18}`;
  }

  /** Audience estimée d'un ciblage (formulaire de création d'offre). */
  async estimate(t: Targeting, db: Db = this.prisma): Promise<AudienceCounts> {
    const weekAgo = new Date(this.clock.now().getTime() - 7 * 86_400_000);
    const filter = await this.familyFilter(db, t);
    const [row] = await db.$queryRaw<{ kids: bigint; families: bigint; active: bigint }[]>`
      SELECT count(DISTINCT c.id) AS kids, count(DISTINCT p.id) AS families,
             count(DISTINCT p.id) FILTER (WHERE EXISTS (
               SELECT 1 FROM child_activities ca JOIN children c2 ON c2.id = ca.child_id
               WHERE c2.parent_id = p.id AND ca.status = 'validated' AND ca.validated_at >= ${weekAgo})) AS active
      FROM profiles p JOIN children c ON c.parent_id = p.id AND c.is_active = true
      WHERE ${filter} AND ${this.ageSql(t)}`;
    return this.present(Number(row.kids), Number(row.families), Number(row.active));
  }

  present(kids: number, families: number, active: number): AudienceCounts {
    if (families < AUDIENCE_MIN_FAMILIES) return { kids: null, families: null, activeFamilies: null, masked: true };
    return { kids: roundTen(kids), families: roundTen(families), activeFamilies: roundTen(active), masked: false };
  }

  /** Éligibilité d'une famille précise (déblocage, catalogue, bons visibles). */
  async isFamilyEligible(db: Db, t: Targeting, parentId: string, childAge?: number | null): Promise<boolean> {
    if (childAge != null && ((t.minAge != null && childAge < t.minAge) || (t.maxAge != null && childAge > t.maxAge))) return false;
    const filter = await this.familyFilter(db, t);
    const age = childAge == null ? Prisma.sql`EXISTS (SELECT 1 FROM children c WHERE c.parent_id = p.id AND c.is_active = true AND ${this.ageSql(t)})` : Prisma.sql`true`;
    const [row] = await db.$queryRaw<{ ok: boolean }[]>`SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = ${parentId}::uuid AND ${filter} AND ${age}) AS ok`;
    return row.ok;
  }

  /** Zones autour des lieux d'un partenaire (familles consentantes à moins de 10 km). */
  async zones(partnerId: string, radiusKm = 10) {
    const places = await this.prisma.partnerPlace.findMany({ where: { partnerId, isActive: true, latitude: { not: null }, longitude: { not: null } } });
    const weekAgo = new Date(this.clock.now().getTime() - 7 * 86_400_000);
    const zones = [];
    for (const place of places) {
      const [row] = await this.prisma.$queryRaw<{ kids: bigint; families: bigint; active: bigint }[]>`
        SELECT count(DISTINCT c.id) AS kids, count(DISTINCT p.id) AS families,
               count(DISTINCT p.id) FILTER (WHERE EXISTS (
                 SELECT 1 FROM child_activities ca JOIN children c2 ON c2.id = ca.child_id
                 WHERE c2.parent_id = p.id AND ca.status = 'validated' AND ca.validated_at >= ${weekAgo})) AS active
        FROM profiles p JOIN children c ON c.parent_id = p.id AND c.is_active = true
        WHERE p.role = 'parent' AND p.latitude IS NOT NULL
          AND EXISTS (SELECT 1 FROM notification_preferences np WHERE np.parent_id = p.id AND np.child_id IS NULL AND np.partner_offers = true)
          AND ${distanceSql(place.latitude!, place.longitude!)} <= ${radiusKm}`;
      zones.push({
        placeId: place.id,
        name: place.name,
        city: place.city,
        latitude: place.latitude,
        longitude: place.longitude,
        ...this.present(Number(row.kids), Number(row.families), Number(row.active)),
      });
    }
    return { radiusKm, zones, bounds: this.bounds(places) };
  }

  private bounds(places: { latitude: number | null; longitude: number | null }[]) {
    const pts = places.filter((p) => p.latitude != null && p.longitude != null) as { latitude: number; longitude: number }[];
    if (!pts.length) return null;
    return {
      minLat: Math.min(...pts.map((p) => p.latitude)),
      maxLat: Math.max(...pts.map((p) => p.latitude)),
      minLng: Math.min(...pts.map((p) => p.longitude)),
      maxLng: Math.max(...pts.map((p) => p.longitude)),
    };
  }

  /** Répartition par âge des enfants de l'audience du partenaire (pourcentages). */
  async ageDistribution(partnerId: string) {
    const places = await this.prisma.partnerPlace.findMany({ where: { partnerId, isActive: true, latitude: { not: null } } });
    const children = await this.prisma.$queryRaw<{ age: number; latitude: number | null; longitude: number | null }[]>`
      SELECT c.age, p.latitude, p.longitude FROM children c JOIN profiles p ON p.id = c.parent_id
      WHERE c.is_active = true AND EXISTS (SELECT 1 FROM notification_preferences np WHERE np.parent_id = p.id AND np.child_id IS NULL AND np.partner_offers = true)`;
    const inZone = places.length
      ? children.filter((c) => c.latitude != null && places.some((pl) => distanceKm({ lat: c.latitude!, lng: c.longitude! }, { lat: pl.latitude!, lng: pl.longitude! }) <= 10))
      : children;
    const total = inZone.length;
    const masked = total < AUDIENCE_MIN_FAMILIES;
    return {
      masked,
      bands: AGE_BANDS.map((b) => {
        const n = inZone.filter((c) => c.age >= b.min && c.age <= b.max).length;
        return { id: b.id, label: b.label, percent: masked || total === 0 ? null : Math.round((n / total) * 100) };
      }),
    };
  }
}
