import { NotificationService } from '../../src/modules/notifications/notification.service';
import { templates } from '../../src/modules/notifications/templates';
import { auth, catalogActivity, completeActivity, familyWithChild, notificationsOf } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

const DAY = 86_400_000;
const YESTERDAY = new Date('2026-09-22T00:00:00.000Z'); // TEST_NOW = mercredi 23/09 12 h à Paris

describe('Moteur d’engagement : relances enfant et parent', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    await resetDb(h.prisma);
  });

  const nudgesOf = async (childId: string) => (await notificationsOf(h, childId)).filter((n) => n.type?.startsWith('nudge_'));

  it('série à protéger : une relance, une seule fois par jour, à l’heure locale', async () => {
    const f = await familyWithChild(h);
    await h.prisma.child.update({ where: { id: f.childId }, data: { streakDays: 4, lastActivityDate: YESTERDAY } });

    // 12 h à Paris un mercredi : ce n'est pas l'heure (16 h).
    expect(await h.engagement.nudgeChildren()).toBe(0);
    h.clock.set('2026-09-23T14:00:00.000Z');
    expect(await h.engagement.nudgeChildren()).toBe(1);
    expect(await h.engagement.nudgeChildren()).toBe(0);
    const [n] = await nudgesOf(f.childId);
    expect(n).toMatchObject({ type: 'nudge_streak', title: '🔥 Ta série de 4 jours t’attend', priority: 'low', route: '/child/activities' });
  });

  it('aucune relance si l’enfant a déjà agi, si les encouragements sont coupés, ou pendant les heures silencieuses', async () => {
    const f = await familyWithChild(h);
    await h.prisma.child.update({ where: { id: f.childId }, data: { streakDays: 4, lastActivityDate: YESTERDAY } });

    await h.http.put(`/v1/notification-preferences?childId=${f.childId}`).set(auth(f.parent.token)).send({ quietHoursStart: '11:00', quietHoursEnd: '13:00' }).expect(200);
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(0);
    await h.http.put(`/v1/notification-preferences?childId=${f.childId}`).set(auth(f.parent.token)).send({ quietHoursStart: '20:30', quietHoursEnd: '07:30' }).expect(200);

    await h.http.put('/v1/notification-preferences').set(auth(f.parent.token)).send({ encouragements: false }).expect(200);
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(0);
    await h.http.put('/v1/notification-preferences').set(auth(f.parent.token)).send({ encouragements: true }).expect(200);

    const activity = await catalogActivity(h, { minAge: 10 });
    const ca = await h.http.post('/v1/child-activities').set(auth(f.child.token)).send({ activityId: activity.id }).expect(201);
    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(f.child.token)).send({}).expect(200);
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(0);
  });

  it('plafond : quatre relances par semaine au plus', async () => {
    const f = await familyWithChild(h);
    const child = await h.prisma.child.findUniqueOrThrow({ where: { id: f.childId } });
    const service = h.app.get(NotificationService);
    for (let d = 1; d <= 4; d++) {
      h.clock.set(new Date(TEST_NOW.getTime() - d * DAY));
      await h.prisma.tx((tx) => service.enqueue(tx, templates.nudge(child, { kind: 'nudge_goal', remaining: 1 }, `2026-09-${String(23 - d).padStart(2, '0')}`)));
    }
    h.clock.set(TEST_NOW);
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(0);
    h.clock.set(new Date(TEST_NOW.getTime() + 4 * DAY)); // les plus anciennes sortent de la fenêtre
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(1);
  });

  it('activité commencée, récompense proche, favorite délaissée, pause suggérée', async () => {
    const f = await familyWithChild(h, { age: 13 });
    const activity = await catalogActivity(h, { minAge: 13 });

    // 1. Commencée hier, pas envoyée.
    const ca = await h.http.post('/v1/child-activities').set(auth(f.child.token)).send({ activityId: activity.id }).expect(201);
    await h.prisma.$executeRaw`UPDATE child_activities SET updated_at = ${new Date(TEST_NOW.getTime() - DAY)} WHERE id = ${ca.body.id}::uuid`;
    const facts = await h.engagement.childFacts({ id: f.childId, parentId: f.parent.userId, age: 13, totalPoints: 90, streakDays: 0, lastActivityDate: null }, 'Europe/Paris');
    expect(facts.started).toMatchObject({ childActivityId: ca.body.id, activityTitle: activity.title });
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(1);
    expect((await nudgesOf(f.childId))[0]).toMatchObject({ type: 'nudge_resume', title: 'On reprend ?', route: `/child/activities/${ca.body.id}` });

    // 2. Le lendemain, l'activité abandonnée ; il manque 10 points pour une récompense.
    await h.prisma.childActivity.delete({ where: { id: ca.body.id } });
    await h.prisma.child.update({ where: { id: f.childId }, data: { totalPoints: 90 } });
    await h.http.post('/v1/rewards').set(auth(f.parent.token)).send({ title: 'Sortie ciné', requiredPoints: 100 }).expect(201);
    h.clock.advance(DAY);
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(1);
    expect((await nudgesOf(f.childId)).at(-1)).toMatchObject({ type: 'nudge_reward_close', title: 'Plus que 10 points' });

    // 3. Activité favorite (2 fois) pas refaite depuis 12 jours ; plus de récompense proche.
    await h.prisma.reward.updateMany({ data: { isActive: false } });
    for (const d of [30, 12]) {
      await h.prisma.childActivity.create({ data: { childId: f.childId, activityId: activity.id, status: 'validated', validatedAt: new Date(h.clock.now().getTime() - d * DAY) } });
    }
    await h.prisma.child.update({ where: { id: f.childId }, data: { lastActivityDate: new Date(h.clock.now().getTime() - 12 * DAY) } });
    h.clock.advance(DAY);
    expect(await h.engagement.nudgeChildren({ anyHour: true })).toBe(1);
    const comeback = (await nudgesOf(f.childId)).at(-1)!;
    expect(comeback.type).toBe('nudge_comeback');
    expect(comeback.body).toContain(`Pas de « ${activity.title} » depuis 13 jours`);
  });

  it('parent : validations en attente depuis la veille, puis enfant inactif avec une idée', async () => {
    const f = await familyWithChild(h);
    const activity = await catalogActivity(h, { minAge: 10 });
    const ca = await h.http.post('/v1/child-activities').set(auth(f.child.token)).send({ activityId: activity.id }).expect(201);
    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(f.child.token)).send({}).expect(200);
    await h.prisma.childActivity.update({ where: { id: ca.body.id }, data: { submittedAt: new Date(TEST_NOW.getTime() - 25 * 3_600_000) } });
    await h.prisma.child.update({ where: { id: f.childId }, data: { createdAt: new Date(TEST_NOW.getTime() - 10 * DAY) } });

    expect(await h.engagement.nudgeParents()).toBe(0); // 12 h : pas l'heure (18 h)
    h.clock.set('2026-09-23T16:00:00.000Z');
    expect(await h.engagement.nudgeParents()).toBe(1); // enfant « inactif » mais activité en attente : pas d'idée
    const [backlog] = await notificationsOf(h, f.parent.userId, 'validation_backlog');
    expect(backlog).toMatchObject({ title: '👀 Emma attend votre validation', route: '/parent/validations' });

    await h.prisma.childActivity.delete({ where: { id: ca.body.id } });
    h.clock.advance(DAY);
    expect(await h.engagement.nudgeParents()).toBe(1);
    const [idle] = await notificationsOf(h, f.parent.userId, 'parent_nudge_idle');
    expect(idle.title).toBe('💡 Une idée pour Emma ?');
    expect(idle.route).toBe(`/parent/children/${f.childId}/assign`);
    h.clock.advance(DAY);
    expect(await h.engagement.nudgeParents()).toBe(0); // une par enfant et par semaine
  });

  it('séries : le 3e jour est fêté (enfant en push, parent en in-app) et annule la relance du jour', async () => {
    const f = await familyWithChild(h);
    await h.prisma.child.update({ where: { id: f.childId }, data: { streakDays: 2, lastActivityDate: YESTERDAY } });
    const activity = await catalogActivity(h, { minAge: 10 });
    await completeActivity(h, f.parent, f.child, activity.id);
    await h.drain();
    const [kid] = await notificationsOf(h, f.childId, 'streak_milestone');
    expect(kid).toMatchObject({ title: '🔥 3 jours de suite !', channels: ['in_app', 'push'] });
    const [parent] = await notificationsOf(h, f.parent.userId, 'streak_milestone');
    expect(parent).toMatchObject({ title: '🔥 Emma : 3 jours de suite', channels: ['in_app'] });
  });
});
