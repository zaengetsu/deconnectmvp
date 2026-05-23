import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { KeyRound, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

// Flow en 2 étapes :
// 1. L'utilisateur entre son email → reçoit un code par email
// 2. L'utilisateur entre le code + son nouveau mot de passe → confirmé

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

  // ── Étape 1 : demander le code ────────────────────────────────
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

  // ── Étape 2 : confirmer avec le code ─────────────────────────
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '2px solid var(--dc-border)', fontSize: 15,
    background: 'white', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--dc-font)',
  };

  // ── Étape done ────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <IonPage><IonContent fullscreen>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--dc-bg)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--dc-green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <CheckCircle size={32} color="var(--dc-green)" strokeWidth={1.8} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Mot de passe modifié</h1>
          <p style={{ color: 'var(--dc-text-light)', fontSize: 15, maxWidth: 300, lineHeight: 1.6 }}>
            Votre mot de passe a été mis à jour avec succès.
          </p>
          <button
            className="dc-btn dc-btn-primary dc-btn-full"
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
    <IonPage><IonContent fullscreen>
      <div style={{ minHeight: '100vh', padding: '60px 24px 40px', background: 'var(--dc-bg)' }}>

        {/* Back button */}
        <button
          onClick={() => step === 'confirm' ? setStep('request') : history.push('/login')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--dc-text-light)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 32 }}
        >
          <ArrowLeft size={16} strokeWidth={2} />
          {step === 'confirm' ? 'Modifier l\'email' : 'Retour à la connexion'}
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            {step === 'request'
              ? <Mail size={26} color="var(--dc-blue)" strokeWidth={1.8} />
              : <KeyRound size={26} color="var(--dc-blue)" strokeWidth={1.8} />
            }
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>
            {step === 'request' ? 'Mot de passe oublié' : 'Entrez votre code'}
          </h1>
          <p style={{ color: 'var(--dc-text-light)', fontSize: 14, lineHeight: 1.55 }}>
            {step === 'request'
              ? 'Entrez votre email pour recevoir un code de réinitialisation'
              : `Un code a été envoyé à ${email}. Vérifiez votre boîte mail.`
            }
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14, fontWeight: 500 }}>
            {error}
          </div>
        )}

        {/* ── Step 1 : email ── */}
        {step === 'request' && (
          <form onSubmit={handleRequest}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="parent@email.com"
                required
                autoFocus
                style={inputStyle}
              />
            </div>
            <button type="submit" className="dc-btn dc-btn-primary dc-btn-full" disabled={loading || !email}>
              {loading ? 'Envoi en cours...' : 'Recevoir le code'}
            </button>
          </form>
        )}

        {/* ── Step 2 : code + nouveau mot de passe ── */}
        {step === 'confirm' && (
          <form onSubmit={handleConfirm}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Code reçu par email</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Entrez le code"
                required
                autoFocus
                style={{ ...inputStyle, letterSpacing: '3px', fontSize: 18, fontWeight: 700, textAlign: 'center' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Nouveau mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
                required
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Confirmer le mot de passe</label>
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                placeholder="Répétez le mot de passe"
                required
                style={{ ...inputStyle, borderColor: password2 && password !== password2 ? 'var(--dc-danger)' : 'var(--dc-border)' }}
              />
              {password2 && password !== password2 && (
                <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 4 }}>Les mots de passe ne correspondent pas</p>
              )}
            </div>
            <button type="submit" className="dc-btn dc-btn-primary dc-btn-full" disabled={loading || !code || !password || !password2}>
              {loading ? 'Vérification...' : 'Changer mon mot de passe'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--dc-text-muted)' }}>
          Vous vous souvenez de votre mot de passe ?{' '}
          <button onClick={() => history.push('/login')} style={{ background: 'none', border: 'none', color: 'var(--dc-primary)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}>
            Se connecter
          </button>
        </p>
      </div>
    </IonContent></IonPage>
  );
};

export default ForgotPasswordPage;
