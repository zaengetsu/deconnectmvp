import React from 'react';
import { RkGlyph } from '../rk/RkGlyph';
import type { AppNotification } from '../../features/notifications/notification.service';

/**
 * Bannière in-app — même carte que le centre de notifications de la maquette
 * (surface, liseré, rayon 18, tuile d'icône 36 px), posée sous la zone sûre.
 */
interface NotificationToastProps {
  notification: AppNotification;
  onTap: (notification: AppNotification) => void;
  onDismiss: () => void;
}

const tintOf = (n: AppNotification) => {
  const t = n.type ?? '';
  if (t.includes('reward')) return 'var(--rk-raspsoft)';
  if (t.includes('validation') || t.includes('reminder') || t.includes('planned')) return 'var(--rk-ambersoft)';
  if (t.includes('validated') || t.includes('completed') || t.includes('goal')) return 'var(--rk-sagesoft)';
  return 'var(--rk-indigosoft)';
};

const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onTap, onDismiss }) => (
  <div
    className="rk-app rk-screen"
    style={{
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
      left: 14, right: 14, zIndex: 99999,
      background: 'transparent',
    }}
  >
    <div
      onClick={() => onTap(notification)}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
        borderRadius: 18, padding: '14px 15px', cursor: 'pointer',
        boxShadow: '0 14px 30px -14px rgba(22,24,43,.45)',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: tintOf(notification),
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rk-text)',
      }}>
        <RkGlyph kind={notification.icon} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{notification.title}</div>
        <div style={{
          fontSize: 13, color: 'var(--rk-text2)', marginTop: 3, lineHeight: 1.45,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {notification.body}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Fermer"
        style={{
          width: 28, height: 28, borderRadius: 9, flexShrink: 0,
          background: 'var(--rk-surface2)', color: 'var(--rk-text3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
        }}
      >
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  </div>
);

export default NotificationToast;
