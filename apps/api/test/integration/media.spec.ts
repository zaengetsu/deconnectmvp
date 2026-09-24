import { auth, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';
import { createPartner, publishOffer } from '../support/partners';

// PNG 1×1 transparent.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Visuels téléversés, exports et indicateurs partenaires', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    await resetDb(h.prisma);
  });

  it('un partenaire téléverse un visuel servi publiquement, puis l’utilise sur une offre', async () => {
    const p = await createPartner(h);
    const up = await h.http.post(`/v1/partner/${p.partnerId}/media`).set(auth(p.token)).send({ dataUrl: `data:image/png;base64,${PNG}` }).expect(201);
    expect(up.body).toMatchObject({ contentType: 'image/png', size: 70 });
    expect(up.body.url).toBe(`http://localhost:3000/v1/media/${up.body.id}`);
    const img = await h.http.get(`/v1/media/${up.body.id}`).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(img.body as Buffer, Buffer.from(PNG, 'base64'))).toBe(0);
    const offer = await publishOffer(h, p, { kind: 'child_reward', title: 'Gourde', requiredPoints: 10, imageUrl: up.body.url });
    expect(offer.imageUrl).toBe(up.body.url);
    await h.http.get('/v1/media/00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('refuse les faux types, les fichiers trop lourds et les non-membres', async () => {
    const p = await createPartner(h);
    const post = (dataUrl: string, token = p.token) => h.http.post(`/v1/partner/${p.partnerId}/media`).set(auth(token)).send({ dataUrl });
    expect((await post(`data:image/jpeg;base64,${PNG}`).expect(400)).body.code).toBe('MEDIA_INVALID');
    expect((await post(`data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`).expect(400)).body.code).toBe('MEDIA_INVALID');
    expect((await post('data:image/png;base64,').expect(400)).body.code).toBe('MEDIA_INVALID');
    const big = Buffer.alloc(2 * 1024 * 1024 + 10);
    Buffer.from(PNG, 'base64').copy(big);
    expect((await post(`data:image/png;base64,${big.toString('base64')}`).expect(400)).body.code).toBe('MEDIA_TOO_LARGE');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64');
    await post(`data:image/jpeg;base64,${jpeg}`).expect(201);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]).toString('base64');
    await post(`data:image/webp;base64,${webp}`).expect(201);
    const parent = await registerParent(h);
    await post(`data:image/png;base64,${PNG}`, parent.token).expect(404);
  });

  it('admin : export CSV des familles et indicateurs partenaires', async () => {
    const p = await createPartner(h);
    await publishOffer(h, p, { kind: 'child_reward', title: 'Gourde', requiredPoints: 10 });
    const a = await registerParent(h, 'Camille Dupont');
    await setFamilyPlan(h, a.userId, 'family');
    const csv = await h.http.get('/v1/admin/families.csv?plan=family').set(auth(p.adminToken)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('familles-rekonect.csv');
    const lines = csv.text.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('famille;parent;email;ville;enfants;plan;inscrite le;dernière activité;statut');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Famille Dupont";"Camille Dupont"');
    // Abonnement créé par l'admin sans paiement : pas de MRR tant que Stripe n'a rien facturé.
    expect((await h.http.get('/v1/admin/partner-stats').set(auth(p.adminToken))).body.partnerMrrCents).toBe(0);
    await h.prisma.subscription.updateMany({ where: { partnerId: p.partnerId }, data: { amountCents: 29000 } });
    const stats = await h.http.get('/v1/admin/partner-stats').set(auth(p.adminToken)).expect(200);
    expect(stats.body).toEqual({ accounts: 1, activeOffers: 1, vouchersUsed30d: 0, partnerMrrCents: 29000 });
  });
});
