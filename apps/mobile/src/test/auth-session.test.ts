import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';
import { sessionStore } from '../lib/session';
import { useAuthStore } from '../stores/auth.store';
import { childSession } from '../features/auth/child.session';
import { json, mockApi, signedInAs } from './http';

const tokens = (id = 'parent-1', email = 'camille@test.fr') => ({ accessToken: `at-${id}`, refreshToken: `rt-${id}`, user: { id, email, fullName: 'Camille Martin', role: 'parent' } });
const profile = { id: 'parent-1', email: 'camille@test.fr', fullName: 'Camille Martin', role: 'parent', subscription: null };

function resetStore() {
  useAuthStore.setState({ user: null, session: null, profile: null, isLoading: false, isInitialized: false, error: null });
}

beforeEach(() => {
  sessionStore.__reset();
  localStorage.clear();
  resetStore();
  vi.mocked(Preferences.get).mockResolvedValue({ value: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('session parent (API, plus de Supabase Auth)', () => {
  it('connexion : session enregistrée, profil chargé, utilisateur non anonyme', async () => {
    const http = mockApi({ 'POST /v1/auth/login': tokens(), 'GET /v1/profile': profile });
    await useAuthStore.getState().signIn(' camille@test.fr ', 'motdepasse');
    const s = useAuthStore.getState();
    expect(s.user).toEqual({ id: 'parent-1', email: 'camille@test.fr', is_anonymous: false });
    expect(s.profile).toMatchObject({ full_name: 'Camille Martin' });
    expect(await sessionStore.get()).toMatchObject({ kind: 'parent', accessToken: 'at-parent-1', refreshToken: 'rt-parent-1' });
    expect(http.calls[0]).toMatchObject({ body: { email: 'camille@test.fr', password: 'motdepasse' }, auth: undefined });
    expect(http.calls[1].auth).toBe('Bearer at-parent-1');
  });

  it('identifiants refusés : message de l’API, aucune session', async () => {
    mockApi({ 'POST /v1/auth/login': json(401, { code: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' }) });
    await expect(useAuthStore.getState().signIn('a@b.fr', 'x')).rejects.toThrow('Email ou mot de passe incorrect');
    expect(useAuthStore.getState().error).toBe('Email ou mot de passe incorrect');
    expect(await sessionStore.get()).toBeNull();
  });

  it('inscription : compte actif tout de suite', async () => {
    const http = mockApi({ 'POST /v1/auth/register': tokens(), 'GET /v1/profile': profile });
    await useAuthStore.getState().signUp('camille@test.fr', 'motdepasse-solide', ' Camille Martin ');
    expect(http.calls[0].body).toEqual({ email: 'camille@test.fr', password: 'motdepasse-solide', fullName: 'Camille Martin' });
    expect(useAuthStore.getState().user?.id).toBe('parent-1');
    mockApi({ 'POST /v1/auth/register': json(409, { code: 'EMAIL_TAKEN', message: 'Un compte existe déjà avec cet email' }) });
    await expect(useAuthStore.getState().signUp('camille@test.fr', 'x', 'C')).rejects.toThrow('existe déjà');
  });

  it('démarrage : reprend la session enregistrée ; jeton révoqué → déconnecté', async () => {
    await signedInAs('parent');
    mockApi({ 'GET /v1/profile': profile });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ isInitialized: true, user: { id: 'parent-1', is_anonymous: false }, profile: { full_name: 'Camille Martin' } });

    resetStore();
    mockApi({ 'GET /v1/profile': json(401, { code: 'TOKEN_EXPIRED' }), 'POST /v1/auth/refresh': json(401, { code: 'REFRESH_INVALID' }) });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ isInitialized: true, user: null });
  });

  it('démarrage sans session et session enfant', async () => {
    mockApi();
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ isInitialized: true, user: null });
    await useAuthStore.getState().initialize(); // déjà initialisé : rien à faire
    resetStore();
    await signedInAs('child', 'child-1');
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().user).toEqual({ id: 'child-1', email: null, is_anonymous: true });
  });

  it('déconnexion : jeton de rafraîchissement et jeton push retirés côté serveur', async () => {
    await signedInAs('parent');
    localStorage.setItem('rk_push_token', 'push-abc-123456');
    const http = mockApi();
    await useAuthStore.getState().signOut();
    expect(http.calls[0]).toMatchObject({ path: '/v1/auth/logout', body: { refreshToken: 'rt-parent-1', pushToken: 'push-abc-123456' } });
    expect(await sessionStore.get()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('mot de passe oublié, profil, mot de passe et adresse', async () => {
    await signedInAs('parent');
    const http = mockApi({
      'POST /v1/auth/password/change': tokens('parent-1'),
      'POST /v1/auth/email': { user: { id: 'parent-1', email: 'nouvelle@test.fr' } },
      'GET /v1/profile': { ...profile, email: 'nouvelle@test.fr' },
    });
    await useAuthStore.getState().resetPassword(' camille@test.fr ');
    await useAuthStore.getState().updateProfile({ full_name: 'Camille B.', email: 'ignoré', id: 'x' });
    await useAuthStore.getState().changePassword('ancien', 'Nouveau-1234');
    await useAuthStore.getState().changeEmail('nouvelle@test.fr', 'Nouveau-1234');
    expect(http.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/v1/auth/password/forgot', { email: 'camille@test.fr' }],
      ['PATCH', '/v1/profile', { fullName: 'Camille B.' }],
      ['GET', '/v1/profile', undefined],
      ['POST', '/v1/auth/password/change', { currentPassword: 'ancien', newPassword: 'Nouveau-1234' }],
      ['POST', '/v1/auth/email', { email: 'nouvelle@test.fr', password: 'Nouveau-1234' }],
      ['GET', '/v1/profile', undefined],
    ]);
    expect(useAuthStore.getState().user?.email).toBe('nouvelle@test.fr');
    expect((await sessionStore.get())?.email).toBe('nouvelle@test.fr');
  });

  it('erreurs de mot de passe oublié et de profil remontées', async () => {
    await signedInAs('parent');
    mockApi({ 'POST /v1/auth/password/forgot': json(429, { message: 'Trop de demandes' }), 'PATCH /v1/profile': json(400, { message: 'Nom invalide' }) });
    await expect(useAuthStore.getState().resetPassword('a@b.fr')).rejects.toThrow('Trop de demandes');
    await expect(useAuthStore.getState().updateProfile({ full_name: '' })).rejects.toThrow('Nom invalide');
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe('session enfant (lien QR / PIN)', () => {
  const childRes = { accessToken: 'at-c', refreshToken: 'rt-c', child: { id: 'child-1', parentId: 'parent-1', displayName: 'Emma', age: 9, lastActivityDate: '2026-09-23T00:00:00.000Z' }, parentName: 'Camille' };

  it('lien QR : pose le PIN, ouvre la session enfant et révoque celle du parent', async () => {
    await signedInAs('parent');
    const http = mockApi({ 'POST /v1/auth/child/link': childRes });
    const res = await childSession.claimLink('a3f1c2d4e5f60718293a4b5c6d7e8f90', '1234', 'iPhone');
    expect(res).toMatchObject({ success: true, parent_name: 'Camille', child: { id: 'child-1', display_name: 'Emma', last_activity_date: '2026-09-23' } });
    expect(http.calls.map((c) => [c.path, c.body])).toEqual([
      ['/v1/auth/child/link', { code: 'a3f1c2d4e5f60718293a4b5c6d7e8f90', pin: '1234', deviceId: 'iPhone' }],
      ['/v1/auth/logout', { refreshToken: 'rt-parent-1' }],
    ]);
    expect(await sessionStore.get()).toMatchObject({ kind: 'child', subjectId: 'child-1', parentId: 'parent-1', accessToken: 'at-c' });
    expect(vi.mocked(Preferences.set)).toHaveBeenCalledWith({ key: 'dc_child_session', value: JSON.stringify({ childId: 'child-1' }) });
  });

  it('PIN : succès, erreur et verrouillage', async () => {
    mockApi({ 'POST /v1/auth/child/login': childRes });
    expect(await childSession.login('child-1', '1234')).toMatchObject({ success: true, child: { id: 'child-1' } });
    mockApi({ 'POST /v1/auth/child/login': json(401, { code: 'PIN_INVALID', message: 'PIN incorrect' }) });
    expect(await childSession.login('child-1', '0000')).toEqual({ success: false, error: 'PIN incorrect' });
    mockApi({ 'POST /v1/auth/child/login': json(429, { code: 'PIN_LOCKED', message: 'Trop de tentatives.', details: { lockedUntil: '2026-09-24T10:15:00Z' } }) });
    expect(await childSession.login('child-1', '0000')).toEqual({ success: false, error: 'Trop de tentatives.', locked_until: '2026-09-24T10:15:00Z' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect((await childSession.claimLink('K7M3PQ', '1234')).success).toBe(false);
    expect(await childSession.login('child-1', '1234')).toMatchObject({ success: false, error: 'Connexion impossible. Vérifiez votre réseau.' });
  });

  it('reprise après redémarrage, dernier enfant relié, fin de session', async () => {
    expect(await childSession.restore()).toBeNull();
    await signedInAs('child', 'child-1');
    mockApi({ 'GET /v1/auth/me': { kind: 'child', child: childRes.child } });
    expect(await childSession.restore()).toMatchObject({ id: 'child-1', display_name: 'Emma' });
    mockApi({ 'GET /v1/auth/me': json(404, {}) });
    expect(await childSession.restore()).toBeNull();

    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: JSON.stringify({ childId: 'child-1' }) });
    expect(await childSession.lastChildId()).toBe('child-1');
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: '{oops' });
    expect(await childSession.lastChildId()).toBeNull();

    localStorage.setItem('rk_push_token', 'push-kid-123456');
    const http = mockApi();
    await childSession.end();
    expect(http.calls[0]).toMatchObject({ path: '/v1/auth/logout', body: { refreshToken: 'rt-child-1', pushToken: 'push-kid-123456' } });
    expect(await sessionStore.get()).toBeNull();
    expect(childSession.isChildUser({ is_anonymous: true })).toBe(true);
    expect(childSession.isChildUser(null)).toBe(false);
  });
});

describe('reconnexion d’un appareil enfant déjà relié', () => {
  it('mémorise l’enfant à la connexion et l’oublie à la fin de session', async () => {
    expect(childSession.rememberedChild()).toBeNull();
    mockApi({ 'POST /v1/auth/child/login': { accessToken: 'a', refreshToken: 'r', child: { id: 'child-1', parentId: 'p', displayName: 'Emma' } } });
    await childSession.login('child-1', '1234');
    expect(childSession.rememberedChild()).toMatchObject({ id: 'child-1', display_name: 'Emma' });
    localStorage.setItem('deconnect_child', '{oops');
    expect(childSession.rememberedChild()).toBeNull();
    localStorage.setItem('deconnect_child', JSON.stringify({ id: 'child-1' }));
    await childSession.end();
    expect(childSession.rememberedChild()).toBeNull();
  });
});
