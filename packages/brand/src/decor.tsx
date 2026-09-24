import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { fadeMask, patternStyle, type PatternKind, type PatternOptions } from './patterns';
import { BRAND, ELEVATION, tint } from './tokens';

/**
 * Éléments graphiques de la charte (§05·B) : des formes simples, toutes issues
 * du cercle du logo, que l'on compose en couches.
 *
 * Règle commune : un élément décoratif est toujours `aria-hidden`, ne capte
 * jamais le pointeur et se place en absolu dans un parent `position: relative`
 * (voir <Scene>, qui s'en charge).
 */

const LAYER: CSSProperties = { position: 'absolute', pointerEvents: 'none' };

/* ── Ancrage ────────────────────────────────────────────────────────────── */

export type Anchor =
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'left' | 'right' | 'top' | 'bottom' | 'center'
  | { x: string; y: string };

const ANCHORS: Record<Exclude<Anchor, object>, [string, string]> = {
  'top-left': ['6%', '0%'],
  'top-right': ['94%', '0%'],
  'bottom-left': ['6%', '100%'],
  'bottom-right': ['94%', '100%'],
  left: ['0%', '50%'],
  right: ['100%', '50%'],
  top: ['50%', '0%'],
  bottom: ['50%', '100%'],
  center: ['50%', '50%'],
};

/** Centre un calque de taille `size` sur un point d'ancrage. */
export function anchorStyle(at: Anchor, size: number | string): CSSProperties {
  const [x, y] = typeof at === 'string' ? ANCHORS[at] : [at.x, at.y];
  return { left: x, top: y, width: size, height: size, transform: 'translate(-50%,-50%)' };
}

/* ── Motif ──────────────────────────────────────────────────────────────── */

export interface PatternProps extends PatternOptions {
  kind: PatternKind;
  /** Direction d'où vient la matière (deg), ou false pour un motif plein. */
  fade?: number | false;
  /** Où le masque devient transparent (%). */
  fadeStop?: number;
  opacity?: number;
  style?: CSSProperties;
}

/** Calque de texture plein cadre. */
export function Pattern({ kind, fade = false, fadeStop = 60, opacity, style, ...opts }: PatternProps) {
  return (
    <div
      aria-hidden
      data-rk-pattern={kind}
      style={{ ...LAYER, inset: 0, ...patternStyle(kind, opts), ...(fade === false ? null : fadeMask(fade, fadeStop)), opacity, ...style }}
    />
  );
}

/* ── Ondes ──────────────────────────────────────────────────────────────── */

export interface RingsProps {
  /** Diamètre de l'onde extérieure (px). */
  size?: number;
  count?: number;
  color?: string;
  /** Multiplie l'opacité des traits. */
  strength?: number;
  stroke?: number;
  at?: Anchor;
  /** Point focal plein au centre (score, lieu, avatar). */
  focal?: string;
  focalSize?: number;
  style?: CSSProperties;
}

/** Ondes concentriques autour d'un point focal. */
export function Rings({ size = 260, count = 3, color = BRAND.white, strength = 1, stroke = 1.5, at = 'bottom-left', focal, focalSize = 18, style }: RingsProps) {
  const n = Math.max(1, Math.round(count));
  const rings = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return { d: Math.round(size * (1 - 0.63 * t)), a: (0.15 + 0.2 * t) * strength };
  });
  return (
    <div aria-hidden data-rk-rings="" style={{ ...LAYER, ...anchorStyle(at, size), ...style }}>
      {rings.map((r) => (
        <div
          key={r.d}
          style={{ ...LAYER, ...anchorStyle('center', r.d), borderRadius: '50%', border: `${stroke}px solid ${tint(color, r.a)}` }}
        />
      ))}
      {focal && <div style={{ ...LAYER, ...anchorStyle('center', focalSize), borderRadius: '50%', background: focal }} />}
    </div>
  );
}

/* ── Halo ───────────────────────────────────────────────────────────────── */

export interface HaloProps {
  size?: number;
  color?: string;
  intensity?: number;
  at?: Anchor;
  style?: CSSProperties;
}

/** Lumière douce derrière l'élément clé. Un seul par écran. */
export function Halo({ size = 220, color = BRAND.peach, intensity = 0.7, at = 'bottom-left', style }: HaloProps) {
  return (
    <div
      aria-hidden
      data-rk-halo=""
      style={{ ...LAYER, ...anchorStyle(at, size), borderRadius: '50%', background: `radial-gradient(circle, ${tint(color, intensity)}, ${tint(color, 0)} 68%)`, ...style }}
    />
  );
}

/* ── Composition ────────────────────────────────────────────────────────── */

export interface BackdropProps {
  /** Couche 2 : motif estompé. */
  pattern?: PatternKind | false;
  patternFade?: number | false;
  patternStop?: number;
  line?: string;
  accent?: string;
  patternScale?: number;
  /** Couche 3 : ondes et halo ancrés dans un coin, qui débordent du cadre. */
  rings?: Anchor | false;
  ringsSize?: number;
  ringsColor?: string;
  ringsStrength?: number;
  halo?: Anchor | false;
  haloSize?: number;
  haloColor?: string;
  haloIntensity?: number;
}

/**
 * Recette en 4 couches (fond → motif → ondes et halo → contenu). <Backdrop>
 * pose les couches 2 et 3 ; le fond et la carte réelle restent au parent.
 */
export function Backdrop({
  pattern = 'links', patternFade = 200, patternStop = 60, line, accent, patternScale,
  rings = 'bottom-left', ringsSize = 260, ringsColor, ringsStrength,
  halo = 'bottom-left', haloSize = 160, haloColor, haloIntensity,
}: BackdropProps) {
  return (
    <>
      {pattern && <Pattern kind={pattern} fade={patternFade} fadeStop={patternStop} line={line} accent={accent} scale={patternScale} />}
      {rings && <Rings at={rings} size={ringsSize} color={ringsColor} strength={ringsStrength} />}
      {halo && <Halo at={halo} size={haloSize} color={haloColor} intensity={haloIntensity} />}
    </>
  );
}

export interface SceneProps extends BackdropProps, Omit<HTMLAttributes<HTMLElement>, 'color'> {
  children?: ReactNode;
  /** Couche 1 : aplat (indigo, encre, pêche ou variable CSS). */
  bg?: string;
  color?: string;
  radius?: number | string;
  padding?: number | string;
  as?: ElementType;
  /** Pour `as="button"`. */
  type?: 'button' | 'submit';
  /** Contenu plein cadre, au-dessus du décor. */
  contentStyle?: CSSProperties;
  [key: `data-${string}`]: string | undefined;
}

/**
 * Surface décorée : aplat + <Backdrop> + contenu au premier plan. C'est le
 * composant à utiliser pour un en-tête, une carte héro ou un écran vide.
 */
export function Scene({ children, bg = BRAND.indigo, color, radius, padding, as: As = 'div', style, contentStyle, ...rest }: SceneProps) {
  const { pattern, patternFade, patternStop, line, accent, patternScale, rings, ringsSize, ringsColor, ringsStrength, halo, haloSize, haloColor, haloIntensity, ...data } = rest;
  return (
    <As
      {...data}
      style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', background: bg, color, borderRadius: radius, padding, ...style }}
    >
      <Backdrop {...{ pattern, patternFade, patternStop, line, accent, patternScale, rings, ringsSize, ringsColor, ringsStrength, halo, haloSize, haloColor, haloIntensity }} />
      <div style={{ position: 'relative', ...contentStyle }}>{children}</div>
    </As>
  );
}

/* ── Stickers ───────────────────────────────────────────────────────────── */

export type StickerTone = 'accent' | 'ink' | 'indigo' | 'white' | 'sage';
const STICKER_TONES: Record<StickerTone, [string, string]> = {
  accent: [BRAND.peach, BRAND.ink],
  ink: [BRAND.ink, BRAND.white],
  indigo: [BRAND.indigo, BRAND.white],
  white: [BRAND.white, BRAND.ink],
  sage: [BRAND.sage, BRAND.white],
};

export interface StickerProps {
  children: ReactNode;
  tone?: StickerTone;
  bg?: string;
  fg?: string;
  /** Inclinaison en degrés (la charte : 2 à 6°). */
  tilt?: number;
  /** Pastille ronde en tête (niveau, icône). */
  badge?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
  style?: CSSProperties;
}

const STICKER_SIZES = { sm: [22, 10], md: [26, 11], lg: [34, 13] } as const;

/** Pastille inclinée posée sur une carte. */
export function Sticker({ children, tone = 'accent', bg, fg, tilt = -4, badge, size = 'md', shadow = false, style }: StickerProps) {
  const [h, fs] = STICKER_SIZES[size];
  const [b, f] = STICKER_TONES[tone];
  const back = bg ?? b;
  return (
    <span
      data-rk-sticker=""
      style={{
        height: h, padding: badge ? `0 ${h * 0.4}px 0 ${Math.round(h * 0.15)}px` : `0 ${Math.round(h * 0.38)}px`, borderRadius: 999,
        background: back, color: fg ?? f, fontSize: fs, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap', transform: tilt ? `rotate(${tilt}deg)` : undefined, boxShadow: shadow ? '0 16px 28px -12px rgba(0,0,0,.45)' : undefined, ...style,
      }}
    >
      {badge !== undefined && (
        <span style={{ width: h - 8, height: h - 8, borderRadius: '50%', background: fg ?? f, color: back, fontSize: fs - 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {badge}
        </span>
      )}
      {children}
    </span>
  );
}

/* ── Anneau de progression ──────────────────────────────────────────────── */

export interface ProgressRingProps {
  /** 0 à 100. */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  track?: string;
  /** Fond du disque intérieur. */
  inner?: string;
  children?: ReactNode;
  label?: string;
  style?: CSSProperties;
}

/** Points, niveau, stock d'une offre. */
export function ProgressRing({ value, size = 74, thickness = 8, color = BRAND.peach, track = 'rgba(22,24,43,.08)', inner = BRAND.white, children, label, style }: ProgressRingProps) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${color} 0 ${v}%, ${track} ${v}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}
    >
      <div style={{ width: size - thickness * 2, height: size - thickness * 2, borderRadius: '50%', background: inner, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.22), fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {children ?? `${Math.round(v)}%`}
      </div>
    </div>
  );
}

/* ── Cible (ondes + point focal, en petit) ──────────────────────────────── */

/** Petit disque à ondes, pour un score ou un lieu dans une carte. */
export function Target({ size = 52, color = BRAND.indigo, focal = BRAND.peach, style }: { size?: number; color?: string; focal?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden style={{ width: size, height: size, borderRadius: '50%', position: 'relative', flexShrink: 0, background: tint(color, 0.1), border: `1.5px solid ${tint(color, 0.35)}`, ...style }}>
      <div style={{ ...LAYER, ...anchorStyle('center', size / 2), borderRadius: '50%', border: `1.5px solid ${tint(color, 0.4)}` }} />
      <div style={{ ...LAYER, ...anchorStyle('center', Math.round(size / 5)), borderRadius: '50%', background: focal, border: '2px solid #fff' }} />
    </div>
  );
}

/* ── Logo ───────────────────────────────────────────────────────────────── */

/** Deux cercles qui se recouvrent : la reconnexion. */
export function LogoMark({ size = 32, a = BRAND.indigo, b = BRAND.peach, stroke, style }: { size?: number; a?: string; b?: string; stroke?: number; style?: CSSProperties }) {
  const d = Math.round(size * 0.56);
  const w = stroke ?? Math.max(2, Math.round(size / 13));
  const top = Math.round((size - d) / 2);
  return (
    <span aria-hidden style={{ width: size, height: size, position: 'relative', flexShrink: 0, display: 'inline-block', ...style }}>
      <span style={{ ...LAYER, left: 0, top, width: d, height: d, borderRadius: '50%', border: `${w}px solid ${a}` }} />
      <span style={{ ...LAYER, left: Math.round(size * 0.375), top, width: d, height: d, borderRadius: '50%', border: `${w}px solid ${b}` }} />
    </span>
  );
}

/** Logo horizontal : pictogramme + « Rekonect ». */
export function Logo({ size = 32, a = BRAND.indigo, b = BRAND.peach, color = BRAND.ink, tag, tagBg, tagFg }: { size?: number; a?: string; b?: string; color?: string; tag?: string; tagBg?: string; tagFg?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.34) }}>
      <LogoMark size={size} a={a} b={b} />
      <span style={{ fontSize: Math.round(size * 0.56), fontWeight: 800, letterSpacing: '-.03em', color }}>Rekonect</span>
      {tag && (
        <span style={{ height: 22, padding: '0 8px', borderRadius: 6, background: tagBg ?? tint(BRAND.peach, 0.18), color: tagFg ?? BRAND.peach, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', display: 'flex', alignItems: 'center' }}>
          {tag}
        </span>
      )}
    </span>
  );
}

/* ── Mise en scène ──────────────────────────────────────────────────────── */

/** Carte réelle inclinée avec ombre de niveau 3 (couche 4 de la recette). */
export function Staged({ children, tilt = 4, radius = 18, padding = 12, bg = BRAND.white, color = BRAND.ink, style }: { children: ReactNode; tilt?: number; radius?: number; padding?: number | string; bg?: string; color?: string; style?: CSSProperties }) {
  return (
    <div style={{ background: bg, color, borderRadius: radius, padding, transform: tilt ? `rotate(${tilt}deg)` : undefined, boxShadow: ELEVATION[3], ...style }}>
      {children}
    </div>
  );
}

/** Petites formes flottantes (carré pêche, point sauge, anneau) pour animer un visuel. */
export function Sprinkles({ light = true }: { light?: boolean }) {
  const ring = light ? 'rgba(255,255,255,.6)' : tint(BRAND.indigo, 0.35);
  return (
    <>
      <span aria-hidden style={{ ...LAYER, right: '8%', top: '7%', width: 14, height: 14, borderRadius: 4, background: BRAND.peach, transform: 'rotate(20deg)' }} />
      <span aria-hidden style={{ ...LAYER, right: '18%', top: '21%', width: 8, height: 8, borderRadius: '50%', background: BRAND.sage }} />
      <span aria-hidden style={{ ...LAYER, left: '12%', top: '7%', width: 10, height: 10, borderRadius: '50%', border: `2px solid ${ring}` }} />
    </>
  );
}

/* ── Anneau d'angle ─────────────────────────────────────────────────────── */

export interface CornerRingProps {
  size?: number;
  /** Épaisseur de l'anneau. */
  width?: number;
  color?: string;
  /** Opacité appliquée à `color`. */
  alpha?: number;
  corner?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Part de l'anneau qui déborde du cadre (0 à 1). */
  overflow?: number;
  style?: CSSProperties;
}

/** Gros anneau translucide qui déborde d'un angle : habille une tuile ou une carte d'étape. */
export function CornerRing({ size = 200, width = 24, color = BRAND.indigo, alpha = 0.07, corner = 'top-right', overflow = 0.3, style }: CornerRingProps) {
  const off = -Math.round(size * overflow);
  const [v, h] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return (
    <div
      aria-hidden
      data-rk-corner-ring={corner}
      style={{ ...LAYER, [v]: off, [h]: off, width: size, height: size, borderRadius: '50%', border: `${width}px solid ${tint(color, alpha)}`, ...style }}
    />
  );
}
