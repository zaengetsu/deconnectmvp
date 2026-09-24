import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '../lib/supabase';
import { api, ApiError } from '../lib/api';
import { billingService, euros } from '../features/billing/billing.service';
import { locatePostalCode, offersService } from '../features/offers/offers.service';
import { appPathFromUrl } from '../lib/childLink';
import { claimState } from '../pages/parent/VouchersPage';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('API Rekonect (pont Supabase)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { access_token: 'sb-jwt', user: { id: 'parent-1' } } } } as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('envoie le jeton Supabase et le corps JSON', async () => {
    expect(await api('POST', '/v1/x', { a: 1 })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/v1/x');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sb-jwt');
    expect(init.body).toBe('{"a":1}');
  });

  it('erreurs lisibles, réseau, 204', async () => {
    fetchMock.mockResolvedValueOnce(json(403, { code: 'PLAN_LIMIT_CHILDREN', message: 'Votre plan Gratuit permet 1 profil enfant.' }));
    await expect(api('GET', '/v1/x')).rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT_CHILDREN', message: 'Votre plan Gratuit permet 1 profil enfant.' });
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    await expect(api('GET', '/v1/x')).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(api('GET', '/v1/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await api('DELETE', '/v1/x')).toBeUndefined();
  });

  it('jeton push enregistré via l’API (environnement compris), repli Supabase si l’API est injoignable', async () => {
    const { notificationService } = await import('../features/notifications/notification.service');
    await notificationService.savePushToken('parent-1', 'push-token-123456', 'ios');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/v1/push-tokens');
    expect(JSON.parse(init.body as string)).toEqual({ token: 'push-token-123456', platform: 'ios', environment: 'development' });

    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.spyOn(supabase, 'from').mockReturnValue({ upsert } as never);
    await notificationService.savePushToken('parent-1', 'push-token-123456', 'android', 'child-1');
    expect(from).toHaveBeenCalledWith('push_tokens');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: null, child_id: 'child-1', environment: 'development' }), { onConflict: 'token' });
  });

  it('abonnement et bons : bonnes routes', async () => {
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
