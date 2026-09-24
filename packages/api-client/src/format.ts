// Mise en forme française identique aux maquettes : « 12 480 », « 22 120 € », « +8,2 % », « 24 sept. ».
const NBSP = ' ';
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Séparateur de milliers : espace insécable (comme Intl fr-FR, mais stable d'un moteur à l'autre). */
export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  const fixed = Math.abs(n).toFixed(digits);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? '−' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

/** Centimes → « 4,99 € » ou « 22 120 € » (sans décimales si le montant est rond). */
export function formatEuros(cents: number | null | undefined, opts: { signed?: boolean; decimals?: 'auto' | 'always' } = {}): string {
  if (cents == null) return '—';
  const euros = cents / 100;
  const decimals = opts.decimals === 'always' || cents % 100 !== 0 ? 2 : 0;
  const sign = opts.signed ? (cents > 0 ? '+' : cents < 0 ? '−' : '') : cents < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(euros), decimals)}${NBSP}€`;
}

/** Variation : « +8,2 % », « −3 % », « — » si inconnue. */
export function formatDelta(pct: number | null | undefined): string {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(pct), Number.isInteger(pct) ? 0 : 1)}${NBSP}%`;
}

export function formatPercent(pct: number | null | undefined, digits?: number): string {
  if (pct == null) return '—';
  return `${formatNumber(pct, digits ?? (Number.isInteger(pct) ? 0 : 1))}${NBSP}%`;
}

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

/** « 24 sept. » */
export function formatShortDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = toDate(d);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** « 24 sept. 16:42 » */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = toDate(d);
  return `${formatShortDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** « 24 septembre 2026 » */
export function formatLongDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = toDate(d);
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** « mars 2026 » */
export function formatMonthYear(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = toDate(d);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** « Septembre 2026 » (factures). */
export function formatMonthLong(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = toDate(d);
  const m = MONTHS_LONG[date.getMonth()];
  return `${m[0].toUpperCase()}${m.slice(1)} ${date.getFullYear()}`;
}

/** « Il y a 4 min », « Il y a 2 h », « Hier », « Il y a 34 j », « Aujourd'hui ». */
export function formatRelative(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return '—';
  const date = toDate(d);
  const diff = Math.max(0, now.getTime() - date.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'Hier';
  return `Il y a ${days} j`;
}

/** « il y a 2 jours », « hier », « il y a 5 h » (soumission d'une offre). */
export function formatSince(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return '';
  const diff = Math.max(0, now.getTime() - toDate(d).getTime());
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}

/** Durée « 3 h 12 » à partir de secondes. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ''))).toUpperCase();
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(n)} ${n > 1 ? pluralForm : singular}`;
}

/** Catégorie d'activité → pictogramme (public/assets/categories). */
const CATEGORY_IMAGES: Record<string, string> = {
  'vie-quotidienne': 'calendar',
  sport: 'track',
  nature: 'eco',
  creativite: 'watercolor',
  lecture: 'books',
  cuisine: 'kung-pao-chicken',
  famille: 'family',
};
export function categoryImage(slug: string | null | undefined): string {
  return `/assets/categories/${CATEGORY_IMAGES[slug ?? ''] ?? 'emoji'}.png`;
}
export function avatarImage(seed: string | number): string {
  const n = typeof seed === 'number' ? seed : [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `/assets/avatars/avatar_${String((Math.abs(n) % 14) + 1).padStart(2, '0')}.png`;
}
