import { useRkBack, useBackSwipe } from '../../hooks/useRkBack';
import React, { useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/** Rejoindre une famille — porté de la maquette Rekonect (écran join). */

const LENGTH = 6;

const JoinFamilyPage: React.FC = () => {
  const history = useHistory();
  const back = useRkBack('/login');
  const backSwipe = useBackSwipe(back);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (code.length < LENGTH) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('accept_family_invitation', { p_token: code });
      if (rpcError) throw rpcError;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result && result.success === false) {
        setError(result.error || 'Code invalide');
        return;
      }
      history.replace('/parent/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Code invalide');
    } finally {
      setLoading(false);
    }
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
            Rejoindre une famille
          </h1>
          <p style={{
            fontSize: 14, color: 'var(--rk-text2)', margin: '8px 0 0',
            lineHeight: 1.55, maxWidth: '32ch',
          }}>
            Entrez le code à {LENGTH} caractères transmis par le parent administrateur.
          </p>
        </div>

        <div style={{
          flex: 1, background: 'var(--rk-surface)', borderRadius: '30px 30px 0 0',
          borderTop: '1px solid var(--rk-border)',
          padding: '32px 26px calc(40px + env(safe-area-inset-bottom))',
        }}>
          {/* Champ invisible : les cases ci-dessous sont l'affichage du code saisi */}
          <input
            ref={inputRef}
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH))}
            autoCapitalize="characters"
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0 }}
          />

          <div onClick={() => inputRef.current?.focus()} style={{ display: 'flex', gap: 8, marginBottom: 26 }}>
            {Array.from({ length: LENGTH }, (_, i) => {
              const char = code[i];
              return (
                <div key={i} style={{
                  flex: 1, aspectRatio: '.8', borderRadius: 14,
                  border: `1.5px solid ${char ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
                  background: char ? 'var(--rk-surface)' : 'var(--rk-surface2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 24, fontWeight: 700,
                  color: 'var(--rk-text)',
                }}>{char ?? ''}</div>
              );
            })}
          </div>

          {error && (
            <div style={{
              background: 'var(--rk-raspsoft)', borderRadius: 14, padding: '12px 14px',
              fontSize: 13, color: 'var(--rk-rasp)', marginBottom: 16, lineHeight: 1.5,
            }}>{error}</div>
          )}

          <button onClick={submit} disabled={code.length < LENGTH || loading} style={{
            width: '100%', height: 54, borderRadius: 999,
            background: code.length === LENGTH ? 'var(--rk-indigo)' : 'var(--rk-surface2)',
            color: code.length === LENGTH ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
            fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: loading ? .6 : 1,
          }}>
            {loading ? 'Vérification…' : 'Rejoindre'}
          </button>

          <div style={{
            textAlign: 'center', fontSize: 13, color: 'var(--rk-text3)',
            marginTop: 20, lineHeight: 1.55,
          }}>
            Vous pourrez valider les activités mais pas modifier l'abonnement.
          </div>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default JoinFamilyPage;
