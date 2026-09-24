import { auth, catalogActivity, completeActivity, createAdmin, familyWithChild, notificationsOf, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';
import { acceptInvitation, createPartner, createPlace, LYON, optIn, PARIS, publishOffer, seedFamily, VILLEURBANNE } from '../support/partners';

describe('Partenaires : réseau, lieux, ciblage, offres, modération, caisse, mesure', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.mailer.sent.length = 0;
    await resetDb(h.prisma);
  });

  const sportCategory = () => h.prisma.activityCategory.findFirstOrThrow({ where: { slug: 'sport' } });

  describe('organisations et équipes', () => {
    it('admin crée une enseigne ; le responsable accepte ; compte, profil, équipe', async () => {
      const brand = await createPartner(h);
      expect(h.mailer.sent[0].subject).toBe('Invitation à rejoindre Decathlon France sur Rekonect');
      const detail = await h.http.get(`/v1/partner/${brand.partnerId}`).set(auth(brand.token)).expect(200);
      expect(detail.body).toMatchObject({ name: 'Decathlon France', initials: 'DF', kindLabel: 'Enseigne', myRole: 'owner', plan: { id: 'partner_network', name: 'Réseau' } });
      expect(detail.body.members[0]).toMatchObject({ status: 'active', role: 'owner', fullName: 'Julie Bernard', initials: 'JB' });

      await h.http.patch(`/v1/partner/${brand.partnerId}`).set(auth(brand.token)).send({ subtitle: 'Enseigne nationale', color: '#3FA0C9' }).expect(200);
      const inv = await h.http.post(`/v1/partner/${brand.partnerId}/members`).set(auth(brand.token)).send({ email: 'marc@decathlon.test', role: 'editor', title: 'Marketing national' }).expect(201);
      const marc = await acceptInvitation(h, inv.body.url, 'Marc Tessier');
      await h.http.patch(`/v1/partner/${brand.partnerId}`).set(auth(marc.token)).send({ name: 'Piratage' }).expect(403);
      await h.http.post(`/v1/partner/${brand.partnerId}/members`).set(auth(brand.token)).send({ email: 'marc@decathlon.test' }).expect(409);

      const members = (await h.http.get(`/v1/partner/${brand.partnerId}`).set(auth(brand.token))).body.members;
      const owner = members.find((m: { role: string }) => m.role === 'owner');
      const marcRow = members.find((m: { email: string }) => m.email === 'marc@decathlon.test');
      expect(marcRow.title).toBe('Marketing national');
      await h.http.patch(`/v1/partner/${brand.partnerId}/members/${owner.id}`).set(auth(brand.token)).send({ role: 'viewer' }).expect(409);
      await h.http.delete(`/v1/partner/${brand.partnerId}/members/${owner.id}`).set(auth(brand.token)).expect(409);
      await h.http.patch(`/v1/partner/${brand.partnerId}/members/${marcRow.id}`).set(auth(brand.token)).send({ role: 'viewer' }).expect(200);
      await h.http.delete(`/v1/partner/${brand.partnerId}/members/${marcRow.id}`).set(auth(brand.token)).expect(200);
      await h.http.get(`/v1/partner/${brand.partnerId}/dashboard`).set(auth(marc.token)).expect(404);
    });

    it('enseigne → magasins rattachés : accès réseau, sélecteur de comptes, cloisonnement', async () => {
      const brand = await createPartner(h);
      const store = await h.http
        .post(`/v1/partner/${brand.partnerId}/stores`)
        .set(auth(brand.token))
        .send({ name: 'Decathlon Lyon Part-Dieu', address: '17 rue du Dr Bouchut', postalCode: '69003', city: 'Lyon', latitude: LYON.lat, longitude: LYON.lng, managerName: 'Karim B.', managerEmail: 'karim@decathlon.test' })
        .expect(201);
      expect(store.body).toMatchObject({ kind: 'store', parentPartnerId: brand.partnerId, subtitle: 'Rattaché à Decathlon France' });
      const karim = await acceptInvitation(h, store.body.invitation.url, 'Karim B.');

      const accounts = await h.http.get('/v1/partner-accounts').set(auth(brand.token)).expect(200);
      expect(accounts.body.map((a: { name: string; via: string }) => [a.name, a.via])).toEqual([
        ['Decathlon France', 'direct'],
        ['Decathlon Lyon Part-Dieu', 'network'],
      ]);
      await h.http.get(`/v1/partner/${store.body.id}/dashboard`).set(auth(brand.token)).expect(200);
      await h.http.get(`/v1/partner/${brand.partnerId}/dashboard`).set(auth(karim.token)).expect(404);
      expect((await h.http.get('/v1/partner-accounts').set(auth(karim.token))).body).toHaveLength(1);
      await h.http.post(`/v1/partner/${store.body.id}/stores`).set(auth(karim.token)).send({ name: 'Sous-magasin', managerEmail: 'x@y.fr' }).expect(403);

      // La facturation d'un magasin est portée par l'enseigne.
      await h.http.get(`/v1/partner/${store.body.id}/billing`).set(auth(karim.token)).expect(403);
      const billing = await h.http.get(`/v1/partner/${brand.partnerId}/billing`).set(auth(brand.token)).expect(200);
      expect(billing.body).toMatchObject({ plan: { id: 'partner_network' }, usage: { stores: 1, places: 1 } });

      const places = await h.http.get(`/v1/partner/${brand.partnerId}/places`).set(auth(brand.token)).expect(200);
      expect(places.body[0]).toMatchObject({ name: 'Decathlon Lyon Part-Dieu', linkedPartnerId: store.body.id, accessLevel: 'delegated', managerName: 'Karim B.' });
    });

    it('plan « Partenaire local » : 1 lieu, pas de ciblage national, rayon ≤ 20 km', async () => {
      const shop = await createPartner(h, { name: 'Librairie Passages', kind: 'local_business', planId: 'partner_local' });
      const placeId = await createPlace(h, shop, 'Librairie Passages');
      await h.http.post(`/v1/partner/${shop.partnerId}/places`).set(auth(shop.token)).send({ name: 'Second lieu' }).expect(403);
      const base = { kind: 'child_reward', title: 'Marque-page offert', requiredPoints: 50 };
      expect((await h.http.post(`/v1/partner/${shop.partnerId}/offers`).set(auth(shop.token)).send(base).expect(403)).body.code).toBe('PLAN_TARGETING');
      await h.http.post(`/v1/partner/${shop.partnerId}/offers`).set(auth(shop.token)).send({ ...base, targetType: 'radius', targetPlaceId: placeId, targetRadiusKm: 25 }).expect(403);
      await h.http.post(`/v1/partner/${shop.partnerId}/offers`).set(auth(shop.token)).send({ ...base, targetType: 'radius', targetPlaceId: placeId, targetRadiusKm: 10 }).expect(201);
      await h.http.post(`/v1/partner/${shop.partnerId}/offers`).set(auth(shop.token)).send({ ...base, targetType: 'area', targetPostalCodes: ['69002'] }).expect(201);
      await h.http.patch(`/v1/partner/${shop.partnerId}/places/${placeId}`).set(auth(shop.token)).send({ managerName: 'Anne' }).expect(200);
    });
  });

  describe('cycle de vie et modération', () => {
    it('offre de magasin : enseigne → Rekonect ; demande de modification ; publication ; pause ; statut affiché', async () => {
      const brand = await createPartner(h);
      const store = await h.http.post(`/v1/partner/${brand.partnerId}/stores`).set(auth(brand.token)).send({ name: 'Decathlon Lyon Part-Dieu', latitude: LYON.lat, longitude: LYON.lng, managerEmail: 'karim@decathlon.test' }).expect(201);
      const karim = { ...(await acceptInvitation(h, store.body.invitation.url, 'Karim B.')), partnerId: store.body.id };
      const place = (await h.http.get(`/v1/partner/${store.body.id}/places`).set(auth(karim.token))).body[0];

      const offer = await h.http
        .post(`/v1/partner/${store.body.id}/offers`)
        .set(auth(karim.token))
        .send({ kind: 'child_reward', title: 'Atelier « répare ton vélo » offert', requiredPoints: 300, targetType: 'radius', targetPlaceId: place.id, targetRadiusKm: 15, stockTotal: 40, startsAt: '2026-10-12T12:00:00.000Z', endsAt: '2026-10-12T16:00:00.000Z' })
        .expect(201);
      expect(offer.body).toMatchObject({ displayStatusLabel: 'Brouillon', condition: 'Échangeable contre 300 points', scope: '15 km autour de Decathlon Lyon Part-Dieu', stockPeriod: '40 places · 12 oct. → 12 oct.' });

      const sub = await h.http.post(`/v1/partner-offers/${offer.body.id}/submit`).set(auth(karim.token)).expect(200);
      expect(sub.body).toMatchObject({ status: 'pending_brand', displayStatusLabel: 'En validation' });
      expect((await h.http.get(`/v1/partner/${brand.partnerId}/store-offers`).set(auth(brand.token))).body).toHaveLength(1);
      await h.http.post(`/v1/partner-offers/${offer.body.id}/brand-approve`).set(auth(karim.token)).expect(404);
      await h.http.post(`/v1/partner-offers/${offer.body.id}/brand-approve`).set(auth(brand.token)).expect(200);

      const queue = await h.http.get('/v1/admin/moderation/offers').set(auth(brand.adminToken)).expect(200);
      expect(queue.body[0]).toMatchObject({ id: offer.body.id, partnerInitials: 'DL', kindLabel: 'Récompense enfant', decided: false });
      expect((await h.http.get('/v1/admin/nav-counts').set(auth(brand.adminToken))).body.pendingOffers).toBe(1);

      await h.http.post(`/v1/admin/moderation/offers/${offer.body.id}/request-changes`).set(auth(brand.adminToken)).send({ note: 'Précisez l’âge minimum' }).expect(200);
      expect(h.mailer.sent.at(-1)?.text).toContain('Modifications demandées : Précisez l’âge minimum');
      const edited = await h.http.patch(`/v1/partner-offers/${offer.body.id}`).set(auth(karim.token)).send({ minAge: 8, maxAge: 14 }).expect(200);
      expect(edited.body.status).toBe('changes_requested');
      await h.http.post(`/v1/partner-offers/${offer.body.id}/submit`).set(auth(karim.token)).expect(200);
      await h.http.post(`/v1/partner-offers/${offer.body.id}/brand-request-changes`).set(auth(brand.token)).send({ note: 'Ajoutez le visuel' }).expect(200);
      await h.http.post(`/v1/partner-offers/${offer.body.id}/submit`).set(auth(karim.token)).expect(200);
      await h.http.post(`/v1/partner-offers/${offer.body.id}/brand-approve`).set(auth(brand.token)).expect(200);

      const approved = await h.http.post(`/v1/admin/moderation/offers/${offer.body.id}/approve`).set(auth(brand.adminToken)).expect(200);
      expect(approved.body).toMatchObject({ status: 'published', displayStatusLabel: 'Programmée' });
      await h.http.post(`/v1/admin/moderation/offers/${offer.body.id}/approve`).set(auth(brand.adminToken)).expect(409);
      await h.http.patch(`/v1/partner-offers/${offer.body.id}`).set(auth(karim.token)).send({ title: 'Changé' }).expect(409);

      h.clock.set('2026-10-12T13:00:00Z');
      expect((await h.http.get(`/v1/partner-offers/${offer.body.id}`).set(auth(karim.token))).body.displayStatusLabel).toBe('Active');
      const paused = await h.http.post(`/v1/partner-offers/${offer.body.id}/pause`).set(auth(karim.token)).expect(200);
      expect(paused.body.displayStatusLabel).toBe('En pause');
      await h.http.post(`/v1/partner-offers/${offer.body.id}/resume`).set(auth(karim.token)).expect(200);
      await h.http.post(`/v1/partner-offers/${offer.body.id}/resume`).set(auth(karim.token)).expect(409);
      h.clock.set('2026-10-13T00:00:00Z');
      const { OfferEngine } = await import('../../src/modules/partners/offer-engine');
      expect(await h.app.get(OfferEngine).expire()).toBe(1);
      expect((await h.http.get(`/v1/partner/${store.body.id}/offers?display=ended`).set(auth(karim.token))).body).toHaveLength(1);
    });

    it('refus avec motif, brouillon supprimable, quota d’offres actives', async () => {
      const shop = await createPartner(h, { name: 'Librairie Passages', kind: 'local_business', planId: 'partner_local' });
      await createPlace(h, shop, 'Librairie Passages');
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const o = await h.http.post(`/v1/partner/${shop.partnerId}/offers`).set(auth(shop.token)).send({ kind: 'child_reward', title: `Offre ${i}`, requiredPoints: 50, targetType: 'area', targetPostalCodes: ['69002'] }).expect(201);
        ids.push(o.body.id);
      }
      for (const id of ids.slice(0, 3)) await h.http.post(`/v1/partner-offers/${id}/submit`).set(auth(shop.token)).expect(200);
      expect((await h.http.post(`/v1/partner-offers/${ids[3]}/submit`).set(auth(shop.token)).expect(403)).body.code).toBe('PLAN_LIMIT_OFFERS');

      await h.http.post(`/v1/admin/moderation/offers/${ids[0]}/reject`).set(auth(shop.adminToken)).send({ reason: 'Visuel inadapté' }).expect(200);
      expect(h.mailer.sent.at(-1)?.subject).toBe('Offre à revoir : Offre 0');
      await h.http.post(`/v1/admin/moderation/offers/${ids[0]}/reject`).set(auth(shop.adminToken)).send({ reason: 'x3x' }).expect(409);
      await h.http.post(`/v1/partner-offers/${ids[3]}/submit`).set(auth(shop.token)).expect(200); // une place s'est libérée
      await h.http.delete(`/v1/partner-offers/${ids[3]}`).set(auth(shop.token)).expect(403);
      const draft = await h.http.post(`/v1/partner/${shop.partnerId}/offers`).set(auth(shop.token)).send({ kind: 'child_reward', title: 'Brouillon', requiredPoints: 5, targetType: 'area', targetPostalCodes: ['69002'] }).expect(201);
      await h.http.delete(`/v1/partner-offers/${draft.body.id}`).set(auth(shop.token)).expect(200);
    });

    it('suspension d’une enseigne : ses offres et celles de ses magasins passent en pause', async () => {
      const brand = await createPartner(h);
      const offer = await publishOffer(h, brand, { kind: 'child_reward', title: 'Gourde enfant offerte', requiredPoints: 250 });
      await h.http.patch(`/v1/admin/partners/${brand.partnerId}/status`).set(auth(brand.adminToken)).send({ status: 'suspended' }).expect(200);
      expect((await h.prisma.partnerOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe('paused');
      expect((await h.prisma.reward.findUniqueOrThrow({ where: { id: offer.rewardId } })).isActive).toBe(false);
      await h.http.get(`/v1/partner/${brand.partnerId}/dashboard`).set(auth(brand.token)).expect(403);
    });
  });

  describe('familles : visibilité, déblocage, caisse', () => {
    it('bon parent « 3 activités Sport en 30 jours » dans un rayon : code RK, notification, progression, caisse, CSV, tableau de bord', async () => {
      const brand = await createPartner(h);
      const placeId = await createPlace(h, brand);
      const cat = await sportCategory();
      const sport = await h.prisma.activity.findFirstOrThrow({ where: { categoryId: cat.id, activityType: 'catalog' } });
      const offer = await publishOffer(h, brand, {
        kind: 'parent_voucher',
        title: '−10 % rayon cycles',
        triggerType: 'category_validated',
        triggerCategoryId: cat.id,
        triggerThreshold: 3,
        triggerWindowDays: 30,
        targetType: 'radius',
        targetPlaceId: placeId,
        targetRadiusKm: 10,
        stockTotal: 3000,
        discountLabel: '−10 %',
      });
      expect(offer.condition).toBe('3 activités Sport validées en 30 jours');

      const near = await familyWithChild(h, { name: 'Emma', age: 10 });
      await optIn(h, near.parent.token, VILLEURBANNE);
      const far = await familyWithChild(h, { name: 'Hugo', age: 10 });
      await optIn(h, far.parent.token, PARIS);
      const noConsent = await familyWithChild(h, { name: 'Lina', age: 10 });

      for (let i = 0; i < 3; i++) {
        for (const f of [near, far, noConsent]) await completeActivity(h, f.parent, f.child, sport.id);
        await h.drain();
        if (i === 1) {
          const progress = await h.http.get('/v1/offer-progress').set(auth(near.parent.token)).expect(200);
          expect(progress.body[0]).toMatchObject({ title: '−10 % rayon cycles', done: 2, target: 3, percent: 67 });
          expect((await h.http.get('/v1/offer-progress').set(auth(far.parent.token))).body).toHaveLength(0);
        }
      }
      const claims = await h.http.get('/v1/offer-claims').set(auth(near.parent.token)).expect(200);
      expect(claims.body).toHaveLength(1);
      expect(claims.body[0]).toMatchObject({ status: 'unlocked', child: { displayName: 'Emma' }, offer: { title: '−10 % rayon cycles', partner: { name: 'Decathlon France' } } });
      expect(claims.body[0].code).toMatch(/^RK[A-Z0-9]{2}-[A-Z0-9]{4}$/);
      expect(claims.body[0].qrPayload).toBe(`rekonect:voucher:${claims.body[0].code}`);
      expect((await h.http.get('/v1/offer-claims').set(auth(far.parent.token))).body).toHaveLength(0);
      expect((await h.http.get('/v1/offer-claims').set(auth(noConsent.parent.token))).body).toHaveLength(0);
      const [notif] = await notificationsOf(h, near.parent.userId, 'partner_offer_unlocked');
      expect(notif).toMatchObject({ title: '🎟️ Bon Decathlon France débloqué', body: 'Grâce aux activités de Emma : −10 % rayon cycles.' });
      expect((await h.http.get('/v1/offer-progress').set(auth(near.parent.token))).body).toHaveLength(0); // limite 1 par famille atteinte

      // En caisse : un agent d'accueil vérifie puis valide le bon.
      const inv = await h.http.post(`/v1/partner/${brand.partnerId}/members`).set(auth(brand.token)).send({ email: 'caisse@decathlon.test', role: 'reception' }).expect(201);
      const cashier = await acceptInvitation(h, inv.body.url, 'Accueil caisse');
      await h.http.get(`/v1/partner/${brand.partnerId}/dashboard`).set(auth(cashier.token)).expect(403);
      const spaced = claims.body[0].code.toLowerCase().replace('-', ' ');
      const check = await h.http.post(`/v1/partner/${brand.partnerId}/redemptions/verify`).set(auth(cashier.token)).send({ code: spaced, redeem: false }).expect(200);
      expect(check.body).toMatchObject({ valid: true, redeemed: false, offer: { title: '−10 % rayon cycles' } });
      const ok = await h.http.post(`/v1/partner/${brand.partnerId}/redemptions/verify`).set(auth(cashier.token)).send({ code: claims.body[0].code, basketAmountCents: 5400 }).expect(200);
      expect(ok.body).toMatchObject({ valid: true, redeemed: true });
      const again = await h.http.post(`/v1/partner/${brand.partnerId}/redemptions/verify`).set(auth(cashier.token)).send({ code: claims.body[0].code }).expect(200);
      expect(again.body).toMatchObject({ valid: false, reason: 'already_redeemed' });
      await h.http.post(`/v1/partner/${brand.partnerId}/redemptions/verify`).set(auth(cashier.token)).send({ code: 'RK00-0000' }).expect(404);
      await h.http.post(`/v1/offer-claims/${claims.body[0].id}/redeem`).set(auth(near.parent.token)).expect(409);

      const list = await h.http.get(`/v1/partner/${brand.partnerId}/redemptions`).set(auth(cashier.token)).expect(200);
      expect(list.body[0]).toMatchObject({ code: claims.body[0].code, offerTitle: '−10 % rayon cycles', place: 'Decathlon Lyon Part-Dieu', statusLabel: 'Utilisé' });
      const csv = await h.http.get(`/v1/partner/${brand.partnerId}/redemptions.csv`).set(auth(brand.token)).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('date;code;offre;lieu;statut');
      expect(csv.text).toContain('"Utilisé"');

      const places = await h.http.get(`/v1/partner/${brand.partnerId}/places`).set(auth(brand.token)).expect(200);
      expect(places.body[0]).toMatchObject({ vouchersUsed: 1, localOffers: 1, kidsWithin10km: null });

      const dash = await h.http.get(`/v1/partner/${brand.partnerId}/dashboard?days=30`).set(auth(brand.token)).expect(200);
      expect(dash.body.kpis.rewardsObtained.value).toBeNull(); // 1 < seuil de 10 : masqué
      expect(dash.body.kpis.averageBasketCents.value).toBe(5400);
      expect(dash.body.activeOffers[0]).toMatchObject({ title: '−10 % rayon cycles', usage: { used: 1, total: 3000, percent: 0 } });
      const stats = await h.http.get(`/v1/partner-offers/${offer.id}/stats`).set(auth(brand.token)).expect(200);
      expect(stats.body).toMatchObject({ masked: true, unlocks: null, stockLeft: 2999 });
    });

    it('récompense enfant partenaire : consentement, activation, demande, code à l’approbation, stock épuisé', async () => {
      const brand = await createPartner(h);
      const offer = await publishOffer(h, brand, { kind: 'child_reward', title: 'Gourde enfant offerte', requiredPoints: 50, stockTotal: 1, minAge: 6, maxAge: 12 });
      // Offre nationale = « premium » : réservée aux familles Famille+.
      const a = await familyWithChild(h, { age: 10 });
      await h.prisma.child.update({ where: { id: a.childId }, data: { totalPoints: 100 } });
      expect((await h.http.get('/v1/rewards/catalog').set(auth(a.parent.token))).body.some((r: { partnerOfferId: string }) => r.partnerOfferId === offer.id)).toBe(false);
      await optIn(h, a.parent.token);
      expect((await h.http.get('/v1/rewards/catalog').set(auth(a.parent.token))).body.some((r: { partnerOfferId: string }) => r.partnerOfferId === offer.id)).toBe(false);
      await setFamilyPlan(h, a.parent.userId, 'family_plus');
      const catalog = await h.http.get('/v1/rewards/catalog').set(auth(a.parent.token)).expect(200);
      const partnerReward = catalog.body.find((r: { partnerOfferId: string }) => r.partnerOfferId === offer.id);
      expect(partnerReward.partnerOffer.partner.name).toBe('Decathlon France');

      const mine = await h.http.post(`/v1/rewards/catalog/${partnerReward.id}/activate`).set(auth(a.parent.token)).send({}).expect(201);
      expect(mine.body).toMatchObject({ rewardType: 'partner', partnerOfferId: offer.id, sourceRewardId: partnerReward.id });
      const req = await h.http.post(`/v1/rewards/${mine.body.id}/request`).set(auth(a.child.token)).expect(201);
      const approved = await h.http.post(`/v1/reward-requests/${req.body.id}/approve`).set(auth(a.parent.token)).send({}).expect(200);
      expect(approved.body.code).toMatch(/^RK/);

      // Deuxième famille : stock épuisé → la récompense n'est plus demandable.
      const b = await familyWithChild(h, { age: 9 });
      await optIn(h, b.parent.token);
      await setFamilyPlan(h, b.parent.userId, 'family_plus');
      await h.prisma.child.update({ where: { id: b.childId }, data: { totalPoints: 100 } });
      expect((await h.http.get('/v1/rewards/catalog').set(auth(b.parent.token))).body.some((r: { partnerOfferId: string }) => r.partnerOfferId === offer.id)).toBe(false);
      await h.http.post(`/v1/rewards/catalog/${partnerReward.id}/activate`).set(auth(b.parent.token)).send({}).expect(404);
      // Une copie déjà activée ne se demande plus.
      await h.http.post(`/v1/rewards/${mine.body.id}/request`).set(auth(a.child.token)).expect(409);
    });

    it('récompense enfant « après des activités » : pas de points dépensés, débloquée comme un bon', async () => {
      const brand = await createPartner(h);
      const cat = await sportCategory();
      const sport = await h.prisma.activity.findFirstOrThrow({ where: { categoryId: cat.id, activityType: 'catalog' } });
      await h.http.post(`/v1/partner/${brand.partnerId}/offers`).set(auth(brand.token)).send({ kind: 'child_reward', title: 'Sans condition' }).expect(400);
      const offer = await publishOffer(h, brand, { kind: 'child_reward', title: 'Initiation escalade gratuite', triggerType: 'category_validated', triggerCategoryId: cat.id, triggerThreshold: 2 });
      expect(offer.rewardId).toBeNull();
      const f = await familyWithChild(h, { name: 'Léa' });
      await optIn(h, f.parent.token);
      await setFamilyPlan(h, f.parent.userId, 'family_plus');
      const before = (await h.prisma.child.findUniqueOrThrow({ where: { id: f.childId } })).totalPoints;
      for (let i = 0; i < 2; i++) await completeActivity(h, f.parent, f.child, sport.id);
      await h.drain();
      const claims = (await h.http.get('/v1/offer-claims').set(auth(f.parent.token))).body;
      expect(claims).toEqual([expect.objectContaining({ offer: expect.objectContaining({ title: 'Initiation escalade gratuite' }), child: expect.objectContaining({ displayName: 'Léa' }) })]);
      expect((await h.prisma.child.findUniqueOrThrow({ where: { id: f.childId } })).totalPoints).toBeGreaterThan(before);
    });

    it('défi sponsorisé visible dans le catalogue des seules familles consentantes', async () => {
      const brand = await createPartner(h);
      const cat = await sportCategory();
      const offer = await publishOffer(h, brand, { kind: 'sponsored_activity', title: 'Défi « 100 km à vélo en famille »', categoryId: cat.id, durationMinutes: 60, minAge: 7, maxAge: 14 });
      const a = await familyWithChild(h);
      const partnerActs = () => h.http.get('/v1/activities?origin=partner').set(auth(a.parent.token));
      expect((await partnerActs()).body).toHaveLength(0);
      await optIn(h, a.parent.token);
      const list = (await partnerActs()).body;
      expect(list).toEqual([expect.objectContaining({ id: offer.activityId, activityType: 'partner', partner: expect.objectContaining({ name: 'Decathlon France' }) })]);
    });

    it('série de 7 jours et niveau : débloqués une seule fois par enfant', async () => {
      const brand = await createPartner(h);
      await publishOffer(h, brand, { kind: 'parent_voucher', title: 'Chèque culture de 20 €', triggerType: 'streak_days', triggerThreshold: 3, perFamilyLimit: 5 });
      await publishOffer(h, brand, { kind: 'parent_voucher', title: 'Niveau 2 atteint', triggerType: 'level_reached', triggerThreshold: 2, perFamilyLimit: 5 });
      const f = await familyWithChild(h);
      await optIn(h, f.parent.token);
      await setFamilyPlan(h, f.parent.userId, 'family_plus');
      const big = await h.prisma.activity.create({ data: { title: 'Grand défi', points: 60, activityType: 'catalog' } });
      for (let d = 0; d < 5; d++) {
        await completeActivity(h, f.parent, f.child, big.id);
        await h.drain();
        h.clock.advance(86_400_000);
      }
      const titles = (await h.http.get('/v1/offer-claims').set(auth(f.parent.token))).body.map((c: { offer: { title: string } }) => c.offer.title).sort();
      expect(titles).toEqual(['Chèque culture de 20 €', 'Niveau 2 atteint']);
    });

    it('ciblage par code d’accès (CSE) et par codes postaux ; audience estimée arrondie et masquée', async () => {
      const cse = await createPartner(h, { name: 'CSE Airbus Toulouse', kind: 'cse', planId: 'partner_public' });
      const code = await h.http.post('/v1/admin/promo-codes').set(auth(cse.adminToken)).send({ code: 'CSE-AIRBUS', description: 'Plan Famille offert', kind: 'sponsored', durationMonths: 12, sponsorPartnerId: cse.partnerId, maxRedemptions: 800 }).expect(201);
      const codes = await h.http.get(`/v1/partner/${cse.partnerId}/access-codes`).set(auth(cse.token)).expect(200);
      expect(codes.body[0].code).toBe('CSE-AIRBUS');
      await h.http.post(`/v1/partner/${cse.partnerId}/offers`).set(auth(cse.token)).send({ kind: 'child_reward', title: 'x national', requiredPoints: 10 }).expect(403);

      const estimate = (q: string) => h.http.get(`/v1/partner/${cse.partnerId}/audience/estimate?${q}`).set(auth(cse.token)).expect(200);
      expect((await estimate(`targetType=code&promoCodeId=${code.body.id}`)).body).toEqual({ kids: null, families: null, activeFamilies: null, masked: true });

      const members = [];
      for (let i = 0; i < 23; i++) members.push(await seedFamily(h, { ages: [8, 11], activeRecently: i < 12 }));
      for (const m of members) await h.prisma.promoRedemption.create({ data: { promoCodeId: code.body.id, parentId: m.parentId } });
      await seedFamily(h, { ages: [9] }); // hors code
      const counts = (await estimate(`targetType=code&promoCodeId=${code.body.id}`)).body;
      expect(counts).toEqual({ kids: 50, families: 20, activeFamilies: 10, masked: false });
      expect((await estimate(`targetType=code&promoCodeId=${code.body.id}&minAge=10&maxAge=12`)).body.kids).toBe(20);

      for (let i = 0; i < 21; i++) await seedFamily(h, { postalCode: '69008', ages: [7] });
      expect((await estimate('targetType=area&postalCodes=69008,69007')).body).toMatchObject({ families: 20, kids: 20 });
      // Les zones nationales sont réservées aux familles « premium ».
      expect((await estimate('targetType=national')).body.masked).toBe(true);
    });

    it('zones autour des lieux et répartition par âge : volumes anonymes', async () => {
      const brand = await createPartner(h);
      await createPlace(h, brand, 'Decathlon Lyon Part-Dieu', LYON);
      await createPlace(h, brand, 'Decathlon Paris Madeleine', PARIS);
      for (let i = 0; i < 23; i++) await seedFamily(h, { at: VILLEURBANNE, ages: [i % 2 ? 8 : 12], activeRecently: true });
      await seedFamily(h, { at: PARIS, ages: [5] });
      const res = await h.http.get(`/v1/partner/${brand.partnerId}/audience`).set(auth(brand.token)).expect(200);
      const lyon = res.body.zones.find((z: { name: string }) => z.name === 'Decathlon Lyon Part-Dieu');
      const paris = res.body.zones.find((z: { name: string }) => z.name === 'Decathlon Paris Madeleine');
      expect(lyon).toMatchObject({ families: 20, kids: 20, activeFamilies: 20, masked: false });
      expect(paris).toMatchObject({ masked: true, families: null });
      expect(res.body.ages.masked).toBe(false);
      expect(res.body.ages.bands.find((b: { id: string }) => b.id === '7-9').percent).toBe(46) // 11 sur 24 (l'enfant de Paris est dans la zone du lieu parisien);
      const places = await h.http.get(`/v1/partner/${brand.partnerId}/places`).set(auth(brand.token)).expect(200);
      expect(places.body[0].kidsWithin10km).toBe(20);
    });

    it('vues d’offres : une par personne et par jour, alimente « enfants touchés »', async () => {
      const brand = await createPartner(h);
      const offer = await publishOffer(h, brand, { kind: 'child_reward', title: 'Gourde', requiredPoints: 10 });
      const f = await familyWithChild(h);
      expect((await h.http.post(`/v1/offers/${offer.id}/impression`).set(auth(f.child.token)).expect(200)).body.recorded).toBe(true);
      expect((await h.http.post(`/v1/offers/${offer.id}/impression`).set(auth(f.child.token)).expect(200)).body.recorded).toBe(false);
      await h.http.post(`/v1/offers/${offer.id}/impression`).set(auth(f.parent.token)).expect(200);
      await h.http.post('/v1/offers/00000000-0000-4000-8000-000000000000/impression').set(auth(f.parent.token)).expect(404);
      const metric = await h.prisma.offerMetricDaily.findFirstOrThrow({ where: { offerId: offer.id } });
      expect(metric.views).toBe(2);
      const list = await h.http.get('/v1/admin/partners').set(auth(brand.adminToken)).expect(200);
      expect(list.body[0]).toMatchObject({ name: 'Decathlon France', kidsReached30d: 1, plan: 'Réseau', kindLabel: 'Enseigne', activeOffers: 1, depth: 0 });
      expect(registerParent).toBeDefined();
      expect(catalogActivity).toBeDefined();
      expect(createAdmin).toBeDefined();
    });
  });
});
