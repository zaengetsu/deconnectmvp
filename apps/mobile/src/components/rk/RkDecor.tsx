import React from 'react';
import { CornerRing, Pattern, Scene, Target, tint, type BackdropProps } from '@rekonect/brand';

/**
 * Habillage de l'app mobile à partir des éléments graphiques de la charte
 * (@rekonect/brand). Tout passe par les variables --rk-* : les composants
 * suivent l'espace (parent / enfant), le thème enfant et le mode sombre.
 *
 *   <RkHeader>   en-tête clair des écrans de liste et de formulaire
 *   <RkHero>     en-tête coloré (fiche enfant, accueil enfant, niveaux)
 *   <RkFeature>  carte héro colorée (« À faire maintenant », « Presque »)
 *   <RkStat>     tuile chiffrée avec anneau d'angle
 *   <RkPrompt>   invitation à agir quand une section est vide
 *   <RkAllClear> « rien à faire » rassurant, avec une cible à ondes
 *   <RkCelebrate> calque de confettis — moments de réussite uniquement
 */

export type RkTone = 'indigo' | 'accent' | 'ink';

interface ToneSpec { bg: string; color: string; decor: BackdropProps }

/* eslint-disable-next-line react-refresh/only-export-components */
export const RK_TONES: Record<RkTone, ToneSpec> = {
  indigo: {
    bg: 'var(--rk-indigo)', color: '#fff',
    decor: {
      pattern: 'links', patternFade: 200, patternStop: 62, line: 'rgba(255,255,255,.1)', accent: 'rgba(255,148,105,.34)',
      rings: 'bottom-left', ringsSize: 280, ringsColor: '#FFFFFF', ringsStrength: 0.9,
      halo: 'bottom-left', haloSize: 170, haloColor: '#FF9469', haloIntensity: 0.5,
    },
  },
  accent: {
    bg: 'var(--rk-accent)', color: 'var(--rk-accentink)',
    decor: {
      pattern: 'hatch', patternFade: 210, patternStop: 58, line: 'rgba(255,255,255,.2)',
      rings: 'bottom-right', ringsSize: 260, ringsColor: '#FFFFFF', ringsStrength: 1.3,
      halo: 'top-right', haloSize: 190, haloColor: '#FFFFFF', haloIntensity: 0.32,
    },
  },
  ink: {
    bg: '#16182B', color: '#fff',
    decor: {
      pattern: 'dots', patternFade: 90, patternStop: 75, line: 'rgba(255,255,255,.13)',
      rings: 'top-right', ringsSize: 240, ringsColor: '#FFFFFF', ringsStrength: 0.7,
      halo: 'top-right', haloSize: 170, haloColor: '#FF9469', haloIntensity: 0.45,
    },
  },
};

/** En-tête clair : arcs estompés et ondes dans l'angle, à la couleur de navigation. */
export const RkHeader: React.FC<{
  children: React.ReactNode;
  padding?: string;
  style?: React.CSSProperties;
}> = ({ children, padding = 'calc(env(safe-area-inset-top) + 16px) 22px 20px', style }) => (
  <Scene
    data-rk-header=""
    bg="var(--rk-surface)"
    padding={padding}
    style={{ borderBottom: '1px solid var(--rk-border)', ...style }}
    pattern="arcs" patternFade={235} patternStop={40}
    line={tint('var(--rk-nav)', 0.14)} accent={tint('var(--rk-accent)', 0.32)}
    rings="top-right" ringsSize={200} ringsColor="var(--rk-nav)" ringsStrength={0.55}
    halo={false}
  >
    {children}
  </Scene>
);

/** En-tête coloré, recette en 4 couches. */
export const RkHero: React.FC<{
  tone?: RkTone;
  children: React.ReactNode;
  padding?: string;
  decor?: Partial<BackdropProps>;
  style?: React.CSSProperties;
}> = ({ tone = 'indigo', children, padding = 'calc(env(safe-area-inset-top) + 12px) 22px 26px', decor, style }) => {
  const t = RK_TONES[tone];
  return (
    <Scene data-rk-hero={tone} bg={t.bg} color={t.color} padding={padding} style={style} {...t.decor} {...decor}>
      {children}
    </Scene>
  );
};

/** Carte héro colorée, cliquable si `onClick` est fourni. */
export const RkFeature: React.FC<{
  tone?: RkTone;
  children: React.ReactNode;
  onClick?: () => void;
  decor?: Partial<BackdropProps>;
  style?: React.CSSProperties;
  label?: string;
}> = ({ tone = 'indigo', children, onClick, decor, style, label }) => {
  const t = RK_TONES[tone];
  return (
    <Scene
      as={onClick ? 'button' : 'div'}
      data-rk-feature={tone}
      bg={t.bg} color={t.color} radius={22} padding={20}
      style={{ display: 'block', width: '100%', textAlign: 'left', boxShadow: '0 14px 30px -14px var(--rk-navshadow)', ...style }}
      {...t.decor} ringsSize={220} haloSize={140}
      {...decor}
      {...(onClick ? { onClick, 'aria-label': label, type: 'button' as const } : {})}
    >
      {children}
    </Scene>
  );
};

/** Tuile chiffrée avec anneau d'angle, dans la couleur de la valeur. */
export const RkStat: React.FC<{
  value: React.ReactNode;
  label: React.ReactNode;
  color?: string;
  ring?: string;
  align?: 'left' | 'center';
  onClick?: () => void;
}> = ({ value, label, color = 'var(--rk-text)', ring, align = 'left', onClick }) => (
  <div
    data-rk-stat=""
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    style={{
      position: 'relative', overflow: 'hidden', background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
      borderRadius: 18, padding: '14px 12px', textAlign: align, cursor: onClick ? 'pointer' : undefined,
    }}
  >
    <CornerRing size={86} width={12} color={ring ?? (color === 'var(--rk-text)' ? 'var(--rk-indigo)' : color)} alpha={0.1} overflow={0.4} />
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.03em', color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rk-text3)', marginTop: 2, lineHeight: 1.3 }}>{label}</div>
    </div>
  </div>
);

/** Section vide : une invitation à agir plutôt qu'un cadre pointillé. */
export const RkPrompt: React.FC<{
  title: string;
  text?: string;
  onClick: () => void;
  img?: string;
}> = ({ title, text, onClick, img }) => (
  <Scene
    as="button"
    data-rk-prompt=""
    bg="var(--rk-surface)"
    radius={18}
    padding="18px 16px"
    style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid var(--rk-border)' }}
    contentStyle={{ display: 'flex', alignItems: 'center', gap: 14 }}
    pattern="arcs" patternFade={250} patternStop={45}
    line={tint('var(--rk-nav)', 0.13)} accent={tint('var(--rk-accent)', 0.3)}
    rings="right" ringsSize={150} ringsColor="var(--rk-nav)" ringsStrength={0.5}
    halo={false}
    onClick={onClick}
    type="button"
  >
    <div style={{
      width: 44, height: 44, borderRadius: 14, background: 'var(--rk-accentsoft)', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {img
        ? <img src={img} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
        : <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--rk-accent)', lineHeight: 1 }}>+</span>}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.01em' }}>{title}</div>
      {text && <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 3, lineHeight: 1.45 }}>{text}</div>}
    </div>
    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--rk-nav)' }}>→</span>
  </Scene>
);

/** Confettis estompés : réservés aux moments de réussite (charte §05). */
export const RkCelebrate: React.FC<{ fade?: number; scale?: number }> = ({ fade = 250, scale = 0.62 }) => (
  <Pattern kind="confetti" fade={fade} fadeStop={90} scale={scale} accent="var(--rk-accent)" line="var(--rk-indigo)" />
);

/** État « rien à faire » : rassurant, sans action. */
export const RkAllClear: React.FC<{ title: string; text?: string }> = ({ title, text }) => (
  <Scene
    data-rk-all-clear=""
    bg="var(--rk-surface)" radius={20} padding={16}
    style={{ border: '1px solid var(--rk-border)' }}
    contentStyle={{ display: 'flex', alignItems: 'center', gap: 14 }}
    pattern="arcs" patternFade={250} patternStop={40}
    line={tint('var(--rk-sage)', 0.16)} accent={tint('var(--rk-accent)', 0.26)}
    rings={{ x: '38px', y: '50%' }} ringsSize={170} ringsColor="var(--rk-sage)" ringsStrength={0.6}
    halo={false}
  >
    <Target size={46} color="var(--rk-sage)" focal="var(--rk-sage)" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.01em' }}>{title}</div>
      {text && <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 3, lineHeight: 1.45 }}>{text}</div>}
    </div>
  </Scene>
);
