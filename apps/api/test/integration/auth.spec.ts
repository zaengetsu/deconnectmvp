import * as bcrypt from 'bcryptjs';
import { auth, createChild, familyWithChild, linkChild, registerParent, uniqueEmail } from '../support/fixtures';
import { createHarness, type Harness, resetDb } from '../support/harness';

describe('Identité : comptes, sessions, enfants, partenaires', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    h.mailer.sent.length = 0;
  });

  describe('parents', () => {
    it('inscription : compte, profil, abonnement gratuit, préférences, email de bienvenue asynchrone', async () => {
      const email = uniqueEmail();
      const res = await h.http.post('/v1/auth/register').send({ email: email.toUpperCase(), password: 'motdepasse-solide', fullName: 'Léa' }).expect(201);
      expect(res.body.user).toMatchObject({ email, role: 'parent', fullName: 'Léa' });
      expect(res.body.accessToken).toBeTruthy();
      const id = res.body.user.id;
      expect(await h.prisma.profile.findUnique({ where: { id } })).toMatchObject({ email, role: 'parent' });
      expect(await h.prisma.subscription.findFirst({ where: { parentId: id } })).toMatchObject({ plan: 'free' });
      expect(await h.prisma.notificationPreference.count({ where: { parentId: id, childId: null } })).toBe(1);

      expect(h.mailer.sent).toHaveLength(0);
      await h.drain();
      expect(h.mailer.sent.map((m) => m.subject)).toEqual(['Bienvenue sur Rekonect']);

      await h.http.post('/v1/auth/register').send({ email, password: 'motdepasse-solide', fullName: 'Léa' }).expect(409);
      await h.http.post('/v1/auth/register').send({ email: 'x', password: 'court', fullName: '' }).expect(400);
    });

    it('connexion : identifiants, compte désactivé, ré-hachage des mots de passe importés de Supabase', async () => {
      const email = uniqueEmail();
      const legacy = await bcrypt.hash('ancien-mot-de-passe', 10);
      const user = await h.prisma.user.create({ data: { email, role: 'parent', passwordHash: legacy } });
      await h.prisma.profile.create({ data: { id: user.id, email } });

      await h.http.post('/v1/auth/login').send({ email, password: 'mauvais' }).expect(401);
      await h.http.post('/v1/auth/login').send({ email: uniqueEmail(), password: 'x' }).expect(401);
      const ok = await h.http.post('/v1/auth/login').send({ email, password: 'ancien-mot-de-passe' }).expect(200);
      expect(ok.body.user.id).toBe(user.id);
      const after = await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.passwordHash).toMatch(/^\$argon2id\$/);
      await h.http.post('/v1/auth/login').send({ email, password: 'ancien-mot-de-passe' }).expect(200);

      await h.prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
      await h.http.post('/v1/auth/login').send({ email, password: 'ancien-mot-de-passe' }).expect(401);
    });

    it('refresh : rotation, détection de réutilisation, expiration', async () => {
      const parent = await registerParent(h);
      const r1 = await h.http.post('/v1/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(200);
      expect(r1.body.refreshToken).not.toBe(parent.refreshToken);
      await h.http.get('/v1/auth/me').set(auth(r1.body.accessToken)).expect(200);

      // Réutilisation de l'ancien jeton : toute la famille de sessions est révoquée.
      await h.http.post('/v1/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(401);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: 'x'.repeat(40) }).expect(401);

      const again = await h.http.post('/v1/auth/login').send({ email: parent.email, password: 'motdepasse-solide' }).expect(200);
      h.clock.advance(31 * 86_400_000);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: again.body.refreshToken }).expect(401);
      h.clock.set(new Date('2026-09-23T10:00:00.000Z'));
    });

    it('déconnexion : révoque la session et détache l’appareil', async () => {
      const parent = await registerParent(h);
      await h.http.post('/v1/push-tokens').set(auth(parent.token)).send({ token: 'apns-token-parent-001', platform: 'ios' }).expect(200);
      await h.http.post('/v1/auth/logout').set(auth(parent.token)).send({ refreshToken: parent.refreshToken, pushToken: 'apns-token-parent-001' }).expect(200);
      expect(await h.prisma.pushToken.count()).toBe(0);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(401);
      await h.http.post('/v1/auth/logout').send({}).expect(401);
    });

    it('jeton absent ou invalide → 401', async () => {
      await h.http.get('/v1/auth/me').expect(401);
      await h.http.get('/v1/auth/me').set({ Authorization: 'Bearer faux' }).expect(401);
      await h.http.get('/health').expect(200);
    });

    it('mot de passe oublié : lien à usage unique, sessions fermées, pas d’énumération', async () => {
      const parent = await registerParent(h);
      await h.http.post('/v1/auth/password/forgot').send({ email: uniqueEmail() }).expect(200);
      expect(h.mailer.sent).toHaveLength(0);

      await h.http.post('/v1/auth/password/forgot').send({ email: parent.email }).expect(200);
      const mail = h.mailer.sent.find((m) => m.subject.includes('Réinitialisation'))!;
      const token = decodeURIComponent(/token=([^\s"&]+)/.exec(mail.text)![1]);
      expect(mail.text).toContain('rekonect://reset-password');

      await h.http.post('/v1/auth/password/reset').send({ token, password: 'nouveau-mot-de-passe' }).expect(200);
      await h.http.post('/v1/auth/password/reset').send({ token, password: 'encore-un-autre' }).expect(400);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(401);
      await h.http.post('/v1/auth/login').send({ email: parent.email, password: 'nouveau-mot-de-passe' }).expect(200);
      expect(h.mailer.sent.some((m) => m.subject === 'Votre mot de passe a été modifié')).toBe(true);
    });
  });

  describe('enfants', () => {
    it('liaison par QR (jeton long) ou code court, puis connexion PIN', async () => {
      const parent = await registerParent(h);
      const childId = await createChild(h, parent, 'Noah', 8);
      const code = await h.http.post(`/v1/children/${childId}/link-code`).set(auth(parent.token)).expect(201);
      expect(code.body.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);

      const res = await h.http.post('/v1/auth/child/link').send({ code: code.body.token.toUpperCase(), pin: '4321' }).expect(200);
      expect(res.body.child).toMatchObject({ id: childId, displayName: 'Noah' });
      expect(res.body.parentName).toBe('Camille Martin');
      await h.http.post('/v1/auth/child/link').send({ code: code.body.token, pin: '4321' }).expect(400);

      const me = await h.http.get('/v1/auth/me').set(auth(res.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ kind: 'child', child: { id: childId } });

      const second = await h.http.post(`/v1/children/${childId}/link-code`).set(auth(parent.token)).expect(201);
      const spaced = `${second.body.code.slice(0, 3)}-${second.body.code.slice(3).toLowerCase()}`;
      await h.http.post('/v1/auth/child/link').send({ code: spaced, pin: '5678' }).expect(200);

      await h.http.post('/v1/auth/child/login').send({ childId, pin: '5678' }).expect(200);
      await h.drain();
      expect(await h.prisma.notification.count({ where: { recipientId: parent.userId, type: 'child_device_linked' } })).toBe(2);
    });

    it('code expiré ou inconnu refusé', async () => {
      const parent = await registerParent(h);
      const childId = await createChild(h, parent);
      const code = await h.http.post(`/v1/children/${childId}/link-code`).set(auth(parent.token)).expect(201);
      h.clock.advance(16 * 60_000);
      await h.http.post('/v1/auth/child/link').send({ code: code.body.code, pin: '1234' }).expect(400);
      h.clock.set(new Date('2026-09-23T10:00:00.000Z'));
      await h.http.post('/v1/auth/child/link').send({ code: 'ZZZZZZ', pin: '1234' }).expect(400);
    });

    it('PIN : 5 essais puis blocage 15 minutes, déblocage automatique', async () => {
      const { childId } = await familyWithChild(h);
      for (let i = 0; i < 4; i++) {
        const r = await h.http.post('/v1/auth/child/login').send({ childId, pin: '0000' }).expect(401);
        expect(r.body.code).toBe('PIN_INVALID');
      }
      const locked = await h.http.post('/v1/auth/child/login').send({ childId, pin: '0000' }).expect(429);
      expect(locked.body.code).toBe('PIN_LOCKED');
      await h.http.post('/v1/auth/child/login').send({ childId, pin: '1234' }).expect(429);

      h.clock.advance(16 * 60_000);
      await h.http.post('/v1/auth/child/login').send({ childId, pin: '0000' }).expect(401);
      await h.http.post('/v1/auth/child/login').send({ childId, pin: '1234' }).expect(200);
      expect(await h.prisma.child.findUniqueOrThrow({ where: { id: childId } })).toMatchObject({ failedPinAttempts: 0, pinLockedUntil: null });
      h.clock.set(new Date('2026-09-23T10:00:00.000Z'));
    });

    it('PIN non configuré, profil inconnu, PIN hérité bcrypt re-haché', async () => {
      const parent = await registerParent(h);
      const childId = await createChild(h, parent);
      await h.http.post('/v1/auth/child/login').send({ childId, pin: '1234' }).expect(400);
      await h.http.post('/v1/auth/child/login').send({ childId: '00000000-0000-4000-8000-000000000000', pin: '1234' }).expect(404);
      await h.prisma.child.update({ where: { id: childId }, data: { pinHash: await bcrypt.hash('2468', 8) } });
      await h.http.post('/v1/auth/child/login').send({ childId, pin: '2468' }).expect(200);
      expect((await h.prisma.child.findUniqueOrThrow({ where: { id: childId } })).pinHash).toMatch(/^\$argon2id/);
    });

    it('session enfant révoquée par le parent ou profil archivé', async () => {
      const { parent, child, childId } = await familyWithChild(h);
      const r = await h.http.post('/v1/auth/refresh').send({ refreshToken: child.refreshToken }).expect(200);
      await h.http.delete(`/v1/children/${childId}/sessions`).set(auth(parent.token)).expect(200);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: r.body.refreshToken }).expect(401);

      const again = await linkChild(h, parent, childId);
      await h.http.delete(`/v1/children/${childId}`).set(auth(parent.token)).expect(200);
      await h.http.post('/v1/auth/refresh').send({ refreshToken: again.refreshToken }).expect(401);
      await h.http.post('/v1/auth/child/login').send({ childId, pin: '1234' }).expect(404);
    });
  });

  describe('partenaires', () => {
    async function invitation(email: string) {
      const partner = await h.prisma.partner.create({ data: { name: 'Décathlon Test', slug: `dt-${Date.now()}` } });
      const { sha256 } = await import('../../src/platform/crypto');
      const token = `invite-token-${Date.now()}-abcdefghij`;
      await h.prisma.partnerMember.create({
        data: { partnerId: partner.id, email, role: 'owner', inviteTokenHash: sha256(token), inviteExpiresAt: new Date('2026-10-01T00:00:00Z') },
      });
      return { partner, token };
    }

    it('acceptation d’invitation : compte partenaire créé, organisation activée', async () => {
      const email = uniqueEmail('partner');
      const { partner, token } = await invitation(email);
      const res = await h.http.post('/v1/auth/partner-invitations/accept').send({ token, fullName: 'Sam', password: 'mot-de-passe-pro' }).expect(200);
      expect(res.body).toMatchObject({ partnerId: partner.id, user: { role: 'partner', email } });
      expect((await h.prisma.partner.findUniqueOrThrow({ where: { id: partner.id } })).status).toBe('active');
      const me = await h.http.get('/v1/auth/me').set(auth(res.body.accessToken)).expect(200);
      expect(me.body.partners).toEqual([expect.objectContaining({ id: partner.id, role: 'owner' })]);
      await h.http.post('/v1/auth/partner-invitations/accept').send({ token, fullName: 'Sam', password: 'mot-de-passe-pro' }).expect(400);
    });

    it('refuse un email déjà utilisé par un parent et une invitation expirée', async () => {
      const parent = await registerParent(h);
      const { token } = await invitation(parent.email);
      await h.http.post('/v1/auth/partner-invitations/accept').send({ token, fullName: 'Sam', password: 'mot-de-passe-pro' }).expect(409);

      const other = await invitation(uniqueEmail('partner'));
      h.clock.set(new Date('2026-10-02T00:00:00Z'));
      await h.http.post('/v1/auth/partner-invitations/accept').send({ token: other.token, fullName: 'Sam', password: 'mot-de-passe-pro' }).expect(400);
      h.clock.set(new Date('2026-09-23T10:00:00.000Z'));
    });
  });
});
