// Règles du moteur d'engagement : fonctions pures, testées unitairement.
// Principe : une seule relance par enfant et par jour au plus, quatre par semaine, jamais un jour
// où l'enfant a déjà agi, jamais pendant les heures silencieuses. Le but est de faire passer à
// l'action hors écran, pas d'augmenter les ouvertures de l'app.
import type { NudgeCopyInput } from './templates';

export const ENGAGEMENT = {
  /** Heure locale de la relance enfant (après l'école ; le week-end en fin de matinée). */
  childHour: { weekday: 16, weekend: 10 },
  /** Heure locale des relances parent (validation en attente, enfant inactif). */
  parentHour: 18,
  maxChildPerWeek: 4,
  maxParentIdlePerWeek: 2,
  /** Jours sans activité avant la relance « pause hors écran ». */
  idleDays: 3,
  /** Jours sans l'activité favorite avant « ça fait longtemps ». */
  comebackDays: 10,
  /** Nombre de réalisations (90 jours) pour qu'une activité compte comme favorite. */
  favoriteMinCount: 2,
  /** Série minimale qui mérite d'être protégée. */
  streakMin: 2,
  /** « Récompense proche » : il manque au plus 25 % du coût (et au moins 5 points). */
  rewardCloseRatio: 0.25,
  rewardCloseMinPoints: 5,
  /** Jours sans activité avant de suggérer une idée au parent. */
  parentIdleDays: 5,
  /** Validation en attente depuis au moins… (heures). */
  validationBacklogHours: 20,
} as const;

export interface ChildFacts {
  /** Activité validée ou soumise aujourd'hui (heure locale). */
  actedToday: boolean;
  /** Une activité est programmée aujourd'hui : le rappel dédié suffit. */
  plannedToday: boolean;
  nudgesThisWeek: number;
  nudgedToday: boolean;
  streakDays: number;
  /** Dernière activité validée hier (la série est encore sauvable aujourd'hui). */
  lastActivityYesterday: boolean;
  /** Activité commencée (choisie) avant aujourd'hui et pas encore envoyée. */
  started: { activityTitle: string; childActivityId: string } | null;
  closestReward: { title: string; missing: number; cost: number } | null;
  familyGoalRemaining: number | null;
  favorite: { activityId: string; title: string; daysSince: number; icon: string | null } | null;
  daysSinceLastActivity: number | null;
  suggestion: { id: string; title: string; minutes: number | null } | null;
}

export function rewardIsClose(missing: number, cost: number): boolean {
  return missing > 0 && (missing <= ENGAGEMENT.rewardCloseMinPoints || missing <= Math.ceil(cost * ENGAGEMENT.rewardCloseRatio));
}

/** Choisit LA relance la plus utile pour un enfant, ou aucune. Ordre : ce qui se perd le plus vite d'abord. */
export function pickChildNudge(f: ChildFacts): NudgeCopyInput | null {
  if (f.actedToday || f.plannedToday || f.nudgedToday) return null;
  if (f.nudgesThisWeek >= ENGAGEMENT.maxChildPerWeek) return null;

  if (f.streakDays >= ENGAGEMENT.streakMin && f.lastActivityYesterday) return { kind: 'nudge_streak', streak: f.streakDays };
  if (f.started) return { kind: 'nudge_resume', activityTitle: f.started.activityTitle, childActivityId: f.started.childActivityId };
  if (f.closestReward && rewardIsClose(f.closestReward.missing, f.closestReward.cost)) {
    return { kind: 'nudge_reward_close', rewardTitle: f.closestReward.title, missing: f.closestReward.missing };
  }
  if (f.familyGoalRemaining !== null && f.familyGoalRemaining > 0 && f.familyGoalRemaining <= 2) return { kind: 'nudge_goal', remaining: f.familyGoalRemaining };
  if (f.favorite && f.favorite.daysSince >= ENGAGEMENT.comebackDays) {
    return { kind: 'nudge_comeback', activityTitle: f.favorite.title, days: f.favorite.daysSince, categoryIcon: f.favorite.icon, activityId: f.favorite.activityId };
  }
  if (f.daysSinceLastActivity === null || f.daysSinceLastActivity >= ENGAGEMENT.idleDays) return { kind: 'nudge_idle', days: f.daysSinceLastActivity ?? 0, suggestion: f.suggestion };
  return null;
}

/** Heure locale à laquelle la relance enfant part ce jour-là (0 = dimanche, 6 = samedi). */
export function childNudgeHour(weekday: number): number {
  return weekday === 0 || weekday === 6 ? ENGAGEMENT.childHour.weekend : ENGAGEMENT.childHour.weekday;
}

/** Suggestion stable dans la journée (pas deux idées différentes si le job repasse). */
export function pickOfTheDay<T>(items: T[], seed: string): T | null {
  if (items.length === 0) return null;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return items[h % items.length];
}
