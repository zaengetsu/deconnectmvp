import { api, withQuery } from '../../lib/api';
import { snake } from '../../lib/case';
import type { Badge, ChildBadge, PointsLedgerEntry } from '../../types/database.types';
import { POINTS_CONFIG } from '../../lib/constants';

/**
 * Compute the real streak value by checking if last_activity_date is stale.
 * If the child hasn't done anything yesterday or today, the streak is 0.
 */
export function getRealStreak(streakDays: number, lastActivityDate: string | null): number {
  if (!lastActivityDate || streakDays === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Parse the date string (YYYY-MM-DD) as local date
  const [y, m, d] = lastActivityDate.split('-').map(Number);
  const lastDate = new Date(y, m - 1, d);
  lastDate.setHours(0, 0, 0, 0);

  // If last activity was today or yesterday, streak is valid
  if (lastDate.getTime() >= yesterday.getTime()) return streakDays;

  // Otherwise streak is broken → 0
  return 0;
}

interface ProgressSummary {
  childId: string;
  totalPoints: number;
  level: number;
  streakDays: number;
  badges: { id: string; name: string; description: string | null; icon: string | null; earnedAt: string }[];
  ledger: { id: string; points: number; reason: string | null; source: string; createdAt: string }[];
}

interface ChildStats {
  totalEarned: number;
  totalSpent: number;
  activitiesValidated: number;
  since: string;
  recent: { validated: { validatedAt: string; earnedPoints: number | null }[]; pointsEarned: number; badgesEarned: number };
}

const progressOf = (childId: string) => api<ProgressSummary>('GET', `/v1/children/${childId}/progress`);
const statsOf = (childId: string, since?: Date) => api<ChildStats>('GET', withQuery(`/v1/children/${childId}/stats`, { since: since?.toISOString() }));

/** Lundi 00:00 de la semaine en cours (heure locale). */
function startOfWeek(now = new Date()): Date {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export const gamificationService = {
  async getAllBadges(): Promise<Badge[]> {
    const rows = snake<Badge[]>(await api('GET', '/v1/badges'));
    return rows.sort((a, b) => a.condition_value - b.condition_value);
  },

  async getChildBadges(childId: string): Promise<ChildBadge[]> {
    const [progress, all] = await Promise.all([progressOf(childId), gamificationService.getAllBadges().catch(() => [] as Badge[])]);
    return progress.badges.map((b) => ({
      id: `${childId}:${b.id}`,
      child_id: childId,
      badge_id: b.id,
      earned_at: b.earnedAt,
      created_at: b.earnedAt,
      badge: all.find((x) => x.id === b.id) ?? ({ id: b.id, name: b.name, description: b.description, icon: b.icon } as Badge),
    }));
  },

  async getPointsHistory(childId: string, limit = 20): Promise<PointsLedgerEntry[]> {
    const progress = await progressOf(childId);
    return progress.ledger.slice(0, limit).map((l) => ({
      id: l.id,
      child_id: childId,
      source_type: l.source as PointsLedgerEntry['source_type'],
      source_id: null,
      points: l.points,
      reason: l.reason,
      created_by: null,
      created_at: l.createdAt,
    }));
  },

  calculateLevel(totalPoints: number): number {
    const thresholds = POINTS_CONFIG.levelThresholds;
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
      if (totalPoints >= thresholds[i]) {
        level = i + 1;
      } else {
        break;
      }
    }
    return level;
  },

  getNextLevelThreshold(totalPoints: number): number {
    const thresholds = POINTS_CONFIG.levelThresholds;
    for (const threshold of thresholds) {
      if (totalPoints < threshold) return threshold;
    }
    return thresholds[thresholds.length - 1];
  },

  getLevelProgress(totalPoints: number): number {
    const thresholds = POINTS_CONFIG.levelThresholds;
    let currentThreshold: number = 0;
    let nextThreshold: number = thresholds[1] || 50;

    for (let i = 0; i < thresholds.length - 1; i++) {
      if (totalPoints >= thresholds[i]) {
        currentThreshold = thresholds[i] as number;
        nextThreshold = thresholds[i + 1] as number;
      } else {
        break;
      }
    }

    if (totalPoints >= thresholds[thresholds.length - 1]) return 100;
    const range = nextThreshold - currentThreshold;
    const progress = totalPoints - currentThreshold;
    return Math.round((progress / range) * 100);
  },

  // ─── All-Time Stats ─────────────────────────────────────
  async getAllTimeStats(childId: string): Promise<{ totalEarned: number; totalSpent: number; activitiesValidated: number }> {
    const s = await statsOf(childId);
    return { totalEarned: s.totalEarned, totalSpent: s.totalSpent, activitiesValidated: s.activitiesValidated };
  },

  async getWeeklyStats(childId: string): Promise<{ activitiesCompleted: number; pointsEarned: number; badgesEarned: number }> {
    const s = await statsOf(childId, new Date(Date.now() - 7 * 86_400_000));
    return { activitiesCompleted: s.recent.validated.length, pointsEarned: s.recent.pointsEarned, badgesEarned: s.recent.badgesEarned };
  },

  /** Semaine en cours, jour par jour (lundi → dimanche, heure locale). */
  async getWeeklyDayByDay(childId: string): Promise<{ day: string; date: string; count: number; points: number; isToday: boolean }[]> {
    const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const localDateStr = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const monday = startOfWeek();
    const s = await statsOf(childId, monday);
    const todayStr = localDateStr(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = localDateStr(d);
      const day = s.recent.validated.filter((a) => a.validatedAt && localDateStr(new Date(a.validatedAt)) === dateStr);
      return {
        day: DAYS_FR[d.getDay()],
        date: dateStr,
        count: day.length,
        points: day.reduce((sum, a) => sum + (a.earnedPoints || 0), 0),
        isToday: dateStr === todayStr,
      };
    });
  },
};
