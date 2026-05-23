// ─── App Constants ───────────────────────────────────────────

export const APP_NAME = 'Deconnect';
export const APP_VERSION = '1.0.0';

// ─── Age Limits ──────────────────────────────────────────────
export const MIN_CHILD_AGE = 7;
export const MAX_CHILD_AGE = 18;

// ─── Free Plan Limits ────────────────────────────────────────
export const FREE_PLAN_LIMITS = {
  maxChildren: 1,
  maxCustomActivities: 5,
  maxCustomRewards: 3,
} as const;

// ─── Premium Plan ────────────────────────────────────────────
export const PREMIUM_PLAN = {
  priceMonthly: 4.99,
  currency: 'EUR',
} as const;

// ─── Points ──────────────────────────────────────────────────
export const POINTS_CONFIG = {
  defaultActivityPoints: 10,
  minPoints: 0,
  levelThresholds: [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500],
} as const;

export const LEVEL_NAMES: { name: string; color: string }[] = [
  { name: 'Graine',       color: '#34C759' },
  { name: 'Pousse',       color: '#1565C0' },
  { name: 'Explorateur',  color: '#0EA5E9' },
  { name: 'Aventurier',   color: '#8B5CF6' },
  { name: 'Champion',     color: '#F59E0B' },
  { name: 'Héros',        color: '#F97316' },
  { name: 'Super Héros',  color: '#EC4899' },
  { name: 'Maître',       color: '#EF4444' },
  { name: 'Grand Maître', color: '#6C5CE7' },
  { name: 'Légende',      color: '#1565C0' },
];

// ─── Categories — use getCategoryStyle() from ChildUIKit instead ─────────────
export const CATEGORY_COLORS: Record<string, string> = {
  sport:             '#F97316',
  creativite:        '#8B5CF6',
  nature:            '#34C759',
  'vie-quotidienne': '#1565C0',
  social:            '#0EA5E9',
  lecture:           '#1565C0',
  famille:           '#EC4899',
  cuisine:           '#F59E0B',
} as const;

// ─── Difficulty ──────────────────────────────────────────────
export const DIFFICULTY_CONFIG = {
  easy:   { label: 'Facile',    color: '#22C55E', emoji: '' },
  medium: { label: 'Moyen',     color: '#F59E0B', emoji: '' },
  hard:   { label: 'Difficile', color: '#EF4444', emoji: '' },
} as const;

// ─── Child-friendly messages ─────────────────────────────────
export const ENCOURAGEMENT_MESSAGES = [
  'Super travail !',
  'Tu es incroyable !',
  'Continue comme ça !',
  'Bravo champion !',
  'Tu progresses à fond !',
  'Quel talent !',
  'Tu es une star !',
  'Magnifique effort !',
] as const;

export const getRandomEncouragement = (): string => {
  return ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
};

// ─── Reward Categories (brief) ───────────────────────────────
export const REWARD_CATEGORIES: Record<string, { label: string; color: string; icon: string }> = {
  experience:     { label: 'Expériences',              color: '#F97316', icon: 'compass' },
  privilege:      { label: 'Privilèges',               color: '#8B5CF6', icon: 'crown' },
  responsibility: { label: 'Responsabilités',           color: '#1565C0', icon: 'shield' },
  symbolic:       { label: 'Symboliques',              color: '#F59E0B', icon: 'award' },
  family:         { label: 'Moments familiaux',        color: '#EC4899', icon: 'heart' },
} as const;

// ─── Streak messages ─────────────────────────────────────────
export const STREAK_MESSAGES: Record<number, string> = {
  0: 'Commence ton premier jour !',
  1: 'Premier jour — c\'est parti !',
  2: 'Deux jours d\'affilée, bien joué !',
  3: 'Trois jours de suite — superbe !',
  5: 'Cinq jours — tu es en feu !',
  7: 'Une semaine complète — champion !',
  14: 'Deux semaines — inarrêtable !',
  30: 'Un mois complet — légendaire !',
};

export const getStreakMessage = (days: number): string => {
  const thresholds = Object.keys(STREAK_MESSAGES).map(Number).sort((a, b) => b - a);
  const match = thresholds.find(t => days >= t);
  return STREAK_MESSAGES[match ?? 0];
};

