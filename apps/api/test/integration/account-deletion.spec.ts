import { auth, catalogActivity, completeActivity, familyWithChild, linkChild, notificationsOf, registerParent, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb } from '../support/harness';

describe('Suppression du compte par son titulaire (DELETE /v1/auth/account)', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDb(h.prisma);
    h.mailer.sent.length = 0;
    h.billing.calls.length = 0;
  });

  it('efface la famille, ferme les sessions, résilie Stripe et confirme par email', async () => {
    const { parent, child, childId } = await familyWithChild(h);
    const other = await familyWithChild(h, { name: 'Lucas' });
    await completeActivity(h, parent, child, (await catalogActivity(h)).id);
    await h.http.post('/v1/push-tokens').set(auth(parent.token)).send({ token: 'ios-token-a-effacer', platform: 'ios' }).expect(200);
    const sub = h.billing.seedSubscription({ customerId: 'cus_famille', priceId: 'price_x' });
    await h.prisma.subscription.updateMany({ where: { parentId: parent.userId }, data: { stripeSubscriptionId: sub.id, stripeCustomerId: 'cus_famille' } });
    // Preuves en base (media_files) : sans clé étrangère vers l'enfant, elles partent par l'événement.
    const proof = { kind: 'proof', contentType: 'image/jpeg', size: 3, data: Uint8Array.from([1, 2, 3]) };
    await h.prisma.mediaFile.create({ data: { ...proof, childId } });
    await h.prisma.mediaFile.create({ data: { ...proof, childId: other.childId } });
    await h.drain();
    expect((await notificationsOf(h, parent.userId)).length + (await notificationsOf(h, childId)).length).toBeGreaterThan(0);
    h.mailer.sent.length = 0;

    // Mot de passe exigé, et seul un parent peut supprimer son compte.
    await h.http.delete('/v1/auth/account').set(auth(parent.token)).send({}).expect(400);
    const wrong = await h.http.delete('/v1/auth/account').set(auth(parent.token)).send({ password: 'mauvais' }).expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    await h.http.delete('/v1/auth/account').set(auth(child.token)).send({ password: 'motdepasse-solide' }).expect(403);
    await h.http.delete('/v1/auth/account').send({ password: 'motdepasse-solide' }).expect(401);

    await h.http.delete('/v1/auth/account').set(auth(parent.token)).send({ password: 'motdepasse-solide' }).expect(204);

    expect(await h.prisma.user.findUnique({ where: { id: parent.userId } })).toBeNull();
    expect(await h.prisma.profile.findUnique({ where: { id: parent.userId } })).toBeNull();
    expect(await h.prisma.child.count({ where: { parentId: parent.userId } })).toBe(0);
    expect(await h.prisma.childActivity.count({ where: { childId } })).toBe(0);
    expect(await h.prisma.subscription.count({ where: { parentId: parent.userId } })).toBe(0);
    expect(await h.prisma.pushToken.count({ where: { userId: parent.userId } })).toBe(0);
    expect(await h.prisma.refreshToken.count({ where: { OR: [{ userId: parent.userId }, { childId }] } })).toBe(0);
    await h.http.post('/v1/auth/refresh').send({ refreshToken: parent.refreshToken }).expect(401);
    await h.http.post('/v1/auth/refresh').send({ refreshToken: child.refreshToken }).expect(401);
    await h.http.post('/v1/auth/login').send({ email: parent.email, password: 'motdepasse-solide' }).expect(401);

    await h.drain();
    expect(await notificationsOf(h, parent.userId)).toHaveLength(0);
    expect(await notificationsOf(h, childId)).toHaveLength(0);
    expect(await h.prisma.mediaFile.count({ where: { childId } })).toBe(0);
    expect(await h.prisma.mediaFile.count({ where: { childId: other.childId } })).toBe(1);
    expect(h.billing.calls).toContainEqual({ method: 'setCancelAtPeriodEnd', args: { subscriptionId: sub.id, cancel: true } });
    expect(h.mailer.sent.map((m) => [m.to, m.subject])).toEqual([[parent.email, 'Votre compte Rekonect a été supprimé']]);

    // L'autre famille n'est pas touchée.
    expect(await h.prisma.child.count({ where: { parentId: other.parent.userId } })).toBe(1);
    await h.http.get('/v1/children').set(auth(other.parent.token)).expect(200);
  });

  it('co-parent invité : seul son compte part, la famille dont il n’est pas titulaire reste intacte', async () => {
    const { parent: owner, child, childId } = await familyWithChild(h);
    const coParent = await registerParent(h, 'Alex');
    await setFamilyPlan(h, owner.userId, 'family');
    const inv = await h.http.post('/v1/family/invitations').set(auth(owner.token)).send({ memberRole: 'co_parent', email: coParent.email }).expect(201);
    await h.http.post('/v1/family/invitations/accept').set(auth(coParent.token)).send({ token: inv.body.token }).expect(200);
    // Activité validée par le co-parent (sa trace doit disparaître, pas l'activité de l'enfant).
    const caId = await completeActivity(h, owner, child, (await catalogActivity(h)).id);
    await h.prisma.childActivity.update({ where: { id: caId }, data: { validatedBy: coParent.userId } });
    expect(await h.prisma.childActivity.findUnique({ where: { id: caId } })).toMatchObject({ validatedBy: coParent.userId });

    await h.http.delete('/v1/auth/account').set(auth(coParent.token)).send({ password: 'motdepasse-solide' }).expect(204);
    await h.drain();

    expect(await h.prisma.user.findUnique({ where: { id: coParent.userId } })).toBeNull();
    expect(await h.prisma.familyMember.count({ where: { ownerId: owner.userId } })).toBe(0);
    expect(await h.prisma.child.findUnique({ where: { id: childId } })).not.toBeNull();
    expect(await h.prisma.childActivity.findUnique({ where: { id: caId } })).toMatchObject({ status: 'validated', validatedBy: null });
    await h.http.get('/v1/children').set(auth(owner.token)).expect(200);
    // L'enfant garde sa session : son appareil dépend du titulaire, pas du co-parent.
    await h.http.get('/v1/auth/me').set(auth(child.token)).expect(200);
  });

  it('un parent membre de l’équipe (is_admin) ne supprime que sa propre famille', async () => {
    const { parent } = await familyWithChild(h);
    await h.prisma.user.update({ where: { id: parent.userId }, data: { isAdmin: true } });
    const other = await familyWithChild(h, { name: 'Zoé' });
    const otherChild = await linkChild(h, other.parent, other.childId, '4321');

    await h.http.delete('/v1/auth/account').set(auth(parent.token)).send({ password: 'motdepasse-solide' }).expect(204);
    await h.drain();

    expect(await h.prisma.user.count({ where: { id: parent.userId } })).toBe(0);
    expect(await h.prisma.user.count({ where: { id: other.parent.userId } })).toBe(1);
    expect(await h.prisma.child.count({ where: { parentId: other.parent.userId } })).toBe(1);
    await h.http.get('/v1/auth/me').set(auth(otherChild.token)).expect(200);
  });
});
