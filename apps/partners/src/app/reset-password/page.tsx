'use client';
import { AuthLayout, ResetPasswordForm } from '@rekonect/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Reset() {
  const token = useSearchParams().get('token') ?? '';
  return (
    <AuthLayout badge={null} title="Nouveau mot de passe" subtitle={token ? 'Choisissez votre nouveau mot de passe.' : 'Lien incomplet : redemandez un email de réinitialisation.'}>
      {token && <ResetPasswordForm token={token} loginHref="/login" />}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
