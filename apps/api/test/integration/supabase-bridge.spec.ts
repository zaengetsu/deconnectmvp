import { randomUUID } from 'node:crypto';
import type { Tx } from '../../src/platform/prisma/prisma.service';
import { auth, catalogActivity, completeActivity, familyWithChild, notificationsOf } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

/**
 * Pont de migration (phase 3) : l'app mobile écrit encore certaines tables via supabase-js.
 * Ces écritures (jeton Supabase présent dans la requête PostgREST) publient les mêmes événements que l'API ;
 * les anciens triggers SQL ne créent plus de notifications.
 */
describe('Pont Supabase → événements, et un seul moteur de notifications', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    h.mailer.sent.length = 0;
    await resetDb(h.prisma);
  });

  /** Simule une requête PostgREST : Supabase pose request.jwt.claims pour la transaction. */
  const asSupabase = <T>(fn: (tx: Tx) => Promise<T>) =>
    h.prisma.tx(async (tx) => {
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: randomUUID(), role: 'authenticated' })}, true)`;
      return fn(tx);
    });

  /** Les événements du pont sont horodatés par Postgres (now()) : on les rend échus pour l'horloge figée des tests. */
  const drain = async () => {
    await h.prisma.outboxEvent.updateMany({ where: { status: 'pending' }, data: { nextAttemptAt: h.clock.now() } });
    await h.drain();
  };

  const events = (type: string) => h.prisma.outboxEvent.findMany({ where: { type }, orderBy: { seq: 'asc' } });

  it('activité envoyée puis validée depuis l’app Supabase : mêmes événements, mêmes notifications', async () => {
    const f = await familyWithChild(h);
    const activity = await catalogActivity(h, { minAge: 10 });
    const ca = await asSupabase((tx) => tx.childActivity.create({ data: { childId: f.childId, activityId: activity.id, status: 'selected' } }));
    await asSupabase((tx) => tx.childActivity.update({ where: { id: ca.id }, data: { status: 'submitted', submittedAt: TEST_NOW } }));
    const [submitted] = await events('activity.submitted');
    expect(submitted.payload).toEqual({ childActivityId: ca.id, childId: f.childId, parentId: f.parent.userId, activityId: activity.id });
    expect(submitted.actor).toEqual({ kind: 'system', id: 'supabase' });

    await asSupabase((tx) => tx.childActivity.update({ where: { id: ca.id }, data: { status: 'validated', validatedAt: TEST_NOW, earnedPoints: 40 } }));
    const [validated] = await events('activity.validated');
    expect(validated.payload).toMatchObject({ childActivityId: ca.id, points: 40, levelUp: false, badgesAwarded: 0, categoryId: activity.categoryId });

    await drain();
    expect(await notificationsOf(h, f.parent.userId, 'activity_validation_required')).toHaveLength(1);
    expect(await notificationsOf(h, f.childId, 'activity_validated')).toHaveLength(1);
  });

  it('les écritures de l’API ne passent pas par le pont (pas de doublon)', async () => {
    const f = await familyWithChild(h);
    const activity = await catalogActivity(h, { minAge: 10 });
    await completeActivity(h, f.parent, f.child, activity.id);
    expect(await events('activity.submitted')).toHaveLength(1);
    expect(await events('activity.validated')).toHaveLength(1);
    expect((await events('activity.validated'))[0].actor).not.toEqual({ kind: 'system', id: 'supabase' });
  });

  it('récompense demandée puis remise, enfant ajouté, invitation co-parent, compte créé par Supabase Auth', async () => {
    const f = await familyWithChild(h);
    const reward = await h.http.post('/v1/rewards').set(auth(f.parent.token)).send({ title: 'Choisir le dessert', requiredPoints: 0 }).expect(201);
    const rr = await asSupabase((tx) => tx.rewardRequest.create({ data: { childId: f.childId, rewardId: reward.body.id, status: 'pending' } }));
    await asSupabase((tx) => tx.rewardRequest.update({ where: { id: rr.id }, data: { status: 'completed' } }));
    expect((await h.prisma.outboxEvent.findMany({ where: { aggregateId: rr.id }, orderBy: { seq: 'asc' } })).map((e) => e.type)).toEqual(['reward.requested', 'reward.approved', 'reward.delivered']);

    const child = await asSupabase((tx) => tx.child.create({ data: { parentId: f.parent.userId, displayName: 'Noah', age: 8 } }));
    expect((await events('child.created')).some((e) => (e.payload as { childId: string }).childId === child.id)).toBe(true);

    await asSupabase((tx) => tx.familyInvitation.create({ data: { ownerId: f.parent.userId, memberRole: 'co_parent', inviteEmail: 'mamie@test.rekonect.app' } }));
    const id = randomUUID();
    await h.prisma.user.deleteMany({ where: { id } });
    await asSupabase((tx) => tx.profile.create({ data: { id, email: `legacy.${id}@test.rekonect.app`, fullName: 'Parent Supabase' } }));
    await drain();
    expect(h.mailer.sent.map((m) => m.subject)).toEqual(expect.arrayContaining(['Le profil de Noah est prêt', 'Bienvenue sur Rekonect']));
    expect(h.mailer.sent.find((m) => m.to === 'mamie@test.rekonect.app')?.subject).toMatch(/vous invite à rejoindre sa famille/);
    expect(await notificationsOf(h, f.parent.userId, 'reward_requested')).toHaveLength(1);
  });

  it('seul le moteur de l’API crée une notification ; l’app peut encore marquer comme lu', async () => {
    const f = await familyWithChild(h);
    const insert = (tx: Tx | typeof h.prisma) => tx.$executeRaw`
      INSERT INTO notifications (recipient_type, recipient_id, title, body) VALUES ('parent', ${f.parent.userId}::uuid, 'Ancien moteur', 'SQL')`;
    await insert(h.prisma);
    await asSupabase((tx) => insert(tx));
    expect(await h.prisma.notification.count({ where: { title: 'Ancien moteur' } })).toBe(0);

    await h.drain(); // notifications de l'API (appareil relié…)
    const [n] = await notificationsOf(h, f.parent.userId);
    await asSupabase((tx) => tx.$executeRaw`UPDATE notifications SET is_read = true, title = 'réécrit' WHERE id = ${n.id}::uuid`);
    const after = await h.prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.isRead).toBe(true);
    expect(after.title).toBe(n.title);
  });
});
