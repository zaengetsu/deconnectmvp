import React from 'react';

/**
 * Champ de recherche de la maquette Rekonect (écran pCatalog) : capsule
 * surface2 de 44px, loupe dessinée en CSS, sans bordure. Réutilisé partout où
 * l'on parcourt une liste (catalogues, assignation, récompenses).
 */
const RkSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  style?: React.CSSProperties;
}> = ({ value, onChange, placeholder, style }) => (
  <div style={{
    height: 44, borderRadius: 14, background: 'var(--rk-surface2)',
    display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', ...style,
  }}>
    <div style={{ position: 'relative', width: 16, height: 16, flexShrink: 0 }}>
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '2px solid var(--rk-text3)',
      }} />
      <div style={{
        position: 'absolute', right: 0, bottom: 0, width: 6, height: 2,
        background: 'var(--rk-text3)', borderRadius: 2, transform: 'rotate(45deg)',
      }} />
    </div>
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoCorrect="off"
      autoCapitalize="none"
      style={{
        flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
        fontSize: 14, fontFamily: 'inherit', color: 'var(--rk-text)', WebkitAppearance: 'none',
      }}
    />
    {value && (
      <button onClick={() => onChange('')} aria-label="Effacer" style={{
        width: 20, height: 20, borderRadius: '50%', background: 'var(--rk-border)',
        color: 'var(--rk-text2)', fontSize: 12, fontWeight: 800, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    )}
  </div>
);

export default RkSearch;
