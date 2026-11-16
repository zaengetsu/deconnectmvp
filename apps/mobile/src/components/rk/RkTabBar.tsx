import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';

/**
 * Barre d'onglets Rekonect — géométrie exacte de la maquette :
 * 82 px, quatre onglets, un creux central de 66 px et un bouton rond de 58 px
 * qui remonte de 44 px. Pictos « famille B · Souple » : grille 24 px,
 * trait 2,2 px arrondi, un détail pêche par picto.
 */

const S: React.SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/** Accent pêche du thème courant ; gris au repos pour ne pas crier. */
const accentFor = (active: boolean) => (active ? 'var(--rk-accent)' : 'currentColor');

const TabIcon: React.FC<{ kind: string; color: string; active: boolean }> = ({ kind, color, active }) => {
  const a = accentFor(active);
  const p = { ...S, style: { color } } as React.SVGProps<SVGSVGElement>;
  switch (kind) {
    case 'home':
      return (
        <svg {...p}>
          <path d="M4 11.3c0-.5.3-1 .7-1.3l6.3-4.9a1.6 1.6 0 0 1 2 0l6.3 4.9c.4.3.7.8.7 1.3v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
          <path d="M9.7 20.8v-4a2.3 2.3 0 0 1 4.6 0v4" stroke={a} />
        </svg>
      );
    case 'kids':
      return (
        <svg {...p}>
          <circle cx="8.4" cy="7.6" r="2.9" />
          <path d="M3.9 19.8a4.5 4.5 0 0 1 9 0" />
          <circle cx="15.8" cy="7.6" r="2.9" stroke={a} />
          <path d="M11.3 19.8a4.5 4.5 0 0 1 9 0" stroke={a} />
        </svg>
      );
    case 'valid':
      return (
        <svg {...p}>
          <rect x="3.2" y="4.4" width="17.6" height="15.4" rx="6" />
          <path d="m8.2 12.2 2.5 2.5 5.1-5.4" stroke={a} />
        </svg>
      );
    case 'gift':
      return (
        <svg {...p}>
          <rect x="3.8" y="9.4" width="16.4" height="11" rx="3.4" />
          <rect x="2.9" y="5.6" width="18.2" height="3.8" rx="1.9" />
          <path d="M12 5.6v14.8" />
          <path d="M12 5.6c-1.4-3.2-5.1-2.3-4.3.6M12 5.6c1.4-3.2 5.1-2.3 4.3.6" stroke={a} />
        </svg>
      );
    case 'acts':
      return (
        <svg {...p}>
          <path d="M20.1 12a8.1 8.1 0 1 1-4.6-7.3" />
          <path d="M16 12a4 4 0 1 1-2.6-3.8" stroke={a} />
          <path d="M12 12 20.4 4" stroke={a} />
          <circle cx="12" cy="12" r="1.4" fill={a} stroke="none" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...p}>
          <circle cx="12" cy="8.4" r="3.8" />
          <path d="M4.8 20.6a7.2 7.2 0 0 1 14.4 0" />
          <path d="M17.6 4.4a2.6 2.6 0 1 1 0 5.2" stroke={a} />
        </svg>
      );
    default:
      return <svg {...p} />;
  }
};

export interface RkTab {
  icon: string;
  label: string;
  path: string;
  badge?: number;
}

export const RkTabBar: React.FC<{
  tabs: [RkTab, RkTab, RkTab, RkTab];
  fab: React.ReactNode;
  onFab: () => void;
  fabStyle?: React.CSSProperties;
}> = ({ tabs, fab, onFab, fabStyle }) => {
  const history = useHistory();
  const { pathname } = useLocation();

  const isActive = (path: string) => pathname.startsWith(path);
  const colorFor = (path: string) => (isActive(path) ? 'var(--rk-nav)' : 'var(--rk-text3)');

  const [a, b, c, d] = tabs;

  const renderTab = (t: RkTab) => (
    <button key={t.path} className="rk-tab" aria-label={t.label} onClick={() => history.push(t.path)}>
      <TabIcon kind={t.icon} color={colorFor(t.path)} active={isActive(t.path)} />
      {!!t.badge && t.badge > 0 && (
        <div style={{
          position: 'absolute', top: 0, right: 22, minWidth: 17, height: 17,
          borderRadius: 999, background: '#E0A233', color: '#16182B',
          fontSize: 10, fontWeight: 800, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '0 4px',
        }}>
          {t.badge > 99 ? '99+' : t.badge}
        </div>
      )}
    </button>
  );

  return (
    <>
      <div className="rk-tabbar">
        {renderTab(a)}
        {renderTab(b)}
        <div style={{ width: 66, flexShrink: 0 }} />
        {renderTab(c)}
        {renderTab(d)}
      </div>

      <button
        className="rk-fab"
        onClick={onFab}
        style={{ background: 'var(--rk-nav)', color: 'var(--rk-navfg)', ...fabStyle }}
      >
        {fab}
      </button>
    </>
  );
};

/** Le « + » du bouton central côté parent : croix 2,2 px et étincelle pêche. */
export const RkPlus: React.FC = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5.2v13.6M5.2 12h13.6" />
    <path d="m18.6 4.4.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5Z"
      fill="var(--rk-accent)" stroke="var(--rk-accent)" strokeWidth={1.2} />
  </svg>
);

/** Cloche des notifications (en-têtes parent et enfant), même famille de pictos que la barre. */
export const RkBell: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.2 16.4V11a5.8 5.8 0 0 1 11.6 0v5.4l1.5 1.8H4.7Z" />
    <path d="M10 20.6a2.2 2.2 0 0 0 4 0" stroke="var(--rk-accent)" />
  </svg>
);
