import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Coquille Rekonect — reprend le contrat de la maquette :
 *   • data-rk-space  : parent | child   → couleur de navigation
 *   • data-rk-theme  : thème enfant     → accent
 *   • data-rk-dark   : mode sombre
 *
 * Les écrans portés depuis la maquette utilisent directement les variables
 * var(--rk-*) ; il n'y a donc rien à traduire.
 */

export type RkTheme = 'peach' | 'ocean' | 'mint' | 'berry' | 'sun' | 'rasp';
export type RkSpace = 'parent' | 'child';

interface RkContextValue {
  space: RkSpace;
  theme: RkTheme;
  dark: boolean;
  setTheme: (t: RkTheme) => void;
  setDark: (d: boolean) => void;
  sheet: string | null;
  openSheet: (name: string) => void;
  closeSheet: () => void;
}

const RkContext = createContext<RkContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useRk = () => {
  const ctx = useContext(RkContext);
  if (!ctx) throw new Error('useRk doit être utilisé dans <RkShell>');
  return ctx;
};

export const RkShell: React.FC<{ space: RkSpace; children: React.ReactNode }> = ({ space, children }) => {
  const [theme, setTheme] = useState<RkTheme>(() => (localStorage.getItem('rk_theme') as RkTheme) || 'peach');
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('rk_dark') === '1');
  const [sheet, setSheet] = useState<string | null>(null);

  const applyTheme = useCallback((t: RkTheme) => {
    setTheme(t);
    try { localStorage.setItem('rk_theme', t); } catch { /* stockage indisponible */ }
  }, []);

  const applyDark = useCallback((d: boolean) => {
    setDark(d);
    try { localStorage.setItem('rk_dark', d ? '1' : '0'); } catch { /* stockage indisponible */ }
  }, []);

  return (
    <RkContext.Provider value={{
      space, theme, dark,
      setTheme: applyTheme, setDark: applyDark,
      sheet, openSheet: setSheet, closeSheet: () => setSheet(null),
    }}>
      <div
        className="rk-app"
        data-rk-space={space}
        data-rk-theme={theme}
        {...(dark ? { 'data-rk-dark': '' } : {})}
        style={{ minHeight: '100%', background: 'var(--rk-bg)' }}
      >
        {children}
      </div>
    </RkContext.Provider>
  );
};

/** Feuille modale glissante — même géométrie que la maquette. */
export const RkSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, eyebrow, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="rk-scrim rk-scrim-bg" onClick={onClose} />
      <div className="rk-sheet rk-sheet-panel" style={{ borderRadius: '28px 28px 0 0', padding: '12px 20px 30px' }}>
        <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--rk-border)', margin: '0 auto 20px' }} />
        {eyebrow && (
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', marginBottom: 14 }}>
            {eyebrow}
          </div>
        )}
        {title && (
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--rk-text)', marginBottom: 4 }}>
            {title}
          </div>
        )}
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--rk-text3)', marginBottom: 18 }}>{subtitle}</div>
        )}
        {children}
      </div>
    </>
  );
};

/** Entrée de feuille modale (icône + titre + sous-titre), format maquette. */
export const RkSheetItem: React.FC<{
  icon: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
}> = ({ icon, iconBg, title, subtitle, onClick }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 13, width: '100%',
    background: 'var(--rk-surface2)', borderRadius: 16, padding: 15,
  }}>
    <div style={{
      width: 38, height: 38, borderRadius: 12, background: iconBg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <img src={icon} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>{subtitle}</div>}
    </div>
  </button>
);
