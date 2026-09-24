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
  { name: 'Graine',       color: '#6E9E85' },
  { name: 'Pousse',       color: '#3C41A8' },
  { name: 'Explorateur',  color: '#3FA0C9' },
  { name: 'Aventurier',   color: '#7C6BD4' },
  { name: 'Champion',     color: '#E0A233' },
  { name: 'Héros',        color: '#FF9469' },
  { name: 'Super Héros',  color: '#E2607F' },
  { name: 'Maître',       color: '#D8556B' },
  { name: 'Grand Maître', color: '#3C41A8' },
  { name: 'Légende',      color: '#3C41A8' },
];

// ─── Categories — use getCategoryStyle() from ChildUIKit instead ─────────────
export const CATEGORY_COLORS: Record<string, string> = {
  sport:             '#FF9469',
  creativite:        '#7C6BD4',
  nature:            '#6E9E85',
  'vie-quotidienne': '#3C41A8',
  social:            '#3FA0C9',
  lecture:           '#3C41A8',
  famille:           '#E2607F',
  cuisine:           '#E0A233',
} as const;

// ─── Difficulty ──────────────────────────────────────────────
export const DIFFICULTY_CONFIG = {
  easy:   { label: 'Facile',    color: '#6E9E85', emoji: '' },
  medium: { label: 'Moyen',     color: '#E0A233', emoji: '' },
  hard:   { label: 'Difficile', color: '#D8556B', emoji: '' },
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
  experience:     { label: 'Expériences',              color: '#FF9469', icon: 'compass' },
  privilege:      { label: 'Privilèges',               color: '#7C6BD4', icon: 'crown' },
  responsibility: { label: 'Responsabilités',           color: '#3C41A8', icon: 'shield' },
  symbolic:       { label: 'Symboliques',              color: '#E0A233', icon: 'award' },
  family:         { label: 'Moments familiaux',        color: '#E2607F', icon: 'heart' },
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

