'use client';
import { AuthLayout, Button, C, Field, TextInput, useSession } from '@rekonect/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';

function Invitation() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { acceptInvitation } = useSession();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError(null);
    try {
      await acceptInvitation(token, fullName.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation invalide');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      badge={<div style={{ height: 20, padding: '0 7px', borderRadius: 6, background: '#FFEDE4', color: '#C2582A', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', display: 'flex', alignItems: 'center' }}>PARTENAIRES</div>}
      title="Rejoindre votre espace"
      subtitle={token ? 'Créez votre accès au portail partenaires Rekonect.' : 'Lien d’invitation incomplet : demandez un nouvel envoi à votre responsable.'}
    >
      {token && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nom complet" htmlFor="inv-name">
            <TextInput id="inv-name" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} focusColor={C.coral} />
          </Field>
          <Field label="Mot de passe" htmlFor="inv-pw" hint="8 caractères minimum">
            <TextInput id="inv-pw" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} focusColor={C.coral} />
          </Field>
          <Field label="Confirmation" htmlFor="inv-pw2">
            <TextInput id="inv-pw2" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} focusColor={C.coral} />
          </Field>
          {error && (
            <div role="alert" style={{ background: C.redSoft, color: C.redText, borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}
          <Button type="submit" variant="coral" height={46} block loading={busy} style={{ fontSize: 14 }}>
            Activer mon accès
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function InvitationPage() {
  return (
    <Suspense>
      <Invitation />
    </Suspense>
  );
}
