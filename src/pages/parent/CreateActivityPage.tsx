import React, { useEffect, useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';
import type { ActivityCategory } from '../../types/database.types';
import { AlertCircle, Star, ArrowLeft, CheckCircle2 } from 'lucide-react';

const DIFFICULTY = [
  { value: 'easy',   label: 'Facile',    color: '#22C55E', bg: '#F0FDF4' },
  { value: 'medium', label: 'Moyen',     color: '#F59E0B', bg: '#FFFBEB' },
  { value: 'hard',   label: 'Difficile', color: '#EF4444', bg: '#FEF2F2' },
] as const;

const QUICK_POINTS = [5, 10, 20, 30, 50, 75, 100];

/* ─── Section wrapper ─── */
const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div style={{
    background: 'white',
    borderRadius: 20,
    padding: '20px',
    marginBottom: 16,
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
    border: '1px solid rgba(0,0,0,0.06)',
  }}>
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--dc-text)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>{subtitle}</div>}
    </div>
    {children}
  </div>
);

const CreateActivityPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);

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
    if (!title.trim()) { setError('Le titre est requis'); return; }
    if (title.trim().length < 3) { setError('Le titre doit faire au moins 3 caractères'); return; }
    if (points < 1 || points > 100) { setError('Les points doivent être entre 1 et 100'); return; }
    if (!user) { setError('Session introuvable — veuillez vous reconnecter'); return; }

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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 16px',
    borderRadius: 12,
    border: '1.5px solid var(--dc-border)',
    fontSize: 15,
    background: '#FAFAFA',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'var(--dc-font)',
    color: 'var(--dc-text)',
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ minHeight: '100vh', background: '#F4F5F9', paddingBottom: 32 }}>

          {/* ── Header ── */}
          <div style={{
            background: 'linear-gradient(135deg, #6C5CE7 0%, #00B894 100%)',
            padding: '56px 24px 36px',
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

            <button
              onClick={() => history.goBack()}
              style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12,
                padding: '8px 14px', color: 'white', fontSize: 14, cursor: 'pointer',
                marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
                backdropFilter: 'blur(8px)',
              }}
            >
              <ArrowLeft size={14} strokeWidth={2.5} /> Retour
            </button>

            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Nouvelle activité</h1>
            <p style={{ opacity: 0.85, fontSize: 13, margin: '4px 0 0' }}>Créez une activité personnalisée</p>
          </div>

          {/* ── Form ── */}
          <div style={{ padding: '24px 20px 0' }}>
            <form onSubmit={onSubmit}>

              {/* Titre */}
              <Section title="Titre de l'activité" subtitle="Donnez un nom clair et motivant">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex : Faire son lit, Lire 20 minutes..."
                  style={inputStyle}
                  autoFocus
                />
              </Section>

              {/* Description */}
              <Section title="Description" subtitle="Optionnel — expliquez ce que l'enfant doit faire">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Décrivez ce que l'enfant doit faire..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </Section>

              {/* Catégorie */}
              {categories.length > 0 && (
                <Section title="Catégorie" subtitle="Classez l'activité par thème">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setCategoryId(undefined)}
                      style={{
                        padding: '8px 14px', borderRadius: 50, fontSize: 13, fontWeight: 600,
                        border: `1.5px solid ${!categoryId ? '#6C5CE7' : 'var(--dc-border)'}`,
                        background: !categoryId ? 'rgba(108,92,231,0.1)' : 'white',
                        color: !categoryId ? '#6C5CE7' : 'var(--dc-text-light)',
                        cursor: 'pointer',
                      }}
                    >
                      Aucune
                    </button>
                    {categories.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(c.id)}
                        style={{
                          padding: '8px 14px', borderRadius: 50, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${categoryId === c.id ? '#6C5CE7' : 'var(--dc-border)'}`,
                          background: categoryId === c.id ? 'rgba(108,92,231,0.1)' : 'white',
                          color: categoryId === c.id ? '#6C5CE7' : 'var(--dc-text-light)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <span>{c.icon}</span> {c.name}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* Difficulté */}
              <Section title="Difficulté" subtitle="Quel effort cela demande à l'enfant ?">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {DIFFICULTY.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDifficulty(d.value)}
                      style={{
                        padding: '14px 8px', borderRadius: 14,
                        border: `2px solid ${difficulty === d.value ? d.color : 'var(--dc-border)'}`,
                        background: difficulty === d.value ? d.bg : 'white',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: difficulty === d.value ? d.color : 'var(--dc-text-light)',
                      }}>
                        {d.label}
                      </span>
                      {difficulty === d.value && (
                        <CheckCircle2 size={14} color={d.color} strokeWidth={2.5} />
                      )}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Points */}
              <Section
                title="Points récompensés"
                subtitle="Combien de points l'enfant gagne ?"
              >
                {/* Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                  {QUICK_POINTS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPoints(p)}
                      style={{
                        padding: '10px 4px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                        border: `2px solid ${points === p ? '#6C5CE7' : 'var(--dc-border)'}`,
                        background: points === p ? '#6C5CE7' : 'white',
                        color: points === p ? 'white' : 'var(--dc-text)',
                        cursor: 'pointer', transition: 'all 0.15s',
                        textAlign: 'center',
                      }}
                    >
                      {p} pts
                    </button>
                  ))}
                </div>

                {/* Valeur affichée + input manuel */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(108,92,231,0.06)', borderRadius: 14, padding: '12px 16px',
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 900, fontSize: 18, lineHeight: 1,
                  }}>
                    <Star size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} fill="rgba(255,255,255,0.5)" />
                    <span style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{points} pts</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dc-text-muted)', marginBottom: 6 }}>
                      Valeur personnalisée (1–100)
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={points}
                      onChange={e => {
                        const v = parseInt(e.target.value) || 1;
                        setPoints(Math.min(100, Math.max(1, v)));
                      }}
                      style={{
                        ...inputStyle,
                        padding: '10px 14px',
                        fontSize: 18,
                        fontWeight: 800,
                        textAlign: 'center',
                        color: '#6C5CE7',
                        background: 'white',
                        border: '2px solid rgba(108,92,231,0.25)',
                      }}
                    />
                  </div>
                </div>
              </Section>

              {/* Durée */}
              <Section title="Durée estimée" subtitle="Optionnel — en minutes">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                  {[15, 30, 45, 60].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDuration(duration === m ? undefined : m)}
                      style={{
                        padding: '10px 4px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                        border: `2px solid ${duration === m ? '#A29BFE' : 'var(--dc-border)'}`,
                        background: duration === m ? 'rgba(162,155,254,0.15)' : 'white',
                        color: duration === m ? '#6C5CE7' : 'var(--dc-text-light)',
                        cursor: 'pointer',
                      }}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={5} max={180}
                  value={duration || ''}
                  onChange={e => setDuration(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Ou entrez une durée personnalisée..."
                  style={inputStyle}
                />
              </Section>

              {/* Erreur */}
              {error && (
                <div style={{
                  background: '#FEF2F2', color: '#DC2626',
                  padding: '14px 16px', borderRadius: 14,
                  marginBottom: 16, fontSize: 14,
                  border: '1px solid #FECACA',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <AlertCircle size={16} strokeWidth={2} /> {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '18px', borderRadius: 18,
                  fontSize: 16, fontWeight: 900,
                  background: loading ? '#D1D5DB' : 'linear-gradient(135deg, #6C5CE7 0%, #00B894 100%)',
                  color: 'white', border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 8px 24px rgba(108,92,231,0.35)',
                  transition: 'all 0.2s',
                }}
              >
                {loading ? 'Création en cours...' : "Créer l'activité"}
              </button>

            </form>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default CreateActivityPage;
