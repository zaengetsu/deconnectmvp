/**
 * Style d'une catégorie d'activité — teinte de fond et pictogramme.
 * Les teintes suivent le contrat de la maquette (var(--rk-*)) pour rester
 * justes en mode sombre et avec chaque thème enfant.
 */
export interface CategoryStyle { bg: string; accent: string; imgSrc: string }

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  sport:             { bg: 'var(--rk-accentsoft)', accent: 'var(--rk-accent)', imgSrc: '/images/categories/track.png' },
  nature:            { bg: 'var(--rk-sagesoft)',   accent: 'var(--rk-sage)',   imgSrc: '/images/categories/eco.png' },
  creativite:        { bg: 'var(--rk-accentsoft)', accent: 'var(--rk-accent)', imgSrc: '/images/categories/watercolor.png' },
  famille:           { bg: 'var(--rk-raspsoft)',   accent: 'var(--rk-rasp)',   imgSrc: '/images/categories/family.png' },
  lecture:           { bg: 'var(--rk-indigosoft)', accent: 'var(--rk-indigo)', imgSrc: '/images/categories/books.png' },
  cuisine:           { bg: 'var(--rk-ambersoft)',  accent: 'var(--rk-amber)',  imgSrc: '/images/categories/kung-pao-chicken.png' },
  'vie-quotidienne': { bg: 'var(--rk-indigosoft)', accent: 'var(--rk-indigo)', imgSrc: '/images/categories/calendar.png' },
};

const DEFAULT_CATEGORY: CategoryStyle = {
  bg: 'var(--rk-surface2)', accent: 'var(--rk-indigo)', imgSrc: '/images/categories/emoji.png',
};

export function getCategoryStyle(slug?: string | null): CategoryStyle {
  if (!slug) return DEFAULT_CATEGORY;
  return CATEGORY_STYLE[slug.toLowerCase()] ?? DEFAULT_CATEGORY;
}
