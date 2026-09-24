import { NOTIFICATION_TYPES } from '@rekonect/contracts';
import { type NotificationDraft, templates } from '../../src/modules/notifications/templates';

const child = (age: number, name = 'Emma') => ({ id: `c-${age}`, displayName: name, age, parentId: 'p1' });
const at = new Date('2026-09-24T15:00:00Z');
const act = { id: 'a1', title: 'Lire 20 pages' };
const rew = { id: 'r1', title: 'Choisir le film' };

/** Toutes les notifications possibles, pour un enfant de l'âge donné. */
function all(age: number): NotificationDraft[] {
  const c = child(age);
  const o = child(age, 'Tom');
  return [
    templates.activityAssigned(c, act, 'ca1'),
    templates.activityValidationRequired(c, act, 'ca1'),
    templates.activityReminder(c, act, 'ca1', at),
    templates.activityValidated(c, act, 'ca1', 40),
    templates.activityCompleted(c, act, 'ca1', 40, '2026-09-24'),
    templates.activityRejected(c, act, 'ca1', null),
    templates.parentPlannedReminder(c, act, 'ca1', '2026-09-24'),
    templates.levelUp(c, 3),
    templates.badgeEarned(c, 1, 'ca1'),
    templates.badgeEarned(c, 2, 'ca2'),
    templates.rewardRequested(c, rew, 'rr1'),
    templates.rewardPending(c, rew, 'rr1', 24, at),
    templates.rewardPending(c, rew, 'rr1', 48, at),
    templates.rewardApproved(c, rew, 'rr1'),
    templates.rewardRejected(c, rew, 'rr1', null),
    templates.deviceLinked(c),
    templates.friendRequest('p1', c, o, 'f1', 'a', c.id),
    templates.duoInvited(o, c, act, 'd1'),
    templates.duoStartingSoon(c, o, act, 'd1', at, 'i'),
    templates.duoAccepted(c, o, act, 'd1'),
    templates.duoCompletedChild(c, o, 'd1', 30, 'p'),
    templates.duoCompletedParent('p1', c, o, act, 'd1'),
    templates.ritualTomorrow('p1', 'Dîner ensemble', '19:00', 'o1', at),
    templates.ritualSoon(c, 'Dîner ensemble', '19:00', 'o1', at),
    templates.ritualThanks(c, 'Dîner ensemble', 25, 'o1'),
    templates.goalCompleted('p1', 'g1', 5),
    templates.goalAlmost('p1', 'g1'),
    templates.dailySummary('p1', ['Emma : 2 activités terminées'], 1, 2, '2026-09-24'),
    templates.weeklySummary('p1', 8, 260, '2026-W39'),
    templates.weeklySummary('p1', 1, 0, '2026-W40'),
    templates.screenTimeGoal(c, 90, '2026-09-23'),
    templates.screenTimeImproved(c, 18, '2026-W39'),
    templates.partnerOfferUnlocked('p1', 'Emma', { title: '−10 % cycles', partnerName: 'Decathlon' }, 'cl1'),
    templates.partnerOfferUnlocked('p1', null, { title: '−10 % cycles', partnerName: 'Decathlon' }, 'cl2'),
    templates.paymentFailed('p1', '4,99 €', 'Famille', 'in_1'),
  ];
}

describe('catalogue des messages', () => {
  it.each([6, 10, 15])('âge %i : messages courts, typés, routés, dédupliqués, jamais culpabilisants', (age) => {
    const drafts = all(age);
    for (const d of drafts) {
      expect(NOTIFICATION_TYPES).toContain(d.type);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.title.length).toBeLessThanOrEqual(60);
      expect(d.body.length).toBeLessThanOrEqual(200);
      expect(d.route === null || d.route.startsWith('/')).toBe(true);
      expect(d.channels).toContain('in_app');
      if (d.type !== 'child_device_linked') expect(d.dedupKey).toBeTruthy(); // clé posée par le consommateur (id d'événement)
      expect(`${d.title} ${d.body}`).not.toMatch(/trop de temps|encore passé|dommage|puni/i);
      if (d.recipientType === 'child') expect(d.channels).not.toContain('email');
    }
    const keys = drafts.map((d) => d.dedupKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ton adapté à l’âge ; jamais infantilisant pour un ado', () => {
    const young = templates.activityReminder(child(6), act, 'x', at);
    const kid = templates.activityReminder(child(10), act, 'x', at);
    const teen = templates.activityReminder(child(15), act, 'x', at);
    expect(young.title).toBe('🌟 C’est bientôt l’heure !');
    expect(kid.title).toBe('🔔 Petit rappel');
    expect(teen.title).toBe('Petit rappel');
    expect(teen.body).toBe('Tu avais prévu « Lire 20 pages » aujourd’hui.');
    for (const d of all(15).filter((x) => x.recipientType === 'child')) expect(d.body).not.toMatch(/on compte sur toi|Bravo !/);
  });

  it('rappels programmés, priorités et motifs personnalisés', () => {
    expect(templates.rewardPending(child(10), rew, 'rr', 48, at)).toMatchObject({ priority: 'low', scheduledAt: at }); // la 2e relance se fait plus discrète
    expect(templates.activityRejected(child(10), act, 'x', '  Il manque la photo ').body).toBe('Il manque la photo');
    expect(templates.rewardRejected(child(10), rew, 'x', 'Ce week-end !').body).toBe('Ce week-end !');
    expect(templates.weeklySummary('p', 8, 260, 'w').body).toBe('Vos enfants ont réalisé 8 activités et passé 4h20 hors écran.');
    expect(templates.dailySummary('p', [], 2, 0, 'd').body).toBe('2 récompenses à valider');
  });

  it('regroupement', () => {
    expect(templates.groupSummary('activity_completed', 3)).toEqual({ title: '🎉 Belle journée', body: 'Vos enfants ont terminé 3 activités aujourd’hui.' });
    expect(templates.groupSummary('activity_validation_required', 2).title).toBe('👀 2 activités à valider');
    expect(templates.groupSummary('tip', 4).title).toBe('4 nouvelles notifications');
  });
});
