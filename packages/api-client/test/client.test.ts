import { describe, expect, it, vi } from 'vitest';
import { adminApi, ApiError, authApi, buildQuery, defaultMessage, fieldErrors, HttpClient, LocalSessionStore, MemorySessionStore, partnerApi, publicApi } from '../src';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function setup(responses: Response[] | ((url: string, init: RequestInit) => Response), session = { accessToken: 'a1', refreshToken: 'r1' }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return typeof responses === 'function' ? responses(url, init) : (responses.shift() ?? json(200, {}));
  });
  const expired = vi.fn();
  const http = new HttpClient({ baseUrl: 'http://api.test/', store: new MemorySessionStore(session), fetch: fetchFn as never, onSessionExpired: expired });
  return { http, calls, expired };
}

describe('HttpClient', () => {
  it('ajoute le jeton, sérialise le corps et la requête', async () => {
    const { http, calls } = setup([json(200, { ok: true })]);
    expect(await http.request('POST', '/v1/x', { body: { a: 1 }, query: { q: 'lyon', empty: '', list: ['a', 'b'], none: undefined } })).toEqual({ ok: true });
    expect(calls[0].url).toBe('http://api.test/v1/x?q=lyon&list=a%2Cb');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer a1');
    expect(calls[0].init.body).toBe('{"a":1}');
  });

  it('rafraîchit une seule fois pour des requêtes simultanées, puis rejoue', async () => {
    let refreshes = 0;
    const { http } = setup((url, init) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshes++;
        return json(200, { accessToken: 'a2', refreshToken: 'r2' });
      }
      const auth = (init.headers as Record<string, string>).authorization;
      return auth === 'Bearer a2' ? json(200, { ok: url }) : json(401, { code: 'UNAUTHORIZED', message: 'x' });
    });
    const changes: unknown[] = [];
    http.onSessionChange((s) => changes.push(s));
    const [a, b] = await Promise.all([http.request('GET', '/v1/a'), http.request('GET', '/v1/b')]);
    expect(a).toEqual({ ok: 'http://api.test/v1/a' });
    expect(b).toEqual({ ok: 'http://api.test/v1/b' });
    expect(refreshes).toBe(1);
    expect(http.session).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    expect(changes).toHaveLength(1);
  });

  it('session perdue si le rafraîchissement échoue', async () => {
    const { http, expired } = setup([json(401, {}), json(401, { code: 'REFRESH_INVALID' })]);
    await expect(http.request('GET', '/v1/a')).rejects.toMatchObject({ status: 401 });
    expect(http.session).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
    expect(await http.refresh()).toBe(false);
  });

  it('erreurs lisibles : code, message, détails de validation, réseau, 204, texte', async () => {
    const { http } = setup([
      json(400, { code: 'VALIDATION_FAILED', message: 'Titre trop court', details: [{ path: 'title', message: 'Titre trop court' }, { path: 'title', message: 'autre' }, { message: 'global' }] }),
      new Response('oops', { status: 500 }),
      new Response(null, { status: 204 }),
      new Response('a;b', { status: 200, headers: { 'content-type': 'text/csv' } }),
      json(400, { message: ['a', 'b'] }),
    ]);
    const err = await http.request('POST', '/v1/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', message: 'Titre trop court' });
    expect(fieldErrors(err)).toEqual({ title: 'Titre trop court', _: 'global' });
    expect(fieldErrors(new Error('x'))).toEqual({});
    await expect(http.request('GET', '/v1/x')).rejects.toMatchObject({ status: 500, code: 'HTTP_500', message: defaultMessage(500) });
    expect(await http.request('DELETE', '/v1/x')).toBeUndefined();
    expect(await http.request('GET', '/v1/x.csv')).toBe('a;b');
    await expect(http.request('GET', '/v1/x')).rejects.toMatchObject({ message: 'a, b' });

    const offline = new HttpClient({ baseUrl: 'http://api.test', fetch: (async () => { throw new TypeError('fetch failed'); }) as never });
    await expect(offline.request('GET', '/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    const aborted = new HttpClient({ baseUrl: 'http://api.test', fetch: (async () => { throw Object.assign(new Error('a'), { name: 'AbortError' }); }) as never });
    await expect(aborted.request('GET', '/x')).rejects.toMatchObject({ name: 'AbortError' });
    for (const s of [401, 403, 404, 429, 418]) expect(defaultMessage(s)).toBeTruthy();
  });

  it('téléchargement authentifié avec nom de fichier', async () => {
    const { http } = setup([new Response('a;b', { status: 200, headers: { 'content-disposition': 'attachment; filename="familles.csv"' } }), new Response('x', { status: 200 })]);
    const file = await http.download('/v1/admin/families.csv', { plan: 'family' });
    expect(file.filename).toBe('familles.csv');
    expect(await file.blob.text()).toBe('a;b');
    expect((await http.download('/v1/x')).filename).toBe('export.csv');
  });

  it('stockage local de session, robuste à l’absence de localStorage', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) });
    const store = new LocalSessionStore('rk');
    store.save({ accessToken: 'a', refreshToken: 'r' });
    expect(store.load()).toEqual({ accessToken: 'a', refreshToken: 'r' });
    store.save(null);
    expect(store.load()).toBeNull();
    mem.set('rk', '{pas du json');
    expect(store.load()).toBeNull();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); }, removeItem: () => undefined });
    expect(store.load()).toBeNull();
    expect(() => store.save({ accessToken: 'a', refreshToken: 'r' })).not.toThrow();
    vi.unstubAllGlobals();
    expect(buildQuery()).toBe('');
  });
});

describe('endpoints', () => {
  it('connexion, invitation, déconnexion', async () => {
    const { http, calls } = setup([
      json(200, { accessToken: 'x', refreshToken: 'y', user: { id: 'u', role: 'admin' } }),
      json(200, { accessToken: 'p', refreshToken: 'q', user: { id: 'v', role: 'partner' } }),
      json(200, { kind: 'user', user: { id: 'v' } }),
      new Response(null, { status: 204 }),
      json(200, { success: true }),
      json(200, { success: true }),
    ], null as never);
    const auth = authApi(http);
    expect((await auth.login('a@b.fr', 'pw')).role).toBe('admin');
    expect(http.session?.accessToken).toBe('x');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined();
    await auth.acceptPartnerInvitation('tok', 'Julie', 'pw');
    expect(http.session?.accessToken).toBe('p');
    expect((await auth.me()).id).toBe('v');
    await auth.logout();
    expect(http.session).toBeNull();
    await auth.forgotPassword('a@b.fr');
    await auth.resetPassword('t', 'pw');
    await auth.logout(); // sans session : pas d'appel
    expect(calls).toHaveLength(6);
  });

  it('chaque méthode admin et partenaire appelle la bonne route', async () => {
    const { http, calls } = setup(() => json(200, {}));
    const a = adminApi(http);
    const p = partnerApi(http);
    const run = [
      a.overview(30), a.activeFamilies(), a.topActivities(7), a.topRewards(7), a.navCounts(), a.search('x'),
      a.activities({ q: 'v' }), a.activity('1'), a.createActivity({ title: 't', points: 1, minAge: 5, maxAge: 9, difficulty: 'easy' }), a.updateActivity('1', { points: 2 }),
      a.importActivities('csv'), a.reports(), a.resolveReports('1', 'ok', 'published'), a.categories(),
      a.rewards(), a.createReward({ title: 't', requiredPoints: 1 }), a.updateReward('1', { isActive: false }),
      a.moderation(), a.approveOffer('1'), a.rejectOffer('1', 'non'), a.requestOfferChanges('1', 'modif'),
      a.familyStats(), a.families({ plan: 'family' }), a.family('1'), a.familyPayments('1'), a.giftMonths('1', 1, 'family'), a.resendLogin('1'), a.deleteFamily('1', 'e'), a.setUserDisabled('1', true),
      a.billingOverview(), a.billingEvents(), a.plans('family'), a.updatePlan('family', { monthlyPriceCents: 499 }), a.promoCodes(), a.createPromoCode({ code: 'X' }), a.setPromoActive('1', false),
      a.partners('deca'), a.partnerStats(), a.createPartner({ name: 'n', kind: 'brand', ownerEmail: 'e', planId: 'partner_local' }), a.setPartnerStatus('1', 'suspended'),
      a.partnerLeads(), a.partnerLeads('new'), a.setPartnerLeadStatus('L', 'contacted'),
      p.accounts(), p.detail('P'), p.update('P', {}), p.dashboard('P'), p.offers('P', { display: 'active' }), p.storeOffers('P'), p.offer('O'), p.createOffer('P', { kind: 'child_reward', title: 't' }),
      p.updateOffer('O', {}), p.deleteOffer('O'), p.submitOffer('O'), p.pauseOffer('O'), p.resumeOffer('O'), p.brandApprove('O'), p.brandRequestChanges('O', 'n'),
      p.places('P'), p.createPlace('P', { name: 'n' }), p.updatePlace('P', 'L', {}), p.createStore('P', { name: 'n', managerEmail: 'e' }),
      p.audience('P'), p.estimate('P', { targetType: 'radius', radiusKm: 10 }), p.accessCodes('P'), p.redemptions('P'), p.verify('P', { code: 'RK', redeem: false }),
      p.invite('P', { email: 'e', role: 'viewer' }), p.updateMember('P', 'M', { role: 'editor' }), p.revokeMember('P', 'M'),
      p.billing('P'), p.plans(), p.checkout('P', 'partner_local', 'month'), p.portal('P'), p.uploadImage('P', 'data:'), p.categories(), p.activities({ q: 'vélo' }),
    ];
    await Promise.all(run);
    await a.familiesCsv({});
    await p.redemptionsCsv('P');
    const urls = calls.map((c) => `${c.init.method} ${c.url.replace('http://api.test', '')}`);
    expect(urls).toContain('GET /v1/admin/overview?days=30');
    expect(urls).toContain('DELETE /v1/admin/families/1');
    expect(urls).toContain('POST /v1/partner/P/redemptions/verify');
    expect(urls).toContain('GET /v1/activities?origin=catalog&q=v%C3%A9lo');
    expect(urls).toContain('GET /v1/admin/families.csv');
    expect(urls).toContain('GET /v1/partner/P/redemptions.csv');
    expect(urls).toContain('GET /v1/admin/partner-leads?status=new');
    expect(urls).toContain('PATCH /v1/admin/partner-leads/L');
    expect(new Set(urls).size).toBeGreaterThan(60);
  });

  it('appels publics de la landing, sans jeton', async () => {
    const { http, calls } = setup(() => json(200, {}));
    const pub = publicApi(http);
    await pub.partnerPlans();
    await pub.submitPartnerLead({ fullName: 'Julie', organization: 'Vélo', email: 'j@v.fr', kind: 'store' });
    expect(calls.map((c) => `${c.init.method} ${c.url.replace('http://api.test', '')}`)).toEqual(['GET /v1/billing/plans?audience=partner', 'POST /v1/partner-leads']);
    for (const c of calls) expect((c.init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(JSON.parse(String(calls[1].init.body))).toMatchObject({ kind: 'store' });
  });
});
