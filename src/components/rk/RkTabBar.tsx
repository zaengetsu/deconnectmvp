import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';

/**
 * Barre d'onglets Rekonect — géométrie exacte de la maquette :
 * 82 px, quatre onglets, un creux central de 66 px et un bouton rond de 58 px
 * qui remonte de 44 px. Les pictos sont ceux de la maquette, dessinés en CSS.
 */

/** Pictos de la maquette Rekonect, dessinés en CSS (22 px, trait 2 px). */
const TabIcon: React.FC<{ kind: string; color: string }> = ({ kind, color }) => {
  const base: React.CSSProperties = { width: 22, height: 22 };
  switch (kind) {
    case 'home':
      return <div style={{ ...base, borderRadius: 6, border: `2px solid ${color}` }} />;
    case 'kids':
      return (
        <div style={{ ...base, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 4, width: 13, height: 13, borderRadius: '50%', border: `2px solid ${color}` }} />
          <div style={{ position: 'absolute', right: 0, top: 4, width: 13, height: 13, borderRadius: '50%', border: `2px solid ${color}` }} />
        </div>
      );
    case 'valid':
      return <div style={{ ...base, borderRadius: '50%', border: `2px solid ${color}` }} />;
    case 'gift':
      return <div style={{ width: 22, height: 16, borderRadius: 4, border: `2px solid ${color}`, marginTop: 3 }} />;
    case 'acts':
      return <div style={{ ...base, borderRadius: '50%', border: `2px solid ${color}`, borderTopColor: 'transparent' }} />;
    case 'profile':
      return <div style={{ ...base, borderRadius: '50%', border: `2px solid ${color}` }} />;
    default:
      return <div style={base} />;
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

  const colorFor = (path: string) =>
    pathname.startsWith(path) ? 'var(--rk-nav)' : 'var(--rk-text3)';

  const [a, b, c, d] = tabs;

  const renderTab = (t: RkTab) => (
    <button key={t.path} className="rk-tab" aria-label={t.label} onClick={() => history.push(t.path)}>
      <TabIcon kind={t.icon} color={colorFor(t.path)} />
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

/** Le « + » du bouton central côté parent, dessiné comme dans la maquette. */
export const RkPlus: React.FC = () => (
  <div style={{ position: 'relative', width: 20, height: 20 }}>
    <div style={{ position: 'absolute', top: 9, left: 0, width: 20, height: 2.5, borderRadius: 2, background: 'currentColor' }} />
    <div style={{ position: 'absolute', left: 9, top: 0, width: 2.5, height: 20, borderRadius: 2, background: 'currentColor' }} />
  </div>
);
