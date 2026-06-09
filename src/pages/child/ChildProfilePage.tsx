import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAppStore } from '../../stores/app.store';
import { childrenService } from '../../features/children/children.service';
import { gamificationService } from '../../features/gamification/gamification.service';
import { CheckCircle2 } from 'lucide-react';

// Les 14 avatars uniformisés (400×400, fond #EDE7FF)
const AVATARS = Array.from({ length: 14 }, (_, i) =>
  `/images/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`
);

const isImageUrl = (url: string | null | undefined) =>
  !!url && url.startsWith('/images/avatars/');

const ChildProfilePage: React.FC = () => {
  const { selectedChild, setSelectedChild } = useAppStore();
  const history = useHistory();

  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);

  if (!selectedChild) return null;

  const progress = gamificationService.getLevelProgress(selectedChild.total_points);
  const currentAvatar = tempAvatar ?? selectedChild.avatar_url;
  const hasImage = isImageUrl(currentAvatar);

  const handleSaveAvatar = async () => {
    if (!tempAvatar || tempAvatar === selectedChild.avatar_url) {
      setShowPicker(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await childrenService.updateChild(selectedChild.id, {
        avatar_url: tempAvatar,
      });
      setSelectedChild(updated);
      setTempAvatar(null);
      setShowPicker(false);
    } catch (e) {
      console.error('Avatar update error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="dc-page-header">
          <div className="dc-header-row">
            <img src="/images/menu/profile.png" alt="profil" style={{ width: 26, height: 26, objectFit: 'contain' }} />
            <h1>Mon Profil</h1>
          </div>
        </div>

        <div style={{ padding: '20px 20px 100px' }}>

          {/* ── Carte profil ── */}
          <div className="dc-card" style={{ textAlign: 'center', padding: 32, marginBottom: 24 }}>

            {/* Avatar actuel */}
            <div
              style={{
                width: 96, height: 96, borderRadius: '50%',
                margin: '0 auto 12px',
                overflow: 'hidden',
                background: '#EDE7FF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(108,92,231,0.2)',
                border: '3px solid rgba(108,92,231,0.15)',
                position: 'relative',
              }}
            >
              {hasImage ? (
                <img
                  src={currentAvatar!}
                  alt="avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--dc-primary)' }}>
                  {selectedChild.display_name?.[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>
              {selectedChild.display_name}
            </h2>
            <p style={{ color: 'var(--dc-text-light)', margin: '0 0 16px' }}>
              {selectedChild.age} ans
            </p>

            <button
              onClick={() => { setTempAvatar(currentAvatar ?? null); setShowPicker(true); }}
              className="dc-btn"
              style={{
                padding: '10px 24px', borderRadius: 50, fontSize: 14, fontWeight: 700,
                background: 'rgba(108,92,231,0.1)', color: 'var(--dc-primary)', border: 'none',
                cursor: 'pointer',
              }}
            >
              Changer mon avatar
            </button>
          </div>

          {/* ── Progression ── */}
          <div className="dc-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>Niveau {selectedChild.level}</span>
              <span style={{ color: 'var(--dc-primary)', fontWeight: 700 }}>
                {selectedChild.total_points} pts
              </span>
            </div>
            <div className="dc-progress-bar">
              <div className="dc-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <button
            className="dc-btn dc-btn-outline dc-btn-full"
            style={{ marginTop: 16 }}
            onClick={() => history.replace('/parent')}
          >
            ← Retour à l'espace parent
          </button>
        </div>

        {/* ── Picker d'avatars (bottom sheet) ── */}
        {showPicker && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'flex-end',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setShowPicker(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'white', borderRadius: '24px 24px 0 0',
                padding: '24px 20px 40px', width: '100%',
                maxHeight: '80vh', overflowY: 'auto',
              }}
            >
              {/* Handle */}
              <div style={{ width: 40, height: 4, background: '#E5E7EB', borderRadius: 99, margin: '0 auto 20px' }} />

              <h3 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 6px', textAlign: 'center' }}>
                Choisis ton avatar
              </h3>
              <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', textAlign: 'center', margin: '0 0 20px' }}>
                Appuie sur un personnage pour le sélectionner
              </p>

              {/* Grille 4 colonnes */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 24,
              }}>
                {AVATARS.map(src => {
                  const selected = tempAvatar === src;
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setTempAvatar(src)}
                      style={{
                        background: selected ? 'rgba(108,92,231,0.12)' : '#F8F8FA',
                        border: `2.5px solid ${selected ? 'var(--dc-primary)' : 'transparent'}`,
                        borderRadius: 16, padding: 6,
                        cursor: 'pointer', position: 'relative',
                        transition: 'all 0.15s',
                      }}
                    >
                      <img
                        src={src}
                        alt="avatar"
                        style={{
                          width: '100%', aspectRatio: '1',
                          borderRadius: 12, objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                      {selected && (
                        <div style={{
                          position: 'absolute', bottom: 4, right: 4,
                          background: 'var(--dc-primary)', borderRadius: '50%',
                          width: 20, height: 20,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <CheckCircle2 size={13} color="white" strokeWidth={2.5} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSaveAvatar}
                disabled={saving || !tempAvatar}
                style={{
                  width: '100%', padding: '16px', borderRadius: 16,
                  fontSize: 16, fontWeight: 900,
                  background: saving || !tempAvatar
                    ? '#D1D5DB'
                    : 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                  color: 'white', border: 'none',
                  cursor: saving || !tempAvatar ? 'not-allowed' : 'pointer',
                  boxShadow: saving || !tempAvatar ? 'none' : '0 6px 20px rgba(108,92,231,0.3)',
                }}
              >
                {saving ? 'Enregistrement...' : 'Valider mon avatar'}
              </button>
            </div>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default ChildProfilePage;
