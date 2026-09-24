// Règles pures des offres partenaires (testées unitairement).
import { randomInt } from 'node:crypto';
import { PARTNER_STATS_MIN_COUNT } from '@rekonect/contracts';

export interface OfferWindow {
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  stockTotal: number | null;
  stockUsed: number;
}

/** Une offre est active si publiée, dans sa période, et avec du stock. */
export function isOfferLive(o: OfferWindow, now: Date): boolean {
  if (o.status !== 'published') return false;
  if (o.startsAt && o.startsAt > now) return false;
  if (o.endsAt && o.endsAt <= now) return false;
  return o.stockTotal == null || o.stockUsed < o.stockTotal;
}

export function stockLeft(o: Pick<OfferWindow, 'stockTotal' | 'stockUsed'>): number | null {
  return o.stockTotal == null ? null : Math.max(0, o.stockTotal - o.stockUsed);
}

export type DisplayStatus = 'draft' | 'in_review' | 'changes_requested' | 'scheduled' | 'active' | 'paused' | 'ended' | 'rejected';

/** Statut affiché au partenaire : « Programmée », « Active », « En validation », « Terminée »… */
export function displayStatus(o: OfferWindow, now: Date): DisplayStatus {
  switch (o.status) {
    case 'draft':
      return 'draft';
    case 'pending_brand':
    case 'pending_review':
      return 'in_review';
    case 'changes_requested':
      return 'changes_requested';
    case 'rejected':
      return 'rejected';
    case 'paused':
      return 'paused';
    case 'expired':
      return 'ended';
    default:
      if (o.startsAt && o.startsAt > now) return 'scheduled';
      if ((o.endsAt && o.endsAt <= now) || (o.stockTotal != null && o.stockUsed >= o.stockTotal)) return 'ended';
      return 'active';
  }
}

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: 'Brouillon',
  in_review: 'En validation',
  changes_requested: 'À modifier',
  scheduled: 'Programmée',
  active: 'Active',
  paused: 'En pause',
  ended: 'Terminée',
  rejected: 'Refusée',
};

/** Statistique masquée sous le seuil (pas de ré-identification d'une famille). */
export function maskCount(n: number): number | null {
  return n < PARTNER_STATS_MIN_COUNT ? null : n;
}

/** Volumes d'audience : arrondis à la dizaine, masqués sous 20 familles (charte partenaires). */
export const AUDIENCE_MIN_FAMILIES = 20;
export function roundTen(n: number): number {
  return Math.round(n / 10) * 10;
}

/** Codes importés : nettoyés, dédoublonnés, en majuscules. */
export function normalizeCodes(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => c.length >= 3))];
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'partenaire'
  );
}

// ─── Codes RK (scannés en caisse) ────────────────────────────────────────────
const RK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** « RK4M-82QA » : 8 caractères utiles, sans caractères ambigus. */
export function rkCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += RK_ALPHABET[randomInt(RK_ALPHABET.length)];
  return `RK${s.slice(0, 2)}-${s.slice(2)}`;
}

/** Saisie en caisse : casse, espaces et tirets ignorés (« rk4m 82qa » → « RK4M-82QA »). */
export function normalizeRk(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^RK[A-Z0-9]{6}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4)}` : input.trim().toUpperCase();
}

// ─── Géographie ──────────────────────────────────────────────────────────────
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ─── Libellés en français (cartes d'offre, modération) ───────────────────────
const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/ /g, ' ');
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const shortDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

export interface DescribableOffer {
  kind: string;
  requiredPoints: number | null;
  triggerType: string;
  triggerThreshold: number;
  triggerWindowDays: number | null;
  targetType: string;
  targetRadiusKm: number | null;
  targetPostalCodes: string[];
  stockTotal: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export function describeCondition(o: DescribableOffer, names: { activity?: string | null; category?: string | null } = {}): string {
  if (o.kind === 'sponsored_activity') return 'Activité sponsorisée ajoutée au catalogue';
  if (o.kind === 'child_reward' && o.requiredPoints) return `Échangeable contre ${fmt(o.requiredPoints)} points`;
  const window = o.triggerWindowDays ? ` en ${o.triggerWindowDays} jours` : '';
  const n = o.triggerThreshold;
  switch (o.triggerType) {
    case 'activity_validated':
      return `${n > 1 ? `${n} fois` : '1 fois'} « ${names.activity ?? 'activité'} » validée${window}`;
    case 'category_validated':
      return `${n} activité${n > 1 ? 's' : ''} ${names.category ?? ''} validée${n > 1 ? 's' : ''}${window}`.replace(/\s+/g, ' ');
    case 'goal_completed':
      return 'Objectif familial de la semaine atteint';
    case 'level_reached':
      return `Niveau ${n} atteint`;
    case 'streak_days':
      return `Enfant actif ${n} jours d'affilée`;
    default:
      return 'Sans condition';
  }
}

export function describeScope(o: DescribableOffer, names: { place?: string | null; code?: string | null } = {}): string {
  switch (o.targetType) {
    case 'radius':
      return `${o.targetRadiusKm ?? '?'} km autour de ${names.place ?? 'votre lieu'}`;
    case 'area':
      return o.targetPostalCodes.length <= 3 ? o.targetPostalCodes.join(', ') : `${o.targetPostalCodes.length} codes postaux`;
    case 'code':
      return `Code d'accès ${names.code ?? ''}`.trim();
    default:
      return 'National';
  }
}

export function describeStockPeriod(o: DescribableOffer): string {
  const stock = o.stockTotal != null ? `${fmt(o.stockTotal)} ${o.kind === 'parent_voucher' ? 'bons' : 'places'}` : 'Stock illimité';
  const period =
    o.startsAt && o.endsAt ? `${shortDate(o.startsAt)} → ${shortDate(o.endsAt)}` : o.endsAt ? `jusqu'au ${shortDate(o.endsAt)}` : o.startsAt ? `dès le ${shortDate(o.startsAt)}` : 'sans limite de date';
  return `${stock} · ${period}`;
}

export const OFFER_KIND_LABELS: Record<string, string> = {
  child_reward: 'Récompense enfant',
  parent_voucher: 'Bon parent',
  sponsored_activity: 'Défi sponsorisé',
};
