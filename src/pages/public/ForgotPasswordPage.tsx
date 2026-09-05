import { useRkBack, useBackSwipe } from '../../hooks/useRkBack';
import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useAuthStore } from '../../stores/auth.store';

/** Réinitialiser — porté de la maquette Rekonect (écran forgot). */

const ForgotPasswordPage: React.FC = () => {
  const back = useRkBack('/login');
  const backSwipe = useBackSwipe(back);
  const { resetPassword, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    clearError();
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch { /* le message d'erreur vient du store */ }
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{
        minHeight: '100%', background: 'var(--rk-bg)', display: 'flex', flexDirection: 'column',
      }} {...backSwipe}>
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 26px 26px' }}>
          <button onClick={back} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 18,
          }}>← Connexion</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Réinitialiser
          </h1>
          <p style={{
            fontSize: 14, color: 'var(--rk-text2)', margin: '8px 0 0',
            lineHeight: 1.55, maxWidth: '32ch',
          }}>
            Indiquez votre email, nous vous envoyons un lien de réinitialisation.
          </p>
        </div>

        <div style={{
          flex: 1, background: 'var(--rk-surface)', borderRadius: '30px 30px 0 0',
          borderTop: '1px solid var(--rk-border)',
          padding: '28px 26px calc(40px + env(safe-area-inset-bottom))',
        }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 7 }}>Email</div>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vous@email.com"
              style={{
                width: '100%', height: 52, borderRadius: 14,
                border: `1.5px solid ${email ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
                background: 'var(--rk-surface)', padding: '0 15px',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--rk-raspsoft)', borderRadius: 14, padding: '12px 14px',
              fontSize: 13, color: 'var(--rk-rasp)', marginBottom: 16, lineHeight: 1.5,
            }}>{error}</div>
          )}

          {sent ? (
            <div style={{
              background: 'var(--rk-sagesoft)', borderRadius: 16, padding: 15,
              fontSize: 13, color: 'var(--rk-text2)', lineHeight: 1.55,
            }}>
              C'est envoyé. Ouvrez votre boîte mail et suivez le lien.
            </div>
          ) : (
            <button onClick={submit} disabled={isLoading || !email.includes('@')} style={{
              width: '100%', height: 54, borderRadius: 999,
              background: email.includes('@') ? 'var(--rk-indigo)' : 'var(--rk-surface2)',
              color: email.includes('@') ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: isLoading ? .6 : 1,
            }}>
              {isLoading ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          )}

          <div style={{
            background: 'var(--rk-surface2)', borderRadius: 16, padding: 15,
            fontSize: 12, color: 'var(--rk-text2)', lineHeight: 1.55, marginTop: 20,
          }}>
            Pensez à vérifier vos courriers indésirables. Le lien expire au bout d'une heure.
          </div>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ForgotPasswordPage;
