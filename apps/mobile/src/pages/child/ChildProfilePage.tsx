import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAppStore } from '../../stores/app.store';
import { childrenService } from '../../features/children/children.service';
import { gamificationService } from '../../features/gamification/gamification.service';
import { childSession } from '../../features/auth/child.session';
import { useRk, RkSheet, type RkTheme } from '../../components/rk/RkShell';
import { LEVEL_NAMES } from '../../lib/constants';

/** Profil & thème — porté de la maquette Rekonect (écran cProfile). */

const AVATARS = Array.from({ length: 14 }, (_, i) => `/images/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`);

/** Un thème se débloque tous les deux niveaux : c'est la récompense de la progression. */
const THEMES: { key: RkTheme; label: string; color: string; level: number }[] = [
  { key: 'peach', label: 'Pêche',    color: '#FF9469', level: 1 },
  { key: 'ocean', label: 'Océan',    color: '#3FA0C9', level: 3 },
  { key: 'mint',  label: 'Menthe',   color: '#5CB88F', level: 5 },
  { key: 'berry', label: 'Myrtille', color: '#7C6BD4', level: 7 },
  { key: 'sun',   label: 'Soleil',   color: '#E8B33F', level: 9 },
  { key: 'rasp',  label: 'Framboise',color: '#E2607F', level: 10 },
];

const ChildProfilePage: React.FC = () => {
  const { selectedChild, setSelectedChild, clearChild } = useAppStore();
  const { theme, setTheme, dark, setDark, sheet, openSheet, closeSheet } = useRk();
  const history = useHistory();
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!selectedChild) {
    return <IonPage><IonContent><div className="rk-app" style={{ padding: 40 }}>Aucun profil</div></IonContent></IonPage>;
  }

  const level = gamificationService.calculateLevel(selectedChild.total_points);
  const levelName = LEVEL_NAMES[level - 1]?.name ?? 'Graine';
  const currentTheme = THEMES.find(t => t.key === theme);
  const isImg = selectedChild.avatar_url?.startsWith('/images/avatars/');

  const handleSaveAvatar = async () => {
    if (!tempAvatar || tempAvatar === selectedChild.avatar_url) { closeSheet(); return; }
    setSaving(true);
    try {
      const updated = await childrenService.updateChild(selectedChild.id, { avatar_url: tempAvatar });
      setSelectedChild(updated);
      setTempAvatar(null);
      closeSheet();
    } catch (e) {
      console.error('[ChildProfile] avatar:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleExit = async () => {
    await childSession.end();
    clearChild();
    history.replace('/login');
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Mon profil
          </h1>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── Carte profil ──────────────────────────────────── */}
          <div style={{
            background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
            borderRadius: 22, padding: 26, textAlign: 'center',
          }}>
            {isImg ? (
              <img src={selectedChild.avatar_url!} alt="" style={{
                width: 92, height: 92, borderRadius: '50%', objectFit: 'cover',
                marginBottom: 14, background: '#EDE7FF', border: '3px solid var(--rk-accent)',
              }} />
            ) : (
              <div style={{
                width: 92, height: 92, borderRadius: '50%', margin: '0 auto 14px',
                background: 'var(--rk-accentsoft)', border: '3px solid var(--rk-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, fontWeight: 800, color: 'var(--rk-text)',
              }}>{selectedChild.display_name[0]?.toUpperCase()}</div>
            )}

            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--rk-text)' }}>
              {selectedChild.display_name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--rk-text3)', marginTop: 3 }}>
              {selectedChild.age} ans · {levelName} · niveau {level}
            </div>

            <button
              onClick={() => { setTempAvatar(selectedChild.avatar_url ?? null); openSheet('avatar'); }}
              style={{
                height: 42, padding: '0 22px', borderRadius: 999, background: 'var(--rk-accentsoft)',
                color: 'var(--rk-text)', fontSize: 14, fontWeight: 700, marginTop: 18,
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              Changer d'avatar
            </button>
          </div>

          {/* ── Thème ─────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', marginBottom: 6 }}>
              MON THÈME
            </div>
            <p style={{ fontSize: 13, color: 'var(--rk-text2)', margin: '0 0 14px', lineHeight: 1.55 }}>
              Tu débloques une nouvelle couleur tous les deux niveaux. Actuellement : {currentTheme?.label ?? 'Pêche'}.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {THEMES.map(t => {
                const unlocked = level >= t.level;
                const picked = theme === t.key;
                return unlocked ? (
                  <button key={t.key} onClick={() => setTheme(t.key)} style={{
                    background: 'var(--rk-surface)',
                    border: `2.5px solid ${picked ? t.color : 'transparent'}`,
                    borderRadius: 18, padding: 12, textAlign: 'center',
                  }}>
                    <div style={{ width: '100%', height: 44, borderRadius: 12, background: t.color, marginBottom: 9 }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rk-text)' }}>{t.label}</div>
                  </button>
                ) : (
                  <div key={t.key} style={{
                    background: 'var(--rk-surface2)', border: '2.5px solid transparent',
                    borderRadius: 18, padding: 12, textAlign: 'center', opacity: .55,
                  }}>
                    <div style={{ width: '100%', height: 44, borderRadius: 12, background: t.color, marginBottom: 9, opacity: .35 }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rk-text3)' }}>Niveau {t.level}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Mode sombre ───────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, background: 'var(--rk-surface)',
            border: '1px solid var(--rk-border)', borderRadius: 20, padding: 16,
          }}>
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

          <button onClick={handleExit} style={{
            width: '100%', height: 50, borderRadius: 999, border: '1.5px solid var(--rk-border)',
            color: 'var(--rk-text2)', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            Retour à l'espace parent
          </button>
        </div>

        {/* ── Choix d'avatar ──────────────────────────────────── */}
        <RkSheet open={sheet === 'avatar'} onClose={closeSheet} title="Choisis ton avatar">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
            {AVATARS.map(src => {
              const picked = tempAvatar === src;
              return (
                <button key={src} onClick={() => setTempAvatar(src)} style={{
                  borderRadius: '50%', padding: 0, border: `3px solid ${picked ? 'var(--rk-accent)' : 'transparent'}`,
                }}>
                  <img src={src} alt="" style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', objectFit: 'cover', background: '#EDE7FF', display: 'block' }} />
                </button>
              );
            })}
          </div>
          <button
            onClick={handleSaveAvatar}
            disabled={saving || !tempAvatar}
            style={{
              width: '100%', height: 50, borderRadius: 999,
              background: saving || !tempAvatar ? 'var(--rk-surface2)' : 'var(--rk-accent)',
              color: saving || !tempAvatar ? 'var(--rk-text3)' : 'var(--rk-accentink)',
              fontSize: 15, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {saving ? 'Enregistrement…' : 'Valider mon avatar'}
          </button>
        </RkSheet>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildProfilePage;
