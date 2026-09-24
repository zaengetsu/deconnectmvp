'use client';
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
} from 'react';
import { C, chip, seg, TONES, type Tone } from './tokens';

// ─── Surfaces ────────────────────────────────────────────────────────────────

export function Card({ children, style, padding = 22, radius = 20, as: As = 'div', ...rest }: { children?: ReactNode; style?: CSSProperties; padding?: number | string; radius?: number; as?: 'div' | 'section' } & Record<string, unknown>) {
  return (
    <As style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: radius, padding, ...style }} {...rest}>
      {children}
    </As>
  );
}

export function CardTitle({ children, action, style }: { children: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, ...style }}>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}

/** « Voir tout → », « + Créer » : lien d'action de carte. */
export function CardLink({ children, onClick, href, style }: { children: ReactNode; onClick?: () => void; href?: string; style?: CSSProperties }) {
  const s: CSSProperties = { fontSize: 12, fontWeight: 700, color: C.primary, ...style };
  if (href) return <a href={href} style={s}>{children}</a>;
  return (
    <button type="button" onClick={onClick} style={s}>
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions, style }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', ...style }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: 0 }}>{title}</h1>
        {subtitle != null && <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stack({ gap = 20, children, style }: { gap?: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}

export function Grid({ min, gap = 12, children, style, fill }: { min: number; gap?: number; children: ReactNode; style?: CSSProperties; fill?: boolean }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fill ? 'auto-fill' : 'auto-fit'},minmax(${min}px,1fr))`, gap, ...style }}>{children}</div>;
}

// ─── Boutons ─────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'dark' | 'coral' | 'outline' | 'danger' | 'dangerSoft' | 'ghost';
const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: { background: C.primary, color: '#fff', boxShadow: '0 8px 20px -10px rgba(60,65,168,.7)' },
  dark: { background: C.ink, color: '#fff' },
  coral: { background: C.coral, color: C.ink, fontWeight: 800 },
  outline: { border: `1.5px solid ${C.borderStrong}` },
  danger: { color: C.redText },
  dangerSoft: { background: C.redSoft, color: C.redText },
  ghost: {},
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  height?: number;
  loading?: boolean;
  block?: boolean;
  shadow?: boolean;
}

export function Button({ variant = 'primary', height = 40, loading, block, shadow = true, style, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const v = VARIANTS[variant];
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className="rk-focusable"
      style={{
        height,
        padding: block ? 0 : '0 18px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        display: block ? 'flex' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        width: block ? '100%' : undefined,
        opacity: disabled && !loading ? 0.5 : 1,
        ...v,
        ...(shadow ? {} : { boxShadow: 'none' }),
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner size={14} color="currentColor" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 18, color = C.primary }: { size?: number; color?: string }) {
  return <span role="status" aria-label="Chargement" className="rk-spin" style={{ width: size, height: size, borderRadius: '50%', border: `2px solid ${color}`, borderRightColor: 'transparent', display: 'inline-block', flexShrink: 0 }} />;
}

// ─── Sélecteurs ──────────────────────────────────────────────────────────────

export interface Option<T extends string = string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

/** Contrôle segmenté (fond #EDEAE4, onglet actif blanc). */
export function Segmented<T extends string>({ options, value, onChange, height = 32, padding = '0 14px', style, track = C.segment, stretch, ariaLabel }: { options: Option<T>[]; value: T; onChange: (v: T) => void; height?: number; padding?: string; style?: CSSProperties; track?: string; stretch?: boolean; ariaLabel?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={{ display: 'flex', gap: 4, background: track, padding: 4, borderRadius: 12, ...style }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === value}
          onClick={() => onChange(o.id)}
          style={{ height, padding, borderRadius: 9, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flex: stretch ? 1 : undefined, textAlign: 'center', ...seg(o.id === value) }}
        >
          {o.label}
          {o.badge}
        </button>
      ))}
    </div>
  );
}

/** Puces de filtre (active = encre). */
export function Chips<T extends string>({ options, value, onChange, style, height = 34 }: { options: Option<T>[]; value: T; onChange: (v: T) => void; style?: CSSProperties; height?: number }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', ...style }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          style={{ height, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, ...chip(o.id === value) }}
        >
          {o.label}
          {o.badge != null && <span style={{ fontSize: 11, opacity: 0.6 }}>{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Puces à sélection multiple (tranches d'âge). */
export function MultiChips<T extends string>({ options, value, onChange, height = 32 }: { options: Option<T>[]; value: T[]; onChange: (v: T[]) => void; height?: number }) {
  return (
    <>
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            style={{ height, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', ...chip(on) }}
          >
            {o.label}
          </button>
        );
      })}
    </>
  );
}

// ─── Indicateurs ─────────────────────────────────────────────────────────────

export function Pill({ children, tone, bg, fg, height = 26, size = 11, weight = 700, padding = '0 10px', style }: { children: ReactNode; tone?: Tone; bg?: string; fg?: string; height?: number; size?: number; weight?: number; padding?: string; style?: CSSProperties }) {
  const [b, f] = tone ? TONES[tone] : [bg ?? C.sand, fg ?? C.text2];
  return <span style={{ height, padding, borderRadius: 999, fontSize: size, fontWeight: weight, display: 'inline-flex', alignItems: 'center', background: b, color: f, whiteSpace: 'nowrap', ...style }}>{children}</span>;
}

/** Pastille orange du menu (compteur). */
export function CountBadge({ children }: { children: ReactNode }) {
  return <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: C.coral, color: C.ink, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</span>;
}

export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />;
}

export function ProgressBar({ percent, color = C.green, track = C.sand, height = 6, radius = 999, label }: { percent: number | null | undefined; color?: string; track?: string; height?: number; radius?: number; label?: string }) {
  const w = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100} style={{ flex: 1, height, borderRadius: radius, background: track, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: radius }} />
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || !onChange}
      onClick={() => onChange?.(!checked)}
      style={{ width: 40, height: 24, borderRadius: 999, background: checked ? C.primary : 'rgba(22,24,43,.16)', position: 'relative', display: 'block', flexShrink: 0, opacity: disabled ? 0.5 : 1, cursor: onChange && !disabled ? 'pointer' : 'default' }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 19 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

export function KpiCard({ label, value, delta, sub, deltaTone = 'green' }: { label: ReactNode; value: ReactNode; delta?: ReactNode; sub?: ReactNode; deltaTone?: Tone }) {
  const [b, f] = TONES[deltaTone];
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {delta != null && delta !== '' && <div style={{ fontSize: 12, fontWeight: 800, color: f, background: b, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>{delta}</div>}
      </div>
      {sub != null && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/** Petite statistique (bandeaux « Familles », « Partenaires »). */
export function StatCard({ value, label, color }: { value: ReactNode; label: ReactNode; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', color }}>{value}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{label}</div>
    </div>
  );
}

/** Tuile grise (fiches, cartes d'offres). */
export function Tile({ value, label, style, valueSize = 18 }: { value: ReactNode; label: ReactNode; style?: CSSProperties; valueSize?: number }) {
  return (
    <div style={{ background: C.bg, borderRadius: 14, padding: 12, ...style }}>
      <div style={{ fontSize: valueSize, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 10, ...style }}>{children}</div>;
}

// ─── Tableaux ────────────────────────────────────────────────────────────────

export function TableHead({ columns, template, gap = 16, padding = '14px 20px' }: { columns: { label: ReactNode; align?: 'right' | 'left' }[]; template: string; gap?: number; padding?: string }) {
  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: template, gap, padding, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderBottom: `1px solid ${C.headBorder}`, background: C.surfaceAlt }}>
      {columns.map((c, i) => (
        <div role="columnheader" key={i} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
          {c.label}
        </div>
      ))}
    </div>
  );
}

export function TableRow({ template, children, onClick, gap = 16, padding = '12px 20px', style, label }: { template: string; children: ReactNode; onClick?: () => void; gap?: number; padding?: string; style?: CSSProperties; label?: string }) {
  const s: CSSProperties = { display: 'grid', width: '100%', gridTemplateColumns: template, gap, alignItems: 'center', padding, borderBottom: `1px solid ${C.rowBorder}`, ...style };
  if (onClick)
    return (
      <button type="button" role="row" aria-label={label} className="rk-row" onClick={onClick} style={s}>
        {children}
      </button>
    );
  return (
    <div role="row" style={s}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ padding: '36px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
      {children && <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number | string; width?: number | string; radius?: number; style?: CSSProperties }) {
  return <div aria-hidden className="rk-skeleton" style={{ height, width, borderRadius: radius, ...style }} />;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Une erreur est survenue.';
  return (
    <div role="alert" style={{ background: C.redSoft, color: C.redText, borderRadius: 14, padding: '13px 14px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ fontWeight: 800, color: C.redText }}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = 'blue', style }: { children: ReactNode; tone?: 'blue' | 'amber'; style?: CSSProperties }) {
  return <div style={{ background: tone === 'blue' ? C.primarySoft : C.amberSoft, borderRadius: 14, padding: '13px 14px', fontSize: 12, color: C.text2, lineHeight: 1.55, ...style }}>{children}</div>;
}

// ─── Formulaires ─────────────────────────────────────────────────────────────

export function Field({ label, children, error, hint, style, htmlFor }: { label: ReactNode; children: ReactNode; error?: string; hint?: ReactNode; style?: CSSProperties; htmlFor?: string }) {
  return (
    <div style={style}>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.text2, marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error ? (
        <div role="alert" style={{ fontSize: 12, fontWeight: 600, color: C.redText, marginTop: 5 }}>
          {error}
        </div>
      ) : hint ? (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>{hint}</div>
      ) : null}
    </div>
  );
}

const inputBase = (invalid?: boolean, weight = 600, focus?: string): CSSProperties =>
  ({
    width: '100%',
    height: 46,
    borderRadius: 12,
    border: `1.5px solid ${invalid ? C.redText : C.borderStrong}`,
    padding: '0 14px',
    fontSize: 14,
    fontWeight: weight,
    background: '#fff',
    ...(focus ? { ['--rk-focus' as string]: focus } : {}),
  }) as CSSProperties;

export function TextInput({ invalid, weight, focusColor, style, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; weight?: number; focusColor?: string }) {
  return <input className="rk-input" aria-invalid={invalid || undefined} style={{ ...inputBase(invalid, weight, focusColor), ...style }} {...rest} />;
}

export function TextArea({ invalid, focusColor, style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; focusColor?: string }) {
  return (
    <textarea
      className="rk-input"
      aria-invalid={invalid || undefined}
      style={{ ...inputBase(invalid, 500, focusColor), height: undefined, minHeight: 80, padding: '12px 14px', color: C.text2, lineHeight: 1.5, resize: 'vertical', display: 'block', ...style }}
      {...rest}
    />
  );
}

export function Select({ invalid, focusColor, style, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; focusColor?: string }) {
  return (
    <select className="rk-input" aria-invalid={invalid || undefined} style={{ ...inputBase(invalid, 600, focusColor), appearance: 'none', backgroundImage: `linear-gradient(45deg,transparent 50%,${C.muted} 50%),linear-gradient(135deg,${C.muted} 50%,transparent 50%)`, backgroundPosition: 'calc(100% - 18px) 20px,calc(100% - 13px) 20px', backgroundSize: '5px 5px', backgroundRepeat: 'no-repeat', paddingRight: 34, ...style }} {...rest}>
      {children}
    </select>
  );
}

/** Ligne à interrupteur (fiches activité, plan). */
export function ToggleRow({ label, checked, onChange, last, disabled }: { label: ReactNode; checked: boolean; onChange?: (v: boolean) => void; last?: boolean; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderBottom: last ? undefined : '1px solid rgba(22,24,43,.06)' }}>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{label}</div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={typeof label === 'string' ? label : undefined} />
    </div>
  );
}

// ─── Panneaux ────────────────────────────────────────────────────────────────

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

/** Tiroir latéral (480 px) avec pied d'actions. */
export function Drawer({ open, kicker, onClose, children, footer, width = 480 }: { open: boolean; kicker: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const id = useId();
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <button type="button" aria-label="Fermer" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(22,24,43,.35)' }} />
      <div role="dialog" aria-modal="true" aria-labelledby={id} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width, maxWidth: '92vw', zIndex: 60, background: '#fff', boxShadow: '-20px 0 60px -20px rgba(22,24,43,.35)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div id={id} style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: C.muted, flex: 1 }}>
            {kicker}
          </div>
          <button type="button" aria-label="Fermer le panneau" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: C.sand, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
        {footer && <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>{footer}</div>}
      </div>
    </>
  );
}

/** Fenêtre centrée (confirmations, formulaires courts) dans le même langage visuel. */
export function Modal({ open, title, onClose, children, footer, width = 460 }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const id = useId();
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <button type="button" aria-label="Fermer" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(22,24,43,.35)' }} />
      <div role="dialog" aria-modal="true" aria-labelledby={id} style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', zIndex: 80, background: '#fff', borderRadius: 22, boxShadow: '0 30px 80px -30px rgba(22,24,43,.45)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div id={id} style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>
            {title}
          </div>
          <button type="button" aria-label="Fermer la fenêtre" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: C.sand, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ×
          </button>
        </div>
        {children}
        {footer && <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </>
  );
}

export function IconSquare({ src, size = 36, img = 20, radius = 11, bg = C.sand }: { src: string; size?: number; img?: number; radius?: number; bg?: string }) {
  return (
    <span style={{ width: size, height: size, borderRadius: radius, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <img src={src} alt="" style={{ width: img, height: img, objectFit: 'contain' }} />
    </span>
  );
}

export function Initials({ children, size = 34, bg = C.primarySoft, fg = C.primary, radius = '50%', fontSize = 13 }: { children: ReactNode; size?: number; bg?: string; fg?: string; radius?: number | string; fontSize?: number }) {
  return <span style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, fontSize, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{children}</span>;
}
