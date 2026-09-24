import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterNotifications,
  isActionRequired,
  notificationService,
  type AppNotification,
} from '../features/notifications/notification.service';
import { preferencesService } from '../features/notifications/preferences.service';
import { sessionStore } from '../lib/session';
import { realtime } from '../lib/realtime';
import { json, mockApi, signedInAs } from './http';

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: over.id ?? 'n1',
  recipient_type: 'parent',
  recipient_id: 'p1',
  title: 't', body: 'b', icon: '🔔', route: null, data: {},
  is_read: false,
  created_at: new Date().toISOString(),
  ...over,
});

describe('centre de notifications (5.13)', () => {
  const list = [
    n({ id: '1', type: 'activity_validation_required', priority: 'high' }),
    n({ id: '2', type: 'activity_completed', priority: 'normal', is_read: true }),
    n({ id: '3', type: 'reward_pending', priority: 'normal' }),
    n({ id: '4', type: 'tip', priority: 'low', is_read: true }),
  ];

  it('filtre les non lues', () => {
    expect(filterNotifications(list, 'unread').map(x => x.id)).toEqual(['1', '3']);
  });

  it('filtre ce qui attend une action du parent', () => {
    expect(filterNotifications(list, 'action').map(x => x.id)).toEqual(['1', '3']);
  });

  it('filtre par famille activité / récompense', () => {
    expect(filterNotifications(list, 'activity').map(x => x.id)).toEqual(['2']);
    expect(filterNotifications(list, 'reward').map(x => x.id)).toEqual(['3']);
  });

  it('« tout » ne retire rien', () => {
    expect(filterNotifications(list, 'all')).toHaveLength(4);
  });

  it('distingue visuellement les notifications à traiter', () => {
    expect(isActionRequired(n({ priority: 'high' }))).toBe(true);
    expect(isActionRequired(n({ type: 'reward_requested', priority: 'normal' }))).toBe(true);
    expect(isActionRequired(n({ type: 'activity_completed', priority: 'normal' }))).toBe(false);
    expect(isActionRequired(n({ type: 'tip', priority: 'low' }))).toBe(false);
  });

  beforeEach(async () => {
    sessionStore.__reset();
    localStorage.clear();
    await signedInAs('parent', 'p1');
  });
  afterEach(() => vi.unstubAllGlobals());

  const apiItem = (over: Record<string, unknown> = {}) => ({
    id: 'n1', type: 'reward_requested', category: 'action', title: '🎁 Récompense demandée', body: 'Emma aimerait sa récompense', icon: '🎁',
    route: '/parent/rewards', data: { rewardId: 'r1' }, priority: 'high', entityType: 'reward_request', entityId: 'rr1', isRead: false, readAt: null, sentAt: '2026-09-24T10:00:00Z', ...over,
  });

  it('lit le centre de la session courante (parent ou enfant)', async () => {
    const http = mockApi({ 'GET /v1/notifications': { items: [apiItem(), apiItem({ id: 'n2', isRead: true, icon: null, data: null })], nextCursor: null } });
    const [first, second] = await notificationService.getParentNotifications('p1', 30);
    expect(first).toMatchObject({ id: 'n1', recipient_type: 'parent', recipient_id: 'p1', is_read: false, created_at: '2026-09-24T10:00:00Z', entity_type: 'reward_request', entity_id: 'rr1', data: { rewardId: 'r1' } });
    expect(isActionRequired(first)).toBe(true);
    expect(second).toMatchObject({ icon: '🔔', data: {}, is_read: true });
    const kid = await notificationService.getChildNotifications('child-9', 500);
    expect(kid[0].recipient_type).toBe('child');
    expect(http.list()).toEqual(['GET /v1/notifications?limit=30', 'GET /v1/notifications?limit=100']);
  });

  it('compteur, lecture, tout lire, suppression et « effacer les lues »', async () => {
    const http = mockApi({ 'GET /v1/notifications/unread-count': { count: 3, action: 1 } });
    expect(await notificationService.getUnreadCount('parent', 'p1')).toBe(3);
    await notificationService.markAsRead('n1');
    await notificationService.markAllRead('parent', 'p1');
    await notificationService.deleteNotification('n1');
    await notificationService.deleteAllRead('parent', 'p1');
    expect(http.list()).toEqual([
      'GET /v1/notifications/unread-count',
      'POST /v1/notifications/n1/read',
      'POST /v1/notifications/read-all',
      'DELETE /v1/notifications/n1',
      'POST /v1/notifications/remove-read',
    ]);
  });

  it('compteur à 0 plutôt qu’un écran cassé si le serveur ne répond pas', async () => {
    mockApi({ 'GET /v1/notifications/unread-count': json(500, {}) });
    expect(await notificationService.getUnreadCount()).toBe(0);
  });

  it('jeton push : enregistré avec l’environnement, mémorisé pour la déconnexion', async () => {
    const http = mockApi();
    await notificationService.savePushToken('p1', 'push-token-123456', 'ios');
    expect(http.calls[0]).toMatchObject({ path: '/v1/push-tokens', body: { token: 'push-token-123456', platform: 'ios', environment: 'development' } });
    expect(localStorage.getItem('rk_push_token')).toBe('push-token-123456');
    await notificationService.removePushToken('push-token-123456');
    expect(http.calls[1]).toMatchObject({ path: '/v1/push-tokens/unregister', body: { token: 'push-token-123456' } });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(notificationService.savePushToken('p1', 'push-token-123456', 'android')).resolves.toBeUndefined();
  });

  it('temps réel : une notification signalée est relue puis transmise', async () => {
    mockApi({ 'GET /v1/notifications': { items: [apiItem({ id: 'n7' })], nextCursor: null } });
    let push: ((id: string) => void) | undefined;
    const spy = vi.spyOn(realtime, 'subscribe').mockImplementation((fn) => {
      push = fn;
      return () => undefined;
    });
    const received = vi.fn();
    const off = notificationService.subscribeToNotifications('parent', 'p1', received);
    push!('n7');
    push!('inconnue');
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0][0]).toMatchObject({ id: 'n7' });
    off();
    spy.mockRestore();
  });
});

describe('préférences (5.15)', () => {
  beforeEach(async () => {
    sessionStore.__reset();
    await signedInAs('parent', 'p1');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lit les préférences du parent et d’un enfant (créées par le serveur si besoin)', async () => {
    const http = mockApi({
      'GET /v1/notification-preferences': { id: 'pref-1', parentId: 'p1', childId: null, pushEnabled: true, quietHoursStart: '20:30' },
      'GET /v1/notification-preferences?childId=c1': { id: 'pref-c1', parentId: 'p1', childId: 'c1' },
    });
    const prefs = await preferencesService.getParentPreferences('p1');
    expect(prefs).toMatchObject({ id: 'pref-1', push_enabled: true, quiet_hours_start: '20:30' });
    expect((await preferencesService.getChildPreferences('c1'))?.id).toBe('pref-c1');
    expect(http.list()).toEqual(['GET /v1/notification-preferences', 'GET /v1/notification-preferences?childId=c1']);
  });

  it('enregistre un réglage et les horaires silencieux sur la bonne ligne', async () => {
    const http = mockApi({
      'GET /v1/notification-preferences?childId=c1': { id: 'pref-c1', parentId: 'p1', childId: 'c1' },
    });
    await preferencesService.getChildPreferences('c1');
    await preferencesService.update('pref-c1', { encouragements: false });
    await preferencesService.setQuietHours('pref-c1', '21:00', '07:30');
    await preferencesService.setQuietHours('pref-1', null, null);
    expect(http.calls.slice(1).map((c) => [c.method, c.path, c.body])).toEqual([
      ['PUT', '/v1/notification-preferences?childId=c1', { encouragements: false }],
      ['PUT', '/v1/notification-preferences?childId=c1', { quietHoursStart: '21:00', quietHoursEnd: '07:30' }],
      ['PUT', '/v1/notification-preferences', { quietHoursStart: null, quietHoursEnd: null }],
    ]);
  });

  it('préférences indisponibles : null plutôt qu’une erreur', async () => {
    mockApi({ 'GET /v1/notification-preferences': json(503, {}) });
    expect(await preferencesService.getParentPreferences('p1')).toBeNull();
  });
});
