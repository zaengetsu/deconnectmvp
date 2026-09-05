import { useRkBack } from '../../hooks/useRkBack';
import React, { useRef, useState } from 'react';
import { MIN_CHILD_AGE, MAX_CHILD_AGE } from '../../lib/constants';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import { emailService } from '../../features/notifications/email.service';

/** Ajouter un enfant — porté de la maquette Rekonect (écran pNewKid). */

const AGES = Array.from({ length: MAX_CHILD_AGE - MIN_CHILD_AGE + 1 }, (_, i) => i + MIN_CHILD_AGE); // 7 → 18, aligné sur childSchema
const AVATARS = Array.from({ length: 14 }, (_, i) => `/images/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`);

const CreateChildPage: React.FC = () => {
  const { user, profile } = useAuthStore();
  const history = useHistory();
  const back = useRkBack('/parent/children');
  const mounted = useRef(true);

  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState(9);
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!user || !displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await childrenService.createChild({
        parent_id: user.id,
        display_name: displayName.trim(),
        age,
        avatar_url: avatar,
      });

      // Événement important côté parent : email en plus de l'in-app (5.14)
      if (profile?.email) {
        emailService.sendChildProfileCreated(profile.email, profile.full_name ?? '', displayName.trim());
      }

      if (mounted.current) history.replace('/parent/children');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const label: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 7,
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={() => back()} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12,
          }}>← Enfants</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Ajouter un enfant
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>
            Vous pourrez lier son appareil ensuite
          </p>
        </div>

        <div style={{ padding: '20px 22px 140px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div>
            <div style={label}>Prénom</div>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Son prénom"
              style={{
                width: '100%', height: 50, borderRadius: 14,
                border: `1.5px solid ${displayName ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
                background: 'var(--rk-surface)', padding: '0 15px',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
              }}
            />
          </div>

          <div>
            <div style={label}>Âge</div>
            <div className="rk-sc" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {AGES.map(a => {
                const on = a === age;
                return (
                  <button key={a} onClick={() => setAge(a)} style={{
                    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: on ? 800 : 700,
                    background: on ? 'var(--rk-indigo)' : 'var(--rk-surface)',
                    border: on ? 'none' : '1px solid var(--rk-border)',
                    color: on ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
                  }}>{a}</button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ ...label, marginBottom: 9 }}>Avatar</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9 }}>
              {AVATARS.map(src => {
                const on = avatar === src;
                return (
                  <button key={src} onClick={() => setAvatar(src)} style={{
                    borderRadius: 16, padding: 5,
                    background: on ? 'var(--rk-accentsoft)' : 'var(--rk-surface2)',
                    border: `2.5px solid ${on ? 'var(--rk-accent)' : 'transparent'}`,
                  }}>
                    <img src={src} alt="" style={{
                      width: '100%', aspectRatio: '1', borderRadius: 12,
                      objectFit: 'cover', display: 'block', background: '#EDE7FF',
                    }} />
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div style={{
              background: 'var(--rk-raspsoft)', borderRadius: 16, padding: '14px 15px',
              fontSize: 12, color: 'var(--rk-rasp)', lineHeight: 1.55,
            }}>{error}</div>
          )}

          <button
            onClick={submit}
            disabled={loading || !displayName.trim()}
            style={{
              width: '100%', height: 52, borderRadius: 999,
              background: displayName.trim() ? 'var(--rk-indigo)' : 'var(--rk-surface2)',
              color: displayName.trim() ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: loading ? .6 : 1,
            }}
          >
            {loading ? 'Création…' : 'Créer le profil'}
          </button>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default CreateChildPage;
