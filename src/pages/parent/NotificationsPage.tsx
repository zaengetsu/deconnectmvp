import React, { useState, useCallback } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { notificationService, type AppNotification } from '../../features/notifications/notification.service';
import { Bell, ArrowLeft, Check, CheckCheck } from 'lucide-react';

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

const NotificationsPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await notificationService.getParentNotifications(user.id, 50);
      setNotifications(data);
    } catch (e) {
      console.error('[NotificationsPage] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useIonViewWillEnter(() => { load(); });

  const handleMarkAllRead = async () => {
    if (!user) return;
    await notificationService.markAllRead('parent', user.id);
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

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ minHeight: '100vh', background: 'var(--dc-bg)' }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--dc-blue) 0%, var(--dc-blue-mid) 100%)',
            padding: '56px 20px 24px', color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => history.goBack()}
                  style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
                    padding: '8px', color: 'white', cursor: 'pointer', display: 'flex',
                  }}
                >
                  <ArrowLeft size={18} strokeWidth={2} />
                </button>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Notifications</h1>
                  {unread > 0 && (
                    <p style={{ fontSize: 12, opacity: 0.8, margin: '2px 0 0' }}>
                      {unread} non lue{unread > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
                    padding: '8px 12px', color: 'white', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <CheckCheck size={14} strokeWidth={2} />
                  Tout lire
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: '16px 16px 100px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--dc-text-muted)' }}>
                Chargement...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 20,
                  background: 'var(--dc-blue-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <Bell size={28} color="var(--dc-blue)" strokeWidth={1.5} />
                </div>
                <h3 style={{ fontWeight: 800, marginBottom: 8 }}>Aucune notification</h3>
                <p style={{ color: 'var(--dc-text-muted)', fontSize: 14 }}>
                  Vous recevrez des alertes quand vos enfants complètent des activités ou demandent des récompenses.
                </p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleTap(n)}
                  style={{
                    background: n.is_read ? 'white' : 'rgba(108,92,231,0.04)',
                    borderRadius: 16, padding: '14px 16px', marginBottom: 10,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    border: n.is_read ? '1px solid var(--dc-border)' : '1.5px solid rgba(108,92,231,0.2)',
                    cursor: n.route ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* Unread dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                    background: n.is_read ? 'transparent' : 'var(--dc-primary)',
                    transition: 'background 0.2s',
                  }} />

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

                  {n.is_read && (
                    <Check size={14} color="var(--dc-text-muted)" strokeWidth={2} style={{ marginTop: 4, flexShrink: 0 }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default NotificationsPage;
