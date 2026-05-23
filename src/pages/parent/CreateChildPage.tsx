import React, { useEffect, useState, useRef } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { childSchema, type ChildFormData } from '../../lib/validations';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';

// Avatar colors — child picks a color, their initials will show in it
const AVATAR_COLORS = [
  '#1565C0', '#34C759', '#F59E0B', '#8B5CF6',
  '#EC4899', '#F97316', '#0EA5E9', '#EF4444',
] as const;
type AvatarColor = typeof AVATAR_COLORS[number];


const CreateChildPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<AvatarColor>(AVATAR_COLORS[0]);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const { register, handleSubmit, control, formState: { errors } } = useForm<ChildFormData>({
    resolver: zodResolver(childSchema),
    defaultValues: { age: 10 },
  });

  const onSubmit = async (data: ChildFormData) => {
    if (!user) { setError('Non connecté'); return; }
    setLoading(true);
    setError(null);
    try {
      await childrenService.createChild({
        parent_id: user.id,
        display_name: data.display_name,
        age: data.age,
        avatar_url: selectedColor, // store the color hex; initials rendered in UI
      });
      if (mounted.current) history.replace('/parent/children');
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Erreur de création');
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const inp = (err: boolean) => ({
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: `2px solid ${err ? 'var(--dc-danger)' : 'var(--dc-border)'}`,
    fontSize: 15, background: 'white', outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: 'var(--dc-font)', color: 'var(--dc-text)',
    transition: 'border-color 0.2s',
  });

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
            {/* Avatar selector */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--dc-text)' }}>
                Avatar de votre enfant
              </label>
              {/* Color picker */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: selectedColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 32, fontWeight: 900, color: 'white' }}>
                  ?
                </div>
                <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 8 }}>Couleur du profil</p>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {AVATAR_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => setSelectedColor(color)} style={{ width: 44, height: 44, borderRadius: '50%', background: color, border: `3px solid ${selectedColor === color ? 'var(--dc-text)' : 'transparent'}`, cursor: 'pointer', boxShadow: selectedColor === color ? `0 2px 12px ${color}60` : 'none', transform: selectedColor === color ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.2s' }} />
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--dc-text)' }}>
                  Prénom ou pseudo
                </label>
                <input
                  {...register('display_name')}
                  placeholder="Ex : Lucas, Zoé..."
                  style={inp(!!errors.display_name)}
                  autoFocus
                />
                {errors.display_name && <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 4 }}>{errors.display_name.message}</p>}
              </div>

              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--dc-text)' }}>
                  Âge <span style={{ color: 'var(--dc-text-muted)', fontWeight: 400 }}>(9–14 ans)</span>
                </label>
                <Controller name="age" control={control} render={({ field }) => (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[9, 10, 11, 12, 13, 14].map(a => (
                      <button key={a} type="button"
                        onClick={() => field.onChange(a)}
                        style={{
                          flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 15, fontWeight: 700,
                          border: `2px solid ${field.value === a ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
                          background: field.value === a ? 'var(--dc-primary)' : 'white',
                          color: field.value === a ? 'white' : 'var(--dc-text)',
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                        {a}
                      </button>
                    ))}
                  </div>
                )} />
                {errors.age && <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 4 }}>{errors.age.message}</p>}
              </div>

              {error && (
                <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontSize: 14 }}>
                  {error}
                </div>
              )}

              <button type="submit" className="dc-btn dc-btn-primary dc-btn-full" disabled={loading}
                style={{ opacity: loading ? 0.7 : 1, fontSize: 16 }}>
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
