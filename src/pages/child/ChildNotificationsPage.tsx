import { useRkBack } from '../../hooks/useRkBack';
import React, { useState, useCallback } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAppStore } from '../../stores/app.store';
import { notificationService, type AppNotification } from '../../features/notifications/notification.service';

/** Messages de l'enfant — porté de la maquette Rekonect (écran cNotifs). */

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (h < 1) return "À l'instant";
  if (h < 12) return `Il y a ${h} h`;
  if (d < 1) return 'Ce matin';
  if (d < 2) return 'Hier';
  if (d < 7) return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long' });
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/** La couleur porte le sens : réussite, nouveauté, badge, à revoir. */
const toneOf = (n: AppNotification) => {
  const t = n.type ?? '';
  if (t.includes('validated') || t.includes('approved') || t.includes('completed'))
    return { bg: 'var(--rk-sagesoft)', icon: 'var(--rk-sage)', filled: true };
  if (t.includes('rejected'))
    return { bg: 'var(--rk-surface)', icon: 'var(--rk-raspsoft)', filled: false, dim: true };
  if (t.includes('badge') || t.includes('level'))
    return { bg: 'var(--rk-surface)', icon: 'var(--rk-ambersoft)', filled: false };
  return { bg: 'var(--rk-surface)', icon: 'var(--rk-accentsoft)', filled: false };
};

const ChildNotificationsPage: React.FC = () => {
  const { selectedChild } = useAppStore();
  const history = useHistory();
  const back = useRkBack('/child/home');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    try {
      const data = await notificationService.getChildNotifications(selectedChild.id, 50);
      setItems(data);
      await notificationService.markAllRead('child', selectedChild.id);
    } catch (e) {
      console.error('[ChildNotifications]', e);
    } finally {
      setLoading(false);
    }
  }, [selectedChild]);

  useIonViewWillEnter(() => { load(); });

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={back} style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12 }}>
            ← Accueil
          </button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Mes messages
          </h1>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--rk-text3)', fontSize: 14 }}>Chargement…</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 12px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)', marginBottom: 6 }}>Rien de neuf</div>
              <div style={{ fontSize: 14, color: 'var(--rk-text3)', lineHeight: 1.5 }}>
                Tes points, tes badges et tes récompenses s'afficheront ici.
              </div>
            </div>
          ) : items.map(n => {
            const tone = toneOf(n);
            return (
              <div
                key={n.id}
                onClick={() => { if (n.route) history.push(n.route); }}
                style={{
                  display: 'flex', gap: 12, borderRadius: 20, padding: 15,
                  background: tone.bg,
                  border: tone.filled ? 'none' : '1px solid var(--rk-border)',
                  opacity: tone.dim ? .75 : 1,
                  cursor: n.route ? 'pointer' : 'default',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                  background: tone.icon, opacity: tone.filled ? .85 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                }}>
                  {tone.filled ? '' : n.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--rk-text)' }}>{n.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--rk-text2)', marginTop: 3, lineHeight: 1.45 }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 6 }}>{timeAgo(n.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildNotificationsPage;
