import type { Metadata } from 'next';
import { PrivacyPolicy } from '@/features/legal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité · Rekonect',
  description: 'Les données traitées par l’app Rekonect, pour les parents et les enfants, et comment exercer vos droits.',
  robots: { index: true, follow: true },
};

export default function ConfidentialitePage() {
  return <PrivacyPolicy />;
}
