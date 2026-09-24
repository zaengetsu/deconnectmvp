import { auth, catalogActivity, completeActivity, familyWithChild, notificationsOf } from '../support/fixtures';
import { createHarness, type Harness, resetDb } from '../support/harness';

describe('Parcours activité : événement → notification → destination', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(() => resetDb(h.prisma));

  it('enfant termine, parent valide : points, niveau, notifications enfant et parent', async () => {
    const { parent, child, childId } = await familyWithChild(h, { age: 10 });
    const activity = await catalogActivity(h, { minAge: 10 });

    const ca = await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId: activity.id }).expect(201);
    await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(child.token)).send({ note: 'Fini !' }).expect(200);
    await h.drain();

    const toValidate = await notificationsOf(h, parent.userId, 'activity_validation_required');
    expect(toValidate).toHaveLength(1);
    expect(toValidate[0]).toMatchObject({ priority: 'high', status: 'sent', route: `/parent/validations?focus=${ca.body.id}` });

    const pending = await h.http.get('/v1/validations').set(auth(parent.token)).expect(200);
    expect(pending.body).toHaveLength(1);

    const res = await h.http.post(`/v1/child-activities/${ca.body.id}/validate`).set(auth(parent.token)).send({ note: 'Bravo' }).expect(200);
    expect(res.body).toMatchObject({ success: true, pointsAwarded: activity.points, newTotal: activity.points });
    await h.drain();

    const childNotifs = await notificationsOf(h, childId);
    expect(childNotifs.map((n) => n.type)).toEqual(expect.arrayContaining(['activity_validated']));
    const completed = await notificationsOf(h, parent.userId, 'activity_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].channels).toEqual(['in_app']);

    const progress = await h.http.get(`/v1/children/${childId}/progress`).set(auth(child.token)).expect(200);
    expect(progress.body.totalPoints).toBe(activity.points);
    expect(progress.body.streakDays).toBe(1);
    expect(progress.body.ledger).toHaveLength(1);
  });

  it('refuse la double validation et les accès croisés entre familles', async () => {
    const a = await familyWithChild(h);
    const b = await familyWithChild(h);
    const activity = await catalogActivity(h, { minAge: 10 });
    const caId = await completeActivity(h, a.parent, a.child, activity.id);

    await h.http.post(`/v1/child-activities/${caId}/validate`).set(auth(a.parent.token)).send({}).expect(409);
    await h.http.post(`/v1/child-activities/${caId}/validate`).set(auth(b.parent.token)).send({}).expect(404);
    await h.http.get(`/v1/children/${a.childId}/activities`).set(auth(b.parent.token)).expect(404);
    await h.http.get(`/v1/children/${a.childId}/activities`).set(auth(b.child.token)).expect(404);
    await h.http.post(`/v1/child-activities/${caId}/validate`).set(auth(a.child.token)).send({}).expect(403);
  });
});
