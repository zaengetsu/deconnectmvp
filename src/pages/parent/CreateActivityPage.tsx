import React, { useEffect, useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';
import type { ActivityCategory } from '../../types/database.types';
import { AlertCircle } from 'lucide-react';

const DIFFICULTY = [
  { value: 'easy',   label: 'Facile',    color: '#22C55E' },
  { value: 'medium', label: 'Moyen',     color: '#F59E0B' },
  { value: 'hard',   label: 'Difficile', color: '#EF4444' },
] as const;

const QUICK_POINTS = [5, 10, 15, 20, 30, 50];

const CreateActivityPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);

  // Controlled form state — avoids Zod UUID issues with empty category_id
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [points, setPoints] = useState(10);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');

  useEffect(() => {
    activitiesService.getCategories()
      .then(c => { if (mounted.current) setCategories(c); })
      .catch(console.error);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setError('Non connecté'); return; }
    if (!title.trim()) { setError('Le titre est requis'); return; }
    if (title.trim().length < 3) { setError('Le titre doit faire au moins 3 caractères'); return; }
    if (points < 1 || points > 100) { setError('Les points doivent être entre 1 et 100'); return; }

    setLoading(true);
    setError(null);
    try {
      await activitiesService.createCustomActivity(user.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        category_id: categoryId || undefined,
        points,
        duration_minutes: duration,
        difficulty,
      });
      if (mounted.current) history.replace('/parent/activities');
    } catch (e) {
      if (mounted.current) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        setError(`Erreur : ${msg}`);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const inp = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '2px solid var(--dc-border)', fontSize: 15, background: 'white',
    outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'var(--dc-font)',
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ minHeight: '100vh', background: 'var(--dc-bg)', padding: '0 0 100px' }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #6C5CE7 0%, #00B894 100%)',
            padding: '60px 24px 32px', color: 'white',
          }}>
            <button onClick={() => history.goBack()} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12,
              padding: '8px 16px', color: 'white', fontSize: 14, cursor: 'pointer', marginBottom: 16,
            }}>← Retour</button>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Nouvelle activité</h1>
            <p style={{ opacity: 0.85, fontSize: 14, margin: '4px 0 0' }}>Créez une activité personnalisée</p>
          </div>

          <div style={{ padding: '24px' }}>
            <form onSubmit={onSubmit}>
              {/* Title */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                  Titre *
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex : Faire son lit, Lire 20 minutes..."
                  style={inp}
                  autoFocus
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                  Description <span style={{ color: 'var(--dc-text-muted)', fontWeight: 400 }}>(optionnel)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Décrivez ce que l'enfant doit faire..."
                  rows={2}
                  style={{ ...inp, resize: 'vertical' }}
                />
              </div>

              {/* Category */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                  Catégorie
                </label>
                <select
                  value={categoryId || ''}
                  onChange={e => setCategoryId(e.target.value || undefined)}
                  style={inp}
                >
                  <option value="">— Aucune catégorie —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Difficulty */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  Difficulté
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {DIFFICULTY.map(d => (
                    <button key={d.value} type="button" onClick={() => setDifficulty(d.value)} style={{
                      padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      border: `2px solid ${difficulty === d.value ? d.color : 'var(--dc-border)'}`,
                      background: difficulty === d.value ? `${d.color}22` : 'white',
                      color: difficulty === d.value ? d.color : 'var(--dc-text)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block', flexShrink: 0 }} />
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Points */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  Points récompensés
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {QUICK_POINTS.map(p => (
                    <button key={p} type="button" onClick={() => setPoints(p)} style={{
                      flex: '1 0 auto', padding: '10px 8px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      border: `2px solid ${points === p ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
                      background: points === p ? 'var(--dc-primary)' : 'white',
                      color: points === p ? 'white' : 'var(--dc-text)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {p} pts
                    </button>
                  ))}
                </div>
                <input
                  type="number" min={1} max={100} value={points}
                  onChange={e => setPoints(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={inp}
                />
              </div>

              {/* Duration */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                  Durée (minutes) <span style={{ color: 'var(--dc-text-muted)', fontWeight: 400 }}>(optionnel)</span>
                </label>
                <input
                  type="number" min={5} max={180}
                  value={duration || ''}
                  onChange={e => setDuration(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Ex : 30"
                  style={inp}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: '#FEE2E2', color: '#DC2626', padding: '12px 16px',
                  borderRadius: 12, marginBottom: 16, fontSize: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} strokeWidth={2} /> {error}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '16px', borderRadius: 16, fontSize: 16, fontWeight: 800,
                  background: loading ? '#ccc' : 'linear-gradient(135deg, #6C5CE7, #00B894)',
                  color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Création...' : 'Créer l\'activité'}
              </button>
            </form>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default CreateActivityPage;
