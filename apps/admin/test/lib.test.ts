import type { PromoCode } from '@rekonect/api-client';
import { activeNav } from '@/components/shell';
import { toInput } from '@/features/activity-drawer';
import { eurosToCents } from '@/features/plan-drawer';
import { describePromo } from '@/features/promo-dialog';
import { capitalize, familyInitials } from '@/lib/labels';
import { planAlt, planPrice, roundEuro, subscribersLabel } from '@/lib/plans';

const promo = (over: Partial<PromoCode>): PromoCode => ({ id: '1', code: 'X', description: null, kind: 'percent', percentOff: 30, amountOffCents: null, durationMonths: 3, planId: null, maxRedemptions: null, redemptions: 412, expiresAt: null, isActive: true, sponsor: null, state: 'active', ...over });

describe('libellés du back-office', () => {
  it('codes promo comme la maquette', () => {
    expect(describePromo(promo({}))).toBe('−30 % pendant 3 mois · 412 utilisations');
    expect(describePromo(promo({ kind: 'sponsored', planId: 'family', durationMonths: 12, sponsor: { id: 's', name: 'CSE Airbus' }, redemptions: 188, maxRedemptions: 800 }))).toBe('Plan Famille offert 12 mois · payé par CSE Airbus · 188 / 800');
    expect(describePromo(promo({ kind: 'free_months', durationMonths: 1, redemptions: 1290 }))).toBe('1 mois offert · 1 290 utilisations');
    expect(describePromo(promo({ kind: 'amount', amountOffCents: 500, durationMonths: null, redemptions: 1 }))).toBe('−5 € · 1 utilisation');
  });
  it('plans : prix, alternative, abonnés, arrondi', () => {
    expect(planPrice({ monthlyPriceCents: 499 })).toEqual({ price: '4,99 €', per: '/ mois' });
    expect(planPrice({ monthlyPriceCents: 0 })).toEqual({ price: '0 €', per: '' });
    expect(planPrice({ monthlyPriceCents: null })).toEqual({ price: 'Sur devis', per: '' });
    expect(planAlt({ annualPriceCents: 4900, tagline: null })).toBe('ou 49 € / an');
    expect(planAlt({ annualPriceCents: 0, tagline: 'Pour découvrir' })).toBe('Pour découvrir');
    expect(subscribersLabel({ id: 'free', audience: 'family' })).toBe('familles');
    expect(subscribersLabel({ id: 'family', audience: 'family' })).toBe('abonnés');
    expect(subscribersLabel({ id: 'partner_public', audience: 'partner' })).toBe('comptes');
    expect(subscribersLabel({ id: 'partner_local', audience: 'partner' })).toBe('partenaires');
    expect(roundEuro(153247)).toBe(153200);
    expect(eurosToCents('4,99')).toBe(499);
    expect(eurosToCents(' 290 € ')).toBe(29000);
    expect(eurosToCents('')).toBeNull();
    expect(eurosToCents('abc')).toBeNaN();
  });
  it('divers', () => {
    expect(familyInitials('Dupont', 'Marie Dupont')).toBe('DM');
    expect(familyInitials('', '')).toBe('?');
    expect(capitalize('doublon probable')).toBe('Doublon probable');
    expect(capitalize('')).toBe('');
    expect(activeNav('/').id).toBe('overview');
    expect(activeNav('/families').id).toBe('families');
    expect(activeNav('/inconnu').id).toBe('overview');
    expect(toInput({ title: ' Herbier ', instructions: '', categoryId: '', points: '20', difficulty: 'easy', minAge: '6', maxAge: '12', catalogStatus: 'draft', proofRequired: true, partnerEligible: false })).toEqual({ title: 'Herbier', instructions: null, categoryId: null, points: 20, difficulty: 'easy', minAge: 6, maxAge: 12, catalogStatus: 'draft', proofRequired: true, partnerEligible: false });
  });
});
