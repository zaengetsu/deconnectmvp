import { useRkBack } from '../../hooks/useRkBack';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { rewardsService } from '../../features/rewards/rewards.service';
import { childrenService } from '../../features/children/children.service';
import { REWARD_CATEGORIES } from '../../lib/constants';
import type { Child } from '../../types/database.types';

/** Nouvelle récompense — porté de la maquette Rekonect (écran pNewRew). */

const MIN = 10;
const MAX = 500;
const AVERAGE_ACTIVITY = 20; // pour l'équivalence « ≈ n activités »

const CreateRewardPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const back = useRkBack('/parent/rewards');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('experience');
  const [points, setPoints] = useState(180);
  const [childId, setChildId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    childrenService.getChildren(user.id).then(setChildren).catch(() => {});
  }, [user?.id]);

  const submit = async () => {
    if (!user || title.trim().length < 3) return;
    setSaving(true);
    setError(null);
    try {
      await rewardsService.createReward(user.id, {
        title: title.trim(),
        description: REWARD_CATEGORIES[category]?.label,
        required_points: points,
        child_id: childId ?? undefined,
      });
      history.replace('/parent/rewards');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 7 };
  const pct = Math.round(((points - MIN) / (MAX - MIN)) * 100);

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={() => back()} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12,
          }}>← Récompenses</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Nouvelle récompense
          </h1>
        </div>

        <div style={{ padding: '20px 22px 140px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div>
            <div style={label}>Intitulé</div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Atelier pâtisserie ensemble"
              style={{
                width: '100%', height: 50, borderRadius: 14,
                border: `1.5px solid ${title ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
                background: 'var(--rk-surface)', padding: '0 15px',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
              }}
            />
          </div>

          <div>
            <div style={{ ...label, marginBottom: 9 }}>Catégorie</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {Object.entries(REWARD_CATEGORIES).map(([key, meta]) => {
                const on = category === key;
                return (
                  <button key={key} onClick={() => setCategory(key)} style={{
                    height: 44, borderRadius: 13, fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? 'var(--rk-accent)' : 'var(--rk-surface)',
                    border: on ? 'none' : '1px solid var(--rk-border)',
                    color: on ? 'var(--rk-accentink)' : 'var(--rk-text2)',
                  }}>{meta.label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={label}>Points requis</div>
            <div style={{
              background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
              borderRadius: 16, padding: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{
                  fontSize: 30, fontWeight: 800, letterSpacing: '-.03em',
                  color: 'var(--rk-text)', fontVariantNumeric: 'tabular-nums',
                }}>{points}</span>
                <span style={{ fontSize: 12, color: 'var(--rk-text3)', fontWeight: 600 }}>
                  ≈ {Math.max(1, Math.round(points / AVERAGE_ACTIVITY))} activités moyennes
                </span>
              </div>

              <div style={{ position: 'relative', height: 8 }}>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--rk-surface2)' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'var(--rk-accent)' }} />
                </div>
                <input
                  type="range"
                  min={MIN}
                  max={MAX}
                  step={10}
                  value={points}
                  onChange={e => setPoints(Number(e.target.value))}
                  style={{
                    position: 'absolute', inset: '-8px 0', width: '100%', height: 24,
                    opacity: 0, cursor: 'pointer',
                  }}
                />
                <div style={{
                  position: 'absolute', left: `${pct}%`, top: -6, width: 20, height: 20,
                  borderRadius: '50%', background: 'var(--rk-surface)',
                  border: '2.5px solid var(--rk-accent)', marginLeft: -10, pointerEvents: 'none',
                }} />
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 11,
                color: 'var(--rk-text3)', marginTop: 9, fontWeight: 600,
              }}><span>{MIN}</span><span>{MAX}</span></div>
            </div>
          </div>

          {children.length > 0 && (
            <div>
              <div style={{ ...label, marginBottom: 9 }}>Pour qui ?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setChildId(null)} style={{
                  flex: '1 1 45%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: 52, borderRadius: 14,
                  border: `1.5px solid ${childId === null ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
                  background: childId === null ? 'var(--rk-accentsoft)' : 'var(--rk-surface)',
                  fontSize: 14, fontWeight: 700,
                  color: childId === null ? 'var(--rk-text)' : 'var(--rk-text3)',
                }}>Toute la fratrie</button>

                {children.map(c => {
                  const on = childId === c.id;
                  const isImg = c.avatar_url?.startsWith('/images/avatars/');
                  return (
                    <button key={c.id} onClick={() => setChildId(c.id)} style={{
                      flex: '1 1 45%', display: 'flex', alignItems: 'center', gap: 9,
                      height: 52, borderRadius: 14, padding: '0 13px',
                      border: `1.5px solid ${on ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
                      background: on ? 'var(--rk-accentsoft)' : 'var(--rk-surface)',
                    }}>
                      {isImg ? (
                        <img src={c.avatar_url!} alt="" style={{
                          width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: '#EDE7FF',
                        }} />
                      ) : (
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', background: '#EDE7FF',
                          color: 'var(--rk-indigo)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 13, fontWeight: 800,
                        }}>{c.display_name[0]?.toUpperCase()}</div>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 700, color: on ? 'var(--rk-text)' : 'var(--rk-text3)' }}>
                        {c.display_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: 'var(--rk-raspsoft)', borderRadius: 16, padding: '14px 15px',
              fontSize: 12, color: 'var(--rk-rasp)', lineHeight: 1.55,
            }}>{error}</div>
          )}

          <button
            onClick={submit}
            disabled={saving || title.trim().length < 3}
            style={{
              width: '100%', height: 52, borderRadius: 999, marginTop: 4,
              background: title.trim().length >= 3 ? 'var(--rk-indigo)' : 'var(--rk-surface2)',
              color: title.trim().length >= 3 ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: saving ? .6 : 1,
            }}
          >
            {saving ? 'Création…' : 'Créer la récompense'}
          </button>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default CreateRewardPage;
