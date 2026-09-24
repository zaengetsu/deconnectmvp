import { randomUUID } from 'node:crypto';
import { OfferEngine } from '../../src/modules/partners/offer-engine';
import { EventBus } from '../../src/platform/events/event-bus';
import { auth, catalogActivity, completeActivity, createAdmin, createChild, familyWithChild, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';
import { acceptInvitation, createPartner, publishOffer, seedFamily } from '../support/partners';

const DAY = 86_400_000;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';

describe('Emails automatiques : catalogue, file, désinscription, déclencheurs', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.mailer.sent.length = 0;
    jest.restoreAllMocks();
    await resetDb(h.prisma);
  });

  const subjectsTo = (email: string) => h.mailer.sent.filter((m) => m.to === email.toLowerCase()).map((m) => m.subject);

  describe('parents', () => {
    it('bienvenue, profil enfant, appareil relié, première activité : chacun une seule fois', async () => {
      const f = await familyWithChild(h);
      await h.drain();
      expect(subjectsTo(f.parent.email)).toEqual(expect.arrayContaining(['Bienvenue sur Rekonect', 'Le profil de Emma est prêt', 'Le téléphone de Emma est relié']));

      const activity = await catalogActivity(h, { minAge: 10 });
      await completeActivity(h, f.parent, f.child, activity.id);
      await h.drain();
      await completeActivity(h, f.parent, f.child, activity.id);
      await h.drain();
      expect(subjectsTo(f.parent.email).filter((s) => s.startsWith('Première activité réussie'))).toHaveLength(1);
      // Pas d'email pour chaque activité terminée (5.14).
      expect(h.mailer.sent.length).toBe(4);
    });

    it('le canal email coupé : plus d’emails famille, mais la sécurité passe toujours', async () => {
      const parent = await registerParent(h);
      await h.http.put('/v1/notification-preferences').set(auth(parent.token)).send({ emailEnabled: false }).expect(200);
      await createChild(h, parent, 'Noah', 9);
      await h.drain();
      expect(subjectsTo(parent.email)).not.toContain('Le profil de Noah est prêt');
      await h.http.post('/v1/auth/password/forgot').send({ email: parent.email }).expect(200);
      expect(subjectsTo(parent.email)).toContain('Réinitialisation de votre mot de passe');
    });

    it('invitation d’un co-parent par email, puis arrivée dans la famille', async () => {
      const owner = await registerParent(h, 'Camille Martin');
      await setFamilyPlan(h, owner.userId, 'family_plus');
      const inv = await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({ memberRole: 'co_parent', email: 'thomas@test.rekonect.app' }).expect(201);
      await h.drain();
      const mail = h.mailer.sent.find((m) => m.to === 'thomas@test.rekonect.app')!;
      expect(mail.subject).toBe('Camille Martin vous invite à rejoindre sa famille sur Rekonect');
      expect(mail.text).toContain(`rekonect://join-family?token=${inv.body.token}`);
      const member = await registerParent(h, 'Thomas Martin');
      await h.http.post('/v1/family/invitations/accept').set(auth(member.token)).send({ token: inv.body.token }).expect(200);
      await h.drain();
      expect(subjectsTo(owner.email)).toContain('Thomas Martin a rejoint votre famille');
    });

    it('nouvelle connexion depuis un appareil inconnu : alerte une fois par appareil', async () => {
      const parent = await registerParent(h);
      await h.prisma.refreshToken.updateMany({ where: { userId: parent.userId }, data: { userAgent: IPHONE } });
      await h.http.post('/v1/auth/login').set('User-Agent', IPHONE).send({ email: parent.email, password: 'motdepasse-solide' }).expect(200);
      await h.http.post('/v1/auth/login').set('User-Agent', MAC).send({ email: parent.email, password: 'motdepasse-solide' }).expect(200);
      h.clock.advance(3_600_000);
      await h.http.post('/v1/auth/login').set('User-Agent', MAC).send({ email: parent.email, password: 'motdepasse-solide' }).expect(200);
      await h.emails.processPending();
      const alerts = h.mailer.sent.filter((m) => m.subject === 'Nouvelle connexion à votre compte Rekonect');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].text).toContain('Mac · Chrome');
    });

    it('suppression RGPD confirmée par email', async () => {
      const admin = await createAdmin(h);
      const f = await familyWithChild(h);
      await h.http.delete(`/v1/admin/families/${f.parent.userId}`).set(auth(admin.token)).send({ confirmEmail: f.parent.email }).expect(200);
      await h.emails.processPending();
      expect(subjectsTo(f.parent.email)).toContain('Votre compte Rekonect a été supprimé');
    });
  });

  describe('file d’envoi', () => {
    it('idempotence, adresse invalide, reprise après erreur temporaire, échec définitif', async () => {
      const q = (key: string) => h.emails.queue(h.prisma, 'parent.coparent_joined', { to: 'Test@Example.com', data: { memberName: 'Thomas' }, dedupKey: key });
      expect((await q('k1')).status).toBe('pending');
      expect((await q('k1')).status).toBe('duplicate');
      expect((await h.emails.queue(h.prisma, 'parent.coparent_joined', { to: 'pas-un-email', data: { memberName: 'x' } })).status).toBe('invalid');

      const send = jest.spyOn(h.mailer, 'send').mockResolvedValueOnce({ status: 'failed', error: '503 indisponible', retryable: true });
      await h.emails.processPending();
      let row = await h.prisma.emailMessage.findUniqueOrThrow({ where: { dedupKey: 'k1' } });
      expect(row).toMatchObject({ status: 'pending', attempts: 1, lastError: '503 indisponible', toEmail: 'test@example.com' });
      await h.emails.processPending(); // pas encore l'heure
      expect(send).toHaveBeenCalledTimes(1);
      h.clock.advance(61_000);
      await h.emails.processPending();
      row = await h.prisma.emailMessage.findUniqueOrThrow({ where: { dedupKey: 'k1' } });
      expect(row).toMatchObject({ status: 'sent', attempts: 2 });

      await q('k2');
      send.mockResolvedValueOnce({ status: 'failed', error: '400 adresse refusée', retryable: false });
      await h.emails.processPending();
      expect(await h.prisma.emailMessage.findUniqueOrThrow({ where: { dedupKey: 'k2' } })).toMatchObject({ status: 'failed', lastError: '400 adresse refusée' });

      await q('k3');
      send.mockResolvedValueOnce({ status: 'skipped', reason: 'email_not_configured' });
      await h.emails.processPending();
      expect(await h.prisma.emailMessage.findUniqueOrThrow({ where: { dedupKey: 'k3' } })).toMatchObject({ status: 'skipped' });
    });

    it('désinscription en un clic par catégorie ; les emails de service continuent', async () => {
      const email = 'parent@test.rekonect.app';
      await h.emails.queue(h.prisma, 'parent.voucher_expiring', { to: email, data: { partnerName: 'Decathlon', offerTitle: '10 €', expiresLabel: '30 septembre', claimId: 'c1' }, dedupKey: 'v1' });
      await h.emails.processPending();
      const mail = h.mailer.sent.at(-1)!;
      expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      const url = new URL(mail.headers!['List-Unsubscribe'].slice(1, -1));
      expect(url.searchParams.get('c')).toBe('offers');
      const path = `${url.pathname}${url.search}`;

      const page = await h.http.get(path).expect(200);
      expect(page.text).toContain('Confirmer la désinscription');
      expect(await h.prisma.emailSuppression.count()).toBe(0); // un simple clic (ou un antivirus) ne désinscrit pas
      await h.http.get(path.replace(/s=[^&]+/, 's=faux')).expect(400);
      await h.http.post(path.replace(/c=offers/, 'c=security')).expect(400);
      const done = await h.http.post(path).expect(200);
      expect(done.text).toContain('C’est noté');

      const again = await h.emails.queue(h.prisma, 'parent.voucher_expiring', { to: email, data: { partnerName: 'Decathlon', offerTitle: '10 €', expiresLabel: '30 septembre', claimId: 'c2' }, dedupKey: 'v2' });
      expect(again.status).toBe('suppressed');
      // Les emails de facturation ne sont pas concernés.
      expect((await h.emails.queue(h.prisma, 'parent.payment_failed', { to: email, data: { amountLabel: '7,99 €', planName: 'Famille' } })).status).toBe('pending');
      // Pas de lien de désinscription dans un email de service.
      await h.emails.processPending();
      expect(h.mailer.sent.at(-1)?.headers?.['List-Unsubscribe']).toBeUndefined();
      await h.emails.resubscribe(email, 'offers');
      expect(await h.prisma.emailSuppression.count()).toBe(0);
    });
  });

  describe('partenaires', () => {
    it('invitation, bienvenue, équipe (arrivée, rôle, retrait) et prévenance de l’équipe Rekonect', async () => {
      const brand = await createPartner(h);
      await h.drain();
      expect(subjectsTo(brand.email)).toEqual(expect.arrayContaining(['Invitation à rejoindre Decathlon France sur Rekonect', 'Bienvenue sur le portail partenaires Decathlon France']));
      const adminMail = h.mailer.sent.find((m) => m.subject === 'Decathlon France a activé son compte');
      expect(adminMail).toBeDefined();

      const inv = await h.http.post(`/v1/partner/${brand.partnerId}/members`).set(auth(brand.token)).send({ email: 'marc@decathlon.test', role: 'editor' }).expect(201);
      expect(h.mailer.sent.at(-1)?.text).toContain('en tant que éditeur');
      await acceptInvitation(h, inv.body.url, 'Marc Petit');
      await h.drain();
      expect(subjectsTo(brand.email)).toContain('Marc Petit a rejoint Decathlon France');
      expect(subjectsTo('marc@decathlon.test')).toContain('Bienvenue sur le portail partenaires Decathlon France');

      await h.http.patch(`/v1/partner/${brand.partnerId}/members/${inv.body.memberId}`).set(auth(brand.token)).send({ role: 'viewer' }).expect(200);
      await h.http.delete(`/v1/partner/${brand.partnerId}/members/${inv.body.memberId}`).set(auth(brand.token)).expect(200);
      await h.drain();
      expect(subjectsTo('marc@decathlon.test')).toEqual(expect.arrayContaining(['Votre rôle chez Decathlon France a changé', 'Votre accès à Decathlon France a été retiré']));
    });

    it('offres : relecture, stock bas puis épuisé, premier passage, fin ; bon parent par email', async () => {
      const brand = await createPartner(h);
      const offer = await publishOffer(h, brand, { kind: 'parent_voucher', title: 'Bon de 10 €', discountLabel: '10 €', triggerType: 'streak_days', triggerThreshold: 3, stockTotal: 5 });
      await h.drain();
      expect(subjectsTo(brand.email)).toEqual(expect.arrayContaining(['Offre envoyée en relecture : Bon de 10 €', 'Offre publiée : Bon de 10 €']));
      expect(h.mailer.sent.some((m) => m.subject === 'À relire : Bon de 10 € (Decathlon France)')).toBe(true);

      const engine = h.app.get(OfferEngine);
      const row = await h.prisma.partnerOffer.findUniqueOrThrow({ where: { id: offer.id } });
      const claims: string[] = [];
      const families: string[] = [];
      for (let i = 0; i < 5; i++) {
        const fam = await seedFamily(h);
        families.push(fam.parentId);
        const claim = await h.prisma.tx((tx) => engine.unlock(tx, row as never, { parentId: fam.parentId, childId: null, sourceKey: `test:${i}` }));
        claims.push(claim!.id);
      }
      await h.drain();
      expect(subjectsTo(brand.email)).toEqual(expect.arrayContaining(['Plus que 1 bon pour « Bon de 10 € »', 'Stock épuisé : Bon de 10 €']));
      const fam0 = await h.prisma.profile.findUniqueOrThrow({ where: { id: families[0] } });
      expect(subjectsTo(fam0.email)).toContain('🎟️ Nouveau bon Decathlon France dans votre portefeuille');

      await engine.redeem(claims[0]);
      await engine.redeem(claims[1]);
      await h.drain();
      expect(subjectsTo(brand.email).filter((s) => s === 'Premier bon utilisé en magasin 🎉')).toHaveLength(1);

      await h.prisma.partnerOffer.update({ where: { id: offer.id }, data: { status: 'published', endsAt: new Date(TEST_NOW.getTime() - 1000) } });
      await engine.expire();
      await h.drain();
      const ended = h.mailer.sent.find((m) => m.subject === 'Offre terminée : Bon de 10 €');
      expect(ended?.text).toContain('bons obtenus : 5');
      expect(ended?.text).toContain('bons utilisés : 2');
    });

    it('caps de bons obtenus : le 10e bon est fêté, une seule fois', async () => {
      const brand = await createPartner(h);
      const offer = await publishOffer(h, brand, { kind: 'parent_voucher', title: 'Bon de 3 €', triggerType: 'streak_days', triggerThreshold: 3 });
      const row = await h.prisma.partnerOffer.findUniqueOrThrow({ where: { id: offer.id } });
      for (let i = 0; i < 11; i++) {
        const fam = await seedFamily(h);
        await h.prisma.tx((tx) => h.app.get(OfferEngine).unlock(tx, row as never, { parentId: fam.parentId, childId: null, sourceKey: `cap:${i}` }));
      }
      await h.drain();
      expect(subjectsTo(brand.email).filter((s) => s === '10 bons obtenus par les familles 🎉')).toHaveLength(1);
    });

    it('suspension puis réactivation du compte', async () => {
      const brand = await createPartner(h);
      await h.http.patch(`/v1/admin/partners/${brand.partnerId}/status`).set(auth(brand.adminToken)).send({ status: 'suspended' }).expect(200);
      await h.http.patch(`/v1/admin/partners/${brand.partnerId}/status`).set(auth(brand.adminToken)).send({ status: 'active' }).expect(200);
      await h.drain();
      expect(subjectsTo(brand.email)).toEqual(expect.arrayContaining(['Compte Decathlon France suspendu', 'Compte Decathlon France réactivé']));
    });
  });

  describe('facturation', () => {
    const publish = <T extends Parameters<EventBus['publish']>[1]>(type: T, payload: Parameters<EventBus['publish']>[2]['payload']) =>
      h.prisma.tx((tx) => h.app.get(EventBus).publish(tx, type, { aggregateType: 'subscription', aggregateId: randomUUID(), payload: payload as never, actor: { kind: 'system', id: 'stripe' } }));

    it('famille : abonnement démarré, changé, résilié ; paiement refusé puis régularisé', async () => {
      const parent = await registerParent(h);
      await h.prisma.subscription.updateMany({ where: { parentId: parent.userId }, data: { plan: 'family', amountCents: 499, billingInterval: 'month' } });
      await publish('billing.subscription_changed', { ownerKind: 'family', ownerId: parent.userId, planId: 'family', previousPlanId: 'free', status: 'active' });
      await publish('billing.subscription_changed', { ownerKind: 'family', ownerId: parent.userId, planId: 'family_plus', previousPlanId: 'family', status: 'active' });
      await publish('billing.subscription_changed', { ownerKind: 'family', ownerId: parent.userId, planId: 'free', previousPlanId: 'family_plus', status: 'canceled' });
      await publish('billing.invoice_paid', { ownerKind: 'family', ownerId: parent.userId, invoiceId: 'in_1', amountCents: 499, recovered: false });
      await publish('billing.invoice_paid', { ownerKind: 'family', ownerId: parent.userId, invoiceId: 'in_2', amountCents: 499, recovered: true });
      await h.drain();
      const subjects = subjectsTo(parent.email);
      expect(subjects).toEqual(expect.arrayContaining([expect.stringMatching(/^Bienvenue dans /), expect.stringMatching(/^Votre abonnement passe à /), 'Votre abonnement Rekonect est résilié', 'Paiement régularisé, merci !']));
      expect(subjects.filter((x) => x === 'Paiement régularisé, merci !')).toHaveLength(1); // le reçu normal vient de Stripe
      const started = h.mailer.sent.find((m) => m.subject.startsWith('Bienvenue dans '))!;
      expect(started.text).toContain('4,99 € par mois');
    });

    it('partenaire : changement de plan, facture disponible, paiement refusé (responsables + équipe Rekonect)', async () => {
      const brand = await createPartner(h);
      await publish('billing.subscription_changed', { ownerKind: 'partner', ownerId: brand.partnerId, planId: 'partner_public', previousPlanId: 'partner_network', status: 'active' });
      await publish('billing.invoice_paid', { ownerKind: 'partner', ownerId: brand.partnerId, invoiceId: 'in_p1', amountCents: 14900, recovered: false });
      await publish('billing.payment_failed', { ownerKind: 'partner', ownerId: brand.partnerId, invoiceId: 'in_p2', amountCents: 14900 });
      await h.drain();
      expect(subjectsTo(brand.email)).toEqual(expect.arrayContaining([expect.stringMatching(/^Decathlon France passe au plan /), expect.stringMatching(/^Votre facture Rekonect · /), 'Paiement refusé']));
      expect(h.mailer.sent.some((m) => m.subject === 'Paiement partenaire refusé : Decathlon France')).toBe(true);
    });
  });

  describe('tâches planifiées', () => {
    it('échéances : offre qui se termine, bon qui expire, récompense en attente, fin d’essai — idempotentes', async () => {
      const brand = await createPartner(h);
      const offer = await publishOffer(h, brand, { kind: 'parent_voucher', title: 'Bon de 5 €', triggerType: 'streak_days', triggerThreshold: 3, endsAt: new Date(TEST_NOW.getTime() + 5 * DAY).toISOString() });
      const fam = await seedFamily(h);
      const row = await h.prisma.partnerOffer.findUniqueOrThrow({ where: { id: offer.id } });
      await h.prisma.tx((tx) => h.app.get(OfferEngine).unlock(tx, row as never, { parentId: fam.parentId, childId: null, sourceKey: 'job' }));
      await h.prisma.offerClaim.updateMany({ data: { expiresAt: new Date(TEST_NOW.getTime() + 2 * DAY) } });

      const f = await familyWithChild(h);
      const reward = await h.http.post('/v1/rewards').set(auth(f.parent.token)).send({ title: 'Choisir le dessert', requiredPoints: 0 }).expect(201);
      await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(f.child.token)).expect(201);
      await h.prisma.rewardRequest.updateMany({ data: { requestedAt: new Date(TEST_NOW.getTime() - 50 * 3_600_000) } });
      await h.prisma.subscription.updateMany({ where: { parentId: f.parent.userId }, data: { plan: 'family', status: 'trialing', amountCents: 499, currentPeriodEnd: new Date(TEST_NOW.getTime() + 2 * DAY) } });

      h.mailer.sent.length = 0;
      const first = await h.emailJobs.daily();
      expect(first).toMatchObject({ offersExpiring: 1, vouchersExpiring: 1, rewardsWaiting: 1, trialsEnding: 1 });
      await h.emails.processPending();
      const subjects = h.mailer.sent.map((m) => m.subject);
      expect(subjects).toEqual(expect.arrayContaining([
        expect.stringMatching(/^Votre offre « Bon de 5 € » se termine le /),
        'Votre bon Decathlon France expire bientôt',
        'Emma attend sa récompense',
        expect.stringMatching(/^Votre essai Famille/),
      ]));
      const again = await h.emailJobs.daily();
      expect(again).toMatchObject({ offersExpiring: 0, vouchersExpiring: 0, rewardsWaiting: 0, trialsEnding: 0 });
    });

    it('accompagnement : partenaire incomplet, famille inactive (une fois par mois au plus)', async () => {
      const brand = await createPartner(h);
      await h.prisma.partner.update({ where: { id: brand.partnerId }, data: { createdAt: new Date(TEST_NOW.getTime() - 5 * DAY) } });
      expect(await h.emailJobs.partnerOnboarding()).toBe(1);
      expect(await h.emailJobs.partnerOnboarding()).toBe(0);

      const f = await familyWithChild(h);
      const activity = await catalogActivity(h, { minAge: 10 });
      await completeActivity(h, f.parent, f.child, activity.id);
      await h.prisma.childActivity.updateMany({ data: { validatedAt: new Date(TEST_NOW.getTime() - 20 * DAY) } });
      expect(await h.emailJobs.parentInactive()).toBe(1);
      h.clock.advance(3 * DAY);
      expect(await h.emailJobs.parentInactive()).toBe(0);
      await h.emails.processPending();
      const nudge = h.mailer.sent.find((m) => m.subject === 'Une idée d’activité pour cette semaine ?');
      expect(nudge?.text).toContain('Aucune activité n’a été faite depuis 20 jours chez Emma');
      expect(nudge?.headers?.['List-Unsubscribe']).toContain('c=tips');
    });

    it('bilans : parent (semaine, mois), partenaire (semaine, mois), point du jour admin', async () => {
      const admin = await createAdmin(h);
      const f = await familyWithChild(h, { name: 'Lucas' });
      const activity = await catalogActivity(h, { minAge: 10 });
      await completeActivity(h, f.parent, f.child, activity.id);
      await completeActivity(h, f.parent, f.child, activity.id);

      expect(await h.emailJobs.parentWeekly()).toBe(1);
      expect(await h.emailJobs.parentWeekly()).toBe(0);

      const brand = await createPartner(h, { adminToken: admin.token });
      const offer = await publishOffer(h, brand, { kind: 'parent_voucher', title: 'Bon de 10 €', triggerType: 'streak_days', triggerThreshold: 3 });
      const day = new Date(TEST_NOW.getTime() - 3 * DAY);
      await h.prisma.offerMetricDaily.create({ data: { offerId: offer.id, day: new Date(day.toISOString().slice(0, 10)), views: 120, unlocks: 12, redemptions: 4 } });
      expect(await h.emailJobs.partnerWeekly()).toBe(1);

      // Le 1er octobre : bilans mensuels de septembre.
      h.clock.set('2026-10-01T08:00:00.000Z');
      expect(await h.emailJobs.partnerMonthly()).toBe(1);
      expect(await h.emailJobs.parentMonthly()).toBe(1);
      await h.emails.processPending();
      h.clock.set(TEST_NOW);
      expect(await h.emailJobs.adminDigest()).toBe(1);

      await h.emails.processPending();
      const weekly = h.mailer.sent.find((m) => m.subject === '📊 Votre semaine avec Rekonect');
      expect(weekly?.text).toContain('activités : 2');
      expect(weekly?.text).toMatch(/Lucas : 2 activités/);
      const partner = h.mailer.sent.find((m) => m.subject === 'Decathlon France · votre semaine sur Rekonect');
      expect(partner?.text).toContain('bons obtenus : 12');
      expect(partner?.text).toContain('utilisés : 4 (33 % d’utilisation)');
      expect(h.mailer.sent.some((m) => m.subject === 'Decathlon France · bilan de septembre 2026')).toBe(true);
      expect(h.mailer.sent.some((m) => m.subject === 'Votre mois de septembre 2026 avec Rekonect')).toBe(true);
      expect(h.mailer.sent.some((m) => m.subject.startsWith('Rekonect · point du'))).toBe(true);
    });
  });
});
