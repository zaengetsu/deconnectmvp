import { DigestService } from '../../src/modules/notifications/digest.service';
import { NotificationScheduler } from '../../src/modules/notifications/scheduler.service';
import { RitualsService } from '../../src/modules/rituals/rituals.service';
import { SocialService } from '../../src/modules/social/social.service';
import { auth, catalogActivity, completeActivity, createChild, familyWithChild, linkChild, notificationsOf, setFamilyPlan } from '../support/fixtures';
import { createHarness, type Harness, resetDb, TEST_NOW } from '../support/harness';

/** Amis, défis duo, rituels familiaux, objectif hebdomadaire, temps d'écran et résumés. */
describe('Vie de famille', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());
  beforeEach(async () => {
    h.clock.set(TEST_NOW);
    await resetDb(h.prisma);
  });

  const befriend = async () => {
    const a = await familyWithChild(h, { name: 'Emma', age: 10 });
    const b = await familyWithChild(h, { name: 'Tom', age: 11 });
    const req = await h.http.post('/v1/friends').set(auth(a.child.token)).send({ friendChildId: b.childId }).expect(201);
    await h.http.post(`/v1/friends/${req.body.id}/approve`).set(auth(a.parent.token)).expect(200);
    await h.http.post(`/v1/friends/${req.body.id}/approve`).set(auth(b.parent.token)).expect(200);
    return { a, b, friendshipId: req.body.id as string };
  };

  describe('amitiés', () => {
    it('double accord parental ; notifications aux deux parents ; refus', async () => {
      const a = await familyWithChild(h, { name: 'Emma' });
      const b = await familyWithChild(h, { name: 'Tom' });
      await h.http.post('/v1/friends').set(auth(a.child.token)).send({ friendChildId: a.childId }).expect(400);
      await h.http.post('/v1/friends').set(auth(a.child.token)).send({ friendChildId: '00000000-0000-4000-8000-000000000000' }).expect(404);
      const req = await h.http.post('/v1/friends').set(auth(a.child.token)).send({ friendChildId: b.childId }).expect(201);
      expect(req.body.status).toBe('pending');
      await h.http.post('/v1/friends').set(auth(b.child.token)).send({ friendChildId: a.childId }).expect(409);
      await h.drain();
      const [na] = await notificationsOf(h, a.parent.userId, 'friend_request');
      const [nb] = await notificationsOf(h, b.parent.userId, 'friend_request');
      expect(na.body).toBe('Emma souhaite ajouter Tom en ami. Votre accord est nécessaire.');
      expect(nb).toBeDefined();

      const first = await h.http.post(`/v1/friends/${req.body.id}/approve`).set(auth(a.parent.token)).expect(200);
      expect(first.body.status).toBe('pending');
      const second = await h.http.post(`/v1/friends/${req.body.id}/approve`).set(auth(b.parent.token)).expect(200);
      expect(second.body.status).toBe('approved');
      const list = await h.http.get('/v1/friends').set(auth(b.child.token)).expect(200);
      expect(list.body[0].child.displayName).toBe('Emma');
      expect((await h.http.get(`/v1/friends?childId=${a.childId}`).set(auth(a.parent.token)).expect(200)).body).toHaveLength(1);
      await h.http.get('/v1/friends').set(auth(a.parent.token)).expect(400);
      await h.http.get(`/v1/friends?childId=${a.childId}`).set(auth(b.parent.token)).expect(404);

      const intruder = await familyWithChild(h);
      await h.http.post(`/v1/friends/${req.body.id}/approve`).set(auth(intruder.parent.token)).expect(404);
      const declined = await h.http.post(`/v1/friends/${req.body.id}/decline`).set(auth(b.parent.token)).expect(200);
      expect(declined.body.status).toBe('declined');
      const again = await h.http.post(`/v1/friends/${req.body.id}/approve`).set(auth(b.parent.token)).expect(200);
      expect(again.body.status).toBe('declined'); // un refus est définitif
    });

    it('frères et sœurs : amis d’office, sans notification', async () => {
      const a = await familyWithChild(h, { name: 'Emma' });
      await setFamilyPlan(h, a.parent.userId, 'family');
      const leoId = await createChild(h, a.parent, 'Léo', 8);
      const res = await h.http.post('/v1/friends').set(auth(a.child.token)).send({ friendChildId: leoId }).expect(201);
      expect(res.body.status).toBe('approved');
      await h.drain();
      expect(await notificationsOf(h, a.parent.userId, 'friend_request')).toHaveLength(0);
    });
  });

  describe('défis duo', () => {
    it('invitation → rappel 10 min avant → acceptation → parts → bonus pour les deux', async () => {
      const { a, b } = await befriend();
      const act = await catalogActivity(h);
      await h.http.post('/v1/duos').set(auth(a.child.token)).send({ activityId: act.id, partnerChildId: a.childId }).expect(400);
      await h.http.post('/v1/duos').set(auth(a.child.token)).send({ activityId: '00000000-0000-4000-8000-000000000000', partnerChildId: b.childId }).expect(404);
      const duo = await h.http.post('/v1/duos').set(auth(a.child.token)).send({ activityId: act.id, partnerChildId: b.childId, startsAt: '2026-09-23T15:00:00.000Z' }).expect(201);
      await h.drain();
      const [inv] = await notificationsOf(h, b.childId, 'friend_activity_invited');
      expect(inv.title).toBe('👋 Emma t’invite');
      const soon = await notificationsOf(h, a.childId, 'friend_activity_started');
      expect(soon[0]).toMatchObject({ status: 'scheduled' });
      expect(soon[0].scheduledAt?.toISOString()).toBe('2026-09-23T14:50:00.000Z');

      await h.http.post(`/v1/duos/${duo.body.id}/accept`).set(auth(a.child.token)).expect(404); // seul l'invité répond
      await h.http.post(`/v1/duos/${duo.body.id}/done`).set(auth(a.child.token)).expect(409); // pas encore accepté
      await h.http.post(`/v1/duos/${duo.body.id}/accept`).set(auth(b.child.token)).expect(200);
      await h.http.post(`/v1/duos/${duo.body.id}/accept`).set(auth(b.child.token)).expect(409);
      await h.drain();
      expect((await notificationsOf(h, a.childId, 'friend_activity_invited'))[0].title).toBe('🙌 Tom est partant !');

      const part = await h.http.post(`/v1/duos/${duo.body.id}/done`).set(auth(a.child.token)).expect(200);
      expect(part.body.status).toBe('active');
      const before = (await h.prisma.child.findUniqueOrThrow({ where: { id: b.childId } })).totalPoints;
      const done = await h.http.post(`/v1/duos/${duo.body.id}/done`).set(auth(b.child.token)).expect(200);
      expect(done.body.status).toBe('completed');
      expect((await h.prisma.child.findUniqueOrThrow({ where: { id: b.childId } })).totalPoints).toBe(before + done.body.bonusPoints);
      await h.drain();
      expect((await notificationsOf(h, a.childId, 'friend_activity_completed'))[0].body).toBe(`Vous avez tous les deux gagné ${done.body.bonusPoints} points.`);
      expect((await notificationsOf(h, b.parent.userId, 'activity_completed')).map((n) => n.title)).toContain('🤝 Défi à deux réussi');
      expect((await notificationsOf(h, a.childId, 'friend_activity_started'))[0].status).toBe('cancelled');
      expect((await h.http.get('/v1/duos').set(auth(b.child.token))).body[0]).toMatchObject({ id: duo.body.id, initiator: { displayName: 'Emma' } });
      await h.http.post(`/v1/duos/${duo.body.id}/cancel`).set(auth(a.child.token)).expect(409);
    });

    it('sans amitié : refusé ; annulation et expiration ferment le défi et ses rappels', async () => {
      const stranger = await familyWithChild(h);
      const { a, b } = await befriend();
      const act = await catalogActivity(h);
      expect((await h.http.post('/v1/duos').set(auth(a.child.token)).send({ activityId: act.id, partnerChildId: stranger.childId }).expect(403)).body.code).toBe('NOT_FRIENDS');

      const d1 = await h.http.post('/v1/duos').set(auth(a.child.token)).send({ activityId: act.id, partnerChildId: b.childId, startsAt: '2026-09-23T18:00:00.000Z' }).expect(201);
      await h.http.post(`/v1/duos/${d1.body.id}/cancel`).set(auth(b.child.token)).expect(404);
      await h.http.post(`/v1/duos/${d1.body.id}/cancel`).set(auth(a.child.token)).expect(200);
      await h.drain();
      expect((await notificationsOf(h, b.childId, 'friend_activity_started')).every((n) => n.status === 'cancelled')).toBe(true);

      const d2 = await h.http.post('/v1/duos').set(auth(a.child.token)).send({ activityId: act.id, partnerChildId: b.childId }).expect(201);
      const d3 = await h.http.post('/v1/duos').set(auth(a.child.token)).send({ activityId: act.id, partnerChildId: b.childId }).expect(201);
      await h.http.post(`/v1/duos/${d3.body.id}/decline`).set(auth(b.child.token)).expect(200);
      h.clock.advance(8 * 86_400_000);
      await h.http.post(`/v1/duos/${d2.body.id}/accept`).set(auth(b.child.token)).expect(409);
      expect(await h.app.get(SocialService).expireDuos()).toBe(1);
      expect((await h.prisma.duoChallenge.findUniqueOrThrow({ where: { id: d2.body.id } })).status).toBe('expired');
    });
  });

  describe('rituels familiaux', () => {
    it('occurrences à l’heure locale, rappels parent (J-1) et enfants (H-1), confirmation avec points', async () => {
      const f = await familyWithChild(h, { name: 'Emma' });
      // Jeudi 19h00 heure de Paris.
      const r = await h.http.post('/v1/rituals').set(auth(f.parent.token)).send({ title: 'Dîner préparé ensemble', weekday: 4, startTime: '19:00', points: 25 }).expect(201);
      expect(r.body.startTime).toBe('19:00');
      const occ = await h.http.get('/v1/ritual-occurrences').set(auth(f.child.token)).expect(200);
      expect(occ.body.map((o: { scheduledAt: string }) => o.scheduledAt)).toEqual(['2026-09-24T17:00:00.000Z', '2026-10-01T17:00:00.000Z']);
      await h.drain();
      const tomorrow = await notificationsOf(h, f.parent.userId, 'family_activity');
      expect(tomorrow.map((n) => n.scheduledAt?.toISOString()).sort()).toEqual(['2026-09-23T17:00:00.000Z', '2026-09-30T17:00:00.000Z']);
      const soon = await notificationsOf(h, f.childId, 'family_activity');
      expect(soon.map((n) => n.scheduledAt?.toISOString()).sort()).toEqual(['2026-09-24T16:00:00.000Z', '2026-10-01T16:00:00.000Z']);
      expect(soon[0].body).toBe('Ça commence à 19h00 — on compte sur toi !');
      expect((await h.http.get('/v1/rituals').set(auth(f.parent.token))).body).toHaveLength(1);

      const first = occ.body[0].id;
      await h.http.post(`/v1/ritual-occurrences/${first}/confirm`).set(auth(f.parent.token)).send({ attendees: ['00000000-0000-4000-8000-000000000000'] }).expect(400);
      await h.http.post(`/v1/ritual-occurrences/${first}/confirm`).set(auth(f.parent.token)).send({ attendees: [f.childId, f.childId] }).expect(200);
      await h.http.post(`/v1/ritual-occurrences/${first}/confirm`).set(auth(f.parent.token)).send({ attendees: [] }).expect(409);
      expect((await h.prisma.child.findUniqueOrThrow({ where: { id: f.childId } })).totalPoints).toBe(25);
      await h.drain();
      expect((await notificationsOf(h, f.childId, 'family_activity')).find((n) => n.title === '💛 Merci d’y avoir été')?.body).toBe('+25 points pour « Dîner préparé ensemble ».');
      await h.http.post(`/v1/ritual-occurrences/${first}/cancel`).set(auth(f.parent.token)).expect(409);

      const other = await familyWithChild(h);
      await h.http.post(`/v1/ritual-occurrences/${first}/confirm`).set(auth(other.parent.token)).send({ attendees: [] }).expect(404);
      await h.http.patch(`/v1/rituals/${r.body.id}`).set(auth(other.parent.token)).send({ title: 'Autre titre' }).expect(404);
    });

    it('changer l’horaire annule et régénère ; annuler une occurrence coupe ses rappels ; occurrence passée → manquée', async () => {
      const f = await familyWithChild(h);
      const r = await h.http.post('/v1/rituals').set(auth(f.parent.token)).send({ title: 'Balade', weekday: 6, startTime: '10:00' }).expect(201);
      const upd = await h.http.patch(`/v1/rituals/${r.body.id}`).set(auth(f.parent.token)).send({ startTime: '15:30' }).expect(200);
      expect(upd.body.startTime).toBe('15:30');
      await h.drain();
      const all = await h.prisma.familyRitualOccurrence.findMany({ where: { ritualId: r.body.id }, orderBy: { createdAt: 'asc' } });
      expect(all.filter((o) => o.status === 'cancelled')).toHaveLength(2);
      const planned = all.filter((o) => o.status === 'planned');
      expect(planned.map((o) => o.scheduledAt.toISOString())).toEqual(['2026-09-26T13:30:00.000Z', '2026-10-03T13:30:00.000Z']);
      await h.http.post(`/v1/ritual-occurrences/${planned[0].id}/cancel`).set(auth(f.parent.token)).expect(200);
      await h.drain();
      const cancelledReminders = await h.prisma.notification.findMany({ where: { entityId: planned[0].id } });
      expect(cancelledReminders.length).toBeGreaterThan(0);
      expect(cancelledReminders.every((n) => n.status === 'cancelled')).toBe(true);
      await h.http.post(`/v1/ritual-occurrences/${planned[0].id}/confirm`).set(auth(f.parent.token)).send({ attendees: [] }).expect(409);

      h.clock.set('2026-10-03T18:00:00Z');
      const rituals = h.app.get(RitualsService);
      expect(await rituals.closePast()).toBe(1);
      expect(await rituals.generateAll()).toBe(1); // horizon glissant de 14 jours : samedi 10 octobre
      await h.http.patch(`/v1/rituals/${r.body.id}`).set(auth(f.parent.token)).send({ isActive: false }).expect(200);
      expect(await h.prisma.familyRitualOccurrence.count({ where: { ritualId: r.body.id, status: 'planned' } })).toBe(0);
    });

    it('objectif familial de la semaine : « plus qu’une activité » puis « atteint »', async () => {
      const f = await familyWithChild(h);
      const act = await catalogActivity(h);
      const g = await h.http.put('/v1/family-goal').set(auth(f.parent.token)).send({ targetActivities: 2 }).expect(200);
      expect(g.body).toMatchObject({ weekStart: '2026-09-21', targetActivities: 2, done: 0, achievedAt: null });
      await completeActivity(h, f.parent, f.child, act.id);
      await h.drain();
      expect((await notificationsOf(h, f.parent.userId, 'goal_progress'))[0].title).toBe('🔥 Plus qu’une activité');
      await completeActivity(h, f.parent, f.child, act.id);
      await h.drain();
      expect((await notificationsOf(h, f.parent.userId, 'goal_completed'))[0].body).toBe('Votre famille a réalisé 2 activités hors écran cette semaine.');
      const after = await h.http.get('/v1/family-goal').set(auth(f.parent.token)).expect(200);
      expect(after.body.done).toBe(2);
      expect(after.body.achievedAt).not.toBeNull();
      expect(await h.app.get(RitualsService).checkAllGoals()).toBe(0);
    });
  });

  describe('temps d’écran et résumés', () => {
    it('relevés, historique, objectif atteint, progression ≥ 10 %', async () => {
      const f = await familyWithChild(h, { name: 'Lucas' });
      for (let i = 1; i <= 14; i++) {
        const day = new Date(Date.UTC(2026, 8, 23 - i)).toISOString().slice(0, 10);
        await h.http.put(`/v1/children/${f.childId}/screen-time`).set(auth(f.child.token)).send({ day, minutes: i <= 7 ? 90 : 120, goalMinutes: 100 }).expect(200);
      }
      const today = await h.http.put(`/v1/children/${f.childId}/screen-time`).set(auth(f.parent.token)).send({ minutes: 30 }).expect(200);
      expect(today.body.day).toBe('2026-09-23');
      const hist = await h.http.get(`/v1/children/${f.childId}/screen-time?days=7`).set(auth(f.parent.token)).expect(200);
      expect(hist.body).toMatchObject({ averageMinutes: 81, goalsReached: 6 });
      const intruder = await familyWithChild(h);
      await h.http.get(`/v1/children/${f.childId}/screen-time`).set(auth(intruder.parent.token)).expect(404);

      await h.http.put('/v1/notification-preferences').set(auth(f.parent.token)).send({ screenTimeSummary: true }).expect(200);
      const digests = h.app.get(DigestService);
      expect(await digests.screenTime()).toBe(2);
      expect(await digests.screenTime()).toBe(0); // dédupliqué
      const [goal] = await notificationsOf(h, f.parent.userId, 'screen_time_goal');
      expect(goal.body).toContain('Lucas');
      expect((await notificationsOf(h, f.parent.userId, 'screen_time_summary'))[0].body).toBe('Lucas a réduit son temps d’écran de 21 % cette semaine.');
    });

    it('résumé du soir et récapitulatif hebdomadaire selon les préférences ; rappel des activités prévues', async () => {
      const f = await familyWithChild(h, { name: 'Lucas' });
      const quiet = await familyWithChild(h);
      const act = await catalogActivity(h);
      await completeActivity(h, f.parent, f.child, act.id);
      await completeActivity(h, quiet.parent, quiet.child, act.id);
      await h.http.put('/v1/notification-preferences').set(auth(f.parent.token)).send({ dailySummary: true, weeklySummary: true }).expect(200);
      await h.http.put('/v1/notification-preferences').set(auth(quiet.parent.token)).send({ dailySummary: false, weeklySummary: false }).expect(200);
      const digests = h.app.get(DigestService);
      h.clock.set('2026-09-23T18:30:00Z');
      expect(await digests.dailySummaries()).toBe(1);
      expect((await notificationsOf(h, f.parent.userId, 'daily_summary'))[0].body).toBe('Lucas : 1 activité terminée');
      expect(await notificationsOf(h, quiet.parent.userId, 'daily_summary')).toHaveLength(0);
      expect(await digests.weeklySummaries()).toBe(1);
      expect((await notificationsOf(h, f.parent.userId, 'weekly_summary'))[0].title).toBe('📊 Votre semaine avec Rekonect');

      h.clock.set('2026-09-24T07:00:00Z');
      const ca = await h.http.post('/v1/child-activities').set(auth(f.child.token)).send({ activityId: act.id, scheduledFor: '2026-09-24' }).expect(201);
      expect(ca.body.status).toBe('selected');
      expect(await digests.parentContextReminders()).toBe(1);
      expect(await digests.parentContextReminders()).toBe(0);
      expect((await notificationsOf(h, f.parent.userId, 'activity_planned'))[0].body).toBe(`Lucas avait prévu « ${act.title} » aujourd’hui.`);
    });

    it('un rappel programmé est libéré à l’heure, ou annulé s’il n’est plus pertinent', async () => {
      const f = await familyWithChild(h);
      await h.http.post('/v1/rituals').set(auth(f.parent.token)).send({ title: 'Jeu de société', weekday: 4, startTime: '19:00' }).expect(201);
      await h.drain();
      const scheduler = h.app.get(NotificationScheduler);
      h.clock.set('2026-09-24T16:00:30Z');
      const res = await scheduler.releaseDue();
      expect(res.released).toBe(2); // rappel enfant H-1 + rappel parent de la veille
      const [n] = (await notificationsOf(h, f.childId, 'family_activity')).filter((x) => x.scheduledAt?.toISOString() === '2026-09-24T16:00:00.000Z');
      expect(n.status).toBe('sent');
      expect(linkChild).toBeDefined();
    });
  });
});
