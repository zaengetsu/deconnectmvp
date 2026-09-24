import { auth, catalogActivity, completeActivity, familyWithChild, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

/** Routes ajoutées pour que l'app mobile n'appelle plus Supabase (compte, preuves, statistiques, famille). */
describe('App mobile sans Supabase', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.mailer.sent.length = 0;
    await resetDb(h.prisma);
  });

  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(200, 1)]);
  const MOV = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(64, 1)]);

  describe('compte', () => {
    it('changer de mot de passe : mot de passe actuel exigé, autres sessions fermées, email de sécurité', async () => {
      const parent = await registerParent(h);
      await h.http.post('/v1/auth/password/change').set(auth(parent.token)).send({ currentPassword: 'faux', newPassword: 'nouveau-solide' }).expect(401);
      await h.http.post('/v1/auth/password/change').set(auth(parent.token)).send({ currentPassword: 'motdepasse-solide', newPassword: 'court' }).expect(400);
      const res = await h.http.post('/v1/auth/password/change').set(auth(parent.token)).send({ currentPassword: 'motdepasse-solide', newPassword: 'nouveau-solide' }).expect(200);
      expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), user: { email: parent.email } });
      await h.http.post('/v1/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(401);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(200);
      await h.http.post('/v1/auth/login').send({ email: parent.email, password: 'motdepasse-solide' }).expect(401);
      await h.http.post('/v1/auth/login').send({ email: parent.email, password: 'nouveau-solide' }).expect(200);
      await h.drain();
      expect(h.mailer.sent.map((m) => m.subject)).toContain('Votre mot de passe a été modifié');
    });

    it('changer d’adresse : confirmée par le mot de passe, unique, ancienne adresse prévenue', async () => {
      const parent = await registerParent(h);
      const other = await registerParent(h, 'Autre Parent');
      await h.http.post('/v1/auth/email').set(auth(parent.token)).send({ email: 'nouvelle@test.rekonect.app', password: 'faux' }).expect(401);
      await h.http.post('/v1/auth/email').set(auth(parent.token)).send({ email: other.email, password: 'motdepasse-solide' }).expect(409);
      const res = await h.http.post('/v1/auth/email').set(auth(parent.token)).send({ email: 'Nouvelle@Test.Rekonect.app', password: 'motdepasse-solide' }).expect(200);
      expect(res.body.user.email).toBe('nouvelle@test.rekonect.app');
      expect((await h.http.get('/v1/profile').set(auth(parent.token))).body.email).toBe('nouvelle@test.rekonect.app');
      await h.http.post('/v1/auth/login').send({ email: 'nouvelle@test.rekonect.app', password: 'motdepasse-solide' }).expect(200);
      await h.drain();
      const notice = h.mailer.sent.find((m) => m.subject === 'L’adresse de votre compte Rekonect a changé');
      expect(notice?.to).toBe(parent.email);
      // Même adresse : rien à faire.
      await h.http.post('/v1/auth/email').set(auth(parent.token)).send({ email: 'nouvelle@test.rekonect.app', password: 'motdepasse-solide' }).expect(200);
    });

    it('un enfant ne peut pas changer de mot de passe', async () => {
      const { child } = await familyWithChild(h);
      await h.http.post('/v1/auth/password/change').set(auth(child.token)).send({ currentPassword: 'x', newPassword: 'nouveau-solide' }).expect(403);
    });
  });

  describe('famille', () => {
    it('invitation co-parent par code court à 6 caractères', async () => {
      const owner = await registerParent(h, 'Camille Martin');
      await setFamilyPlan(h, owner.userId, 'family_plus');
      const inv = await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({ memberRole: 'co_parent' }).expect(201);
      expect(inv.body.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(inv.body.token).toMatch(/^[0-9a-f]{40}$/);
      const partner = await registerParent(h, 'Alex Martin');
      await h.http.post('/v1/family/invitations/accept').set(auth(partner.token)).send({ token: 'ZZZZZZ' }).expect(400);
      const ok = await h.http.post('/v1/family/invitations/accept').set(auth(partner.token)).send({ token: inv.body.code.toLowerCase() }).expect(200);
      expect(ok.body).toMatchObject({ ownerName: 'Camille Martin', role: 'co_parent' });
      const members = await h.http.get('/v1/family/members').set(auth(owner.token)).expect(200);
      expect(members.body.members[0]).toMatchObject({ status: 'active', memberRole: 'co_parent' });
      // Le lien long fonctionne toujours (invitation suivante).
      const inv2 = await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({}).expect(201);
      const third = await registerParent(h, 'Sam');
      await h.http.post('/v1/family/invitations/accept').set(auth(third.token)).send({ token: inv2.body.token }).expect(200);
    });
  });

  describe('preuves d’activité (remplace le bucket Supabase)', () => {
    it('photo envoyée avant de terminer, servie sans cache partagé, verrouillée après envoi', async () => {
      const { child } = await familyWithChild(h);
      const other = await familyWithChild(h, { name: 'Lucas' });
      const activity = await catalogActivity(h);
      const ca = (await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id }).expect(201)).body;

      await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(other.child.token)).set('Content-Type', 'image/jpeg').send(JPEG).expect(404);
      await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(child.token)).set('Content-Type', 'image/png').send(Buffer.from('pas une image')).expect(400);
      await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(child.token)).set('Content-Type', 'video/mp4').send(JPEG).expect(400);

      const up = await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(child.token)).set('Content-Type', 'image/jpeg').send(JPEG).expect(201);
      expect(up.body).toMatchObject({ contentType: 'image/jpeg', size: JPEG.length, type: 'image' });
      expect(up.body.url).toMatch(new RegExp(`/v1/media/${up.body.id}$`));

      const file = await h.http.get(`/v1/media/${up.body.id}`).expect(200);
      expect(file.headers['cache-control']).toBe('private, max-age=86400');
      expect(file.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.compare(file.body as Buffer, JPEG)).toBe(0);

      const video = await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(child.token)).set('Content-Type', 'video/mp4').send(MP4).expect(201);
      expect(video.body).toMatchObject({ contentType: 'video/mp4', type: 'video' });
      await h.http.delete(`/v1/child-activities/${ca.id}/proof/${video.body.id}`).set(auth(child.token)).expect(200);
      await h.http.delete(`/v1/child-activities/${ca.id}/proof/${video.body.id}`).set(auth(child.token)).expect(404);
      const mov = await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(child.token)).set('Content-Type', 'video/quicktime').send(MOV).expect(201);
      expect(mov.body.contentType).toBe('video/quicktime');

      await h.http.post(`/v1/child-activities/${ca.id}/submit`).set(auth(child.token)).send({ note: 'fait', proofUrl: up.body.url, proofType: 'photo' }).expect(200);
      await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(child.token)).set('Content-Type', 'image/jpeg').send(JPEG).expect(409);
      await h.http.delete(`/v1/child-activities/${ca.id}/proof/${up.body.id}`).set(auth(child.token)).expect(409);
    });

    it('preuve vidéo acceptée à l’envoi', async () => {
      const { child } = await familyWithChild(h);
      const activity = await catalogActivity(h);
      const ca = (await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id }).expect(201)).body;
      const up = await h.http.post(`/v1/child-activities/${ca.id}/proof`).set(auth(child.token)).set('Content-Type', 'video/mp4').send(MP4).expect(201);
      const res = await h.http.post(`/v1/child-activities/${ca.id}/submit`).set(auth(child.token)).send({ proofUrl: up.body.url, proofType: 'video' }).expect(200);
      expect(res.body).toMatchObject({ status: 'submitted', proofType: 'video' });
    });
  });

  describe('statistiques et centre de notifications', () => {
    it('totaux de points et activités de la semaine', async () => {
      const { parent, child, childId } = await familyWithChild(h);
      const activity = await catalogActivity(h);
      await completeActivity(h, parent, child, activity.id);
      const stats = await h.http.get(`/v1/children/${childId}/stats`).set(auth(parent.token)).expect(200);
      expect(stats.body).toMatchObject({ totalEarned: activity.points, totalSpent: 0, activitiesValidated: 1 });
      expect(stats.body.recent.validated).toHaveLength(1);
      expect(stats.body.recent.pointsEarned).toBe(activity.points);
      const later = await h.http.get(`/v1/children/${childId}/stats`).query({ since: new Date(TEST_NOW.getTime() + 3_600_000).toISOString() }).set(auth(child.token)).expect(200);
      expect(later.body.recent.validated).toHaveLength(0);
      const stranger = await registerParent(h);
      await h.http.get(`/v1/children/${childId}/stats`).set(auth(stranger.token)).expect(404);
    });

    it('« effacer les lues » masque les notifications lues seulement', async () => {
      const { parent, child } = await familyWithChild(h);
      const activity = await catalogActivity(h);
      await completeActivity(h, parent, child, activity.id);
      await h.drain();
      const before = (await h.http.get('/v1/notifications').set(auth(child.token)).expect(200)).body.items;
      expect(before.length).toBeGreaterThan(0);
      await h.http.post(`/v1/notifications/${before[0].id}/read`).set(auth(child.token)).expect(200);
      const res = await h.http.post('/v1/notifications/remove-read').set(auth(child.token)).expect(200);
      expect(res.body.removed).toBe(1);
      const after = (await h.http.get('/v1/notifications').set(auth(child.token)).expect(200)).body.items;
      expect(after).toHaveLength(before.length - 1);
    });
  });
});
