import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { KeyRound, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

type Step = 'request' | 'confirm' | 'done';

const ForgotPasswordPage: React.FC = () => {
  const history = useHistory();
  const [step, setStep]       = useState<Step>('request');
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('reset-password', {
        body: { action: 'request', email },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setStep('confirm');
    } catch (e: any) {
      setError(e?.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !password) return;
    if (password !== password2) { setError('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères'); return; }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('reset-password', {
        body: { action: 'confirm', token: code.trim(), new_password: password },
      });
      if (fnError) throw fnError;
      if (data?.error || data?.success === false) throw new Error(data?.error || 'Code invalide ou expiré');
      setStep('done');
    } catch (e: any) {
      setError(e?.message || 'Code invalide ou expiré');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (hasError = false): React.CSSProperties => ({
    width: '100%', padding: '14px 16px', borderRadius: 14,
    border: `2px solid ${hasError ? 'var(--dc-danger)' : 'var(--dc-border)'}`,
    fontSize: 15, background: 'var(--dc-bg)', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--dc-text)',
    transition: 'border-color 0.15s',
  });

  // ── Done state ──
  if (step === 'done') {
    return (
      <IonPage><IonContent fullscreen>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px', background: 'var(--dc-bg)', textAlign: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22,
            background: 'var(--dc-green-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          }}>
            <CheckCircle size={36} color="var(--dc-green)" strokeWidth={1.8} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8, color: 'var(--dc-text)' }}>
            Mot de passe modifié
          </h1>
          <p style={{ color: 'var(--dc-text-light)', fontSize: 15, maxWidth: 300, lineHeight: 1.6 }}>
            Votre mot de passe a été mis à jour avec succès.
          </p>
          <button
            className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg"
            style={{ marginTop: 32, maxWidth: 300, width: '100%' }}
            onClick={() => history.push('/login')}
          >
            Se connecter
          </button>
        </div>
      </IonContent></IonPage>
    );
  }

  return (
    <IonPage><IonContent fullscreen scrollY>
      <style>{`
        .fp-input:focus { border-color: var(--dc-primary) !important; background: white !important; }
      `}</style>

      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: 'var(--dc-bg)',
      }}>
        {/* ── Header ── */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 20px) 24px 28px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative orb */}
          <div style={{
            position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
            width: 220, height: 220, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(21,101,192,0.08) 0%, transparent 60%)',
            pointerEvents: 'none',
          }} />

          {/* Icon */}
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: step === 'request' ? 'var(--dc-blue-light)' : 'rgba(108,92,231,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, zIndex: 1,
          }}>
            {step === 'request'
              ? <Mail size={28} color="var(--dc-blue)" strokeWidth={1.8} />
              : <KeyRound size={28} color="var(--dc-primary)" strokeWidth={1.8} />
            }
          </div>

          <h1 style={{ color: 'var(--dc-text)', fontSize: 24, fontWeight: 900, margin: '0 0 6px', zIndex: 1 }}>
            {step === 'request' ? 'Mot de passe oublié' : 'Entrez votre code'}
          </h1>
          <p style={{ color: 'var(--dc-text-light)', fontSize: 14, lineHeight: 1.5, textAlign: 'center', maxWidth: 300, zIndex: 1 }}>
            {step === 'request'
              ? 'Entrez votre email pour recevoir un code de réinitialisation'
              : `Un code a été envoyé à ${email}. Vérifiez votre boîte mail.`
            }
          </p>
        </div>

        {/* ── Form card ── */}
        <div className="dc-animate-in" style={{
          flex: 1, background: 'white', borderRadius: '28px 28px 0 0',
          padding: '28px 24px 48px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
        }}>
          {/* Back button */}
          <button
            onClick={() => step === 'confirm' ? setStep('request') : history.push('/login')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none',
              color: 'var(--dc-primary)', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', padding: 0, marginBottom: 24,
            }}
          >
            <ArrowLeft size={16} strokeWidth={2} />
            {step === 'confirm' ? "Modifier l'email" : 'Retour à la connexion'}
          </button>

          {/* Error */}
          {error && (
            <div style={{
              background: 'var(--dc-danger-light)', color: 'var(--dc-danger)',
              padding: '12px 16px', borderRadius: 14, marginBottom: 20,
              fontSize: 14, fontWeight: 600, borderLeft: '3px solid var(--dc-danger)',
            }}>
              {error}
            </div>
          )}

          {/* ── Step 1: email ── */}
          {step === 'request' && (
            <form onSubmit={handleRequest}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Email</label>
                <input
                  className="fp-input"
                  type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="parent@email.com" required autoFocus
                  style={inputStyle()}
                />
              </div>
              <button type="submit" className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg"
                disabled={loading || !email}>
                {loading ? 'Envoi en cours...' : 'Recevoir le code'}
              </button>
            </form>
          )}

          {/* ── Step 2: code + nouveau mot de passe ── */}
          {step === 'confirm' && (
            <form onSubmit={handleConfirm}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Code reçu par email</label>
                <input
                  className="fp-input"
                  type="text" value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Entrez le code" required autoFocus
                  style={{ ...inputStyle(), letterSpacing: '3px', fontSize: 18, fontWeight: 700, textAlign: 'center' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Nouveau mot de passe</label>
                <input
                  className="fp-input"
                  type="password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères" required
                  style={inputStyle()}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Confirmer le mot de passe</label>
                <input
                  className="fp-input"
                  type="password" value={password2}
                  onChange={e => setPassword2(e.target.value)}
                  placeholder="Répétez le mot de passe" required
                  style={inputStyle(!!password2 && password !== password2)}
                />
                {password2 && password !== password2 && (
                  <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                    Les mots de passe ne correspondent pas
                  </p>
                )}
              </div>
              <button type="submit" className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg"
                disabled={loading || !code || !password || !password2}>
                {loading ? 'Vérification...' : 'Changer mon mot de passe'}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--dc-text-muted)' }}>
            Vous vous souvenez de votre mot de passe ?{' '}
            <button onClick={() => history.push('/login')}
              style={{ background: 'none', border: 'none', color: 'var(--dc-primary)', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 14 }}>
              Se connecter
            </button>
          </p>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ForgotPasswordPage;
