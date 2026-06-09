import React, { useEffect, useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import { rewardsService } from '../../features/rewards/rewards.service';

import { ArrowLeft, Gift, Star, Zap, Gamepad2, Film, Music, Bike, Book, Pizza, AlertCircle } from 'lucide-react';
import type { Child } from '../../types/database.types';

// ─── Icon categories instead of emojis ─────────────────────────
const ICON_OPTIONS = [
  { id: 'gift',    Icon: Gift,     label: 'Cadeau',  color: '#FDCB6E' },
  { id: 'star',    Icon: Star,     label: 'Étoile',  color: '#A29BFE' },
  { id: 'zap',     Icon: Zap,      label: 'Énergie', color: '#6C5CE7' },
  { id: 'game',    Icon: Gamepad2, label: 'Jeu',     color: '#00B894' },
  { id: 'film',    Icon: Film,     label: 'Film',    color: '#E17055' },
  { id: 'music',   Icon: Music,    label: 'Musique', color: '#FD79A8' },
  { id: 'bike',    Icon: Bike,     label: 'Sport',   color: '#0984E3' },
  { id: 'book',    Icon: Book,     label: 'Livre',   color: '#6C5CE7' },
  { id: 'pizza',   Icon: Pizza,    label: 'Repas',   color: '#E17055' },
];

const QUICK_POINTS = [25, 50, 100, 150, 200, 300];

const CreateRewardPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [points, setPoints] = useState(50);
  const [childId, setChildId] = useState<string | undefined>(undefined);
  const [iconId, setIconId] = useState('gift');

  useEffect(() => {
    if (user) {
      childrenService.getChildren(user.id)
        .then(c => { if (mounted.current) setChildren(c); })
        .catch(() => {});
    }
  }, [user?.id]);


  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Le titre est requis'); return; }
    if (title.trim().length < 3) { setError('Le titre doit contenir au moins 3 caractères'); return; }
    if (points < 10 || points > 1000) { setError('Les points doivent être entre 10 et 1000'); return; }

    if (!user) { setError('Session introuvable — veuillez vous reconnecter'); return; }

    setLoading(true);
    setError(null);
    try {
      await rewardsService.createReward(user.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        required_points: points,
        child_id: childId || undefined,
      });
      if (mounted.current) history.replace('/parent/rewards');
    } catch (err) {
      if (mounted.current) {
        const msg = err instanceof Error ? err.message : 'Une erreur est survenue';
        setError(msg);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const selectedIcon = ICON_OPTIONS.find(o => o.id === iconId) || ICON_OPTIONS[0];
  const SelectedIconCmp = selectedIcon.Icon;

  const inp: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '1.5px solid #e5e5e7', fontSize: 15, background: '#fafafa',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1d1d1f',
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY>
        <style>{`
          .crp-input:focus { border-color: #6C5CE7 !important; background: white !important; }
          .crp-btn:active { transform: scale(0.97); }
        `}</style>

        {/* ── Dark header (consistent with Login/Register) ── */}
        <div style={{
          background: '#0f0e17', padding: '52px 24px 32px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 180, height: 180,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${selectedIcon.color}30 0%, transparent 65%)`,
            pointerEvents: 'none', transition: 'background 0.3s',
          }} />

          {/* Back button */}
          <button onClick={() => history.goBack()} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '8px 14px', color: 'rgba(255,255,255,0.7)',
            fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 24,
          }}>
            <ArrowLeft size={14} strokeWidth={2} />
            Retour
          </button>

          {/* Icon preview */}
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: `${selectedIcon.color}20`,
            border: `1.5px solid ${selectedIcon.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14, transition: 'all 0.3s',
          }}>
            <SelectedIconCmp size={26} color={selectedIcon.color} strokeWidth={1.8} />
          </div>

          <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 6px', letterSpacing: -0.4 }}>
            Nouvelle récompense
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
            Motivez vos enfants
          </p>
        </div>

        {/* ── White form card ── */}
        <div style={{
          background: 'white', borderRadius: '24px 24px 0 0',
          padding: '28px 24px 60px', marginTop: -16,
        }}>
          <form onSubmit={onSubmit}>

            {/* ── Icon picker ── */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#3d3d3f' }}>
                Catégorie
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ICON_OPTIONS.map(({ id, Icon, label, color }) => {
                  const active = iconId === id;
                  return (
                    <button key={id} type="button" onClick={() => setIconId(id)}
                      className="crp-btn"
                      style={{
                        width: 52, height: 52, borderRadius: 14, cursor: 'pointer',
                        border: `2px solid ${active ? color : '#e5e5e7'}`,
                        background: active ? `${color}12` : '#fafafa',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 2, transition: 'all 0.15s', flexShrink: 0,
                      }}
                      title={label}
                    >
                      <Icon size={20} color={active ? color : '#94a3b8'} strokeWidth={1.8} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Title ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>
                Titre <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                className="crp-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex : Choisir le repas du soir"
                style={inp}
                autoFocus
              />
            </div>

            {/* ── Description ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>
                Description{' '}
                <span style={{ fontWeight: 400, color: '#aeaeb2' }}>(optionnel)</span>
              </label>
              <textarea
                className="crp-input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Détails de la récompense..."
                rows={2}
                style={{ ...inp, resize: 'none' }}
              />
            </div>

            {/* ── Points ── */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#3d3d3f' }}>
                Points requis
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {QUICK_POINTS.map(p => (
                  <button key={p} type="button" onClick={() => setPoints(p)}
                    className="crp-btn"
                    style={{
                      padding: '9px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                      border: `2px solid ${points === p ? '#6C5CE7' : '#e5e5e7'}`,
                      background: points === p ? 'rgba(108,92,231,0.08)' : '#fafafa',
                      color: points === p ? '#6C5CE7' : '#6e6e73',
                      cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
                    }}
                  >
                    {p} pts
                  </button>
                ))}
              </div>
              <input
                type="number" min={10} max={1000} value={points}
                onChange={e => setPoints(Math.min(1000, Math.max(10, parseInt(e.target.value) || 10)))}
                style={inp}
                className="crp-input"
              />
            </div>

            {/* ── Child selector ── */}
            {children.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#3d3d3f' }}>
                  Pour quel enfant ?
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" onClick={() => setChildId(undefined)}
                    className="crp-btn"
                    style={{
                      padding: '9px 16px', borderRadius: 50, fontSize: 14, fontWeight: 600,
                      border: `2px solid ${!childId ? '#6C5CE7' : '#e5e5e7'}`,
                      background: !childId ? 'rgba(108,92,231,0.08)' : '#fafafa',
                      color: !childId ? '#6C5CE7' : '#6e6e73',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    Tous les enfants
                  </button>
                  {children.map(c => (
                    <button key={c.id} type="button" onClick={() => setChildId(c.id)}
                      className="crp-btn"
                      style={{
                        padding: '9px 16px', borderRadius: 50, fontSize: 14, fontWeight: 600,
                        border: `2px solid ${childId === c.id ? '#6C5CE7' : '#e5e5e7'}`,
                        background: childId === c.id ? 'rgba(108,92,231,0.08)' : '#fafafa',
                        color: childId === c.id ? '#6C5CE7' : '#6e6e73',
                        cursor: 'pointer', transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#6C5CE7', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {c.display_name?.[0]?.toUpperCase() || '?'}
                      </span>
                      {c.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {error && (
              <div style={{
                background: '#FEF2F2', color: '#DC2626', padding: '12px 16px',
                borderRadius: 10, marginBottom: 16, fontSize: 14,
                display: 'flex', alignItems: 'center', gap: 8,
                borderLeft: '3px solid #DC2626',
              }}>
                <AlertCircle size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            {/* ── Submit ── */}
            <button
              type="submit" disabled={loading}
              className="crp-btn"
              style={{
                width: '100%', padding: '15px', borderRadius: 12, fontSize: 16, fontWeight: 700,
                background: loading ? '#e5e5e7' : 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                color: loading ? '#94a3b8' : 'white', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer', transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Création...' : 'Créer la récompense'}
            </button>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default CreateRewardPage;
