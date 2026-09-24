import { notificationsOutline, optionsOutline, timeOutline, peopleOutline, swapHorizontalOutline } from 'ionicons/icons';
import RkTile from '../../components/rk/RkTile';
import { useRkBack } from '../../hooks/useRkBack';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAuthStore } from '../../stores/auth.store';
import { useAppStore } from '../../stores/app.store';
import { useRk, type RkTheme } from '../../components/rk/RkShell';

/** Réglages — porté de la maquette Rekonect (écran pSettings). */

const ACCENTS: { key: RkTheme; color: string; label: string }[] = [
  { key: 'peach', color: '#FF9469', label: 'Pêche' },
  { key: 'ocean', color: '#3FA0C9', label: 'Océan' },
  { key: 'mint',  color: '#5CB88F', label: 'Menthe' },
  { key: 'berry', color: '#7C6BD4', label: 'Myrtille' },
  { key: 'sun',   color: '#E8B33F', label: 'Soleil' },
  { key: 'rasp',  color: '#E2607F', label: 'Framboise' },
];

const SettingsPage: React.FC = () => {
  const { profile, signOut } = useAuthStore();
  const { switchToParent } = useAppStore();
  const { theme, setTheme, dark, setDark } = useRk();
  const history = useHistory();
  const back = useRkBack('/parent/dashboard');
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!Capacitor.isNativePlatform()) { if (!cancelled) setPerm('prompt'); return; }
      try {
        const res = await PushNotifications.checkPermissions();
        if (!cancelled) setPerm(res.receive as 'granted' | 'denied' | 'prompt');
      } catch { if (!cancelled) setPerm('prompt'); }
    })();
    return () => { cancelled = true; };
  }, []);

  const enablePush = async () => {
    if (!Capacitor.isNativePlatform()) return;
    if (perm === 'denied') {
      // iOS ne repropose pas la boîte de dialogue : il faut passer par les Réglages
      alert('Activez les notifications dans Réglages → Notifications → Rekonect.');
      return;
    }
    const res = await PushNotifications.requestPermissions();
    if (res.receive === 'granted') await PushNotifications.register();
    setPerm(res.receive as 'granted' | 'denied' | 'prompt');
  };

  const logout = async () => {
    await signOut();
    switchToParent();
    history.replace('/onboarding');
  };

  const name = profile?.full_name || 'Mon compte';
  const initial = name[0]?.toUpperCase() ?? 'P';
  const accentLabel = ACCENTS.find(a => a.key === theme)?.label ?? 'Pêche';

  const eyebrow: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', marginBottom: 12,
  };
  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', width: '100%',
  };
  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={back} style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12 }}>← Accueil</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Réglages
          </h1>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── Compte ────────────────────────────────────────── */}
          <button onClick={() => history.push('/parent/account')} style={{
            display: 'flex', alignItems: 'center', gap: 14, background: 'var(--rk-surface)',
            border: '1px solid var(--rk-border)', borderRadius: 20, padding: 16, width: '100%', textAlign: 'left',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--rk-indigo)',
              color: 'var(--rk-indigofg)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0,
            }}>{initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--rk-text)' }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>{profile?.email}</div>
              <div style={{ fontSize: 11, color: 'var(--rk-indigo)', fontWeight: 700, marginTop: 4 }}>Modifier nom, email, mot de passe</div>
            </div>
            <div style={{ fontSize: 16, color: 'var(--rk-text3)', flexShrink: 0 }}>›</div>
          </button>

          {/* ── Apparence ─────────────────────────────────────── */}
          <div>
            <div style={eyebrow}>APPARENCE</div>
            <div style={{
              background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
              borderRadius: 20, padding: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Mode sombre</div>
                  <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>Plus doux le soir</div>
                </div>
                <button
                  onClick={() => setDark(!dark)}
                  role="switch"
                  aria-checked={dark}
                  style={{
                    width: 46, height: 28, borderRadius: 999, position: 'relative', flexShrink: 0,
                    background: dark ? 'var(--rk-indigo)' : 'var(--rk-track)',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: dark ? 21 : 3, width: 22, height: 22,
                    borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                    transition: 'left .18s',
                  }} />
                </button>
              </div>

              <div style={{ paddingTop: 16, borderTop: '1px solid var(--rk-line)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)', marginBottom: 4 }}>
                  Couleur d'accent
                </div>
                <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginBottom: 13 }}>
                  Actuellement : {accentLabel}. Chaque enfant peut choisir la sienne.
                </div>
                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                  {ACCENTS.map(a => (
                    <button
                      key={a.key}
                      onClick={() => setTheme(a.key)}
                      aria-label={a.label}
                      style={{
                        width: 38, height: 38, borderRadius: 12, background: a.color,
                        boxShadow: theme === a.key ? '0 0 0 2.5px var(--rk-text)' : '0 0 0 1px var(--rk-border)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Compte & liens ────────────────────────────────── */}
          <div>
            <div style={eyebrow}>COMPTE</div>
            <div style={{
              background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
              borderRadius: 20, overflow: 'hidden',
            }}>
              <button onClick={enablePush} style={{ ...row, borderBottom: '1px solid var(--rk-line)' }}>
                <RkTile icon={notificationsOutline} tint={perm === 'granted' ? 'var(--rk-sagesoft)' : 'var(--rk-ambersoft)'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Notifications push</div>
                  <div style={{
                    fontSize: 12, marginTop: 2,
                    color: perm === 'granted' ? 'var(--rk-sage)' : 'var(--rk-text3)',
                  }}>
                    {perm === 'checking' && 'Vérification…'}
                    {perm === 'granted' && 'Activées'}
                    {perm === 'denied' && 'Désactivées — touchez pour ouvrir les réglages'}
                    {perm === 'prompt' && 'Touchez pour activer'}
                  </div>
                </div>
                <div style={{ fontSize: 16, color: 'var(--rk-text3)', flexShrink: 0 }}>›</div>
              </button>

              <button onClick={() => history.push('/parent/notification-preferences')} style={{ ...row, borderBottom: '1px solid var(--rk-line)' }}>
                <RkTile icon={optionsOutline} tint="var(--rk-indigosoft)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Préférences de notifications</div>
                  <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                    Catégories, canaux, horaires silencieux
                  </div>
                </div>
                <div style={{ fontSize: 16, color: 'var(--rk-text3)', flexShrink: 0 }}>›</div>
              </button>

              <button onClick={() => history.push('/parent/notifications')} style={{ ...row, borderBottom: '1px solid var(--rk-line)' }}>
                <RkTile icon={timeOutline} tint="var(--rk-indigosoft)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Historique des notifications</div>
                </div>
                <div style={{ fontSize: 16, color: 'var(--rk-text3)', flexShrink: 0 }}>›</div>
              </button>

              <button onClick={() => history.push('/family')} style={{ ...row, borderBottom: '1px solid var(--rk-line)' }}>
                <RkTile icon={peopleOutline} tint="var(--rk-raspsoft)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Ma famille</div>
                  <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                    Inviter un co-parent, un éducateur
                  </div>
                </div>
                <div style={{ fontSize: 16, color: 'var(--rk-text3)', flexShrink: 0 }}>›</div>
              </button>

              <button onClick={() => history.push('/select-child')} style={row}>
                <RkTile icon={swapHorizontalOutline} tint="var(--rk-accentsoft)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Basculer vers l'espace enfant</div>
                </div>
                <div style={{ fontSize: 16, color: 'var(--rk-text3)', flexShrink: 0 }}>›</div>
              </button>
            </div>
          </div>

          <button onClick={logout} style={{
            width: '100%', height: 50, borderRadius: 999, background: 'var(--rk-raspsoft)',
            color: 'var(--rk-rasp)', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            Se déconnecter
          </button>

          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--rk-text3)' }}>Rekonect 1.0.0</div>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default SettingsPage;
