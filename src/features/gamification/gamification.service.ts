import { supabase } from '../../lib/supabase';
import type { Badge, ChildBadge, PointsLedgerEntry } from '../../types/database.types';
import { POINTS_CONFIG } from '../../lib/constants';

export const gamificationService = {
  // ─── Badges ──────────────────────────────────────────────
  async getAllBadges(): Promise<Badge[]> {
    const { data, error } = await supabase
      .from('badges')
      .select('*')
      .order('condition_value', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getChildBadges(childId: string): Promise<ChildBadge[]> {
    const { data, error } = await supabase
      .from('child_badges')
      .select('*, badge:badges(*)')
      .eq('child_id', childId)
      .order('earned_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // ─── Points ──────────────────────────────────────────────
  async getPointsHistory(childId: string, limit = 20): Promise<PointsLedgerEntry[]> {
    const { data, error } = await supabase
      .from('points_ledger')
      .select('*')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  // ─── Level ───────────────────────────────────────────────
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

  // ─── Weekly Stats ────────────────────────────────────────
  async getWeeklyStats(childId: string): Promise<{
    activitiesCompleted: number;
    pointsEarned: number;
    badgesEarned: number;
  }> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO = weekAgo.toISOString();

    const [activitiesRes, pointsRes, badgesRes] = await Promise.all([
      supabase
        .from('child_activities')
        .select('id', { count: 'exact' })
        .eq('child_id', childId)
        .eq('status', 'validated')
        .gte('validated_at', weekAgoISO),
      supabase
        .from('points_ledger')
        .select('points')
        .eq('child_id', childId)
        .eq('source_type', 'activity_validation')
        .gte('created_at', weekAgoISO),
      supabase
        .from('child_badges')
        .select('id', { count: 'exact' })
        .eq('child_id', childId)
        .gte('earned_at', weekAgoISO),
    ]);

    const pointsEarned = (pointsRes.data || []).reduce((sum, entry) => sum + entry.points, 0);

    return {
      activitiesCompleted: activitiesRes.count || 0,
      pointsEarned,
      badgesEarned: badgesRes.count || 0,
    };
  },

  // ─── Weekly Day-by-Day ──────────────────────────────────
  async getWeeklyDayByDay(childId: string): Promise<{
    day: string;       // 'Lun', 'Mar', etc.
    date: string;      // ISO date
    count: number;     // activities validated
    points: number;    // points earned
    isToday: boolean;
  }[]> {
    const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    // Start from Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const weekStart = monday.toISOString();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const weekEnd = sunday.toISOString();

    // Fetch validated activities for this week
    const { data: activities } = await supabase
      .from('child_activities')
      .select('validated_at, earned_points')
      .eq('child_id', childId)
      .eq('status', 'validated')
      .gte('validated_at', weekStart)
      .lte('validated_at', weekEnd);

    const todayStr = now.toISOString().slice(0, 10);

    // Build 7-day array
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayActivities = (activities || []).filter(
        a => a.validated_at && a.validated_at.slice(0, 10) === dateStr
      );
      return {
        day: DAYS_FR[d.getDay()],
        date: dateStr,
        count: dayActivities.length,
        points: dayActivities.reduce((s, a) => s + (a.earned_points || 0), 0),
        isToday: dateStr === todayStr,
      };
    });
  },
};
