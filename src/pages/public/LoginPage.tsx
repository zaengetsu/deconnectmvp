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

  const inp = (hasError = false) => ({
    width: '100%', padding: '14px 16px', borderRadius: 12, fontSize: 15,
    border: `1.5px solid ${hasError ? '#DC2626' : '#e5e5e7'}`,
    background: '#fafafa', outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: 'inherit', color: '#1d1d1f',
    transition: 'border-color 0.15s',
  });

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <style>{`
          @keyframes lp-in { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
          .lp-card { animation: lp-in 0.45s ease both; }
          .lp-input:focus { border-color: #6C5CE7 !important; background: white !important; }
          .lp-btn { width:100%; padding:15px; border-radius:12px; border:none;
            font-size:16px; font-weight:700; cursor:pointer; letter-spacing:-0.2px;
            background: linear-gradient(135deg,#6C5CE7,#A29BFE); color:white;
            transition: opacity 0.15s, transform 0.15s; }
          .lp-btn:active { transform:scale(0.98); }
          .lp-btn:disabled { opacity:0.55; cursor:not-allowed; }
        `}</style>

        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {/* Dark header */}
          <div style={{
            background: '#0f0e17', padding: '60px 24px 40px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Orb */}
            <div style={{
              position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
              width: 200, height: 200, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(108,92,231,0.2) 0%, transparent 65%)',
              pointerEvents: 'none',
            }} />
            {/* Logo mark */}
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 28px rgba(108,92,231,0.4)',
              marginBottom: 16, zIndex: 1,
            }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: 'white', letterSpacing: -1 }}>D</span>
            </div>
            <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: 0, zIndex: 1 }}>Connexion</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 6, zIndex: 1 }}>
              Espace parent
            </p>
          </div>

          {/* Form card */}
          <div className="lp-card" style={{
            flex: 1, background: 'white', borderRadius: '24px 24px 0 0',
            padding: '32px 24px 48px', marginTop: -16,
          }}>
            {error && (
              <div onClick={clearError} style={{
                background: '#FEF2F2', color: '#DC2626', padding: '12px 16px',
                borderRadius: 10, marginBottom: 20, fontSize: 14, cursor: 'pointer',
                borderLeft: '3px solid #DC2626',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>
                  Email
                </label>
                <input
                  {...register('email')} type="email" placeholder="parent@email.com"
                  className="lp-input"
                  style={inp(!!errors.email)}
                />
                {errors.email && <p style={{ color: '#DC2626', fontSize: 12, marginTop: 4 }}>{errors.email.message}</p>}
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>
                  Mot de passe
                </label>
                <input
                  {...register('password')} type="password" placeholder="••••••••"
                  className="lp-input"
                  style={inp(!!errors.password)}
                />
                {errors.password && <p style={{ color: '#DC2626', fontSize: 12, marginTop: 4 }}>{errors.password.message}</p>}
              </div>

              <button type="button" onClick={() => history.push('/forgot-password')}
                style={{
                  background: 'none', border: 'none', color: '#6C5CE7',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 0 24px',
                }}>
                Mot de passe oublié ?
              </button>

              <button type="submit" className="lp-btn" disabled={isLoading}>
                {isLoading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: '#6e6e73' }}>
              Pas encore de compte ?{' '}
              <button onClick={() => history.push('/register')}
                style={{ background: 'none', border: 'none', color: '#6C5CE7', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 14 }}>
                S'inscrire
              </button>
            </p>
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 14, color: '#6e6e73' }}>
              Invité(e) par un parent ?{' '}
              <button onClick={() => history.push('/join-family')}
                style={{ background: 'none', border: 'none', color: '#6C5CE7', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 14 }}>
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
