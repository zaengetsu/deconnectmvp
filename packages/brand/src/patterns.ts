import type { CSSProperties } from 'react';
import { BRAND, tint } from './tokens';

/**
 * Les six textures de la charte (§05), générées en CSS : aucune image à
 * charger, et chaque couleur est paramétrable pour suivre l'accent.
 *
 *  - waves    : ondes concentriques, en-têtes colorés
 *  - dots     : grille de points, fonds sombres
 *  - hatch    : hachures obliques, fonds pêche / accent
 *  - links    : maillons — motif signature, dérivé du logo
 *  - arcs     : arcs, fonds clairs et pages vides
 *  - confetti : moments de réussite uniquement
 */
export type PatternKind = 'waves' | 'dots' | 'hatch' | 'links' | 'arcs' | 'confetti';

export const PATTERN_KINDS: readonly PatternKind[] = ['waves', 'dots', 'hatch', 'links', 'arcs', 'confetti'];

export interface PatternOptions {
  /** Couleur du trait principal (blanc translucide sur fond coloré par défaut). */
  line?: string;
  /** Seconde couleur (pêche par défaut). */
  accent?: string;
  /** Agrandit ou réduit le motif (1 = taille de la charte). */
  scale?: number;
  /** Point d'origine des ondes, ex. « 20% 120% ». */
  origin?: string;
}

const px = (n: number, s: number) => `${round(n * s)}px`;
const round = (n: number) => Math.round(n * 100) / 100;

/** Styles de fond (backgroundImage, taille, position) d'un motif. */
export function patternStyle(kind: PatternKind, o: PatternOptions = {}): CSSProperties {
  const s = o.scale ?? 1;
  switch (kind) {
    case 'waves': {
      const at = o.origin ?? '20% 120%';
      const line = o.line ?? 'rgba(255,255,255,.14)';
      const glow = o.accent ?? tint(BRAND.peach, 0.55);
      return {
        backgroundImage: [
          `radial-gradient(circle at ${at}, ${glow} 0%, transparent 42%)`,
          `radial-gradient(circle at ${at}, ${line} 42%, transparent 43%)`,
          `radial-gradient(circle at ${at}, ${line} 62%, transparent 63%)`,
          `radial-gradient(circle at ${at}, ${line} 82%, transparent 83%)`,
        ].join(','),
      };
    }
    case 'dots': {
      const line = o.line ?? 'rgba(255,255,255,.2)';
      return {
        backgroundImage: `radial-gradient(circle, ${line} ${px(1.4, s)}, transparent ${px(1.5, s)})`,
        backgroundSize: `${px(14, s)} ${px(14, s)}`,
      };
    }
    case 'hatch': {
      const line = o.line ?? 'rgba(255,255,255,.22)';
      return { backgroundImage: `repeating-linear-gradient(115deg, ${line} 0 ${px(2, s)}, transparent ${px(2, s)} ${px(13, s)})` };
    }
    case 'links': {
      const line = o.line ?? 'rgba(255,255,255,.16)';
      const accent = o.accent ?? tint(BRAND.peach, 0.5);
      const ring = (c: string) => `radial-gradient(circle, transparent ${px(15, s)}, ${c} ${px(15.5, s)} ${px(17, s)}, transparent ${px(17.5, s)})`;
      return {
        backgroundImage: `${ring(line)},${ring(accent)}`,
        backgroundSize: `${px(44, s)} ${px(44, s)}`,
        backgroundPosition: `0 0,${px(22, s)} 0`,
      };
    }
    case 'arcs': {
      const line = o.line ?? tint(BRAND.indigo, 0.16);
      const accent = o.accent ?? tint(BRAND.peach, 0.4);
      return {
        backgroundImage:
          `radial-gradient(circle at 0 0, transparent ${px(21, s)}, ${line} ${px(21.5, s)} ${px(23, s)}, transparent ${px(23.5, s)}),` +
          `radial-gradient(circle at 100% 100%, transparent ${px(21, s)}, ${accent} ${px(21.5, s)} ${px(23, s)}, transparent ${px(23.5, s)})`,
        backgroundSize: `${px(44, s)} ${px(44, s)}`,
      };
    }
    case 'confetti': {
      const dot = (x: string, y: string, c: string, r: number) => `radial-gradient(circle at ${x} ${y}, ${c} 0 ${px(r, s)}, transparent ${px(r + 0.5, s)})`;
      return {
        backgroundImage: [
          dot('20%', '30%', o.accent ?? BRAND.peach, 3),
          dot('70%', '20%', BRAND.sage, 2.5),
          dot('45%', '75%', BRAND.amber, 2.5),
          dot('85%', '65%', o.line ?? 'rgba(255,255,255,.7)', 2),
          dot('10%', '85%', BRAND.rasp, 2),
        ].join(','),
        backgroundSize: `${px(90, s)} ${px(90, s)}`,
      };
    }
  }
}

/**
 * Estompe un calque par un masque en dégradé (couche 2 de la recette).
 * `angle` indique d'où vient la matière : 200deg = en haut à droite.
 */
export function fadeMask(angle = 200, stop = 60): CSSProperties {
  const m = `linear-gradient(${angle}deg, #000 0%, transparent ${stop}%)`;
  return { WebkitMaskImage: m, maskImage: m };
}
