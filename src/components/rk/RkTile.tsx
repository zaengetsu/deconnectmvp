import React from 'react';
import { IonIcon } from '@ionic/react';

/**
 * Tuile d'icône Rekonect : le carré teinté de la maquette (rayon 11–15) avec
 * une icône trait (Ionicons) à l'intérieur — la maquette laissait ces carrés
 * vides en attendant les pictos.
 */
const INK: Record<string, string> = {
  'var(--rk-indigosoft)': 'var(--rk-indigo)',
  'var(--rk-sagesoft)':   'var(--rk-sage)',
  'var(--rk-ambersoft)':  'var(--rk-amber)',
  'var(--rk-raspsoft)':   'var(--rk-rasp)',
  'var(--rk-accentsoft)': 'var(--rk-accent)',
};

const RkTile: React.FC<{
  /** Icône Ionicons… */
  icon?: string;
  /** …ou picto image (ex. /images/menu/gift.png) */
  img?: string;
  tint: string;
  size?: number;
  radius?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ icon, img, tint, size = 34, radius = 11, color, style }) => (
  <div style={{
    width: size, height: size, borderRadius: radius, background: tint, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
  }}>
    {img
      ? <img src={img} alt="" style={{ width: Math.round(size * 0.58), height: Math.round(size * 0.58), objectFit: 'contain' }} />
      : <IonIcon icon={icon} style={{ fontSize: Math.round(size * 0.53), color: color ?? INK[tint] ?? 'var(--rk-text2)' }} />}
  </div>
);

export default RkTile;
