// Règles de décision des notifications : fonctions pures, testées unitairement.
import type { NotificationChannel, NotificationPriority, NotificationType } from '@rekonect/contracts';
import { hhmmToMinutes, timeColumnToHhmm, zonedParts, zonedTimeToUtc } from '../../platform/time';

export interface PreferenceFlags {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  activityCompleted: boolean;
  activityValidation: boolean;
  activityPlanned: boolean;
  rewardUnlocked: boolean;
  rewardPending: boolean;
  familyActivities: boolean;
  familyInvitations: boolean;
  goals: boolean;
  dailySummary: boolean;
  weeklySummary: boolean;
  screenTimeGoal: boolean;
  screenTimeSummary: boolean;
  tips: boolean;
  productNews: boolean;
  quietHoursStart: Date | null;
  quietHoursEnd: Date | null;
  timezone: string;
  channelOverrides: unknown;
}

/** Correspondance type de notification → interrupteur de préférence (ex-notification_type_allowed). */
const TYPE_TO_FLAG: Partial<Record<NotificationType, keyof PreferenceFlags>> = {
  activity_completed: 'activityCompleted',
  activity_validated: 'activityCompleted',
  activity_validation_required: 'activityValidation',
  activity_planned: 'activityPlanned',
  activity_reminder: 'activityPlanned',
  activity_assigned: 'activityPlanned',
  reward_unlocked: 'rewardUnlocked',
  reward_requested: 'rewardUnlocked',
  reward_pending: 'rewardPending',
  reward_approved: 'rewardUnlocked',
  reward_rejected: 'rewardUnlocked',
  family_activity: 'familyActivities',
  family_invitation: 'familyInvitations',
  friend_request: 'familyInvitations',
  goal_progress: 'goals',
  goal_completed: 'goals',
  daily_summary: 'dailySummary',
  weekly_summary: 'weeklySummary',
  screen_time_goal: 'screenTimeGoal',
  screen_time_summary: 'screenTimeSummary',
  tip: 'tips',
  product_news: 'productNews',
};

/** Niveaux, badges, sécurité, appareil relié : toujours autorisés. */
export function typeAllowed(prefs: PreferenceFlags | null, type: NotificationType): boolean {
  if (!prefs) return true;
  const flag = TYPE_TO_FLAG[type];
  return flag ? prefs[flag] !== false : true;
}

/** Canaux retenus après préférences globales et surcharges par type. */
export function resolveChannels(
  prefs: PreferenceFlags | null,
  type: NotificationType,
  requested: NotificationChannel[],
  priority: NotificationPriority,
): NotificationChannel[] {
  if (!prefs) return [...requested];
  // Une alerte critique (sécurité) passe toujours en in-app et par email si demandé.
  if (priority === 'critical') return [...requested];
  const overrides = (prefs.channelOverrides ?? {}) as Record<string, { push?: boolean; email?: boolean } | undefined>;
  const override = overrides[type] ?? {};
  return requested.filter((c) => {
    if (c === 'push') return prefs.pushEnabled && override.push !== false;
    if (c === 'email') return prefs.emailEnabled && override.email !== false;
    return prefs.inAppEnabled;
  });
}

/**
 * Heures silencieuses : renvoie l'instant où l'envoi redevient possible, ou null si l'on peut envoyer.
 * Gère les plages qui traversent minuit (20:30 → 07:30) et le fuseau du destinataire.
 */
export function nextSendTime(prefs: PreferenceFlags | null, priority: NotificationPriority, at: Date): Date | null {
  if (!prefs || priority === 'critical') return null;
  const start = timeColumnToHhmm(prefs.quietHoursStart);
  const end = timeColumnToHhmm(prefs.quietHoursEnd);
  if (!start || !end || start === end) return null;

  const tz = prefs.timezone || 'Europe/Paris';
  const local = zonedParts(at, tz);
  const now = local.hour * 60 + local.minute;
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  const inQuiet = s > e ? now >= s || now < e : now >= s && now < e;
  if (!inQuiet) return null;

  const [eh, em] = end.split(':').map(Number);
  // Fin des heures silencieuses : aujourd'hui si on est avant, sinon demain.
  const base = new Date(Date.UTC(local.year, local.month - 1, local.day + (now < e ? 0 : 1)));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), eh, em, tz);
}

export type NotificationCategory = 'action' | 'activity' | 'reward' | 'family' | 'progress' | 'other';

/** Regroupement visuel du centre de notifications (filtres). */
export function categoryOf(type: string | null | undefined, priority?: string): NotificationCategory {
  if (priority === 'high' || priority === 'critical') return 'action';
  if (!type) return 'other';
  if (type.startsWith('activity_')) return 'activity';
  if (type.startsWith('reward_') || type === 'partner_offer_unlocked') return 'reward';
  if (type.startsWith('family_') || type.startsWith('friend_')) return 'family';
  if (['level_up', 'badge_earned', 'goal_progress', 'goal_completed', 'daily_summary', 'weekly_summary', 'screen_time_goal', 'screen_time_summary'].includes(type)) {
    return 'progress';
  }
  return 'other';
}

export const CATEGORY_TYPES: Record<Exclude<NotificationCategory, 'action'>, (t: string) => boolean> = {
  activity: (t) => t.startsWith('activity_'),
  reward: (t) => t.startsWith('reward_') || t === 'partner_offer_unlocked',
  family: (t) => t.startsWith('family_') || t.startsWith('friend_'),
  progress: (t) => categoryOf(t) === 'progress',
  other: (t) => categoryOf(t) === 'other',
};
