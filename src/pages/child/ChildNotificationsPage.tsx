import React, { useState, useCallback } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAppStore } from '../../stores/app.store';
import { notificationService, type AppNotification } from '../../features/notifications/notification.service';
import { Bell, CheckCheck, Gift, CheckCircle, XCircle, Star, Info } from 'lucide-react';

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  if (h < 24) return `Il y a ${h}h`;
  return `Il y a ${d}j`;
};

const NOTIF_ICONS: Record<string, { icon: React.FC<any>; color: string; bg: string }> = {
  check:  { icon: CheckCircle, color: 'var(--dc-green)',     bg: 'var(--dc-green-light)' },
  gift:   { icon: Gift,        color: 'var(--dc-primary)',   bg: 'rgba(108,92,231,0.1)' },
  info:   { icon: Info,        color: 'var(--dc-blue)',      bg: 'var(--dc-blue-light)' },
  star:   { icon: Star,        color: 'var(--dc-gold-dark)', bg: 'var(--dc-gold-light)' },
  reject: { icon: XCircle,     color: 'var(--dc-danger)',    bg: 'var(--dc-danger-light)' },
};

const ChildNotificationsPage: React.FC = () => {
  const { selectedChild } = useAppStore();
  const history = useHistory();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    try {
      const data = await notificationService.getChildNotifications(selectedChild.id, 50);
      setNotifications(data);
    } catch (e) {
      console.error('[ChildNotifications] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedChild]);

  useIonViewWillEnter(() => { load(); });

  const handleMarkAllRead = async () => {
    if (!selectedChild) return;
    await notificationService.markAllRead('child', selectedChild.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleTap = async (n: AppNotification) => {
    if (!n.is_read) {
      await notificationService.markAsRead(n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.route) history.push(n.route);
  };

  const unread = notifications.filter(n => !n.is_read).length;

  // Helper: get icon config from notification icon field
  const getIconCfg = (n: AppNotification) => {
    // Map by data.type or icon field
    const dataType = (n.data as any)?.type || '';
    if (dataType.includes('rejected') || dataType.includes('reject')) return NOTIF_ICONS.reject;
    if (dataType.includes('reward')) return NOTIF_ICONS.gift;
    if (dataType.includes('validated') || n.icon === 'check') return NOTIF_ICONS.check;
    if (n.icon === 'gift') return NOTIF_ICONS.gift;
    if (n.icon === 'star') return NOTIF_ICONS.star;
    return NOTIF_ICONS.info;
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY>
        {/* ── Header ── */}
        <div className="dc-page-header">
          <div className="dc-header-row">
            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={22} color="var(--dc-primary)" strokeWidth={2} />
            </div>
            <h1>Notifications</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ margin: 0 }}>
              {unread > 0 ? `${unread} nouvelle${unread > 1 ? 's' : ''}` : 'Tout est lu !'}
            </p>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'rgba(108,92,231,0.1)', border: 'none', borderRadius: 50,
                  padding: '6px 14px', color: 'var(--dc-primary)', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <CheckCheck size={14} strokeWidth={2} />
                Tout lire
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 20px 100px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--dc-text-muted)' }}>
              Chargement...
            </div>
          ) : notifications.length === 0 ? (
            <div className="dc-empty-state">
              <div style={{
                width: 72, height: 72, borderRadius: 22,
                background: 'var(--dc-blue-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <Bell size={34} color="var(--dc-blue)" strokeWidth={1.5} />
              </div>
              <h3>Rien pour le moment</h3>
              <p>Tes notifications apparaîtront ici quand tes parents valideront tes activités !</p>
            </div>
          ) : (
            notifications.map(n => {
              const cfg = getIconCfg(n);
              const IconCmp = cfg.icon;
              return (
                <div
                  key={n.id}
                  onClick={() => handleTap(n)}
                  className="dc-animate-in"
                  style={{
                    background: n.is_read ? 'white' : 'rgba(108,92,231,0.04)',
                    borderRadius: 16, padding: '14px 16px', marginBottom: 10,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    border: n.is_read ? '1.5px solid var(--dc-border)' : '1.5px solid rgba(108,92,231,0.2)',
                    cursor: n.route ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: cfg.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconCmp size={20} color={cfg.color} strokeWidth={2} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontWeight: n.is_read ? 600 : 800, fontSize: 14, color: 'var(--dc-text)' }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', flexShrink: 0 }}>
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--dc-text-light)', marginTop: 3, lineHeight: 1.4 }}>
                      {n.body}
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                      background: 'var(--dc-primary)',
                    }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ChildNotificationsPage;
