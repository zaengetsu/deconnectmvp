import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginFormData } from '../../lib/validations';
import { useAuthStore } from '../../stores/auth.store';

const LoginPage: React.FC = () => {
  const history = useHistory();
  const { signIn, isLoading, error, clearError } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await signIn(data.email, data.password);
      history.replace('/parent');
    } catch { /* error handled in store */ }
  };

  const inputStyle = (hasError = false): React.CSSProperties => ({
    width: '100%', padding: '14px 16px', borderRadius: 14, fontSize: 15,
    border: `2px solid ${hasError ? 'var(--dc-danger)' : 'var(--dc-border)'}`,
    background: 'var(--dc-bg)', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', color: 'var(--dc-text)',
    transition: 'border-color 0.15s, background 0.15s',
  });

  return (
    <IonPage>
      <IonContent fullscreen scrollY>
        <style>{`
          .lp-input:focus { border-color: var(--dc-primary) !important; background: white !important; }
        `}</style>

        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          background: 'var(--dc-bg)',
        }}>
          {/* ── Header ── */}
          <div style={{
            padding: 'calc(env(safe-area-inset-top) + 24px) 24px 32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Decorative orb */}
            <div style={{
              position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
              width: 220, height: 220, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(108,92,231,0.1) 0%, transparent 60%)',
              pointerEvents: 'none',
            }} />

            {/* Logo */}
            <div style={{
              width: 60, height: 60, borderRadius: 18,
              background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 24px rgba(108,92,231,0.25)',
              marginBottom: 16, zIndex: 1,
            }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: -1 }}>D</span>
            </div>
            <h1 style={{ color: 'var(--dc-text)', fontSize: 26, fontWeight: 900, margin: '0 0 4px', zIndex: 1 }}>
              Connexion
            </h1>
            <p style={{ color: 'var(--dc-text-muted)', fontSize: 14, zIndex: 1 }}>
              Espace parent
            </p>
          </div>

          {/* ── Form card ── */}
          <div className="dc-animate-in" style={{
            flex: 1, background: 'white', borderRadius: '28px 28px 0 0',
            padding: '28px 24px 48px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
          }}>
            {error && (
              <div onClick={clearError} style={{
                background: 'var(--dc-danger-light)', color: 'var(--dc-danger)',
                padding: '12px 16px', borderRadius: 14, marginBottom: 20,
                fontSize: 14, cursor: 'pointer', fontWeight: 600,
                borderLeft: '3px solid var(--dc-danger)',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>
                  Email
                </label>
                <input
                  {...register('email')} type="email" placeholder="parent@email.com"
                  className="lp-input"
                  style={inputStyle(!!errors.email)}
                />
                {errors.email && <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors.email.message}</p>}
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>
                  Mot de passe
                </label>
                <input
                  {...register('password')} type="password" placeholder="••••••••"
                  className="lp-input"
                  style={inputStyle(!!errors.password)}
                />
                {errors.password && <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors.password.message}</p>}
              </div>

              <button type="button" onClick={() => history.push('/forgot-password')}
                style={{
                  background: 'none', border: 'none', color: 'var(--dc-primary)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '10px 0 24px',
                }}>
                Mot de passe oublié ?
              </button>

              <button type="submit" className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg" disabled={isLoading}>
                {isLoading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 28, fontSize: 14, color: 'var(--dc-text-light)' }}>
              Pas encore de compte ?{' '}
              <button onClick={() => history.push('/register')}
                style={{ background: 'none', border: 'none', color: 'var(--dc-primary)', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 14 }}>
                S'inscrire
              </button>
            </p>
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 14, color: 'var(--dc-text-light)' }}>
              Invité(e) par un parent ?{' '}
              <button onClick={() => history.push('/join-family')}
                style={{ background: 'none', border: 'none', color: 'var(--dc-primary)', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 14 }}>
                Entrer mon code
              </button>
            </p>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default LoginPage;
