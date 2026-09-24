'use client';
import { AuthLayout, C, LoginForm, useSession } from '@rekonect/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  useEffect(() => {
    if (status === 'authenticated') router.replace(target);
  }, [status, router, target]);
  return (
    <AuthLayout
      badge={<div style={{ height: 20, padding: '0 7px', borderRadius: 6, background: '#FFEDE4', color: '#C2582A', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', display: 'flex', alignItems: 'center' }}>PARTENAIRES</div>}
      title="Connexion"
      subtitle="Espace des enseignes, magasins, collectivités et CSE partenaires."
    >
      <LoginForm onSuccess={() => router.replace(target)} forgotHref="/forgot-password" />
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
