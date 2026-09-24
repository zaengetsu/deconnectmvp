import { type AdminPlan, formatEuros } from '@rekonect/api-client';

export function planPrice(p: Pick<AdminPlan, 'monthlyPriceCents'>) {
  if (p.monthlyPriceCents == null) return { price: 'Sur devis', per: '' };
  if (p.monthlyPriceCents === 0) return { price: '0 €', per: '' };
  return { price: formatEuros(p.monthlyPriceCents), per: '/ mois' };
}
export function planAlt(p: Pick<AdminPlan, 'annualPriceCents' | 'tagline'>) {
  return p.annualPriceCents ? `ou ${formatEuros(p.annualPriceCents)} / an` : (p.tagline ?? '');
}
export function subscribersLabel(p: Pick<AdminPlan, 'id' | 'audience'>) {
  if (p.audience === 'family') return p.id === 'free' ? 'familles' : 'abonnés';
  return p.id === 'partner_public' ? 'comptes' : 'partenaires';
}

/** Libellés des limites de plans, dans l'ordre d'affichage. */
export const LIMIT_LABELS: Record<string, string> = {
  maxChildren: 'Enfants max',
  maxCustomActivities: 'Activités personnalisées',
  maxCoParents: 'Co-parents',
  weeklyStats: 'Statistiques hebdomadaires',
  partnerOffersLocal: 'Offres partenaires locales',
  partnerOffersPremium: 'Offres partenaires premium',
  maxPlaces: 'Points de vente',
  maxActiveOffers: 'Offres actives',
  maxRadiusKm: 'Rayon de ciblage max (km)',
  nationalTargeting: 'Ciblage national',
  accessCodeTargeting: "Ciblage par code d'accès",
  includedFamilyLicenses: 'Licences Famille incluses',
  parentVouchers: 'Bons parents',
  apiAccess: 'Accès API',
};

/** Montants de pilotage arrondis à l'euro, comme la maquette (« 22 120 € »). */
export const roundEuro = (cents: number) => Math.round(cents / 100) * 100;
