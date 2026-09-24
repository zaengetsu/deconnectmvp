/**
 * Couleurs de marque et élévations de la charte (§02 et §05·C).
 * Les composants acceptent aussi bien ces valeurs que des variables CSS
 * (`var(--rk-accent)`) : c'est ce qui permet à l'app mobile de suivre le thème
 * enfant et le mode sombre sans code supplémentaire.
 */
export const BRAND = {
  indigo: '#3C41A8',
  indigoDark: '#262A78',
  peach: '#FF9469',
  peachText: '#C2582A',
  ink: '#16182B',
  cream: '#F6F4F1',
  sage: '#6E9E85',
  amber: '#E0A233',
  rasp: '#D8556B',
  white: '#FFFFFF',
  /** Accents des thèmes enfant (§02). */
  ocean: '#3FA0C9',
  mint: '#5CB88F',
  berry: '#7C6BD4',
  sun: '#E8B33F',
  raspberry: '#E2607F',
} as const;

/** Quatre niveaux d'ombre teintés à l'encre (§05·C). */
export const ELEVATION = {
  /** À plat : tableaux, listes. */
  0: 'none',
  /** Carte : cartes d'activité. */
  1: '0 1px 2px rgba(22,24,43,.04), 0 8px 24px -10px rgba(22,24,43,.14)',
  /** Flottant : menus, tiroirs. */
  2: '0 20px 40px -18px rgba(22,24,43,.3)',
  /** Mise en scène : visuels, marketing. */
  3: '0 30px 50px -20px rgba(22,24,43,.5)',
} as const;
export type Elevation = keyof typeof ELEVATION;

/** Bordure du niveau 0. */
export const FLAT_BORDER = '1px solid rgba(22,24,43,.08)';

/**
 * Applique une opacité à une couleur. Les hexadécimaux deviennent des rgba
 * (compatibles partout) ; le reste — variables CSS comprises — passe par
 * color-mix.
 */
export function tint(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${round(a)})`;
  }
  return `color-mix(in srgb, ${color} ${round(a * 100)}%, transparent)`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
