import React from 'react';
import RkTile from './RkTile';

/**
 * État vide Rekonect : une carte qui dit ce que l'écran contiendra, pourquoi
 * il est vide, et — quand c'est utile — comment le remplir. Jamais un écran
 * blanc.
 */
const RkEmpty: React.FC<{
  icon?: string;
  img?: string;
  tint?: string;
  title: string;
  text: string;
  steps?: string[];
  cta?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}> = ({ icon, img, tint = 'var(--rk-indigosoft)', title, text, steps, cta, secondary }) => (
  <div style={{
    background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
    borderRadius: 24, padding: '26px 20px 20px', textAlign: 'center',
  }}>
    <RkTile icon={icon} img={img} tint={tint} size={64} radius={20} style={{ margin: '0 auto 16px' }} />
    <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--rk-text)', marginBottom: 6 }}>
      {title}
    </div>
    <div style={{ fontSize: 14, color: 'var(--rk-text2)', lineHeight: 1.55, textWrap: 'pretty' as never }}>
      {text}
    </div>

    {steps && steps.length > 0 && (
      <div style={{
        marginTop: 18, padding: '14px 14px 4px', borderRadius: 16, background: 'var(--rk-surface2)',
        textAlign: 'left',
      }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: 'var(--rk-indigo)', color: 'var(--rk-indigofg)',
              fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{i + 1}</div>
            <div style={{ fontSize: 13, color: 'var(--rk-text2)', lineHeight: 1.5, paddingTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>
    )}

    {cta && (
      <button onClick={cta.onClick} style={{
        marginTop: 18, width: '100%', height: 50, borderRadius: 999,
        background: 'var(--rk-indigo)', color: 'var(--rk-indigofg)', fontSize: 14, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{cta.label}</button>
    )}
    {secondary && (
      <button onClick={secondary.onClick} style={{
        marginTop: 8, width: '100%', height: 44, borderRadius: 999,
        color: 'var(--rk-text2)', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{secondary.label}</button>
    )}
  </div>
);

export default RkEmpty;
