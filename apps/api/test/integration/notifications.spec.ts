import { NotificationService } from '../../src/modules/notifications/notification.service';
import { templates } from '../../src/modules/notifications/templates';
import { auth, catalogActivity, completeActivity, createChild, familyWithChild, linkChild, notificationsOf, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

describe('Notifications : décision, centre, préférences, livraisons', () => {
  let h: Harness;
  let service: NotificationService;
  beforeAll(async () => {
    h = await createHarness();
    service = h.app.get(NotificationService);
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.push.sent.length = 0;
    h.push.responses.clear();
    h.mailer.sent.length = 0;
    await resetDb(h.prisma);
  });

  const tip = (recipientId: string, extra: Record<string, unknown> = {}) => ({
    recipientType: 'parent' as const,
    recipientId,
    type: 'tip' as const,
    title: 'Conseil',
    body: 'Une idée de sortie ce week-end ?',
    icon: '💡',
    route: '/parent/dashboard',
    priority: 'low' as const,
    channels: ['in_app' as const, 'push' as const],
    ...extra,
  });

  describe('centre de notifications', () => {
    it('liste, pagination, filtres, compteurs, lu / non lu, tout lire, masquer', async () => {
      const { parent, child, childId } = await familyWithChild(h);
      const reward = await h.http.post('/v1/rewards').set(auth(parent.token)).send({ title: 'Glace', requiredPoints: 0 }).expect(201);
      await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(child.token)).expect(201);
      await h.prisma.$transaction(async (tx) => {
        for (let i = 0; i < 3; i++) await service.enqueue(tx, tip(parent.userId, { dedupKey: `tip-${i}` }));
      });
      await h.drain();

      const count = await h.http.get('/v1/notifications/unread-count').set(auth(parent.token)).expect(200);
      expect(count.body).toEqual({ count: 5, action: 1 }); // appareil relié + récompense (action) + 3 conseils

      const p1 = await h.http.get('/v1/notifications?limit=2').set(auth(parent.token)).expect(200);
      expect(p1.body.items).toHaveLength(2);
      const p2 = await h.http.get(`/v1/notifications?limit=2&cursor=${p1.body.nextCursor}`).set(auth(parent.token)).expect(200);
      expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);

      const actions = await h.http.get('/v1/notifications?category=action').set(auth(parent.token)).expect(200);
      expect(actions.body.items.map((n: { type: string }) => n.type)).toEqual(['reward_requested']);
      const rewards = await h.http.get('/v1/notifications?category=reward').set(auth(parent.token)).expect(200);
      expect(rewards.body.items).toHaveLength(1);
      const other = await h.http.get('/v1/notifications?category=other').set(auth(parent.token)).expect(200);
      expect(other.body.items.length).toBeGreaterThanOrEqual(3);

      const id = actions.body.items[0].id;
      expect((await h.http.post(`/v1/notifications/${id}/read`).set(auth(parent.token)).expect(200)).body).toEqual({ count: 4, action: 0 });
      expect((await h.http.post(`/v1/notifications/${id}/unread`).set(auth(parent.token)).expect(200)).body.count).toBe(5);
      const unreadOnly = await h.http.get('/v1/notifications?unread=true').set(auth(parent.token)).expect(200);
      expect(unreadOnly.body.items).toHaveLength(5);

      await h.http.delete(`/v1/notifications/${id}`).set(auth(parent.token)).expect(200);
      await h.http.delete(`/v1/notifications/${id}`).set(auth(parent.token)).expect(404);
      expect((await h.http.post('/v1/notifications/read-all').set(auth(parent.token)).expect(200)).body).toEqual({ count: 0, action: 0 });

      // Cloisonnement : l'enfant ne voit ni ne modifie les notifications du parent.
      await h.http.post(`/v1/notifications/${p1.body.items[0].id}/read`).set(auth(child.token)).expect(404);
      const childList = await h.http.get('/v1/notifications').set(auth(child.token)).expect(200);
      expect(childList.body.items.every((n: { id: string }) => n.id !== id)).toBe(true);
      expect(childId).toBeTruthy();
    });
  });

  describe('décision', () => {
    it('préférence désactivée → notification supprimée (tracée, invisible)', async () => {
      const parent = await registerParent(h);
      await h.http.put('/v1/notification-preferences').set(auth(parent.token)).send({ tips: false }).expect(200);
      const res = await h.prisma.$transaction((tx) => service.enqueue(tx, tip(parent.userId)));
      expect(res.status).toBe('suppressed');
      expect((await h.http.get('/v1/notifications').set(auth(parent.token)).expect(200)).body.items).toHaveLength(0);
    });

    it('canaux : push coupé globalement ou par type, in-app conservé', async () => {
      const parent = await registerParent(h);
      await h.http.put('/v1/notification-preferences').set(auth(parent.token)).send({ channelOverrides: { tip: { push: false } } }).expect(200);
      await h.prisma.$transaction((tx) => service.enqueue(tx, tip(parent.userId, { dedupKey: 'a' })));
      await h.http.put('/v1/notification-preferences').set(auth(parent.token)).send({ pushEnabled: false, channelOverrides: { weekly_summary: { email: false } } }).expect(200);
      await h.prisma.$transaction((tx) => service.enqueue(tx, { ...tip(parent.userId), type: 'weekly_summary', channels: ['in_app', 'push', 'email'], dedupKey: 'b' }));
      const rows = await notificationsOf(h, parent.userId);
      expect(rows.map((r) => r.channels)).toEqual([['in_app'], ['in_app']]);
      const prefs = await h.http.get('/v1/notification-preferences').set(auth(parent.token)).expect(200);
      expect(prefs.body.channelOverrides).toEqual({ tip: { push: false }, weekly_summary: { email: false } });
    });

    it('heures silencieuses de l’enfant : report à 7h30, sauf alerte critique ; changement de fuseau', async () => {
      const { parent, childId } = await familyWithChild(h);
      h.clock.set('2026-09-23T21:30:00Z'); // 23h30 à Paris
      const draft = { ...tip(parent.userId), recipientType: 'child' as const, recipientId: childId };
      const deferred = await h.prisma.$transaction((tx) => service.enqueue(tx, { ...draft, dedupKey: 'q1' }));
      expect(deferred.status).toBe('scheduled');
      const row = await h.prisma.notification.findUniqueOrThrow({ where: { id: deferred.id! } });
      expect(row.scheduledAt?.toISOString()).toBe('2026-09-24T05:30:00.000Z');

      const critical = await h.prisma.$transaction((tx) => service.enqueue(tx, { ...draft, type: 'security', priority: 'critical', dedupKey: 'q2' }));
      expect(critical.status).toBe('sent');

      // Toujours dans la plage au moment de l'échéance ? On reporte encore, sinon on envoie.
      h.clock.set('2026-09-24T05:00:00Z');
      expect(await h.scheduler.releaseDue()).toMatchObject({ released: 0 });
      h.clock.set('2026-09-24T05:31:00Z');
      expect(await h.scheduler.releaseDue()).toMatchObject({ released: 1 });

      // La famille part à New York : 23h30 locales = 03h30 UTC.
      await h.http.put('/v1/notification-preferences').set(auth(parent.token)).send({ timezone: 'America/New_York' }).expect(200);
      h.clock.set('2026-09-25T03:30:00Z');
      const ny = await h.prisma.$transaction((tx) => service.enqueue(tx, { ...draft, dedupKey: 'q3' }));
      const nyRow = await h.prisma.notification.findUniqueOrThrow({ where: { id: ny.id! } });
      expect(nyRow.scheduledAt?.toISOString()).toBe('2026-09-25T11:30:00.000Z'); // 7h30 à New York
      await h.http.put('/v1/notification-preferences').set(auth(parent.token)).send({ timezone: 'Mars/Olympus' }).expect(400);
    });

    it('préférences d’un enfant : lecture et réglage par le parent uniquement', async () => {
      const { parent, child, childId } = await familyWithChild(h);
      const prefs = await h.http.get(`/v1/notification-preferences?childId=${childId}`).set(auth(parent.token)).expect(200);
      expect(prefs.body).toMatchObject({ childId, quietHoursStart: '20:30', quietHoursEnd: '07:30' });
      const upd = await h.http.put(`/v1/notification-preferences?childId=${childId}`).set(auth(parent.token)).send({ quietHoursStart: '21:00', quietHoursEnd: null }).expect(200);
      expect(upd.body).toMatchObject({ quietHoursStart: '21:00', quietHoursEnd: null });
      await h.http.get('/v1/notification-preferences').set(auth(child.token)).expect(403);
      const other = await registerParent(h);
      await h.http.get(`/v1/notification-preferences?childId=${childId}`).set(auth(other.token)).expect(404);
    });

    it('anti-doublon : même clé → une seule notification', async () => {
      const parent = await registerParent(h);
      const a = await h.prisma.$transaction((tx) => service.enqueue(tx, tip(parent.userId, { dedupKey: 'same' })));
      const b = await h.prisma.$transaction((tx) => service.enqueue(tx, tip(parent.userId, { dedupKey: 'same' })));
      expect(a.status).toBe('sent');
      expect(b).toEqual({ id: null, status: 'duplicate' });
    });

    it('regroupement : 3 enfants terminent une activité → « Belle journée », priorité conservée', async () => {
      const parent = await registerParent(h);
      await setFamilyPlan(h, parent.userId, 'family_plus');
      const activity = await catalogActivity(h);
      for (const name of ['Lucas', 'Emma', 'Noah']) {
        const id = await createChild(h, parent, name, 10);
        const child = await linkChild(h, parent, id);
        await completeActivity(h, parent, child, activity.id);
      }
      await h.drain();
      const completed = await notificationsOf(h, parent.userId, 'activity_completed');
      expect(completed).toHaveLength(1);
      expect(completed[0]).toMatchObject({ title: '🎉 Belle journée', body: 'Vos enfants ont terminé 3 activités aujourd’hui.' });
      expect((completed[0].data as { group_count: number }).group_count).toBe(3);

      // Une fois lue, la suivante ouvre un nouveau groupe.
      await h.http.post(`/v1/notifications/${completed[0].id}/read`).set(auth(parent.token)).expect(200);
      const id = await createChild(h, parent, 'Clara', 10);
      await completeActivity(h, parent, await linkChild(h, parent, id), activity.id);
      await h.drain();
      expect(await notificationsOf(h, parent.userId, 'activity_completed')).toHaveLength(2);
    });

    it('moteur SQL encore actif : les consommateurs API se taisent (pas de doublon pendant la migration)', async () => {
      const env = (service as unknown as { env: { NOTIFICATIONS_ENGINE: string } }).env;
      env.NOTIFICATIONS_ENGINE = 'sql';
      try {
        const { parent, child } = await familyWithChild(h);
        await completeActivity(h, parent, child, (await catalogActivity(h)).id);
        await h.drain();
        expect(await h.prisma.notification.count()).toBe(0);
        expect(await h.prisma.outboxEvent.count({ where: { status: 'published' } })).toBeGreaterThan(0);
      } finally {
        env.NOTIFICATIONS_ENGINE = 'api';
      }
    });
  });

  describe('push', () => {
    it('multi-appareils, badge, deep link ; jeton invalide purgé ; aucun appareil → ignoré', async () => {
      const { parent, child, childId } = await familyWithChild(h);
      await h.http.post('/v1/push-tokens').set(auth(parent.token)).send({ token: 'ios-parent-token-1', platform: 'ios' }).expect(200);
      await h.http.post('/v1/push-tokens').set(auth(parent.token)).send({ token: 'android-parent-token', platform: 'android' }).expect(200);
      await h.http.post('/v1/push-tokens').set(auth(parent.token)).send({ token: 'ios-parent-token-dead', platform: 'ios', environment: 'development' }).expect(200);
      h.push.responses.set('ios-parent-token-dead', { ok: false, invalidToken: true, retryable: false, error: 'apns 410 Unregistered' });

      const reward = await h.http.post('/v1/rewards').set(auth(parent.token)).send({ title: 'Vélo', requiredPoints: 0 }).expect(201);
      const req = await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(child.token)).expect(201);
      await h.drain();
      await h.deliveries.processPending();

      // Le jeton mort n'est contacté qu'une fois : il est purgé dès le premier refus APNs.
      expect(h.push.sent.filter((s) => s.target.token === 'ios-parent-token-dead')).toHaveLength(1);
      const rewardTargets = h.push.sent.filter((s) => s.message.data.type === 'reward_requested').map((s) => s.target.token).sort();
      expect(rewardTargets).toEqual(expect.arrayContaining(['android-parent-token', 'ios-parent-token-1']));
      const rewardPush = h.push.sent.find((s) => s.message.data.type === 'reward_requested')!;
      expect(rewardPush.message.data).toMatchObject({ route: `/parent/rewards/requests/${req.body.id}`, entityType: 'reward_request', entityId: req.body.id });
      expect(rewardPush.message.badge).toBeGreaterThanOrEqual(1);
      expect(await h.prisma.pushToken.count({ where: { userId: parent.userId } })).toBe(2);

      const deliveries = await h.prisma.notificationDelivery.findMany({ include: { notification: true } });
      expect(deliveries.every((d) => d.status === 'sent' || d.notification.recipientType === 'child')).toBe(true);
      const childDelivery = deliveries.find((d) => d.notification.recipientId === childId);
      expect(childDelivery?.status ?? 'skipped').toBe('skipped'); // l'enfant n'a pas d'appareil enregistré
    });

    it('erreur temporaire : retentée avec délai croissant, puis abandonnée après 5 essais', async () => {
      const parent = await registerParent(h);
      await h.http.post('/v1/push-tokens').set(auth(parent.token)).send({ token: 'flaky-token-0001', platform: 'android' }).expect(200);
      h.push.responses.set('flaky-token-0001', { ok: false, invalidToken: false, retryable: true, error: 'fcm 503' });
      await h.prisma.$transaction((tx) => service.enqueue(tx, tip(parent.userId)));

      for (let i = 0; i < 5; i++) {
        await h.deliveries.processPending();
        h.clock.advance(3_600_000);
      }
      const d = await h.prisma.notificationDelivery.findFirstOrThrow();
      expect(d).toMatchObject({ status: 'failed', attempts: 5, lastError: 'fcm 503' });
      expect(h.push.sent).toHaveLength(5);
    });

    it('fournisseur non configuré → ignoré ; échec définitif → failed', async () => {
      const parent = await registerParent(h);
      await h.http.post('/v1/push-tokens').set(auth(parent.token)).send({ token: 'web-token-000001', platform: 'web' }).expect(200);
      h.push.responses.set('web-token-000001', { ok: false, invalidToken: false, retryable: false, error: 'web_push_not_supported', skipped: true });
      await h.prisma.$transaction((tx) => service.enqueue(tx, tip(parent.userId, { dedupKey: 'x1' })));
      await h.deliveries.processPending();
      expect((await h.prisma.notificationDelivery.findFirstOrThrow()).status).toBe('skipped');

      h.push.responses.set('web-token-000001', { ok: false, invalidToken: false, retryable: false, error: 'bad payload' });
      await h.prisma.$transaction((tx) => service.enqueue(tx, tip(parent.userId, { dedupKey: 'x2' })));
      await h.deliveries.processPending();
      expect(await h.prisma.notificationDelivery.count({ where: { status: 'failed' } })).toBe(1);
    });

    it('un appareil repris par un autre compte change de propriétaire ; désinscription', async () => {
      const a = await familyWithChild(h);
      const b = await registerParent(h);
      await h.http.post('/v1/push-tokens').set(auth(a.parent.token)).send({ token: 'shared-ipad-token', platform: 'ios' }).expect(200);
      await h.http.post('/v1/push-tokens').set(auth(a.child.token)).send({ token: 'shared-ipad-token', platform: 'ios' }).expect(200);
      expect(await h.prisma.pushToken.findUniqueOrThrow({ where: { token: 'shared-ipad-token' } })).toMatchObject({ childId: a.childId, userId: null });
      await h.http.post('/v1/push-tokens').set(auth(b.token)).send({ token: 'shared-ipad-token', platform: 'ios' }).expect(200);
      await h.http.post('/v1/push-tokens/unregister').set(auth(a.child.token)).send({ token: 'shared-ipad-token' }).expect(200);
      expect(await h.prisma.pushToken.count()).toBe(1);
      await h.http.post('/v1/push-tokens/unregister').set(auth(b.token)).send({ token: 'shared-ipad-token' }).expect(200);
      expect(await h.prisma.pushToken.count()).toBe(0);
    });
  });

  describe('email', () => {
    it('canal email du moteur : relayé par la file d’emails, avec lien vers l’app', async () => {
      const parent = await registerParent(h);
      const draft = { ...templates.weeklySummary(parent.userId, 8, 260, '2026-W39'), channels: ['in_app', 'email'] as ('in_app' | 'email')[] };
      await h.prisma.$transaction((tx) => service.enqueue(tx, draft));
      await h.deliveries.processPending();
      const d = await h.prisma.notificationDelivery.findFirstOrThrow({ where: { channel: 'email' } });
      expect(d.status).toBe('sent');
      await h.emails.processPending();
      const mail = h.mailer.sent.find((m) => m.subject === '📊 Votre semaine avec Rekonect');
      expect(mail?.to).toBe(parent.email);
      expect(mail?.text).toContain('8 activités et passé 4h20 hors écran');
      expect(mail?.text).toContain('Ouvrir Rekonect : rekonect://parent/dashboard?view=week');
      // Rejouer la livraison ne renvoie pas l'email.
      await h.prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: 'pending', nextAttemptAt: h.clock.now() } });
      await h.deliveries.processPending();
      await h.emails.processPending();
      expect(h.mailer.sent.filter((m) => m.subject === '📊 Votre semaine avec Rekonect')).toHaveLength(1);
    });

    it('aucun email pour un enfant ni pour une activité terminée', async () => {
      const { parent, child } = await familyWithChild(h);
      await completeActivity(h, parent, child, (await catalogActivity(h)).id);
      await h.drain();
      expect(await h.prisma.notificationDelivery.count({ where: { channel: 'email' } })).toBe(0);
    });
  });
});
