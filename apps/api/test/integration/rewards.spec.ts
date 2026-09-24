import { auth, familyWithChild, notificationsOf, registerParent } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

describe('Récompenses : catalogue, demandes, relances', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    await resetDb(h.prisma);
  });

  async function givePoints(childId: string, points: number) {
    await h.prisma.child.update({ where: { id: childId }, data: { totalPoints: points } });
  }

  it('récompenses de la famille : création, catalogue, activation, suppression', async () => {
    const { parent, child, childId } = await familyWithChild(h);
    const other = await registerParent(h);
    const custom = await h.http.post('/v1/rewards').set(auth(parent.token)).send({ title: 'Choisir le film', requiredPoints: 50 }).expect(201);
    await h.http.post('/v1/rewards').set(auth(other.token)).send({ title: 'Pirate', requiredPoints: 1, childId }).expect(404);

    const catalog = await h.http.get('/v1/rewards/catalog').set(auth(parent.token)).expect(200);
    expect(catalog.body.length).toBeGreaterThan(20);
    expect(catalog.body.every((r: { rewardType: string }) => r.rewardType === 'catalog')).toBe(true);
    const activated = await h.http.post(`/v1/rewards/catalog/${catalog.body[0].id}/activate`).set(auth(parent.token)).send({ childId }).expect(201);
    expect(activated.body).toMatchObject({ parentId: parent.userId, childId, rewardType: 'custom' });
    await h.http.post(`/v1/rewards/catalog/${custom.body.id}/activate`).set(auth(parent.token)).send({}).expect(404);

    await givePoints(childId, 60);
    const forChild = await h.http.get('/v1/rewards').set(auth(child.token)).expect(200);
    const film = forChild.body.find((r: { id: string }) => r.id === custom.body.id);
    expect(film).toMatchObject({ affordable: true, missingPoints: 0 });

    const forParent = await h.http.get(`/v1/rewards?childId=${childId}`).set(auth(parent.token)).expect(200);
    expect(forParent.body).toHaveLength(2);

    await h.http.patch(`/v1/rewards/${custom.body.id}`).set(auth(parent.token)).send({ requiredPoints: 70 }).expect(200);
    await h.http.patch(`/v1/rewards/${custom.body.id}`).set(auth(other.token)).send({ requiredPoints: 1 }).expect(404);
    await h.http.delete(`/v1/rewards/${custom.body.id}`).set(auth(parent.token)).expect(200);
    expect((await h.http.get('/v1/rewards').set(auth(parent.token)).expect(200)).body).toHaveLength(1);
  });

  it('demande → notification parent prioritaire + relances 24 h / 48 h ; approbation → débit, enfant prévenu, relances annulées', async () => {
    const { parent, child, childId } = await familyWithChild(h, { name: 'Emma' });
    const reward = await h.http.post('/v1/rewards').set(auth(parent.token)).send({ title: 'Choisir le dessert', requiredPoints: 40 }).expect(201);

    const tooPoor = await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(child.token)).expect(409);
    expect(tooPoor.body.message).toBe('Encore 40 points avant cette récompense');
    await givePoints(childId, 50);

    const req = await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(child.token)).expect(201);
    await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(child.token)).expect(409);
    await h.drain();

    const parentNotifs = (await notificationsOf(h, parent.userId)).filter((n) => n.type?.startsWith('reward_'));
    expect(parentNotifs.map((n) => [n.type, n.status, n.priority])).toEqual([
      ['reward_requested', 'sent', 'high'],
      ['reward_pending', 'scheduled', 'normal'],
      ['reward_pending', 'scheduled', 'low'],
    ]);
    expect(parentNotifs[0].title).toBe('🎁 Emma a débloqué une récompense');
    expect(parentNotifs[0].route).toBe(`/parent/rewards/requests/${req.body.id}`);

    // 24 h plus tard, toujours en attente : relance.
    h.clock.set('2026-09-24T10:01:00Z');
    expect(await h.scheduler.releaseDue()).toMatchObject({ released: 1 });

    const approved = await h.http.post(`/v1/reward-requests/${req.body.id}/approve`).set(auth(parent.token)).send({}).expect(200);
    expect(approved.body).toMatchObject({ success: true, pointsDeducted: 40, code: null });
    await h.http.post(`/v1/reward-requests/${req.body.id}/approve`).set(auth(parent.token)).send({}).expect(409);
    await h.drain();

    expect((await h.prisma.child.findUniqueOrThrow({ where: { id: childId } })).totalPoints).toBe(10);
    const pending48 = await h.prisma.notification.findFirstOrThrow({ where: { dedupKey: `reward_pending48:${req.body.id}` } });
    expect(pending48.status).toBe('cancelled');
    expect((await notificationsOf(h, childId, 'reward_approved'))[0].title).toBe('🎁 Ta récompense est validée !');

    await h.http.post(`/v1/reward-requests/${req.body.id}/deliver`).set(auth(parent.token)).expect(200);
    await h.http.post(`/v1/reward-requests/${req.body.id}/deliver`).set(auth(parent.token)).expect(409);
    const list = await h.http.get('/v1/reward-requests?status=completed').set(auth(child.token)).expect(200);
    expect(list.body).toHaveLength(1);
    await h.drain();
  });

  it('refus : message bienveillant, relances coupées ; points insuffisants au moment d’approuver', async () => {
    const { parent, child, childId } = await familyWithChild(h);
    const reward = await h.http.post('/v1/rewards').set(auth(parent.token)).send({ title: 'Soirée jeux', requiredPoints: 30 }).expect(201);
    await givePoints(childId, 30);
    const r1 = await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(child.token)).expect(201);
    await h.http.post(`/v1/reward-requests/${r1.body.id}/reject`).set(auth(parent.token)).send({ note: 'Ce week-end plutôt !' }).expect(200);
    await h.http.post(`/v1/reward-requests/${r1.body.id}/reject`).set(auth(parent.token)).send({}).expect(409);
    await h.drain();
    const [ko] = await notificationsOf(h, childId, 'reward_rejected');
    expect(ko.body).toBe('Ce week-end plutôt !');
    expect(await h.prisma.notification.count({ where: { type: 'reward_pending', status: 'scheduled' } })).toBe(0);

    const r2 = await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(child.token)).expect(201);
    await givePoints(childId, 10);
    const res = await h.http.post(`/v1/reward-requests/${r2.body.id}/approve`).set(auth(parent.token)).send({}).expect(409);
    expect(res.body.code).toBe('NOT_ENOUGH_POINTS');

    const all = await h.http.get(`/v1/reward-requests?childId=${childId}`).set(auth(parent.token)).expect(200);
    expect(all.body).toHaveLength(2);
    const other = await registerParent(h);
    await h.http.post(`/v1/reward-requests/${r2.body.id}/approve`).set(auth(other.token)).send({}).expect(404);
    await h.http.get(`/v1/reward-requests?childId=${childId}`).set(auth(other.token)).expect(404);
  });

  it('un enfant ne peut demander que les récompenses de sa famille qui le concernent', async () => {
    const a = await familyWithChild(h);
    const b = await familyWithChild(h);
    const reward = await h.http.post('/v1/rewards').set(auth(a.parent.token)).send({ title: 'Pour la famille A', requiredPoints: 0 }).expect(201);
    await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(b.child.token)).expect(404);
    await h.http.post(`/v1/rewards/${reward.body.id}/request`).set(auth(a.parent.token)).expect(403);
  });
});
