'use client';
import { ApiError } from '@rekonect/api-client';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Button, Field, TextInput } from './components';
import { useSession } from './session';
import { C } from './tokens';

/** Logo double cercle (couleur du premier anneau selon le portail). */
export function Logo({ size = 32, first = '#fff', second = C.coral }: { size?: number; first?: string; second?: string }) {
  const r = Math.round(size * 0.5625);
  return (
    <div aria-hidden style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: 0, top: Math.round(size * 0.22), width: r, height: r, borderRadius: '50%', border: `2.5px solid ${first}` }} />
      <div style={{ position: 'absolute', left: Math.round(size * 0.375), top: Math.round(size * 0.22), width: r, height: r, borderRadius: '50%', border: `2.5px solid ${second}` }} />
    </div>
  );
}

/** Carte centrée des écrans d'accès (connexion, invitation, mot de passe). */
export function AuthLayout({ badge, title, subtitle, children }: { badge: ReactNode; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 420, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, justifyContent: 'center' }}>
          <Logo size={28} first={C.primary} />
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.03em' }}>Rekonect</div>
          {badge}
        </div>
        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 22, padding: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 22px', lineHeight: 1.5 }}>{subtitle}</p>}
          {children}
        </div>
      </div>
    </main>
  );
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : 'Connexion impossible');

export function LoginForm({ onSuccess, focusColor, forgotHref }: { onSuccess: () => void; focusColor?: string; forgotHref?: string }) {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Email ou mot de passe incorrect.' : messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
      <Field label="Email" htmlFor="login-email">
        <TextInput id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} focusColor={focusColor} />
      </Field>
      <Field label="Mot de passe" htmlFor="login-password">
        <TextInput id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} focusColor={focusColor} />
      </Field>
      {error && (
        <div role="alert" style={{ background: C.redSoft, color: C.redText, borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}
      <Button type="submit" height={46} block loading={busy} style={{ fontSize: 14 }}>
        Se connecter
      </Button>
      {forgotHref && (
        <a href={forgotHref} style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
          Mot de passe oublié ?
        </a>
      )}
    </form>
  );
}

export function ForgotPasswordForm({ focusColor, loginHref }: { focusColor?: string; loginHref: string }) {
  const { auth } = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <div style={{ marginTop: 18, fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
        Si un compte existe pour <strong>{email}</strong>, un lien de réinitialisation vient d’être envoyé. Il est valable une heure.
        <div style={{ marginTop: 18 }}>
          <a href={loginHref} style={{ fontWeight: 700 }}>
            Retour à la connexion
          </a>
        </div>
      </div>
    );
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
      <Field label="Email" htmlFor="forgot-email">
        <TextInput id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} focusColor={focusColor} />
      </Field>
      {error && <div role="alert" style={{ color: C.redText, fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <Button type="submit" height={46} block loading={busy} style={{ fontSize: 14 }}>
        Recevoir un lien
      </Button>
      <a href={loginHref} style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
        Retour à la connexion
      </a>
    </form>
  );
}

export function ResetPasswordForm({ token, focusColor, loginHref }: { token: string; focusColor?: string; loginHref: string }) {
  const { auth } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError(null);
    try {
      await auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  if (done)
    return (
      <div style={{ marginTop: 18, fontSize: 14, color: C.text2 }}>
        Mot de passe modifié.{' '}
        <a href={loginHref} style={{ fontWeight: 700 }}>
          Se connecter
        </a>
      </div>
    );
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
      <Field label="Nouveau mot de passe" htmlFor="reset-pw" hint="8 caractères minimum">
        <TextInput id="reset-pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} focusColor={focusColor} />
      </Field>
      <Field label="Confirmation" htmlFor="reset-pw2">
        <TextInput id="reset-pw2" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} focusColor={focusColor} />
      </Field>
      {error && <div role="alert" style={{ color: C.redText, fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <Button type="submit" height={46} block loading={busy} style={{ fontSize: 14 }}>
        Enregistrer
      </Button>
    </form>
  );
}
