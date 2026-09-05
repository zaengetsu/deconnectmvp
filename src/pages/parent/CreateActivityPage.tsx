import { useRkBack } from '../../hooks/useRkBack';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';
import type { ActivityCategory } from '../../types/database.types';

/** Nouvelle activité — porté de la maquette Rekonect (écran pNewAct). */

const DIFFICULTIES = [
  { key: 'easy',   label: 'Facile',   tint: 'var(--rk-sagesoft)',  ink: 'var(--rk-sage)' },
  { key: 'medium', label: 'Moyen',    tint: 'var(--rk-ambersoft)', ink: 'var(--rk-amber)' },
  { key: 'hard',   label: 'Difficile',tint: 'var(--rk-raspsoft)',  ink: 'var(--rk-rasp)' },
] as const;

const CreateActivityPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const back = useRkBack('/parent/activities');

  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [points, setPoints] = useState(10);
  const [duration, setDuration] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activitiesService.getCategories().then(c => {
      setCategories(c);
      if (c[0]) setCategoryId(c[0].id);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!user || title.trim().length < 3) return;
    setSaving(true);
    setError(null);
    try {
      await activitiesService.createCustomActivity(user.id, {
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        points,
        duration_minutes: duration,
        difficulty,
        category_id: categoryId,
      });
      history.replace('/parent/activities');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 7 };
  const stepper = (v: number, set: (n: number) => void, step: number, min: number, max: number, suffix = '') => (
    <div style={{
      height: 50, borderRadius: 14, border: '1.5px solid var(--rk-border)', background: 'var(--rk-surface)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px',
    }}>
      <button onClick={() => set(Math.max(min, v - step))} style={{
        width: 30, height: 30, borderRadius: 9, background: 'var(--rk-surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, fontWeight: 700, color: 'var(--rk-text2)',
      }}>−</button>
      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--rk-text)' }}>{v}{suffix}</span>
      <button onClick={() => set(Math.min(max, v + step))} style={{
        width: 30, height: 30, borderRadius: 9, background: 'var(--rk-surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, fontWeight: 700, color: 'var(--rk-text2)',
      }}>+</button>
    </div>
  );

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={() => back()} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12,
          }}>← Catalogue</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Nouvelle activité
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>
            Visible uniquement par votre famille
          </p>
        </div>

        <div style={{ padding: '20px 22px 140px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div>
            <div style={label}>Titre</div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Vider le lave-vaisselle"
              style={{
                width: '100%', height: 50, borderRadius: 14,
                border: `1.5px solid ${title ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
                background: 'var(--rk-surface)', padding: '0 15px',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
              }}
            />
          </div>

          <div>
            <div style={label}>Consigne pour l'enfant</div>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Range la vaisselle propre dans les placards, puis referme la porte."
              style={{
                width: '100%', height: 88, borderRadius: 14, border: '1.5px solid var(--rk-border)',
                background: 'var(--rk-surface)', padding: '13px 15px', fontSize: 14,
                fontFamily: 'inherit', color: 'var(--rk-text)', lineHeight: 1.5, resize: 'none',
              }}
            />
          </div>

          {categories.length > 0 && (
            <div>
              <div style={{ ...label, marginBottom: 9 }}>Catégorie</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {categories.map(c => {
                  const on = categoryId === c.id;
                  return (
                    <button key={c.id} onClick={() => setCategoryId(c.id)} style={{
                      height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                      display: 'flex', alignItems: 'center',
                      background: on ? 'var(--rk-indigo)' : 'var(--rk-surface)',
                      border: on ? 'none' : '1px solid var(--rk-border)',
                      color: on ? 'var(--rk-indigofg)' : 'var(--rk-text2)',
                    }}>{c.name}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>Points</div>
              {stepper(points, setPoints, 5, 5, 100)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>Durée</div>
              {stepper(duration, setDuration, 5, 5, 180, ' min')}
            </div>
          </div>

          <div>
            <div style={{ ...label, marginBottom: 9 }}>Difficulté</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {DIFFICULTIES.map(d => {
                const on = difficulty === d.key;
                return (
                  <button key={d.key} onClick={() => setDifficulty(d.key)} style={{
                    flex: 1, height: 42, borderRadius: 12, fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? d.tint : 'var(--rk-surface)',
                    border: on ? 'none' : '1px solid var(--rk-border)',
                    color: on ? d.ink : 'var(--rk-text3)',
                  }}>{d.label}</button>
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
            {saving ? 'Création…' : "Créer l'activité"}
          </button>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default CreateActivityPage;
