import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

// Cette page intercepte le lien de confirmation envoyé par Supabase Auth.
// L'URL a la forme : /confirm#access_token=...&type=signup
// Supabase gère automatiquement le token via onAuthStateChange.

const ConfirmPage: React.FC = () => {
  const history = useHistory();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Supabase parse le fragment #access_token automatiquement
    // onAuthStateChange reçoit EMAIL_OTP_VERIFIED ou SIGNED_IN si valide
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session?.user) {
          setStatus('success');
          // Redirige vers le parent dashboard après 2s
          setTimeout(() => history.replace('/parent'), 2000);
        }
      }
    });

    // Fallback : si la session est déjà active au chargement
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setStatus('error');
        setErrorMsg('Lien invalide ou expiré.');
        return;
      }
      if (session?.user) {
        setStatus('success');
        setTimeout(() => history.replace('/parent'), 2000);
      }
      // Sinon on attend onAuthStateChange
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 32px',
          background: 'var(--dc-bg)',
          textAlign: 'center',
        }}>

          {/* Loading */}
          {status === 'loading' && (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: 22,
                background: 'var(--dc-blue-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}>
                <Loader size={32} color="var(--dc-blue)" strokeWidth={1.8}
                  style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                Confirmation en cours...
              </h1>
              <p style={{ color: 'var(--dc-text-light)', fontSize: 15 }}>
                Veuillez patienter un instant.
              </p>
            </>
          )}

          {/* Success */}
          {status === 'success' && (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: 22,
                background: 'var(--dc-green-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24,
              }}>
                <CheckCircle size={36} color="var(--dc-green)" strokeWidth={1.8} />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                Compte confirmé !
              </h1>
              <p style={{ color: 'var(--dc-text-light)', fontSize: 15, lineHeight: 1.6 }}>
                Votre adresse email a été vérifiée.<br />
                Vous allez être redirigé automatiquement.
              </p>
            </>
          )}

          {/* Error */}
          {status === 'error' && (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: 22,
                background: 'var(--dc-danger-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24,
              }}>
                <XCircle size={36} color="var(--dc-danger)" strokeWidth={1.8} />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                Lien invalide
              </h1>
              <p style={{ color: 'var(--dc-text-light)', fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
                {errorMsg || 'Ce lien de confirmation est invalide ou a expiré.'}
              </p>
              <button
                className="dc-btn dc-btn-primary"
                style={{ width: '100%', maxWidth: 280 }}
                onClick={() => history.replace('/register')}
              >
                Recommencer l'inscription
              </button>
            </>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default ConfirmPage;
