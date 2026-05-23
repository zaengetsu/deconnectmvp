import React from 'react';
import type { AppNotification } from '../../features/notifications/notification.service';

interface NotificationToastProps {
  notification: AppNotification;
  onTap: (notification: AppNotification) => void;
  onDismiss: () => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onTap, onDismiss }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 12px)',
        left: 12, right: 12,
        zIndex: 99999,
        animation: 'dc-slide-down 0.35s ease',
      }}
    >
      <div
        onClick={() => onTap(notification)}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: '14px 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          cursor: 'pointer',
          border: '1px solid rgba(108,92,231,0.15)',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 14, fontSize: 22,
          background: 'linear-gradient(135deg, rgba(108,92,231,0.1), rgba(0,184,148,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {notification.icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2, color: 'var(--dc-text)' }}>
            {notification.title}
          </div>
          <div style={{
            fontSize: 13, color: 'var(--dc-text-light)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {notification.body}
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          style={{
            background: 'none', border: 'none', padding: 8,
            fontSize: 16, color: 'var(--dc-text-muted)', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default NotificationToast;
