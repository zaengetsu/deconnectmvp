import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { Halo, LogoMark, Pattern, Rings, tint } from '@rekonect/brand';

/** Connexion — porté de la maquette Rekonect (écran login). */

const LoginPage: React.FC = () => {
  const history = useHistory();
  const { signIn, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  const submit = async () => {
    clearError();
    try {
      await signIn(email.trim(), password);
      history.replace('/parent/dashboard');
    } catch { /* le message d'erreur vient du store */ }
  };

  const label: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 7,
  };
  const field = (focused: boolean): React.CSSProperties => ({
    width: '100%', height: 52, borderRadius: 14,
    border: `1.5px solid ${focused ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
    background: 'var(--rk-surface)', padding: '0 15px',
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
  });

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{
        minHeight: '100%', background: 'var(--rk-bg)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 30px) 26px 34px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <Pattern kind="arcs" fade={180} fadeStop={70} line={tint('var(--rk-indigo)', 0.12)} accent={tint('var(--rk-accent)', 0.28)} />
          <Rings at={{ x: '50%', y: 'calc(env(safe-area-inset-top) + 56px)' }} size={260} color="var(--rk-indigo)" strength={0.55} />
          <Halo at={{ x: '50%', y: 'calc(env(safe-area-inset-top) + 56px)' }} size={150} color="var(--rk-accent)" intensity={0.3} />
          <LogoMark size={52} a="var(--rk-indigo)" b="var(--rk-accent)" stroke={3} style={{ display: 'block', margin: '0 auto 18px' }} />
          <h1 style={{ position: 'relative', fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Bon retour
          </h1>
          <p style={{ position: 'relative', fontSize: 14, color: 'var(--rk-text3)', margin: '6px 0 0' }}>Espace parent</p>
        </div>

        <div style={{
          flex: 1, background: 'var(--rk-surface)', borderRadius: '30px 30px 0 0',
          borderTop: '1px solid var(--rk-border)',
          padding: '28px 26px calc(40px + env(safe-area-inset-bottom))',
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={label}>Email</div>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vous@email.com"
              style={field(!!email)}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={label}>Mot de passe</div>
            <div style={{
              height: 52, borderRadius: 14,
              border: `1.5px solid ${password ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
              background: 'var(--rk-surface)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '0 15px',
            }}>
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 16, fontFamily: 'inherit', color: 'var(--rk-text)',
                }}
              />
              <button onClick={() => setShow(!show)} style={{
                fontSize: 12, fontWeight: 700, color: 'var(--rk-indigo)', flexShrink: 0, paddingLeft: 10,
              }}>{show ? 'Cacher' : 'Voir'}</button>
            </div>
          </div>

          <button onClick={() => history.push('/forgot-password')} style={{
            fontSize: 13, fontWeight: 700, color: 'var(--rk-indigo)', padding: '10px 0 24px',
          }}>Mot de passe oublié ?</button>

          {error && (
            <div style={{
              background: 'var(--rk-raspsoft)', borderRadius: 14, padding: '12px 14px',
              fontSize: 13, color: 'var(--rk-rasp)', marginBottom: 16, lineHeight: 1.5,
            }}>{error}</div>
          )}

          <button
            onClick={submit}
            disabled={isLoading || !email || !password}
            style={{
              width: '100%', height: 54, borderRadius: 999,
              background: email && password ? 'var(--rk-indigo)' : 'var(--rk-surface2)',
              color: email && password ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: isLoading ? .6 : 1,
            }}
          >
            {isLoading ? 'Connexion…' : 'Se connecter'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--rk-text3)', marginTop: 26 }}>
            Pas encore de compte ?{' '}
            <button onClick={() => history.push('/register')} style={{
              fontSize: 14, fontWeight: 800, color: 'var(--rk-indigo)',
            }}>S'inscrire</button>
          </div>

          <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--rk-text3)', marginTop: 10 }}>
            Invité par un parent ?{' '}
            <button onClick={() => history.push('/join-family')} style={{
              fontSize: 14, fontWeight: 800, color: 'var(--rk-indigo)',
            }}>Entrer mon code</button>
          </div>

          <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--rk-text3)', marginTop: 10 }}>
            C'est le téléphone d'un enfant ?{' '}
            <button onClick={() => history.push('/child-link')} style={{
              fontSize: 14, fontWeight: 800, color: 'var(--rk-accent)',
            }}>Scanner le QR</button>
          </div>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default LoginPage;
