import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, refreshSession, withQuery } from '../lib/api';
import { sessionStore } from '../lib/session';
import { billingService, euros } from '../features/billing/billing.service';
import { locatePostalCode, offersService } from '../features/offers/offers.service';
import { appPathFromUrl } from '../lib/childLink';
import { claimState } from '../pages/parent/VouchersPage';
import { json, mockApi, signedInAs } from './http';

describe('client de l’API Rekonect', () => {
  beforeEach(async () => {
    sessionStore.__reset();
    localStorage.clear();
    await signedInAs('parent');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('envoie le jeton de la session et le corps JSON', async () => {
    const http = mockApi({ 'POST /v1/x': { ok: true } });
    expect(await api('POST', '/v1/x', { a: 1 })).toEqual({ ok: true });
    expect(http.calls[0]).toMatchObject({ path: '/v1/x', auth: 'Bearer at-parent-1', body: { a: 1 }, contentType: 'application/json' });
  });

  it('requêtes publiques sans jeton', async () => {
    const http = mockApi();
    await api('POST', '/v1/auth/login', { email: 'a@b.fr', password: 'x' }, { auth: false });
    expect(http.calls[0].auth).toBeUndefined();
  });

  it('erreurs lisibles, 204 et réponses vides', async () => {
    mockApi({
      'GET /v1/limit': json(403, { code: 'PLAN_LIMIT_CHILDREN', message: 'Votre plan Gratuit permet 1 profil enfant.' }),
      'GET /v1/list': json(400, { code: 'VALIDATION', message: ['a', 'b'] }),
      'GET /v1/oops': () => new Response('oops', { status: 500 }),
      'DELETE /v1/x': () => new Response(null, { status: 204 }),
    });
    await expect(api('GET', '/v1/limit')).rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT_CHILDREN', message: 'Votre plan Gratuit permet 1 profil enfant.' });
    await expect(api('GET', '/v1/list')).rejects.toMatchObject({ message: 'a b' });
    await expect(api('GET', '/v1/oops')).rejects.toBeInstanceOf(ApiError);
    expect(await api('DELETE', '/v1/x')).toBeUndefined();
  });

  it('jeton expiré : un seul rafraîchissement partagé, puis nouvel essai avec le nouveau jeton', async () => {
    let refreshes = 0;
    const http = mockApi({
      'POST /v1/auth/refresh': () => {
        refreshes++;
        return { accessToken: 'at-2', refreshToken: 'rt-2' };
      },
      'GET /v1/a': (c: { auth?: string }) => (c.auth === 'Bearer at-2' ? { ok: 'a' } : json(401, { code: 'TOKEN_EXPIRED' })),
      'GET /v1/b': (c: { auth?: string }) => (c.auth === 'Bearer at-2' ? { ok: 'b' } : json(401, { code: 'TOKEN_EXPIRED' })),
    });
    expect(await Promise.all([api('GET', '/v1/a'), api('GET', '/v1/b')])).toEqual([{ ok: 'a' }, { ok: 'b' }]);
    expect(refreshes).toBe(1);
    expect(http.calls.find((c) => c.path === '/v1/auth/refresh')).toMatchObject({ body: { refreshToken: 'rt-parent-1' }, auth: undefined });
    expect((await sessionStore.get())?.refreshToken).toBe('rt-2');
  });

  it('rafraîchissement refusé : la session est effacée et l’erreur remonte', async () => {
    const onChange = vi.fn();
    sessionStore.onChange(onChange);
    mockApi({ 'POST /v1/auth/refresh': json(401, { code: 'REFRESH_INVALID' }), 'GET /v1/a': json(401, { code: 'TOKEN_EXPIRED' }) });
    await expect(api('GET', '/v1/a')).rejects.toMatchObject({ status: 401 });
    expect(await sessionStore.get()).toBeNull();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('coupure réseau : la session est gardée, les lectures sont retentées une fois', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      if (n === 1) throw new TypeError('Load failed');
      return json(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await api('GET', '/v1/x')).toEqual({ ok: true });
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(api('POST', '/v1/x', {})).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await refreshSession()).toBe(false);
    expect(await sessionStore.get()).not.toBeNull();
  });

  it('délai dépassé : message clair plutôt qu’un écran figé', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))));
    await expect(api('POST', '/v1/slow', {}, { timeoutMs: 5 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('envoi binaire (preuve) et construction des requêtes', async () => {
    const http = mockApi();
    await api('POST', '/v1/child-activities/c/proof', undefined, { raw: { data: new Blob(['x']), contentType: 'image/jpeg' } });
    expect(http.calls[0].contentType).toBe('image/jpeg');
    expect(withQuery('/v1/a', { x: 1, y: undefined, z: '', w: 'é' })).toBe('/v1/a?x=1&w=%C3%A9');
    expect(withQuery('/v1/a?b=1', { c: true })).toBe('/v1/a?b=1&c=true');
    expect(withQuery('/v1/a')).toBe('/v1/a');
  });

  it('abonnement et bons : bonnes routes', async () => {
    const fetchMock = mockApi().fetchMock;
    await billingService.plans();
    await billingService.subscription();
    await billingService.invoices();
    await billingService.checkout('family', 'year', 'RENTREE26');
    await billingService.changePlan('family_plus', 'month');
    await billingService.portal();
    await billingService.cancel();
    await billingService.resume();
    await billingService.redeem('CSE-AIRBUS');
    await offersService.claims();
    await offersService.progress();
    await offersService.markUsed('c1');
    await offersService.impression('o1');
    const calls = fetchMock.mock.calls.map(([u, i]) => `${(i as RequestInit).method} ${String(u).replace('http://localhost:3000', '')}`);
    expect(calls).toEqual([
      'GET /v1/billing/plans?audience=family',
      'GET /v1/billing/subscription',
      'GET /v1/billing/invoices',
      'POST /v1/billing/checkout',
      'POST /v1/billing/change-plan',
      'POST /v1/billing/portal',
      'POST /v1/billing/cancel',
      'POST /v1/billing/resume',
      'POST /v1/billing/redeem',
      'GET /v1/offer-claims',
      'GET /v1/offer-progress',
      'POST /v1/offer-claims/c1/redeem',
      'POST /v1/offers/o1/impression',
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toEqual({ planId: 'family', interval: 'year', promoCode: 'RENTREE26' });
    expect(euros(499)).toBe('4,99 €');
    expect(euros(4900)).toBe('49 €');
    expect(euros(null)).toBe('—');
  });

  it('consentement partenaires : code postal géocodé puis préférence', async () => {
    const fetchMock = mockApi().fetchMock;
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('https://api-adresse.data.gouv.fr') ? json(200, { features: [{ properties: { city: 'Lyon' }, geometry: { coordinates: [4.85, 45.76] } }] }) : json(200, {}),
    );
    await offersService.setConsent(true, '69003');
    const bodies = fetchMock.mock.calls.filter(([u]) => String(u).startsWith('http://localhost')).map(([u, i]) => [String(u).replace('http://localhost:3000', ''), JSON.parse(String((i as RequestInit).body))]);
    expect(bodies).toEqual([
      ['/v1/profile', { postalCode: '69003', city: 'Lyon', latitude: 45.76, longitude: 4.85 }],
      ['/v1/notification-preferences', { partnerOffers: true }],
    ]);
    expect(await locatePostalCode('69', fetchMock as never)).toBeNull();
    expect(await locatePostalCode('69003', (async () => { throw new Error('x'); }) as never)).toBeNull();
    fetchMock.mockResolvedValueOnce(json(200, { partnerOffers: true }));
    expect(await offersService.consent()).toBe(true);
  });
});

describe('liens et bons', () => {
  it('liens profonds de l’app', () => {
    expect(appPathFromUrl('rekonect://parent/subscription?checkout=success')).toBe('/parent/subscription?checkout=success');
    expect(appPathFromUrl('rekonect://parent/offers/abc')).toBe('/parent/offers/abc');
    expect(appPathFromUrl('rekonect://join-family?token=3f9a1c')).toBe('/join-family?token=3f9a1c');
    expect(appPathFromUrl('rekonect://family')).toBe('/family');
    expect(appPathFromUrl('rekonect://link?t=123')).toBeNull();
    expect(appPathFromUrl('https://evil.example/parent')).toBeNull();
  });
  it('état d’un bon', () => {
    const base = { id: 'c', code: 'RK4M-82QA', qrPayload: 'rekonect:voucher:RK4M-82QA', unlockedAt: '2026-09-01', redeemedAt: null, expiresAt: null, child: null, offer: { endsAt: null } } as never;
    const now = new Date('2026-09-24');
    expect(claimState({ ...(base as object), status: 'unlocked' } as never, now)).toBe('ready');
    expect(claimState({ ...(base as object), status: 'redeemed' } as never, now)).toBe('used');
    expect(claimState({ ...(base as object), status: 'unlocked', expiresAt: '2026-09-01' } as never, now)).toBe('expired');
  });
});
