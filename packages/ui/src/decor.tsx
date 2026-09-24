import { Backdrop, type BackdropProps, CornerRing, Halo, Pattern, Rings, Scene, Target, tint } from '@rekonect/brand';
import type { CSSProperties, ReactNode } from 'react';
import { C } from './tokens';

/**
 * Éléments graphiques de la charte (§05 et §05·B) pour les portails web.
 * Les briques viennent de @rekonect/brand ; ce fichier les ré-exporte et les
 * assemble en composants prêts à l'emploi pour l'admin et le portail partenaires.
 */
export {
  Backdrop, BRAND, CornerRing, ELEVATION, fadeMask, Halo, LogoMark, Pattern, PATTERN_KINDS, patternStyle, ProgressRing, Rings, Scene, Sprinkles, Staged, Sticker, Target, tint,
} from '@rekonect/brand';
export type { Anchor, BackdropProps, PatternKind, SceneProps, StickerTone } from '@rekonect/brand';

export type HeroTone = 'indigo' | 'ink' | 'coral';

/** Recettes de fond par ton (couches 1 à 3). */
export const HERO_TONES: Record<HeroTone, { bg: string; fg: string; muted: string; decor: BackdropProps }> = {
  indigo: {
    bg: C.primary, fg: '#fff', muted: 'rgba(255,255,255,.72)',
    decor: { pattern: 'links', patternFade: 200, patternStop: 55, line: 'rgba(255,255,255,.08)', accent: 'rgba(255,148,105,.3)', rings: 'bottom-right', ringsSize: 420, halo: 'bottom-right', haloSize: 260, haloIntensity: 0.55 },
  },
  ink: {
    bg: C.ink, fg: '#fff', muted: 'rgba(255,255,255,.65)',
    decor: { pattern: 'dots', patternFade: 90, patternStop: 70, line: 'rgba(255,255,255,.1)', rings: 'top-right', ringsSize: 380, ringsStrength: 0.7, halo: 'top-right', haloSize: 280, haloIntensity: 0.4 },
  },
  coral: {
    bg: C.coral, fg: C.ink, muted: '#3A1D0E',
    decor: { pattern: 'hatch', patternFade: false, line: 'rgba(255,255,255,.2)', rings: 'bottom-right', ringsSize: 380, ringsColor: '#FFFFFF', ringsStrength: 1.2, halo: false },
  },
};

/** Bandeau d'accueil décoré (titre, phrase d'intro, actions). */
export function HeroBanner({ kicker, title, subtitle, actions, aside, tone = 'indigo', style }: { kicker?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; aside?: ReactNode; tone?: HeroTone; style?: CSSProperties }) {
  const t = HERO_TONES[tone];
  return (
    <Scene
      as="section"
      data-rk-hero={tone}
      bg={t.bg}
      color={t.fg}
      radius={24}
      padding="26px 28px"
      style={style}
      contentStyle={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}
      {...t.decor}
    >
      <div style={{ flex: 1, minWidth: 260 }}>
        {kicker && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: t.muted, marginBottom: 8 }}>{kicker}</div>}
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: 0, color: t.fg }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: t.muted, margin: '6px 0 0', lineHeight: 1.5 }}>{subtitle}</p>}
        {actions && <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      {aside && <div style={{ flexShrink: 0 }}>{aside}</div>}
    </Scene>
  );
}

/** Encart clair avec ondes dans l'angle (aide contextuelle, mentions). */
export function SoftPanel({ title, children, color = C.primary, bg = C.primarySoft, style }: { title?: ReactNode; children: ReactNode; color?: string; bg?: string; style?: CSSProperties }) {
  return (
    <Scene
      bg={bg}
      radius={14}
      padding="13px 14px"
      style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, ...style }}
      pattern={false}
      rings="top-right"
      ringsSize={130}
      ringsColor={color}
      ringsStrength={0.7}
      halo={false}
    >
      {title && <div style={{ fontWeight: 800, color, marginBottom: 3 }}>{title}</div>}
      {children}
    </Scene>
  );
}

/** Fond des écrans d'accès : arcs estompés, ondes et halo débordant des angles. */
export function AuthBackdrop({ accent = C.primary }: { accent?: string }) {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <Pattern kind="arcs" fade={200} fadeStop={55} line={tint(accent, 0.12)} accent={tint(C.coral, 0.3)} />
      <Rings at={{ x: '100%', y: '0%' }} size={640} color={accent} strength={0.7} />
      <Rings at={{ x: '0%', y: '100%' }} size={520} color={accent} strength={0.55} />
      <Halo at={{ x: '0%', y: '100%' }} size={420} intensity={0.35} />
    </div>
  );
}

/** Pictogramme des états vides : cible à ondes, dans un petit halo d'ondes. */
export function EmptyMark({ color = C.primary }: { color?: string }) {
  return (
    <div aria-hidden style={{ position: 'relative', width: 120, height: 64, margin: '0 auto 14px' }}>
      <Rings at="center" size={150} color={color} strength={0.45} />
      <Target size={52} color={color} style={{ position: 'absolute', left: 34, top: 6 }} />
    </div>
  );
}

/** Anneau d'angle discret des tuiles chiffrées. */
export function TileRing({ color = C.primary }: { color?: string }) {
  return <CornerRing size={120} width={16} color={color} alpha={0.06} overflow={0.42} />;
}
