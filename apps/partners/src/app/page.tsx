import type { Metadata } from 'next';
import { PartnersLanding } from '@/features/landing';

export const metadata: Metadata = {
  title: 'Rekonect Partenaires · Récompensez les enfants qui bougent, lisent et créent',
  description:
    'Enseignes, magasins, collectivités et CSE : offrez la récompense au bout de l’effort. Les enfants réalisent de vraies activités hors écran, validées par leurs parents, et les familles viennent la chercher chez vous.',
  robots: { index: true, follow: true },
};

export default function HomePage() {
  return <PartnersLanding />;
}
