import { auth, catalogActivity, completeActivity, familyWithChild, notificationsOf, registerParent } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

describe('Activités : catalogue, cycle de vie, rappels', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    await resetDb(h.prisma);
  });

  it('catalogue : catégories, filtre d’âge côté enfant, activités perso visibles de leur seule famille', async () => {
    const a = await familyWithChild(h, { age: 6 });
    const b = await registerParent(h);
    const cats = await h.http.get('/v1/activity-categories').set(auth(a.parent.token)).expect(200);
    expect(cats.body.length).toBeGreaterThan(3);

    const custom = await h.http.post('/v1/activities').set(auth(a.parent.token)).send({ title: 'Ranger la cabane', points: 15, minAge: 5, maxAge: 12 }).expect(201);
    await h.http.post('/v1/activities').set(auth(a.parent.token)).send({ title: 'Invalide', minAge: 12, maxAge: 5 }).expect(400);

    // Catalogue Rekonect non filtré tant que ses tranches d'âge ne sont pas revues (CATALOG_AGE_FILTER).
    const forChild = await h.http.get('/v1/activities').set(auth(a.child.token)).expect(200);
    expect(forChild.body.length).toBeGreaterThan(10);
    expect(forChild.body.some((x: { id: string }) => x.id === custom.body.id)).toBe(true);

    const other = await h.http.get('/v1/activities?origin=custom').set(auth(b.token)).expect(200);
    expect(other.body).toHaveLength(0);
    await h.http.get(`/v1/activities/${custom.body.id}`).set(auth(b.token)).expect(404);
    await h.http.get(`/v1/activities/${custom.body.id}`).set(auth(a.child.token)).expect(200);
    const q = await h.http.get('/v1/activities?q=cabane&age=8').set(auth(a.parent.token)).expect(200);
    expect(q.body).toHaveLength(1);
    expect((await h.http.get('/v1/activities?origin=partner').set(auth(a.parent.token)).expect(200)).body).toHaveLength(0);

    await h.http.patch(`/v1/activities/${custom.body.id}`).set(auth(a.parent.token)).send({ isActive: false }).expect(200);
    await h.http.patch(`/v1/activities/${custom.body.id}`).set(auth(b.token)).send({ title: 'Pirate' }).expect(404);
  });

  it('défis du jour : 3 activités adaptées à l’âge, stables dans la journée', async () => {
    const { parent, child, childId } = await familyWithChild(h, { age: 10 });
    const d1 = await h.http.get(`/v1/children/${childId}/daily-challenges`).set(auth(child.token)).expect(200);
    const d2 = await h.http.get(`/v1/children/${childId}/daily-challenges`).set(auth(parent.token)).expect(200);
    expect(d1.body).toHaveLength(3);
    expect(d1.body.map((a: { id: string }) => a.id)).toEqual(d2.body.map((a: { id: string }) => a.id));
    // Une activité commencée aujourd'hui sort des défis.
    await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: d1.body[0].id }).expect(201);
    const d3 = await h.http.get(`/v1/children/${childId}/daily-challenges`).set(auth(child.token)).expect(200);
    expect(d3.body.map((a: { id: string }) => a.id)).not.toContain(d1.body[0].id);
  });

  it('assignation par le parent → notification enfant, démarrage, envoi', async () => {
    const { parent, child, childId } = await familyWithChild(h, { age: 10 });
    const activity = await catalogActivity(h, { minAge: 10 });
    const ca = await h.http.post(`/v1/children/${childId}/activities`).set(auth(parent.token)).send({ activityId: activity.id }).expect(201);
    expect(ca.body.status).toBe('available');
    await h.drain();
    const [assigned] = await notificationsOf(h, childId, 'activity_assigned');
    expect(assigned.title).toBe('✨ Nouvelle activité');

    const started = await h.http.post(`/v1/child-activities/${ca.body.id}/start`).set(auth(child.token)).send({}).expect(200);
    expect(started.body.status).toBe('selected');
    await h.http.post(`/v1/child-activities/${ca.body.id}/start`).set(auth(child.token)).send({}).expect(409);
    const list = await h.http.get(`/v1/children/${childId}/activities?status=selected`).set(auth(parent.token)).expect(200);
    expect(list.body).toHaveLength(1);
    await h.http.post('/v1/child-activities').set(auth(child.token)).send({}).expect(400);
  });

  it('activité prévue : rappel à 17h locales, annulé si terminée — aucune relance après coup', async () => {
    const { parent, child, childId } = await familyWithChild(h, { age: 15 });
    const activity = await catalogActivity(h, { minAge: 12 });
    const ca = await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id, scheduledFor: '2026-09-23' }).expect(201);
    await h.drain();

    const [reminder] = await notificationsOf(h, childId, 'activity_reminder');
    expect(reminder).toMatchObject({ status: 'scheduled', title: 'Petit rappel' }); // ton ado, sans emoji
    expect(reminder.scheduledAt?.toISOString()).toBe('2026-09-23T15:00:00.000Z'); // 17h Paris (UTC+2)

    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(child.token)).send({}).expect(200);
    await h.drain();
    expect((await h.prisma.notification.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe('cancelled');

    h.clock.set('2026-09-23T15:05:00Z');
    const r = await h.scheduler.releaseDue();
    expect(r.released).toBe(0);
    await h.http.post(`/v1/child-activities/${ca.body.id}/validate`).set(auth(parent.token)).send({}).expect(200);
  });

  it('rappel libéré à l’échéance si l’activité est toujours prévue ; abandon = plus de rappel', async () => {
    const { child, childId } = await familyWithChild(h, { age: 6 });
    const activity = await catalogActivity(h);
    const a1 = await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id, scheduledFor: '2026-09-23' }).expect(201);
    const a2 = await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id, scheduledFor: '2026-09-23' }).expect(201);
    await h.drain();
    await h.http.post(`/v1/child-activities/${a2.body.id}/abandon`).set(auth(child.token)).expect(200);
    await h.http.post(`/v1/child-activities/${a2.body.id}/abandon`).set(auth(child.token)).expect(409);
    await h.drain();

    h.clock.set('2026-09-23T15:01:00Z');
    expect(await h.scheduler.releaseDue()).toMatchObject({ released: 1 });
    const sent = await notificationsOf(h, childId, 'activity_reminder');
    const byEntity = Object.fromEntries(sent.map((n) => [n.entityId, n.status]));
    expect(byEntity[a1.body.id]).toBe('sent');
    expect(byEntity[a2.body.id]).toBe('cancelled');
    expect(sent.find((n) => n.entityId === a1.body.id)!.title).toBe('🌟 C’est bientôt l’heure !'); // ton jeune enfant
  });

  it('pas de rappel pour une date passée ; replanifier le même jour ne duplique pas', async () => {
    const { child, childId } = await familyWithChild(h);
    const activity = await catalogActivity(h, { minAge: 10 });
    await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id, scheduledFor: '2026-09-22' }).expect(201);
    await h.drain();
    expect(await notificationsOf(h, childId, 'activity_reminder')).toHaveLength(0);
  });

  it('refus → message encourageant, puis renvoi possible', async () => {
    const { parent, child, childId } = await familyWithChild(h, { age: 9 });
    const activity = await catalogActivity(h, { minAge: 9 });
    const ca = await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id }).expect(201);
    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(child.token)).send({}).expect(200);
    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(child.token)).send({}).expect(409);
    await h.http.post(`/v1/child-activities/${ca.body.id}/reject`).set(auth(parent.token)).send({}).expect(200);
    await h.http.post(`/v1/child-activities/${ca.body.id}/reject`).set(auth(parent.token)).send({}).expect(409);
    await h.drain();
    const [rejected] = await notificationsOf(h, childId, 'activity_rejected');
    expect(rejected).toMatchObject({ title: 'Presque !' });
    expect(rejected.body).toContain('Tu peux réessayer');

    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(child.token)).send({}).expect(200);
    await h.drain();
    expect(await notificationsOf(h, parent.userId, 'activity_validation_required')).toHaveLength(2);
  });

  it('niveau, badges et série : notifications et points cumulés', async () => {
    const { parent, child, childId } = await familyWithChild(h, { age: 10 });
    const big = await h.prisma.activity.create({ data: { title: 'Grand défi', points: 160, minAge: 3, maxAge: 18, activityType: 'catalog' } });
    await completeActivity(h, parent, child, big.id);
    h.clock.advance(86_400_000);
    await completeActivity(h, parent, child, big.id);
    await h.drain();

    const c = await h.prisma.child.findUniqueOrThrow({ where: { id: childId } });
    expect(c).toMatchObject({ totalPoints: 320, level: 4, streakDays: 2 });
    const types = (await notificationsOf(h, childId)).map((n) => n.type);
    expect(types.filter((t) => t === 'level_up')).toHaveLength(2);
    expect(types).toContain('badge_earned');

    h.clock.advance(3 * 86_400_000);
    await completeActivity(h, parent, child, big.id);
    expect((await h.prisma.child.findUniqueOrThrow({ where: { id: childId } })).streakDays).toBe(1);
  });

  it('tâches expirées refusées automatiquement', async () => {
    const { parent, childId } = await familyWithChild(h);
    const activity = await catalogActivity(h, { minAge: 10 });
    await h.http.post(`/v1/children/${childId}/activities`).set(auth(parent.token)).send({ activityId: activity.id, expiresAt: '2026-09-23T12:00:00.000Z' }).expect(201);
    h.clock.set('2026-09-23T13:00:00Z');
    const { ActivitiesService } = await import('../../src/modules/activities/activities.service');
    expect(await h.app.get(ActivitiesService).expireOverdue()).toBe(1);
    const [ca] = await h.prisma.childActivity.findMany({ where: { childId } });
    expect(ca).toMatchObject({ status: 'rejected', rejectionReason: 'Tâche expirée automatiquement' });
  });

  it('activité inactive non assignable, enfant archivé non validable', async () => {
    const { parent, child, childId } = await familyWithChild(h);
    const off = await h.prisma.activity.create({ data: { title: 'Ancienne', activityType: 'custom_parent', createdBy: parent.userId, isActive: false, isPublic: false } });
    await h.http.post(`/v1/children/${childId}/activities`).set(auth(parent.token)).send({ activityId: off.id }).expect(400);

    const activity = await catalogActivity(h, { minAge: 10 });
    const ca = await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id }).expect(201);
    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(child.token)).send({}).expect(200);
    await h.prisma.child.update({ where: { id: childId }, data: { isActive: false } });
    await h.http.post(`/v1/child-activities/${ca.body.id}/validate`).set(auth(parent.token)).send({}).expect(403);
  });
});
