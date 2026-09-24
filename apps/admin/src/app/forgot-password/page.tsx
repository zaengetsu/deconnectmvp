'use client';
import { AuthLayout, ForgotPasswordForm } from '@rekonect/ui';

export default function ForgotPasswordPage() {
  return (
    <AuthLayout badge={null} title="Mot de passe oublié" subtitle="Indiquez votre email : nous vous envoyons un lien pour choisir un nouveau mot de passe.">
      <ForgotPasswordForm loginHref="/login" />
    </AuthLayout>
  );
}
