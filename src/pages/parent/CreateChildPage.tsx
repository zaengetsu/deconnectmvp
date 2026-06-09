import React, { useEffect, useState, useRef } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';

const AVATAR_COLORS: string[] = [
  '#1565C0', '#34C759', '#F59E0B', '#8B5CF6',
  '#EC4899', '#F97316', '#0EA5E9', '#EF4444',
];

const CreateChildPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState(10);
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation front-end
    if (!displayName.trim()) { setError('Le prénom est requis'); return; }
    if (displayName.trim().length < 2) { setError('Le prénom doit contenir au moins 2 caractères'); return; }

    if (!user) {
      const msg = 'Session introuvable — veuillez vous reconnecter';
      setError(msg);
      alert(msg);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await childrenService.createChild({
        parent_id: user.id,
        display_name: displayName.trim(),
        age,
        avatar_url: selectedColor,
      });
      if (mounted.current) history.replace('/parent/children');
    } catch (e: any) {
      const msg = e?.message || 'Erreur inconnue';
      const code = e?.code ? ` [${e.code}]` : '';
      const detail = e?.details ? ` — ${e.details}` : '';
      const hint = e?.hint ? ` (${e.hint})` : '';
      const fullMsg = `ERREUR: ${msg}${code}${detail}${hint}`;
      alert(fullMsg); // Alert natif iOS — toujours visible
      if (mounted.current) setError(fullMsg);
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '2px solid var(--dc-border)', fontSize: 15,
    background: 'white', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--dc-font)', color: 'var(--dc-text)',
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ minHeight: '100vh', background: 'var(--dc-bg)', padding: '0 0 100px' }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--dc-primary) 0%, var(--dc-primary-light) 100%)',
            padding: '60px 24px 32px', color: 'white', marginBottom: 24,
          }}>
            <button onClick={() => history.goBack()} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12,
              padding: '8px 16px', color: 'white', fontSize: 14, cursor: 'pointer', marginBottom: 16,
            }}>← Retour</button>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Nouveau profil</h1>
            <p style={{ opacity: 0.85, fontSize: 14, margin: '4px 0 0' }}>Créez un espace pour votre enfant</p>
          </div>

          <div style={{ padding: '0 24px' }}>
            {/* Avatar preview */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--dc-text)' }}>
                Couleur du profil
              </label>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', background: selectedColor,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 28, fontWeight: 900, color: 'white',
                }}>
                  {displayName.trim() ? displayName.trim()[0].toUpperCase() : '?'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {AVATAR_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => setSelectedColor(color)} style={{
                    width: 44, height: 44, borderRadius: '50%', background: color,
                    border: `3px solid ${selectedColor === color ? '#111' : 'transparent'}`,
                    cursor: 'pointer', transform: selectedColor === color ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.2s',
                  }} />
                ))}
              </div>
            </div>

            <form onSubmit={onSubmit}>
              {/* Name */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--dc-text)' }}>
                  Prénom ou pseudo *
                </label>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Ex : Lucas, Zoé..."
                  style={inp}
                />
              </div>

              {/* Age */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--dc-text)' }}>
                  Âge <span style={{ color: 'var(--dc-text-muted)', fontWeight: 400 }}>(7–18 ans)</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(a => (
                    <button key={a} type="button" onClick={() => setAge(a)} style={{
                      padding: '11px 0', borderRadius: 12, fontSize: 15, fontWeight: 700,
                      border: `2px solid ${age === a ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
                      background: age === a ? 'var(--dc-primary)' : 'white',
                      color: age === a ? 'white' : 'var(--dc-text)',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: '#FEE2E2', color: '#DC2626', padding: '12px 16px',
                  borderRadius: 12, marginBottom: 16, fontSize: 13, wordBreak: 'break-all',
                }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '16px', borderRadius: 16, fontSize: 16, fontWeight: 800,
                background: loading ? '#ccc' : 'linear-gradient(135deg, var(--dc-primary), var(--dc-primary-light))',
                color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              }}>
                {loading ? 'Création...' : 'Créer le profil'}
              </button>
            </form>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default CreateChildPage;
