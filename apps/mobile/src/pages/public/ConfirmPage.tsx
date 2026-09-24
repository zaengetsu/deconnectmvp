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
        <div className="rk-app rk-screen" style={{
          minHeight: '100vh', background: 'var(--rk-bg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 32, textAlign: 'center',
        }}>
          <div style={{ width: 52, height: 52, position: 'relative', marginBottom: 26 }}>
            <div style={{ position: 'absolute', left: 0, top: 13, width: 29, height: 29, borderRadius: '50%', border: '3px solid var(--rk-indigo)' }} />
            <div style={{ position: 'absolute', left: 19, top: 13, width: 29, height: 29, borderRadius: '50%', border: '3px solid var(--rk-accent)' }} />
          </div>

          <div style={{
            width: 72, height: 72, borderRadius: 24, marginBottom: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: status === 'success' ? 'var(--rk-sagesoft)'
              : status === 'error' ? 'var(--rk-raspsoft)' : 'var(--rk-indigosoft)',
          }}>
            {status === 'loading' && <Loader size={30} color="var(--rk-indigo)" strokeWidth={2} />}
            {status === 'success' && <CheckCircle size={30} color="var(--rk-sage)" strokeWidth={2} />}
            {status === 'error' && <XCircle size={30} color="var(--rk-rasp)" strokeWidth={2} />}
          </div>

          <h1 style={{
            fontSize: 25, fontWeight: 800, letterSpacing: '-.03em',
            margin: 0, color: 'var(--rk-text)',
          }}>
            {status === 'loading' && 'Vérification…'}
            {status === 'success' && 'Compte confirmé'}
            {status === 'error' && 'Lien invalide'}
          </h1>

          <p style={{
            fontSize: 14, color: 'var(--rk-text2)', lineHeight: 1.55,
            margin: '10px 0 0', maxWidth: '30ch',
          }}>
            {status === 'loading' && 'Un instant, nous validons votre lien.'}
            {status === 'success' && 'Bienvenue dans Rekonect. Redirection en cours…'}
            {status === 'error' && (errorMsg || 'Ce lien a expiré. Demandez-en un nouveau depuis la connexion.')}
          </p>

          {status === 'error' && (
            <button onClick={() => history.replace('/login')} style={{
              width: '100%', maxWidth: 300, height: 54, borderRadius: 999, marginTop: 26,
              background: 'var(--rk-indigo)', color: 'var(--rk-indigofg)',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              Retour à la connexion
            </button>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ConfirmPage;
