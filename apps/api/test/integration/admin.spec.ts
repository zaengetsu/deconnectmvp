import { auth, catalogActivity, completeActivity, createAdmin, familyWithChild, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

describe('Back-office Rekonect', () => {
  let h: Harness;
  let admin: { token: string; userId: string };
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.mailer.sent.length = 0;
    await resetDb(h.prisma);
    admin = await createAdmin(h);
  });

  it('réservé aux administrateurs', async () => {
    const parent = await registerParent(h);
    await h.http.get('/v1/admin/overview').set(auth(parent.token)).expect(403);
    await h.http.get('/v1/admin/overview').expect(401);
  });

  describe('pilotage', () => {
    it('vue d’ensemble : KPIs, santé, alertes, top activités et récompenses, familles actives par mois', async () => {
      const a = await familyWithChild(h, { name: 'Emma' });
      const b = await familyWithChild(h, { name: 'Lucas' });
      await setFamilyPlan(h, a.parent.userId, 'family');
      const act = await catalogActivity(h);
      await completeActivity(h, a.parent, a.child, act.id);
      await completeActivity(h, b.parent, b.child, act.id);
      const ca = await h.http.post('/v1/child-activities').set(auth(b.child.token)).send({ activityId: act.id }).expect(201);
      await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(b.child.token)).send({}).expect(200);
      await h.http.post(`/v1/child-activities/${ca.body.id}/reject`).set(auth(b.parent.token)).send({ reason: 'pas fini' }).expect(200);

      await h.prisma.child.update({ where: { id: a.childId }, data: { totalPoints: 10_000 } });
      const catalog = await h.http.get('/v1/rewards/catalog').set(auth(a.parent.token)).expect(200);
      const mine = await h.http.post(`/v1/rewards/catalog/${catalog.body[0].id}/activate`).set(auth(a.parent.token)).send({ requiredPoints: 0 }).expect(201);
      const req = await h.http.post(`/v1/rewards/${mine.body.id}/request`).set(auth(a.child.token)).expect(201);
      await h.http.post(`/v1/reward-requests/${req.body.id}/approve`).set(auth(a.parent.token)).send({}).expect(200);

      const o = await h.http.get('/v1/admin/overview?days=30').set(auth(admin.token)).expect(200);
      expect(o.body).toMatchObject({
        environment: 'development',
        days: 30,
        alerts: { pendingOffers: 0, failedPayments: 0, flaggedActivities: 0 },
        kpis: {
          activeFamilies: { value: 2, newFamilies: 2 },
          children: { value: 2, perFamily: 1 },
          validatedActivities: { value: 2, perActiveChild: 1 },
          mrr: { valueCents: 499 },
        },
        health: { refusalRate: 33.3, streaks7Plus: 0 },
      });
      await h.http.get('/v1/admin/overview?days=12').set(auth(admin.token)).expect(400);

      const months = await h.http.get('/v1/admin/overview/active-families').set(auth(admin.token)).expect(200);
      expect(months.body).toHaveLength(12);
      expect(months.body.at(-1)).toMatchObject({ label: 'S', month: '2026-09', paid: 1, free: 1 });

      const top = await h.http.get('/v1/admin/overview/top-activities').set(auth(admin.token)).expect(200);
      expect(top.body[0]).toMatchObject({ id: act.id, validated: 2, validationRate: 66.7 });
      const rewards = await h.http.get('/v1/admin/overview/top-rewards').set(auth(admin.token)).expect(200);
      expect(rewards.body[0]).toMatchObject({ rank: '01', title: catalog.body[0].title, partner: false, exchanges: 1 });
      expect(rewards.body[0].source).toMatch(/^Native · /);
    });

    it('recherche ⌘K : familles, activités, partenaires', async () => {
      await registerParent(h, 'Camille Dupont');
      const res = await h.http.get('/v1/admin/search?q=dupont').set(auth(admin.token)).expect(200);
      expect(res.body.families[0]).toMatchObject({ name: 'Famille Dupont', subtitle: 'Camille Dupont' });
      expect((await h.http.get('/v1/admin/search?q=d').set(auth(admin.token))).body).toEqual({ families: [], activities: [], partners: [] });
    });
  });

  describe('catalogue', () => {
    it('liste filtrée, fiche, création, modification, âge invalide', async () => {
      const list = await h.http.get('/v1/admin/activities?limit=5').set(auth(admin.token)).expect(200);
      expect(list.body.items).toHaveLength(5);
      expect(list.body.nextCursor).toBeTruthy();
      expect(list.body.total).toBe(58);
      expect(list.body.categories.length).toBe(8);
      const next = await h.http.get(`/v1/admin/activities?limit=5&cursor=${list.body.nextCursor}`).set(auth(admin.token)).expect(200);
      expect(next.body.items[0].id).not.toBe(list.body.items[0].id);

      const cat = list.body.categories[0];
      const created = await h.http
        .post('/v1/admin/activities')
        .set(auth(admin.token))
        .send({ title: 'Cabane dans le salon', categoryId: cat.id, points: 30, minAge: 5, maxAge: 10, difficulty: 'easy', catalogStatus: 'published' })
        .expect(201);
      expect(created.body).toMatchObject({ activityType: 'catalog', isActive: true, catalogStatus: 'published' });
      await h.http.post('/v1/admin/activities').set(auth(admin.token)).send({ title: 'Âge inversé', points: 1, minAge: 12, maxAge: 6, difficulty: 'easy' }).expect(400);
      const upd = await h.http.patch(`/v1/admin/activities/${created.body.id}`).set(auth(admin.token)).send({ catalogStatus: 'archived' }).expect(200);
      expect(upd.body.isActive).toBe(false);
      const search = await h.http.get('/v1/admin/activities?q=cabane&status=archived').set(auth(admin.token)).expect(200);
      expect(search.body.items.map((a: { id: string }) => a.id)).toEqual([created.body.id]);
      const detail = await h.http.get(`/v1/admin/activities/${created.body.id}`).set(auth(admin.token)).expect(200);
      expect(detail.body).toMatchObject({ title: 'Cabane dans le salon', assigned30d: 0, families: 0, reports: [] });
      await h.http.get('/v1/admin/activities/00000000-0000-4000-8000-000000000000').set(auth(admin.token)).expect(404);
      await h.http.patch('/v1/admin/activities/00000000-0000-4000-8000-000000000000').set(auth(admin.token)).send({ points: 2 }).expect(404);
    });

    it('import CSV : brouillons créés, erreurs par ligne', async () => {
      const csv = ['titre;catégorie;points;difficulté;âge min;âge max;consigne', 'Herbier;nature;20;facile;6;12;Ramasse 5 feuilles', 'Mystère;inconnue;20;facile;6;12;', ';sport;x;facile;6;12;'].join('\n');
      await h.prisma.activityCategory.upsert({ where: { slug: 'nature' }, update: {}, create: { name: 'Nature', slug: 'nature' } });
      const res = await h.http.post('/v1/admin/activities/import').set(auth(admin.token)).send({ csv }).expect(200);
      expect(res.body.created).toBe(1);
      expect(res.body.errors.map((e: { line: number }) => e.line)).toEqual([3, 4]);
      expect(res.body.errors[0].message).toBe('Catégorie inconnue : inconnue');
      expect(await h.prisma.activity.findFirst({ where: { title: 'Herbier', catalogStatus: 'draft', isActive: false } })).not.toBeNull();
    });

    it('signalements des familles : 3 signalements → « Signalée », alerte, résolution', async () => {
      const act = await catalogActivity(h);
      for (let i = 0; i < 3; i++) {
        const p = await registerParent(h);
        await h.http.post(`/v1/activities/${act.id}/report`).set(auth(p.token)).send({ reason: 'unclear', details: 'Consigne floue' }).expect(201);
        if (i === 0) await h.http.post(`/v1/activities/${act.id}/report`).set(auth(p.token)).send({ reason: 'other' }).expect(409);
      }
      expect((await h.prisma.activity.findUniqueOrThrow({ where: { id: act.id } })).catalogStatus).toBe('flagged');
      const o = await h.http.get('/v1/admin/overview').set(auth(admin.token)).expect(200);
      expect(o.body.alerts).toMatchObject({ flaggedActivities: 1, flagReasons: ['unclear'] });
      const reports = await h.http.get('/v1/admin/activity-reports').set(auth(admin.token)).expect(200);
      expect(reports.body).toHaveLength(3);
      expect(reports.body[0].activity).toMatchObject({ id: act.id, catalogStatus: 'flagged' });
      await h.http.post(`/v1/admin/activities/${act.id}/resolve-reports`).set(auth(admin.token)).send({ resolution: 'Consigne réécrite', status: 'published' }).expect(200);
      expect((await h.http.get('/v1/admin/activity-reports').set(auth(admin.token))).body).toHaveLength(0);
      expect((await h.prisma.activity.findUniqueOrThrow({ where: { id: act.id } })).catalogStatus).toBe('published');
      const p = await registerParent(h);
      await h.http.post('/v1/activities/00000000-0000-4000-8000-000000000000/report').set(auth(p.token)).send({ reason: 'other' }).expect(404);
    });

    it('catégories, récompenses natives (stats par catégorie), badges', async () => {
      await h.http.post('/v1/admin/categories').set(auth(admin.token)).send({ name: 'Jardin', slug: 'jardin' }).expect(201);
      await h.http.post('/v1/admin/categories').set(auth(admin.token)).send({ name: 'Jardin 2', slug: 'jardin' }).expect(409);

      const r = await h.http.post('/v1/admin/rewards').set(auth(admin.token)).send({ title: 'Soirée pyjama', requiredPoints: 120, rewardCategory: 'moment' }).expect(201);
      const f = await familyWithChild(h);
      await h.prisma.child.update({ where: { id: f.childId }, data: { totalPoints: 10_000 } });
      await h.http.post(`/v1/rewards/catalog/${r.body.id}/activate`).set(auth(f.parent.token)).send({ requiredPoints: 0 }).expect(201);
      const mine = await h.prisma.reward.findFirstOrThrow({ where: { sourceRewardId: r.body.id } });
      const req = await h.http.post(`/v1/rewards/${mine.id}/request`).set(auth(f.child.token)).expect(201);
      await h.http.post(`/v1/reward-requests/${req.body.id}/approve`).set(auth(f.parent.token)).send({}).expect(200);

      const list = await h.http.get('/v1/admin/rewards').set(auth(admin.token)).expect(200);
      const row = list.body.items.find((x: { id: string }) => x.id === r.body.id);
      expect(row).toMatchObject({ families: 1, exchanges30d: 1 });
      const moment = list.body.categories.find((c: { key: string }) => c.key === 'moment');
      expect(moment.share).toBe(100);
      await h.http.patch(`/v1/admin/rewards/${r.body.id}`).set(auth(admin.token)).send({ isActive: false }).expect(200);
      await h.http.patch(`/v1/admin/rewards/${mine.id}`).set(auth(admin.token)).send({ isActive: false }).expect(404); // copie famille

      await h.http.post('/v1/admin/badges').set(auth(admin.token)).send({ name: 'Marathonien', conditionType: 'activities_validated', conditionValue: 100 }).expect(201);
    });
  });

  describe('familles et support', () => {
    it('liste (plan effectif, statut, filtres), statistiques, fiche détaillée', async () => {
      const a = await familyWithChild(h);
      await h.prisma.profile.update({ where: { id: a.parent.userId }, data: { fullName: 'Camille Dupont', city: 'Lyon' } });
      await setFamilyPlan(h, a.parent.userId, 'family_plus');
      const b = await registerParent(h, 'Paul Martin');
      await h.prisma.subscription.updateMany({ where: { parentId: b.userId }, data: { compPlan: 'family', compUntil: new Date('2026-12-01') } });
      const c = await registerParent(h, 'Ines Petit');
      await h.prisma.subscription.updateMany({ where: { parentId: c.userId }, data: { plan: 'family', status: 'past_due', amountCents: 499 } });
      await h.prisma.user.update({ where: { id: c.userId }, data: { lastLoginAt: new Date('2026-06-01') } });

      const all = await h.http.get('/v1/admin/families').set(auth(admin.token)).expect(200);
      expect(all.body.items).toHaveLength(3);
      const byName = Object.fromEntries(all.body.items.map((i: { name: string }) => [i.name, i]));
      expect(byName['Famille Dupont']).toMatchObject({ plan: 'family_plus', planName: 'Famille+', children: 1, city: 'Lyon', status: 'active', statusLabel: 'Active' });
      expect(byName['Famille Martin']).toMatchObject({ plan: 'family' });
      expect(byName['Famille Petit']).toMatchObject({ status: 'past_due', statusLabel: 'Impayé' });
      expect((await h.http.get('/v1/admin/families?plan=family').set(auth(admin.token))).body.items.map((i: { name: string }) => i.name)).toEqual(['Famille Petit', 'Famille Martin']); // impayé = période de grâce, le plan reste acquis
      expect((await h.http.get('/v1/admin/families?status=past_due').set(auth(admin.token))).body.items).toHaveLength(1);
      expect((await h.http.get('/v1/admin/families?q=lyon').set(auth(admin.token))).body.items).toHaveLength(1);

      const stats = await h.http.get('/v1/admin/families/stats').set(auth(admin.token)).expect(200);
      expect(stats.body).toMatchObject({ families: 3, children: 1, newFamilies30d: 3, deviceLinkedRate: 100 });

      const detail = await h.http.get(`/v1/admin/families/${a.parent.userId}`).set(auth(admin.token)).expect(200);
      expect(detail.body).toMatchObject({ name: 'Famille Dupont', planName: 'Famille+', parents: [{ role: 'administrateur' }], children: [{ displayName: 'Emma', levelName: expect.any(String) }], activity30d: 0 });
      await h.http.get('/v1/admin/families/00000000-0000-4000-8000-000000000000').set(auth(admin.token)).expect(404);
    });

    it('désactivation du compte : connexion et rafraîchissement refusés, réactivation', async () => {
      const p = await registerParent(h);
      await h.http.patch(`/v1/admin/users/${p.userId}/disabled`).set(auth(admin.token)).send({ disabled: true }).expect(200);
      expect((await h.http.post('/v1/auth/login').send({ email: p.email, password: 'motdepasse-solide' }).expect(401)).body.code).toBe('ACCOUNT_DISABLED');
      await h.http.post('/v1/auth/refresh').send({ refreshToken: p.refreshToken }).expect(401);
      await h.http.get('/v1/children').set(auth(p.token)).expect(401);
      await h.http.patch(`/v1/admin/users/${admin.userId}/disabled`).set(auth(admin.token)).send({ disabled: true }).expect(404);
      await h.http.patch(`/v1/admin/users/${p.userId}/disabled`).set(auth(admin.token)).send({ disabled: false }).expect(200);
      await h.http.post('/v1/auth/login').send({ email: p.email, password: 'motdepasse-solide' }).expect(200);
    });

    it('renvoi de l’email de connexion et suppression RGPD confirmée par email', async () => {
      const f = await familyWithChild(h);
      const resend = await h.http.post(`/v1/admin/families/${f.parent.userId}/resend-login`).set(auth(admin.token)).expect(200);
      expect(resend.body.email).toBe(f.parent.email);
      expect(h.mailer.sent.at(-1)?.to).toBe(f.parent.email);

      await h.http.delete(`/v1/admin/families/${f.parent.userId}`).set(auth(admin.token)).send({ confirmEmail: 'autre@x.fr' }).expect(400);
      await h.http.delete(`/v1/admin/families/${f.parent.userId}`).set(auth(admin.token)).send({ confirmEmail: f.parent.email.toUpperCase() }).expect(200);
      expect(await h.prisma.profile.findUnique({ where: { id: f.parent.userId } })).toBeNull();
      expect(await h.prisma.child.findUnique({ where: { id: f.childId } })).toBeNull();
      expect(await h.prisma.user.findUnique({ where: { id: f.parent.userId } })).toBeNull();
      await h.http.post('/v1/auth/login').send({ email: f.parent.email, password: 'motdepasse-solide' }).expect(401);
      await h.http.delete(`/v1/admin/families/${f.parent.userId}`).set(auth(admin.token)).send({ confirmEmail: f.parent.email }).expect(404);
    });
  });

  describe('supervision', () => {
    it('journal des notifications, envoi de test, événements et relance', async () => {
      const f = await familyWithChild(h);
      await h.http.post('/v1/admin/notifications/test').set(auth(admin.token)).send({ recipientType: 'parent', recipientId: f.parent.userId, title: 'Test', body: 'Bonjour' }).expect(200);
      const log = await h.http.get('/v1/admin/notifications?type=tip').set(auth(admin.token)).expect(200);
      expect(log.body.items[0]).toMatchObject({ title: 'Test', recipientId: f.parent.userId, type: 'tip' });

      const events = await h.http.get('/v1/admin/events?limit=50').set(auth(admin.token)).expect(200);
      expect(events.body.items.length).toBeGreaterThan(0);
      const ev = events.body.items[0];
      expect(typeof ev.seq).toBe('string');
      await h.prisma.outboxEvent.update({ where: { id: ev.id }, data: { status: 'dead', attempts: 10, lastError: 'boom' } });
      expect((await h.http.get('/v1/admin/events?status=dead').set(auth(admin.token))).body.items).toHaveLength(1);
      await h.http.post(`/v1/admin/events/${ev.id}/retry`).set(auth(admin.token)).expect(200);
      expect(await h.prisma.outboxEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ status: 'pending', attempts: 0, lastError: null });
      await h.http.post('/v1/admin/events/00000000-0000-4000-8000-000000000000/retry').set(auth(admin.token)).expect(404);
    });

    it('équipe Rekonect : création et liste des administrateurs', async () => {
      const res = await h.http.post('/v1/admin/admins').set(auth(admin.token)).send({ email: ' Ops@Rekonect.app ', fullName: 'Ops', password: 'un-mot-de-passe-long' }).expect(201);
      expect(res.body).toMatchObject({ email: 'ops@rekonect.app', role: 'admin' });
      await h.http.post('/v1/admin/admins').set(auth(admin.token)).send({ email: 'ops@rekonect.app', fullName: 'Ops', password: 'un-mot-de-passe-long' }).expect(409);
      expect((await h.http.get('/v1/admin/admins').set(auth(admin.token))).body).toHaveLength(2);
      await h.http.post('/v1/auth/login').send({ email: 'ops@rekonect.app', password: 'un-mot-de-passe-long' }).expect(200);
    });
  });
});
