import { useRkBack } from '../../hooks/useRkBack';
import React, { useState, useCallback } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import {
  notificationService,
  isActionRequired,
  type AppNotification,
} from '../../features/notifications/notification.service';

/** Notifications parent — porté de la maquette Rekonect (écran pNotifs). */

const tintOf = (n: AppNotification) => {
  const t = n.type ?? '';
  if (t.includes('reward')) return 'var(--rk-raspsoft)';
  if (t.includes('validation') || t.includes('planned') || t.includes('reminder')) return 'var(--rk-ambersoft)';
  if (t.includes('completed') || t.includes('validated') || t.includes('goal')) return 'var(--rk-sagesoft)';
  return 'var(--rk-indigosoft)';
};

const shortTime = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/** La maquette groupe par jour : aujourd'hui, hier, puis les jours nommés. */
const dayBucket = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (isSameDay(d, today)) return "AUJOURD'HUI";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'HIER';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
};

const NotificationsPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const back = useRkBack('/parent/dashboard');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await notificationService.getParentNotifications(user.id, 50);
      setItems(data);
    } catch (e) {
      console.error('[pNotifs]', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useIonViewWillEnter(() => { load(); });

  const open = async (n: AppNotification) => {
    if (!n.is_read) {
      await notificationService.markAsRead(n.id);
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    if (n.route) history.push(n.route);
  };

  const markAll = async () => {
    if (!user) return;
    await notificationService.markAllRead('parent', user.id);
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // Regroupement par jour, dans l'ordre d'arrivée
  const groups: { label: string; items: AppNotification[] }[] = [];
  items.forEach(n => {
    const label = dayBucket(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  });

  const unread = items.filter(n => !n.is_read).length;

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={back} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12,
          }}>← Accueil</button>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
              Notifications
            </h1>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {unread > 0 && (
                <button onClick={markAll} style={{
                  height: 32, padding: '0 12px', borderRadius: 999, background: 'var(--rk-indigosoft)',
                  color: 'var(--rk-indigo)', fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center',
                }}>Tout lire</button>
              )}
              <button onClick={() => history.push('/parent/notification-preferences')} style={{
                height: 32, padding: '0 12px', borderRadius: 999, background: 'var(--rk-surface2)',
                color: 'var(--rk-text2)', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center',
              }}>Réglages</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 22px 140px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--rk-text3)', fontSize: 14 }}>Chargement…</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 16px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)', marginBottom: 6 }}>Aucune notification</div>
              <div style={{ fontSize: 14, color: 'var(--rk-text3)', lineHeight: 1.5 }}>
                Vous serez prévenu des activités terminées, des validations à faire et des récompenses à remettre.
              </div>
            </div>
          ) : groups.map(group => (
            <div key={group.label}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '.12em',
                color: 'var(--rk-text3)', marginBottom: 11,
              }}>{group.label}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {group.items.map(n => {
                  const action = isActionRequired(n);
                  return (
                    <div
                      key={n.id}
                      onClick={() => open(n)}
                      style={{
                        display: 'flex', gap: 12, background: 'var(--rk-surface)',
                        border: action && !n.is_read ? '1.5px solid var(--rk-amber)' : '1px solid var(--rk-border)',
                        borderRadius: 18, padding: '14px 15px',
                        opacity: n.is_read ? .72 : 1,
                        cursor: n.route ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: tintOf(n),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                      }}>{n.icon}</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{n.title}</div>
                        <div style={{ fontSize: 13, color: 'var(--rk-text2)', marginTop: 3, lineHeight: 1.45 }}>{n.body}</div>
                        <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 6 }}>{shortTime(n.created_at)}</div>
                      </div>

                      {!n.is_read && (
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', background: 'var(--rk-accent)',
                          flexShrink: 0, marginTop: 5,
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default NotificationsPage;
