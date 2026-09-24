import { auth, createChild, familyWithChild, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb } from '../support/harness';

describe('Familles : profil, enfants, co-parents', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(() => resetDb(h.prisma));

  it('profil parent : lecture et mise à jour', async () => {
    const parent = await registerParent(h);
    const p = await h.http.get('/v1/profile').set(auth(parent.token)).expect(200);
    expect(p.body).toMatchObject({ id: parent.userId, subscription: { plan: 'free' } });
    const u = await h.http.patch('/v1/profile').set(auth(parent.token)).send({ fullName: 'Camille M.', city: 'Lyon', parentRole: 'maman' }).expect(200);
    expect(u.body).toMatchObject({ fullName: 'Camille M.', city: 'Lyon' });
    expect((await h.prisma.user.findUniqueOrThrow({ where: { id: parent.userId } })).fullName).toBe('Camille M.');
    await h.http.patch('/v1/profile').set(auth(parent.token)).send({ city: 'Paris' }).expect(200);
  });

  it('enfants : création avec préférences silencieuses par défaut, lecture, modification, archivage', async () => {
    const parent = await registerParent(h);
    const id = await createChild(h, parent, 'Lucas', 9);
    const prefs = await h.prisma.notificationPreference.findFirstOrThrow({ where: { childId: id } });
    expect(prefs.quietHoursStart?.toISOString().slice(11, 16)).toBe('20:30');

    const list = await h.http.get('/v1/children').set(auth(parent.token)).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id, displayName: 'Lucas', age: 9 })]);
    await h.http.get(`/v1/children/${id}`).set(auth(parent.token)).expect(200);
    const upd = await h.http.patch(`/v1/children/${id}`).set(auth(parent.token)).send({ age: 10 }).expect(200);
    expect(upd.body.age).toBe(10);

    await h.http.post('/v1/children').set(auth(parent.token)).send({ displayName: 'Bébé', age: 1 }).expect(400);
    await h.http.get('/v1/children/pas-un-uuid').set(auth(parent.token)).expect(400);

    await h.http.delete(`/v1/children/${id}`).set(auth(parent.token)).expect(200);
    expect((await h.http.get('/v1/children').set(auth(parent.token)).expect(200)).body).toHaveLength(0);
    await h.drain();
    expect(await h.prisma.outboxEvent.count({ where: { type: 'child.created', status: 'published' } })).toBe(1);
  });

  it('un nouveau code de liaison invalide le précédent', async () => {
    const parent = await registerParent(h);
    const id = await createChild(h, parent);
    const first = await h.http.post(`/v1/children/${id}/link-code`).set(auth(parent.token)).expect(201);
    await h.http.post(`/v1/children/${id}/link-code`).set(auth(parent.token)).expect(201);
    await h.http.post('/v1/auth/child/link').send({ code: first.body.code, pin: '1234' }).expect(400);
  });

  it('les routes parent sont interdites aux enfants et aux autres familles', async () => {
    const a = await familyWithChild(h);
    const b = await registerParent(h);
    await h.http.get('/v1/children').set(auth(a.child.token)).expect(403);
    await h.http.get(`/v1/children/${a.childId}`).set(auth(b.token)).expect(404);
    await h.http.patch(`/v1/children/${a.childId}`).set(auth(b.token)).send({ age: 12 }).expect(404);
    await h.http.post(`/v1/children/${a.childId}/link-code`).set(auth(b.token)).expect(404);
  });

  it('co-parent : invitation, acceptation, liste et révocation', async () => {
    const owner = await registerParent(h, 'Camille');
    const other = await registerParent(h, 'Alex');
    // Plan gratuit : pas de co-parent.
    const blocked = await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({ memberRole: 'co_parent' }).expect(403);
    expect(blocked.body.code).toBe('PLAN_LIMIT_COPARENTS');
    await setFamilyPlan(h, owner.userId, 'family');
    const inv = await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({ memberRole: 'co_parent', email: other.email }).expect(201);

    await h.http.post('/v1/family/invitations/accept').set(auth(owner.token)).send({ token: inv.body.token }).expect(400);
    const acc = await h.http.post('/v1/family/invitations/accept').set(auth(other.token)).send({ token: inv.body.token }).expect(200);
    expect(acc.body).toEqual({ ownerName: 'Camille', role: 'co_parent' });
    await h.http.post('/v1/family/invitations/accept').set(auth(other.token)).send({ token: inv.body.token }).expect(400);

    const members = await h.http.get('/v1/family/members').set(auth(owner.token)).expect(200);
    expect(members.body.members).toHaveLength(1);
    const memberships = await h.http.get('/v1/family/members').set(auth(other.token)).expect(200);
    expect(memberships.body.memberships[0].owner.fullName).toBe('Camille');

    // Plan Famille : 1 co-parent. Le plafond est atteint, mais un membre existant peut être mis à jour.
    await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({ memberRole: 'grandparent' }).expect(403);
    await setFamilyPlan(h, owner.userId, 'family_plus');
    const inv2 = await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({ memberRole: 'grandparent' }).expect(201);
    await h.http.post('/v1/family/invitations/accept').set(auth(other.token)).send({ token: inv2.body.token }).expect(200);
    expect(await h.prisma.familyMember.count()).toBe(1);

    await h.http.delete(`/v1/family/members/${members.body.members[0].id}`).set(auth(owner.token)).expect(200);
    await h.http.delete(`/v1/family/members/${members.body.members[0].id}`).set(auth(other.token)).expect(404);
  });
});
