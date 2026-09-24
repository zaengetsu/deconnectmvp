import { BRAND } from '@rekonect/ui';
import type { CSSProperties, ReactNode } from 'react';
import s from './landing.module.css';

/** Briques de mise en page communes aux sections de la landing. */

export function Container({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={`${s.container}${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}

export function Kicker({ children, color = BRAND.peachText, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', color, ...style }}>{children}</div>;
}

export function SectionTitle({ children, maxWidth, size = 'lg', style, id }: { children: ReactNode; maxWidth?: string; size?: 'lg' | 'md'; style?: CSSProperties; id?: string }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: size === 'lg' ? 'clamp(32px,3.6vw,46px)' : 'clamp(28px,3vw,38px)',
        fontWeight: 800, letterSpacing: size === 'lg' ? '-.04em' : '-.035em', lineHeight: 1.08, margin: '12px 0 0', maxWidth, textWrap: 'balance', ...style,
      }}
    >
      {children}
    </h2>
  );
}

export type CtaVariant = 'coral' | 'ink' | 'glass' | 'outline' | 'indigo';
const CTA: Record<CtaVariant, CSSProperties> = {
  coral: { background: BRAND.peach, color: BRAND.ink, boxShadow: '0 16px 30px -14px rgba(255,148,105,.9)' },
  ink: { background: BRAND.ink, color: '#fff' },
  indigo: { background: BRAND.indigo, color: '#fff' },
  glass: { background: 'rgba(255,255,255,.1)', color: '#fff' },
  outline: { border: '1.5px solid rgba(255,255,255,.25)', color: '#fff' },
};

/** Lien-bouton plein arrondi. */
export function CtaLink({ href, children, variant = 'coral', size = 'md', onClick, style, className }: { href: string; children: ReactNode; variant?: CtaVariant; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; style?: CSSProperties; className?: string }) {
  const h = size === 'lg' ? 54 : size === 'md' ? 50 : 40;
  return (
    <a
      href={href}
      onClick={onClick}
      className={`${s.cta}${className ? ` ${className}` : ''}`}
      style={{ height: h, padding: `0 ${size === 'sm' ? 16 : 24}px`, borderRadius: 999, fontSize: size === 'sm' ? 13 : size === 'md' ? 14 : 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', ...CTA[variant], ...style }}
    >
      {children}
    </a>
  );
}

/** Petite carte blanche flottante (exemple d'offre, de bon…). */
export function MiniCard({ title, sub, badge, style }: { title: ReactNode; sub?: ReactNode; badge?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: '#fff', color: BRAND.ink, borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: '#8A8FA6', marginTop: 2 }}>{sub}</span>}
      </span>
      {badge && <span style={{ height: 24, padding: '0 9px', borderRadius: 999, background: BRAND.peach, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{badge}</span>}
    </div>
  );
}
