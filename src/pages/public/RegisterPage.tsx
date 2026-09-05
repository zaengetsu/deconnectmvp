import { useRkBack, useBackSwipe } from '../../hooks/useRkBack';
import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

/** Créer un compte — porté de la maquette Rekonect (écran register). */

/** Force du mot de passe : longueur, majuscule, chiffre, caractère spécial. */
const strengthOf = (pwd: string) => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
};

const RegisterPage: React.FC = () => {
  const history = useHistory();
  const back = useRkBack('/onboarding');
  const backSwipe = useBackSwipe(back);
  const { signUp, isLoading, error, clearError } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  const score = strengthOf(password);
  const valid = fullName.trim().length >= 2 && email.includes('@') && score >= 3 && accepted;

  const submit = async () => {
    if (!valid) return;
    clearError();
    try {
      await signUp(email.trim(), password, fullName.trim());
      history.replace('/parent/create-child');
    } catch { /* le message d'erreur vient du store */ }
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 7 };
  const field = (filled: boolean): React.CSSProperties => ({
    width: '100%', height: 52, borderRadius: 14,
    border: `1.5px solid ${filled ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
    background: 'var(--rk-surface)', padding: '0 15px',
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
  });

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{
        minHeight: '100%', background: 'var(--rk-bg)', display: 'flex', flexDirection: 'column',
      }} {...backSwipe}>
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 26px 26px' }}>
          <button onClick={() => back()} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 18,
          }}>← Retour</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Créer un compte
          </h1>
          <p style={{ fontSize: 14, color: 'var(--rk-text3)', margin: '6px 0 0' }}>
            Vous serez l'administrateur de la famille
          </p>
        </div>

        <div style={{
          flex: 1, background: 'var(--rk-surface)', borderRadius: '30px 30px 0 0',
          borderTop: '1px solid var(--rk-border)',
          padding: '28px 26px calc(40px + env(safe-area-inset-bottom))',
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={label}>Prénom et nom</div>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Marie Dupont" style={field(!!fullName)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={label}>Email</div>
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="vous@email.com" style={field(!!email)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={label}>Mot de passe</div>
            <input type="password" autoComplete="new-password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              style={{ ...field(!!password), letterSpacing: password ? '.2em' : 'normal', fontSize: 16 }} />

            <div style={{ display: 'flex', gap: 4, marginTop: 9 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i < score ? 'var(--rk-sage)' : 'var(--rk-border)',
                }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 6 }}>
              8 caractères minimum, une majuscule, un chiffre
            </div>
          </div>

          <button onClick={() => setAccepted(!accepted)} style={{
            display: 'flex', gap: 11, marginBottom: 22, width: '100%', textAlign: 'left',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
              background: accepted ? 'var(--rk-indigo)' : 'transparent',
              border: accepted ? 'none' : '2px solid var(--rk-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {accepted && (
                <div style={{
                  width: 10, height: 6, borderLeft: '2.5px solid #fff', borderBottom: '2.5px solid #fff',
                  transform: 'rotate(-45deg) translate(1px,-2px)',
                }} />
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--rk-text2)', lineHeight: 1.5 }}>
              J'accepte les conditions d'utilisation et la politique de confidentialité.
            </div>
          </button>

          {error && (
            <div style={{
              background: 'var(--rk-raspsoft)', borderRadius: 14, padding: '12px 14px',
              fontSize: 13, color: 'var(--rk-rasp)', marginBottom: 16, lineHeight: 1.5,
            }}>{error}</div>
          )}

          <button onClick={submit} disabled={!valid || isLoading} style={{
            width: '100%', height: 54, borderRadius: 999,
            background: valid ? 'var(--rk-indigo)' : 'var(--rk-surface2)',
            color: valid ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
            fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: isLoading ? .6 : 1,
          }}>
            {isLoading ? 'Création…' : 'Créer mon compte'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--rk-text3)', marginTop: 22 }}>
            Déjà inscrit ?{' '}
            <button onClick={() => history.push('/login')} style={{
              fontSize: 14, fontWeight: 800, color: 'var(--rk-indigo)',
            }}>Se connecter</button>
          </div>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default RegisterPage;
