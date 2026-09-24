import { auth, createAdmin, registerParent } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

describe('Landing partenaires : grille tarifaire publique et demandes « Être rappelé »', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.mailer.sent.length = 0;
    await resetDb(h.prisma);
  });

  const lead = (over: Record<string, unknown> = {}) => ({ fullName: 'Julie Bernard', organization: 'Vélo Lyon', email: 'Julie@VeloLyon.fr', kind: 'store', ...over });

  it('la grille partenaires est lisible sans connexion', async () => {
    const res = await h.http.get('/v1/billing/plans').query({ audience: 'partner' }).expect(200);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual(['partner_local', 'partner_network', 'partner_public']);
    expect(res.body[0]).toMatchObject({ name: 'Partenaire local', monthlyPriceCents: 2900 });
    expect(res.body[0]).not.toHaveProperty('stripeProductId');
  });

  it('enregistre la demande, accuse réception et prévient l’équipe', async () => {
    const res = await h.http.post('/v1/partner-leads').send({ ...lead(), message: '  Deux magasins à Lyon  ' }).expect(202);
    expect(res.body).toEqual({ received: true });
    const rows = await h.prisma.partnerLead.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'julie@velolyon.fr', kind: 'store', status: 'new', source: 'landing', message: 'Deux magasins à Lyon' });
    expect(h.mailer.sent.map((m) => [m.to, m.subject])).toEqual([
      ['julie@velolyon.fr', 'Votre demande a bien été reçue'],
      ['equipe@rekonect.test', 'Nouvelle demande partenaire : Vélo Lyon'],
    ]);
    expect(h.mailer.sent[1].text).toContain('Julie Bernard · Vélo Lyon (Magasin)');
    expect(h.mailer.sent[1].text).toContain('/partners?tab=leads');
  });

  it('refuse une saisie invalide', async () => {
    const res = await h.http.post('/v1/partner-leads').send(lead({ email: 'pas-un-email', kind: 'mairie' })).expect(400);
    expect(JSON.stringify(res.body)).toMatch(/email|kind/);
    await h.http.post('/v1/partner-leads').send(lead({ fullName: 'J' })).expect(400);
    expect(await h.prisma.partnerLead.count()).toBe(0);
  });

  it('ignore les robots (piège) et les envois répétés, sans le révéler', async () => {
    await h.http.post('/v1/partner-leads').send(lead({ website: 'http://spam.example' })).expect(202);
    expect(await h.prisma.partnerLead.count()).toBe(0);
    for (let i = 0; i < 5; i++) await h.http.post('/v1/partner-leads').send(lead()).expect(202);
    expect(await h.prisma.partnerLead.count()).toBe(3);
    h.clock.set(new Date(TEST_NOW.getTime() + 25 * 3_600_000));
    await h.http.post('/v1/partner-leads').send(lead()).expect(202);
    expect(await h.prisma.partnerLead.count()).toBe(4);
  });

  it('l’admin liste les demandes et les traite ; personne d’autre', async () => {
    await h.http.post('/v1/partner-leads').send(lead()).expect(202);
    await h.http.post('/v1/partner-leads').send(lead({ email: 'mairie@ville.fr', organization: 'Ville de Lyon', kind: 'public_institution' })).expect(202);
    const admin = await createAdmin(h);
    const parent = await registerParent(h);
    await h.http.get('/v1/admin/partner-leads').set(auth(parent.token)).expect(403);
    await h.http.get('/v1/admin/partner-leads').expect(401);

    const list = await h.http.get('/v1/admin/partner-leads').set(auth(admin.token)).expect(200);
    expect(list.body.counts).toEqual({ new: 2 });
    expect(list.body.items.map((i: { kindLabel: string }) => i.kindLabel).sort()).toEqual(['Collectivité', 'Magasin']);

    const id = list.body.items[0].id;
    const done = await h.http.patch(`/v1/admin/partner-leads/${id}`).set(auth(admin.token)).send({ status: 'contacted' }).expect(200);
    expect(done.body).toMatchObject({ status: 'contacted', handledBy: admin.userId });
    expect(done.body.handledAt).not.toBeNull();
    const reopened = await h.http.patch(`/v1/admin/partner-leads/${id}`).set(auth(admin.token)).send({ status: 'new' }).expect(200);
    expect(reopened.body).toMatchObject({ status: 'new', handledBy: null, handledAt: null });

    await h.http.patch(`/v1/admin/partner-leads/${id}`).set(auth(admin.token)).send({ status: 'converted' }).expect(200);
    const filtered = await h.http.get('/v1/admin/partner-leads').query({ status: 'converted' }).set(auth(admin.token)).expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.counts).toEqual({ new: 1, converted: 1 });
    await h.http.patch('/v1/admin/partner-leads/00000000-0000-4000-8000-000000000000').set(auth(admin.token)).send({ status: 'archived' }).expect(404);
    await h.http.patch(`/v1/admin/partner-leads/${id}`).set(auth(admin.token)).send({ status: 'lost' }).expect(400);
  });
});
