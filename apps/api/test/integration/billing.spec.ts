import { auth, createChild, familyWithChild, notificationsOf, registerParent, setFamilyPlan, uniqueEmail } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

describe('Abonnements : plans, limites, Stripe, codes, métriques', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.billing.enabled = true;
    h.billing.calls.length = 0;
    await resetDb(h.prisma);
  });

  /** Envoie un webhook « signé » (la passerelle de test accepte la signature « valid »). */
  const webhook = (event: unknown, signature = 'valid') =>
    h.http.post('/v1/billing/webhook').set('stripe-signature', signature).set('content-type', 'application/json').send(JSON.stringify(event));

  async function checkoutAndPay(token: string, parentId: string, planId = 'family', interval: 'month' | 'year' = 'month') {
    await h.http.post('/v1/billing/checkout').set(auth(token)).send({ planId, interval }).expect(200);
    const checkout = h.billing.calls.filter((c) => c.method === 'createCheckout').at(-1)!.args as { customerId: string; priceId: string; metadata: Record<string, string> };
    const sub = h.billing.seedSubscription({ customerId: checkout.customerId, priceId: checkout.priceId, metadata: checkout.metadata });
    await webhook({ id: `evt_${sub.id}_co`, type: 'checkout.completed', customerId: checkout.customerId, subscriptionId: sub.id, metadata: checkout.metadata }).expect(200);
    return sub;
  }

  it('plans publics et résumé d’abonnement d’une nouvelle famille', async () => {
    const parent = await registerParent(h);
    const plans = await h.http.get('/v1/billing/plans').set(auth(parent.token)).expect(200);
    expect(plans.body.map((p: { id: string }) => p.id)).toEqual(['free', 'family', 'family_plus']);
    expect(plans.body[1]).toMatchObject({ name: 'Famille', monthlyPriceCents: 499, annualPriceCents: 4900, tag: 'LE PLUS CHOISI' });
    expect(plans.body[1].stripeMonthlyPriceId).toBeUndefined();
    const pro = await h.http.get('/v1/billing/plans?audience=partner').set(auth(parent.token)).expect(200);
    expect(pro.body.map((p: { name: string }) => p.name)).toEqual(['Partenaire local', 'Réseau', 'Collectivité & CSE']);

    const sub = await h.http.get('/v1/billing/subscription').set(auth(parent.token)).expect(200);
    expect(sub.body).toMatchObject({ plan: { id: 'free' }, limits: { maxChildren: 1 }, usage: { children: 0 }, status: 'active', paymentsEnabled: true });
  });

  it('limites du plan gratuit : 1 enfant, 5 activités perso ; lecture seule après une baisse de plan', async () => {
    const parent = await registerParent(h);
    const first = await createChild(h, parent, 'Léa');
    const res = await h.http.post('/v1/children').set(auth(parent.token)).send({ displayName: 'Tom', age: 8 }).expect(403);
    expect(res.body).toMatchObject({ code: 'PLAN_LIMIT_CHILDREN' });
    for (let i = 0; i < 5; i++) await h.http.post('/v1/activities').set(auth(parent.token)).send({ title: `Perso ${i}` }).expect(201);
    expect((await h.http.post('/v1/activities').set(auth(parent.token)).send({ title: 'Une de trop' }).expect(403)).body.code).toBe('PLAN_LIMIT_ACTIVITIES');

    await setFamilyPlan(h, parent.userId, 'family');
    const second = await createChild(h, parent, 'Tom', 8);
    await h.http.post('/v1/activities').set(auth(parent.token)).send({ title: 'Illimitées maintenant' }).expect(201);

    // Retour au gratuit : rien n'est supprimé, le 2e profil passe en lecture seule.
    await setFamilyPlan(h, parent.userId, 'free');
    const activity = await h.prisma.activity.findFirstOrThrow({ where: { activityType: 'catalog' } });
    await h.http.post(`/v1/children/${first}/activities`).set(auth(parent.token)).send({ activityId: activity.id }).expect(201);
    const ro = await h.http.post(`/v1/children/${second}/activities`).set(auth(parent.token)).send({ activityId: activity.id }).expect(403);
    expect(ro.body.code).toBe('CHILD_READ_ONLY');
    expect((await h.http.get('/v1/children').set(auth(parent.token)).expect(200)).body).toHaveLength(2);
  });

  it('checkout Stripe → webhook : abonnement actif, limites relevées, événement « Nouvel abonnement »', async () => {
    const parent = await registerParent(h, 'Nadia Simon');
    const out = await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'family', interval: 'year' }).expect(200);
    expect(out.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const call = h.billing.calls.find((c) => c.method === 'createCheckout')!.args as { priceId: string; metadata: Record<string, string>; successUrl: string; customerId: string };
    expect(call.metadata).toMatchObject({ ownerKind: 'family', ownerId: parent.userId, planId: 'family', interval: 'year' });
    expect(call.successUrl).toBe('rekonect://parent/subscription?checkout=success');

    const plan = await h.prisma.plan.findUniqueOrThrow({ where: { id: 'family' } });
    expect(call.priceId).toBe(plan.stripeAnnualPriceId);
    const sub = h.billing.seedSubscription({ customerId: call.customerId, priceId: call.priceId, metadata: call.metadata });
    await webhook({ id: 'evt_1', type: 'checkout.completed', customerId: call.customerId, subscriptionId: sub.id, metadata: call.metadata }).expect(200);
    const dup = await webhook({ id: 'evt_1', type: 'checkout.completed', customerId: call.customerId, subscriptionId: sub.id, metadata: call.metadata }).expect(200);
    expect(dup.body.duplicate).toBe(true);

    const summary = await h.http.get('/v1/billing/subscription').set(auth(parent.token)).expect(200);
    expect(summary.body).toMatchObject({ plan: { id: 'family' }, status: 'active', interval: 'year', amountCents: 4900, monthlyAmountCents: 408, limits: { maxChildren: 4 } });
    const events = await h.prisma.subscriptionEvent.findMany({ where: { parentId: parent.userId } });
    expect(events.map((e) => [e.type, e.description, e.amountCents])).toEqual([['created', 'Nouvel abonnement Famille (annuel)', 4900]]);
    await h.drain();
    expect((await h.prisma.outboxEvent.findFirstOrThrow({ where: { type: 'billing.subscription_changed' } })).payload).toMatchObject({ planId: 'family', previousPlanId: 'free' });

    await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'family_plus' }).expect(409);
  });

  it('changement de plan, résiliation programmée puis annulée, suppression → retour au gratuit', async () => {
    const parent = await registerParent(h);
    const sub = await checkoutAndPay(parent.token, parent.userId, 'family');

    const up = await h.http.post('/v1/billing/change-plan').set(auth(parent.token)).send({ planId: 'family_plus' }).expect(200);
    expect(up.body).toMatchObject({ plan: { id: 'family_plus' }, amountCents: 799 });
    await webhook({ id: 'evt_up', type: 'subscription.updated', subscription: { ...(await h.billing.retrieveSubscription(sub.id)) } }).expect(200);

    await h.http.post('/v1/billing/cancel').set(auth(parent.token)).send({ reason: 'enfants trop grands' }).expect(200);
    expect((await h.http.get('/v1/billing/subscription').set(auth(parent.token))).body.cancelAtPeriodEnd).toBe(true);
    await h.http.post('/v1/billing/resume').set(auth(parent.token)).expect(200);
    await h.http.post('/v1/billing/resume').set(auth(parent.token)).expect(400);
    await h.http.post('/v1/billing/cancel').set(auth(parent.token)).send({ reason: 'enfants trop grands' }).expect(200);

    await webhook({ id: 'evt_del', type: 'subscription.deleted', subscription: { ...(await h.billing.retrieveSubscription(sub.id)) } }).expect(200);
    const after = await h.http.get('/v1/billing/subscription').set(auth(parent.token)).expect(200);
    expect(after.body).toMatchObject({ plan: { id: 'free' }, status: 'cancelled', hasPaymentMethod: false });
    const types = (await h.prisma.subscriptionEvent.findMany({ where: { parentId: parent.userId }, orderBy: { occurredAt: 'asc' } })).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['created', 'cancel_scheduled', 'reactivated', 'canceled']));
    const canceled = await h.prisma.subscriptionEvent.findFirstOrThrow({ where: { type: 'canceled' } });
    expect(canceled.description).toBe('Résiliation · « enfants trop grands »');
    await h.http.post('/v1/billing/cancel').set(auth(parent.token)).send({}).expect(400);
  });

  it('factures : payée, échec de paiement → impayé + notification + email, régularisation', async () => {
    const { parent } = await familyWithChild(h);
    const sub = await checkoutAndPay(parent.token, parent.userId);
    const invoice = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      number: `RK-${id}`,
      customerId: sub.customerId,
      subscriptionId: sub.id,
      amountPaidCents: 499,
      amountDueCents: 499,
      currency: 'eur',
      status: 'paid',
      billingReason: 'subscription_cycle',
      hostedUrl: 'https://invoice.stripe.test',
      pdfUrl: 'https://invoice.stripe.test/pdf',
      periodStart: '2026-09-01T00:00:00Z',
      periodEnd: '2026-10-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
      ...extra,
    });
    await webhook({ id: 'evt_inv1', type: 'invoice.paid', invoice: invoice('in_1') }).expect(200);
    await webhook({ id: 'evt_inv2', type: 'invoice.payment_failed', invoice: invoice('in_2', { status: 'open', amountPaidCents: 0, periodStart: '2026-10-01T00:00:00Z' }) }).expect(200);

    const invoices = await h.http.get('/v1/billing/invoices').set(auth(parent.token)).expect(200);
    expect(invoices.body.map((i: { label: string; status: string }) => [i.label, i.status])).toEqual([
      ['Octobre 2026', 'open'],
      ['Septembre 2026', 'paid'],
    ]);
    expect((await h.http.get('/v1/billing/subscription').set(auth(parent.token))).body.status).toBe('past_due');
    // L'accès est conservé pendant la relance.
    expect((await h.http.get('/v1/billing/subscription').set(auth(parent.token))).body.plan.id).toBe('family');

    await h.drain();
    const [notif] = await notificationsOf(h, parent.userId, 'billing');
    expect(notif).toMatchObject({ title: '💳 Paiement refusé', priority: 'high', route: '/parent/subscription' });
    expect(notif.channels).toEqual(['in_app', 'push', 'email']);

    await webhook({ id: 'evt_inv3', type: 'invoice.paid', invoice: invoice('in_2', { periodStart: '2026-10-01T00:00:00Z' }) }).expect(200);
    expect((await h.http.get('/v1/billing/subscription').set(auth(parent.token))).body.status).toBe('active');
    const types = (await h.prisma.subscriptionEvent.findMany({ where: { parentId: parent.userId } })).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['renewed', 'payment_failed', 'payment_succeeded']));
  });

  it('webhook : signature invalide refusée, événements inconnus ignorés', async () => {
    await webhook({ id: 'evt_x', type: 'ignored', raw: 'customer.created' }, 'forged').expect(400);
    const ok = await webhook({ id: 'evt_y', type: 'ignored', raw: 'customer.created' }).expect(200);
    expect(ok.body.type).toBe('ignored');
    // Abonnement inconnu : accusé de réception sans effet.
    await webhook({ id: 'evt_z', type: 'subscription.updated', subscription: { ...h.billing.seedSubscription({ customerId: 'cus_ghost', priceId: 'price_ghost' }) } }).expect(200);
  });

  it('paiements non configurés → 503 explicite ; plan sur devis non achetable', async () => {
    const parent = await registerParent(h);
    h.billing.enabled = false;
    expect((await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'family' }).expect(503)).body.code).toBe('BILLING_DISABLED');
    await h.http.post('/v1/billing/portal').set(auth(parent.token)).expect(503);
    h.billing.enabled = true;
    await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'partner_network' }).expect(400);
    await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'free' }).expect(400);
    await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'nope' }).expect(404);
    const portal = await h.http.post('/v1/billing/portal').set(auth(parent.token)).expect(200);
    expect(portal.body.url).toMatch(/portal\/cus_/);
  });

  describe('codes', () => {
    async function admin() {
      const { createAdmin } = await import('../support/fixtures');
      return createAdmin(h);
    }

    it('code sponsorisé (CSE) : plan Famille offert, compteur de licences, une fois par famille', async () => {
      const a = await admin();
      const cse = await h.prisma.partner.create({ data: { name: 'CSE Airbus Toulouse', slug: 'cse-airbus', kind: 'cse' } });
      await h.http.post('/v1/admin/promo-codes').set(auth(a.token)).send({ code: 'cse-airbus', description: 'Plan Famille offert 12 mois · payé par le CSE', kind: 'sponsored', durationMonths: 12, sponsorPartnerId: cse.id, maxRedemptions: 1, planId: 'family' }).expect(201);
      await h.http.post('/v1/admin/promo-codes').set(auth(a.token)).send({ code: 'CSE-AIRBUS', description: 'doublon', kind: 'free_months', durationMonths: 1 }).expect(409);

      const p1 = await registerParent(h);
      const res = await h.http.post('/v1/billing/redeem').set(auth(p1.token)).send({ code: ' cse-airbus ' }).expect(200);
      expect(res.body).toMatchObject({ kind: 'comp', planId: 'family', sponsor: 'CSE Airbus Toulouse' });
      expect(new Date(res.body.compUntil).toISOString()).toBe('2027-09-23T10:00:00.000Z');
      const sub = await h.http.get('/v1/billing/subscription').set(auth(p1.token)).expect(200);
      expect(sub.body).toMatchObject({ plan: { id: 'family' }, source: 'comp', limits: { maxChildren: 4 } });
      await h.http.post('/v1/billing/redeem').set(auth(p1.token)).send({ code: 'CSE-AIRBUS' }).expect(400); // licences épuisées

      const p2 = await registerParent(h);
      expect((await h.http.post('/v1/billing/redeem').set(auth(p2.token)).send({ code: 'CSE-AIRBUS' }).expect(400)).body.code).toBe('PROMO_EXHAUSTED');
      const codes = await h.http.get('/v1/admin/promo-codes').set(auth(a.token)).expect(200);
      expect(codes.body[0]).toMatchObject({ code: 'CSE-AIRBUS', redemptions: 1, state: 'expired', sponsor: { name: 'CSE Airbus Toulouse' } });
    });

    it('mois offerts cumulables ; remise vérifiée puis appliquée au paiement ; codes expirés ou désactivés refusés', async () => {
      const a = await admin();
      await h.http.post('/v1/admin/promo-codes').set(auth(a.token)).send({ code: 'NOEL25', description: '1 mois offert', kind: 'free_months', durationMonths: 1, expiresAt: '2026-12-31T23:00:00.000Z' }).expect(201);
      const rentree = await h.http.post('/v1/admin/promo-codes').set(auth(a.token)).send({ code: 'RENTREE26', description: '−30 % pendant 3 mois', kind: 'percent', percentOff: 30, durationMonths: 3 }).expect(201);
      expect(rentree.body.stripePromotionCodeId).toMatch(/^promo_test_/);
      await h.http.post('/v1/admin/promo-codes').set(auth(a.token)).send({ code: 'BAD', description: 'sans pourcentage', kind: 'percent' }).expect(400);

      const parent = await registerParent(h);
      const d = await h.http.post('/v1/billing/redeem').set(auth(parent.token)).send({ code: 'rentree26' }).expect(200);
      expect(d.body).toMatchObject({ kind: 'discount', percentOff: 30 });
      await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'family', promoCode: 'RENTREE26' }).expect(200);
      expect((h.billing.calls.filter((c) => c.method === 'createCheckout').at(-1)!.args as { promotionCodeId: string }).promotionCodeId).toBe(rentree.body.stripePromotionCodeId);
      await h.http.post('/v1/billing/checkout').set(auth(parent.token)).send({ planId: 'family', promoCode: 'NOEL25' }).expect(400);

      const other = await registerParent(h);
      await h.http.post('/v1/billing/redeem').set(auth(other.token)).send({ code: 'NOEL25' }).expect(200);
      await h.http.post('/v1/billing/redeem').set(auth(other.token)).send({ code: 'NOEL25' }).expect(409);
      await h.http.patch(`/v1/admin/promo-codes/${rentree.body.id}`).set(auth(a.token)).send({ isActive: false }).expect(200);
      await h.http.post('/v1/billing/redeem').set(auth(other.token)).send({ code: 'RENTREE26' }).expect(400);
      h.clock.set('2027-01-02T00:00:00Z');
      await h.http.post('/v1/billing/redeem').set(auth(parent.token)).send({ code: 'NOEL25' }).expect(400);
    });
  });

  describe('administration', () => {
    it('métriques business : MRR, répartition, conversion, churn, paiements échoués, événements', async () => {
      const { createAdmin } = await import('../support/fixtures');
      const a = await createAdmin(h);
      const free = await registerParent(h);
      const fam = await registerParent(h, 'Marie Dupont');
      const plus = await registerParent(h, 'Karim Leroy');
      await checkoutAndPay(fam.token, fam.userId, 'family');
      await checkoutAndPay(plus.token, plus.userId, 'family_plus', 'year');
      await h.prisma.subscription.updateMany({ where: { parentId: fam.userId }, data: { status: 'past_due' } });
      const partner = await h.prisma.partner.create({ data: { name: 'Decathlon France', slug: 'dfr', kind: 'brand' } });
      await h.prisma.subscription.create({ data: { partnerId: partner.id, plan: 'partner_network', status: 'active', amountCents: 29000 } });
      expect(free).toBeTruthy();

      const o = await h.http.get('/v1/admin/billing/overview').set(auth(a.token)).expect(200);
      expect(o.body).toMatchObject({ familyMrrCents: 499 + 658, partnerMrrCents: 29000, mrrCents: 499 + 658 + 29000, families: 3, payingFamilies: 2, failedPayments: 1 });
      expect(o.body.conversionRate).toBe(66.7);
      expect(o.body.distribution.map((d: { planId: string; count: number }) => [d.planId, d.count])).toEqual([['free', 1], ['family', 1], ['family_plus', 1]]);

      const plans = await h.http.get('/v1/admin/plans?audience=partner').set(auth(a.token)).expect(200);
      expect(plans.body.find((p: { id: string }) => p.id === 'partner_network')).toMatchObject({ subscribers: 1, mrrCents: 29000 });
      const events = await h.http.get('/v1/admin/billing/events').set(auth(a.token)).expect(200);
      expect(events.body[0].who).toMatch(/^Famille (Leroy|Dupont)$/);
    });

    it('modifier un plan : nouveau prix Stripe, limites fusionnées ; offrir des mois ; historique de paiement', async () => {
      const { createAdmin } = await import('../support/fixtures');
      const a = await createAdmin(h);
      const upd = await h.http.patch('/v1/admin/plans/family').set(auth(a.token)).send({ monthlyPriceCents: 549, limits: { maxChildren: 5 }, features: ['Jusqu’à 5 enfants'] }).expect(200);
      expect(upd.body).toMatchObject({ monthlyPriceCents: 549, limits: { maxChildren: 5, maxCoParents: 1 } });
      expect(upd.body.stripeMonthlyPriceId).toMatch(/^price_family_month/);
      await h.http.patch('/v1/admin/plans/nope').set(auth(a.token)).send({ name: 'Xy' }).expect(404);

      const parent = await registerParent(h);
      const gift = await h.http.post(`/v1/admin/families/${parent.userId}/gift`).set(auth(a.token)).send({ months: 1 }).expect(200);
      expect(new Date(gift.body.compUntil).toISOString()).toBe('2026-10-23T10:00:00.000Z');
      await h.http.post(`/v1/admin/families/${parent.userId}/gift`).set(auth(a.token)).send({ months: 1 }).expect(200);
      expect((await h.http.get('/v1/billing/subscription').set(auth(parent.token))).body).toMatchObject({ plan: { id: 'family' }, source: 'comp' });
      const pay = await h.http.get(`/v1/admin/families/${parent.userId}/payments`).set(auth(a.token)).expect(200);
      expect(pay.body.events).toHaveLength(2);
      await h.http.post(`/v1/admin/families/${parent.userId}/gift`).set(auth(a.token)).send({ months: 1, planId: 'free' }).expect(404);
      await h.http.post(`/v1/admin/families/00000000-0000-4000-8000-000000000000/gift`).set(auth(a.token)).send({ months: 1 }).expect(404);
      await h.http.get('/v1/admin/billing/overview').set(auth(parent.token)).expect(403);
      expect(uniqueEmail()).toContain('@');
    });
  });
});
