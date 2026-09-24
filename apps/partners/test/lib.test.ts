import type { Offer, PartnerDetail } from '@rekonect/api-client';
import { emptyForm, formFromOffer, toOfferInput } from '@/features/offer-editor';
import { matchesFilter } from '@/features/offer-card';
import { searchAddress } from '@/features/place-dialog';
import { placesCopy, placesNote } from '@/lib/labels';
import { offerDates, usageLine } from '@/lib/offers';
import { parseVoucherInput } from '@/lib/voucher';
import { scopeLabel, screenOf } from '@/components/shell';

const offer = (over: Partial<Offer> = {}): Offer =>
  ({
    id: 'o1', partnerId: 'p1', kind: 'parent_voucher', kindLabel: 'Bon parent', status: 'published', displayStatus: 'active', displayStatusLabel: 'Active', title: '−10 % rayon cycles',
    description: null, imageUrl: null, terms: null, minAge: 7, maxAge: 12, requiredPoints: null, durationMinutes: null, categoryId: null, triggerType: 'category_validated', triggerActivityId: null,
    triggerCategoryId: 'cat-sport', triggerThreshold: 5, triggerWindowDays: 30, codeMode: 'rekonect', discountLabel: '−10 %', stockTotal: 3000, stockUsed: 640, perFamilyLimit: 1,
    startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-12-31T22:00:00.000Z', targetType: 'radius', targetPlaceId: 'pl1', targetRadiusKm: 15, targetPostalCodes: [], targetPromoCodeId: null,
    redemptionMethod: 'qr', reviewNote: null, submittedAt: null, publishedAt: null, condition: 'x', scope: 'y', stockPeriod: 'z', stockLeft: 2360, usage: { used: 640, total: 3000, percent: 21 }, ...over,
  }) as Offer;

describe('saisie en caisse', () => {
  it.each([
    ['rk4m 82qa', 'RK4M-82QA'],
    ['rekonect:voucher:RK4M-82QA', 'RK4M-82QA'],
    ['RK4M', 'RK4M'],
    ['promo10', 'PROMO10'],
    ['  rk7p-2m4q ', 'RK7P-2M4Q'],
  ])('%s → %s', (input, out) => expect(parseVoucherInput(input)).toBe(out));
});

describe('éditeur d’offre', () => {
  it('bon parent après des activités : déclencheur catégorie, fenêtre, ciblage rayon, dates', () => {
    const f = { ...emptyForm(false), type: 'parent' as const, title: ' −15 % vélo ', trigger: 'cat-sport', threshold: '10', windowDays: '30', placeId: 'pl1', radiusKm: '15', stock: '5 000', start: '2026-10-01', end: '2026-12-31', ages: ['7-9', '10-12'] };
    const body = toOfferInput(f);
    expect(body).toMatchObject({ kind: 'parent_voucher', title: '−15 % vélo', triggerType: 'category_validated', triggerCategoryId: 'cat-sport', triggerThreshold: 10, triggerWindowDays: 30, targetType: 'radius', targetPlaceId: 'pl1', targetRadiusKm: 15, stockTotal: 5000, minAge: 7, maxAge: 12, redemptionMethod: 'qr' });
    expect(body.startsAt).toMatch(/^2026-(09-30|10-01)T/);
    expect(body.requiredPoints).toBeUndefined();
  });
  it('récompense enfant contre des points ; série ; objectif ; défi sponsorisé ; zones et code', () => {
    expect(toOfferInput({ ...emptyForm(true), type: 'kid', cond: 'points', points: '300' })).toMatchObject({ kind: 'child_reward', requiredPoints: 300, targetType: 'national' });
    expect(toOfferInput({ ...emptyForm(true), type: 'kid', cond: 'acts', trigger: 'streak_days', threshold: '7' })).toMatchObject({ triggerType: 'streak_days', triggerThreshold: 7 });
    expect(toOfferInput({ ...emptyForm(true), type: 'parent', trigger: 'goal_completed' }).triggerType).toBe('goal_completed');
    expect(toOfferInput({ ...emptyForm(true), type: 'defi', categoryId: 'c', durationMinutes: '45' })).toMatchObject({ kind: 'sponsored_activity', categoryId: 'c', durationMinutes: 45 });
    expect(toOfferInput({ ...emptyForm(false), target: 'area', postalCodes: '69001, 69002;69003' }).targetPostalCodes).toEqual(['69001', '69002', '69003']);
    expect(toOfferInput({ ...emptyForm(false), target: 'code', promoCodeId: 'pc' }).targetPromoCodeId).toBe('pc');
    expect(toOfferInput({ ...emptyForm(false), ages: [] }).minAge).toBeUndefined();
  });
  it('relit une offre existante sans perte', () => {
    const f = formFromOffer(offer());
    expect(f).toMatchObject({ type: 'parent', trigger: 'cat-sport', threshold: '5', windowDays: '30', target: 'radius', stock: '3000', ages: ['7-9', '10-12'] });
    expect(toOfferInput(f)).toMatchObject({ triggerCategoryId: 'cat-sport', triggerThreshold: 5, stockTotal: 3000, minAge: 7, maxAge: 12 });
    expect(formFromOffer(offer({ kind: 'child_reward', requiredPoints: 250, triggerType: 'none' }))).toMatchObject({ type: 'kid', cond: 'points', points: '250', trigger: '' });
    expect(formFromOffer(offer({ triggerType: 'streak_days' })).trigger).toBe('streak_days');
  });
});

describe('cartes et filtres', () => {
  it('utilisation, dates, filtres', () => {
    expect(usageLine(offer())).toEqual({ used: '640 / 3 000', pct: '21%', width: '21%' });
    expect(usageLine(offer({ usage: { used: 12, total: null, percent: null } }))).toEqual({ used: '12 obtenus', pct: '—', width: '0%' });
    expect(offerDates(offer())).toMatch(/1 oct\. → 31 déc\./);
    expect(offerDates(offer({ startsAt: null }))).toMatch(/^jusqu'au/);
    expect(offerDates(offer({ endsAt: null }))).toMatch(/^dès le/);
    expect(offerDates(offer({ startsAt: null, endsAt: null }))).toBe('sans limite de date');
    expect(matchesFilter(offer(), 'all')).toBe(true);
    expect(matchesFilter(offer(), 'parent_voucher')).toBe(true);
    expect(matchesFilter(offer(), 'child_reward')).toBe(false);
    expect(matchesFilter(offer({ displayStatus: 'changes_requested' }), 'in_review')).toBe(true);
    expect(matchesFilter(offer({ displayStatus: 'rejected' }), 'draft')).toBe(true);
    expect(matchesFilter(offer(), 'active')).toBe(true);
  });
});

describe('coque et libellés', () => {
  const detail = (over: Partial<PartnerDetail>) => ({ kind: 'brand', plan: { limits: { nationalTargeting: true, maxRadiusKm: null } }, stores: [{}, {}], _count: { places: 2 }, parentPartner: null, ...over }) as unknown as PartnerDetail;
  it('portée affichée dans l’en-tête', () => {
    expect(scopeLabel(detail({}))).toBe('National · 2 magasins');
    expect(scopeLabel(detail({ kind: 'store', plan: { limits: { maxRadiusKm: 20 } } } as never), 'Lyon')).toBe('Rayon 20 km · Lyon');
    expect(scopeLabel(detail({ kind: 'cse' }))).toBe("Salariés · code d'accès CSE");
    expect(scopeLabel(detail({ kind: 'public_institution' }), 'Lyon')).toBe('Habitants · Lyon');
    expect(scopeLabel(detail({ kind: 'retailer', stores: [], _count: { places: 1 } } as never))).toBe('National · 1 lieu');
    expect(scopeLabel(null)).toBe('');
  });
  it('écran courant', () => {
    expect(screenOf('/dashboard')).toBe('dash');
    expect(screenOf('/offers/new')).toBe('create');
    expect(screenOf('/offers/123')).toBe('edit');
    expect(screenOf('/places')).toBe('stores');
    expect(screenOf('/inconnu')).toBe('dash');
  });
  it('page Lieux selon le type de compte', () => {
    for (const kind of ['brand', 'store', 'public_institution', 'cse', 'retailer']) {
      const d = detail({ kind, parentPartner: { id: 'x', name: 'Decathlon France' } } as never);
      expect(placesCopy(d).title).toBeTruthy();
      expect(placesCopy(d).sub(3)).toBeTruthy();
      expect(placesNote(d)).toBeTruthy();
    }
    expect(placesCopy(null).title).toBe('Magasins');
  });
  it('géocodage BAN', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ features: [{ properties: { label: '17 Rue du Docteur Bouchut 69003 Lyon', name: '17 Rue du Docteur Bouchut', postcode: '69003', city: 'Lyon' }, geometry: { coordinates: [4.8594, 45.7606] } }] })));
    expect(await searchAddress('17 rue bouchut', fetchFn as never)).toEqual([{ label: '17 Rue du Docteur Bouchut 69003 Lyon', name: '17 Rue du Docteur Bouchut', postcode: '69003', city: 'Lyon', lat: 45.7606, lng: 4.8594 }]);
    expect(await searchAddress('ab', fetchFn as never)).toEqual([]);
    expect(await searchAddress('rue inconnue', (async () => new Response('', { status: 500 })) as never)).toEqual([]);
  });
});
