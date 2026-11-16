import type { Metadata } from 'next';
import { SupportPage } from '@/features/legal';

export const metadata: Metadata = {
  title: 'Support · Rekonect',
  description: 'Aide de l’app Rekonect : relier le téléphone d’un enfant, mot de passe oublié, abonnement, suppression de compte.',
  robots: { index: true, follow: true },
};

export default function Support() {
  return <SupportPage />;
}
