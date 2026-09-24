import { NUDGE_TYPES } from '@rekonect/contracts';
import { type ChildFacts, childNudgeHour, ENGAGEMENT, pickChildNudge, pickOfTheDay, rewardIsClose } from '../../src/modules/notifications/engagement.rules';
import { categoryOf, typeAllowed } from '../../src/modules/notifications/policy';
import { nudgeCopy, templates } from '../../src/modules/notifications/templates';

const base: ChildFacts = {
  actedToday: false,
  plannedToday: false,
  nudgesThisWeek: 0,
  nudgedToday: false,
  streakDays: 0,
  lastActivityYesterday: false,
  started: null,
  closestReward: null,
  familyGoalRemaining: null,
  favorite: null,
  daysSinceLastActivity: 1,
  suggestion: null,
};

describe('Moteur d’engagement : choix de la relance', () => {
  it('rien si l’enfant a déjà agi, a une activité prévue, a déjà eu sa relance ou a atteint le plafond', () => {
    const streak = { ...base, streakDays: 4, lastActivityYesterday: true };
    expect(pickChildNudge(streak)).toMatchObject({ kind: 'nudge_streak', streak: 4 });
    expect(pickChildNudge({ ...streak, actedToday: true })).toBeNull();
    expect(pickChildNudge({ ...streak, plannedToday: true })).toBeNull();
    expect(pickChildNudge({ ...streak, nudgedToday: true })).toBeNull();
    expect(pickChildNudge({ ...streak, nudgesThisWeek: ENGAGEMENT.maxChildPerWeek })).toBeNull();
    expect(pickChildNudge({ ...streak, nudgesThisWeek: ENGAGEMENT.maxChildPerWeek - 1 })).not.toBeNull();
  });

  it('priorités : série > activité commencée > récompense proche > objectif familial > favorite > pause', () => {
    const all: ChildFacts = {
      ...base,
      streakDays: 3,
      lastActivityYesterday: true,
      started: { activityTitle: 'Lire 20 pages', childActivityId: 'ca1' },
      closestReward: { title: 'Choisir le film', missing: 10, cost: 100 },
      familyGoalRemaining: 1,
      favorite: { activityId: 'a1', title: 'Vélo', daysSince: 12, icon: '🚲' },
      daysSinceLastActivity: 5,
      suggestion: { id: 'a2', title: 'Cabane', minutes: 20 },
    };
    const order: string[] = [];
    let f = all;
    for (;;) {
      const n = pickChildNudge(f);
      if (!n) break;
      order.push(n.kind);
      if (n.kind === 'nudge_streak') f = { ...f, streakDays: 0 };
      else if (n.kind === 'nudge_resume') f = { ...f, started: null };
      else if (n.kind === 'nudge_reward_close') f = { ...f, closestReward: null };
      else if (n.kind === 'nudge_goal') f = { ...f, familyGoalRemaining: null };
      else if (n.kind === 'nudge_comeback') f = { ...f, favorite: null };
      else break;
    }
    expect(order).toEqual(['nudge_streak', 'nudge_resume', 'nudge_reward_close', 'nudge_goal', 'nudge_comeback', 'nudge_idle']);
  });

  it('pas de relance « pause » pour un enfant actif hier ; relance dès 3 jours ou jamais d’activité', () => {
    expect(pickChildNudge({ ...base, daysSinceLastActivity: 1 })).toBeNull();
    expect(pickChildNudge({ ...base, daysSinceLastActivity: 3 })).toMatchObject({ kind: 'nudge_idle', days: 3 });
    expect(pickChildNudge({ ...base, daysSinceLastActivity: null })).toMatchObject({ kind: 'nudge_idle' });
    // Favorite récente : pas de « ça fait longtemps ».
    expect(pickChildNudge({ ...base, favorite: { activityId: 'a', title: 'Vélo', daysSince: 4, icon: null } })).toBeNull();
  });

  it('récompense « proche » : 25 % du coût au plus, ou 5 points', () => {
    expect(rewardIsClose(20, 100)).toBe(true);
    expect(rewardIsClose(26, 100)).toBe(false);
    expect(rewardIsClose(5, 10)).toBe(true);
    expect(rewardIsClose(0, 100)).toBe(false);
  });

  it('heure locale : 16 h en semaine, 10 h le week-end ; suggestion stable dans la journée', () => {
    expect(childNudgeHour(3)).toBe(16);
    expect(childNudgeHour(6)).toBe(10);
    expect(childNudgeHour(0)).toBe(10);
    const items = ['a', 'b', 'c', 'd'];
    expect(pickOfTheDay(items, 'child:2026-09-23')).toBe(pickOfTheDay(items, 'child:2026-09-23'));
    expect(pickOfTheDay([], 'x')).toBeNull();
  });
});

describe('Relances : textes selon l’âge et préférences', () => {
  const young = { id: 'c1', displayName: 'Léo', age: 6, parentId: 'p1' };
  const teen = { id: 'c2', displayName: 'Inès', age: 15, parentId: 'p1' };

  it('ado : jamais infantilisant ; petit : chaleureux ; jamais culpabilisant', () => {
    const inputs = [
      { kind: 'nudge_streak', streak: 5 },
      { kind: 'nudge_resume', activityTitle: 'Lire', childActivityId: 'x' },
      { kind: 'nudge_reward_close', rewardTitle: 'Cinéma', missing: 20 },
      { kind: 'nudge_comeback', activityTitle: 'Vélo', days: 12, categoryIcon: '🚲', activityId: 'a' },
      { kind: 'nudge_idle', days: 4, suggestion: { id: 'a', title: 'Cabane', minutes: 15 } },
      { kind: 'nudge_goal', remaining: 1 },
    ] as const;
    for (const n of inputs) {
      const t = nudgeCopy('teen', n);
      const y = nudgeCopy('young', n);
      expect(`${t.title} ${t.body}`).not.toMatch(/trop fort|bravo mon|petit/i);
      for (const c of [t, y]) {
        expect(`${c.title} ${c.body}`).not.toMatch(/trop d.écran|téléphone|tu n.as rien fait|dommage/i);
        expect(c.route.startsWith('/child/')).toBe(true);
      }
    }
    expect(nudgeCopy('young', inputs[3]).body).toContain('12 jours');
    expect(nudgeCopy('teen', inputs[4]).body).toContain('Cabane');
  });

  it('une relance par enfant et par jour (clé de déduplication), priorité basse, lien vers l’enfant', () => {
    const d = templates.nudge(young, { kind: 'nudge_goal', remaining: 1 }, '2026-09-23');
    expect(d).toMatchObject({ recipientType: 'child', recipientId: 'c1', priority: 'low', entityType: 'child', entityId: 'c1', dedupKey: 'nudge:c1:2026-09-23' });
    expect(templates.nudge(teen, { kind: 'nudge_streak', streak: 3 }, '2026-09-23').dedupKey).toBe('nudge:c2:2026-09-23');
    expect(templates.streakMilestone(teen, 7, '2026-09-23').title).toBe('🔥 7 jours d’affilée');
    expect(templates.streakMilestoneParent(teen, 7, '2026-09-23').channels).toEqual(['in_app']);
  });

  it('préférence « encouragements » : coupe toutes les relances, pas les validations', () => {
    const prefs = { encouragements: false, activityValidation: true, goals: true } as never;
    for (const t of NUDGE_TYPES) expect(typeAllowed(prefs, t)).toBe(false);
    expect(typeAllowed(prefs, 'validation_backlog')).toBe(true);
    expect(typeAllowed(prefs, 'streak_milestone')).toBe(true);
    expect(categoryOf('nudge_idle')).toBe('activity');
    expect(categoryOf('streak_milestone')).toBe('progress');
    expect(categoryOf('validation_backlog')).toBe('activity');
  });
});
