import React, { useState, useEffect } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useAppStore } from '../../stores/app.store';
import { Users, ChevronRight, User, Pencil, Check, LogOut, Bell, BellOff, ExternalLink } from 'lucide-react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

const SettingsPage: React.FC = () => {
  const { profile, signOut, updateProfile } = useAuthStore();
  const { switchToParent } = useAppStore();
  const history = useHistory();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(profile?.full_name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) { setNotifPermission('prompt'); return; }
    PushNotifications.checkPermissions().then(res => {
      setNotifPermission(res.receive as 'granted' | 'denied' | 'prompt');
    }).catch(() => setNotifPermission('prompt'));
  }, []);

  const handleLogout = async () => {
    await signOut();
    switchToParent();
    history.replace('/onboarding');
  };

  const handleEnableNotifications = async () => {
    if (!Capacitor.isNativePlatform()) return;
    if (notifPermission === 'denied') {
      // iOS won't re-show the dialog — must go to Settings
      // Use Capacitor App to open app settings
      try {
        const { App } = await import('@capacitor/app');
        // On iOS, openUrl with app-settings:// opens the app's notification settings
        await (App as any).openUrl({ url: 'app-settings:' });
      } catch {
        alert('Activez les notifications dans : Réglages iOS → Notifications → [Nom de l\'app]');
      }
      return;
    }
    // Not yet asked — request now
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      await PushNotifications.register();
    }
    setNotifPermission(result.receive as 'granted' | 'denied' | 'prompt');
  };

  const handleSaveName = async () => {
    if (!newName.trim() || newName.trim().length < 2) return;
    setSavingName(true);
    try {
      await updateProfile({ full_name: newName.trim() });
      setEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingName(false);
    }
  };

  const inp = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '2px solid var(--dc-primary)', fontSize: 15,
    background: 'white', outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: 'var(--dc-font)',
  };

  const iconBox = {
    width: 38, height: 38, borderRadius: 10, display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="dc-page-header">
        <div className="dc-header-row">
          <img src="/images/menu/gear.png" alt="paramètres" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          <h1>Paramètres</h1>
        </div>
      </div>
      <div style={{ padding: '20px 20px 100px' }}>

        {/* Profile card */}
        <div className="dc-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: editingName ? 16 : 0 }}>
            <div className="dc-avatar" style={{ background: 'var(--dc-primary)', color: 'white', flexShrink: 0 }}>
              {(profile?.full_name || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{profile?.full_name}</div>
              <div style={{ fontSize: 13, color: 'var(--dc-text-light)' }}>{profile?.email}</div>
            </div>
            <button
              onClick={() => { setEditingName(!editingName); setNewName(profile?.full_name || ''); }}
              style={{
                background: 'none', border: '2px solid var(--dc-border)', borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                color: 'var(--dc-primary)',
              }}
            >
              <Pencil size={14} strokeWidth={2} />
            </button>
          </div>

          {editingName && (
            <div style={{ marginTop: 4 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--dc-text-light)' }}>
                Votre prénom / nom
              </label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex : Marie Dupont"
                style={inp}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={handleSaveName}
                  disabled={savingName || !newName.trim()}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 800,
                    background: 'var(--dc-primary)', color: 'white', border: 'none',
                    cursor: savingName ? 'not-allowed' : 'pointer', opacity: savingName ? 0.7 : 1,
                  }}
                >
                  {savingName ? 'Sauvegarde...' : 'Enregistrer'}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  style={{
                    padding: '10px 16px', borderRadius: 10, fontSize: 14,
                    background: 'none', border: '2px solid var(--dc-border)',
                    color: 'var(--dc-text-light)', cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {nameSuccess && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(0,184,148,0.1)', color: '#00B894',
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Check size={14} /> Nom mis à jour
            </div>
          )}
        </div>

        {/* Abonnement */}
        <div className="dc-card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, color: 'var(--dc-text-muted)', letterSpacing: '0.08em' }}>ABONNEMENT</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Plan Gratuit</div>
              <div style={{ fontSize: 13, color: 'var(--dc-text-light)' }}>1 enfant · Fonctionnalités de base</div>
            </div>
            <button className="dc-btn" style={{ padding: '8px 16px', fontSize: 13, background: 'var(--dc-accent)', color: 'white', borderRadius: 50 }}>Upgrade</button>
          </div>
        </div>

        {/* Notifications */}
        <div className="dc-card" style={{ marginBottom: 10 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, marginBottom: 14, color: 'var(--dc-text-muted)', letterSpacing: '0.08em' }}>NOTIFICATIONS</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ ...iconBox, background: notifPermission === 'granted' ? 'rgba(0,184,148,0.1)' : 'rgba(255,107,107,0.1)' }}>
              {notifPermission === 'granted'
                ? <Bell size={18} color="var(--dc-success)" strokeWidth={2} />
                : <BellOff size={18} color="#FF6B6B" strokeWidth={2} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Notifications push</div>
              <div style={{ fontSize: 12, color: notifPermission === 'granted' ? 'var(--dc-success)' : 'var(--dc-text-muted)' }}>
                {notifPermission === 'checking' && 'Vérification...'}
                {notifPermission === 'granted' && '✓ Activées'}
                {notifPermission === 'denied' && 'Désactivées — touchez pour activer dans les Réglages'}
                {notifPermission === 'prompt' && 'Touchez pour activer'}
              </div>
            </div>
            {notifPermission !== 'granted' && notifPermission !== 'checking' && (
              <button
                onClick={handleEnableNotifications}
                style={{
                  background: 'var(--dc-primary)', color: 'white', border: 'none',
                  borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {notifPermission === 'denied' ? <><ExternalLink size={13} /> Réglages</> : 'Activer'}
              </button>
            )}
          </div>

          {/* Link to notifications history */}
          <div
            onClick={() => history.push('/parent/notifications')}
            style={{
              marginTop: 14, paddingTop: 14,
              borderTop: '1px solid var(--dc-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>Historique des notifications</span>
            <ChevronRight size={16} color="var(--dc-text-muted)" />
          </div>
        </div>

        {/* Ma famille */}
        <div className="dc-card" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => history.push('/family')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ ...iconBox, background: 'rgba(108,92,231,0.1)' }}>
              <img src="/images/menu/family.png" alt="famille" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Ma famille</div>
              <div style={{ fontSize: 12, color: 'var(--dc-text-light)' }}>Inviter un co-parent, éducateur...</div>
            </div>
            <ChevronRight size={16} color="var(--dc-text-muted)" />
          </div>
        </div>

        {/* Espace enfant */}
        <div className="dc-card" style={{ marginBottom: 24, cursor: 'pointer' }} onClick={() => history.push('/select-child')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ ...iconBox, background: 'rgba(0,184,148,0.1)' }}>
              <User size={18} color="var(--dc-success)" strokeWidth={2} />
            </div>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>Espace enfant</div>
            <ChevronRight size={16} color="var(--dc-text-muted)" />
          </div>
        </div>

        <button
          className="dc-btn dc-btn-full"
          style={{ background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={handleLogout}
        >
          <LogOut size={16} strokeWidth={2} />
          Se déconnecter
        </button>
      </div>
    </IonContent></IonPage>
  );
};

export default SettingsPage;
