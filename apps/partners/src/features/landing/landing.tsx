'use client';
import type { PartnerLeadKind } from '@rekonect/api-client';
import { BRAND } from '@rekonect/ui';
import { useState } from 'react';
import { ContactSection } from './contact';
import { Faq } from './faq';
import { LandingFooter } from './footer';
import { Hero } from './hero';
import { Pricing } from './pricing';
import { Audiences, HowItWorks, OfferTypes, SegmentsBand, Trust } from './sections';

/**
 * Landing publique du portail partenaires (maquette « Rekonect Partenaires - Landing »).
 * Chaque section est un composant autonome ; seul le type d'organisation est
 * partagé, pour que le bouton d'un plan présélectionne le formulaire.
 */
export function PartnersLanding() {
  const [kind, setKind] = useState<PartnerLeadKind>('store');
  return (
    <div style={{ minHeight: '100vh', background: BRAND.cream, color: BRAND.ink }}>
      <Hero />
      <main>
        <SegmentsBand />
        <HowItWorks />
        <OfferTypes />
        <Audiences />
        <Trust />
        <Pricing onChoose={setKind} />
        <Faq />
        <ContactSection kind={kind} onKind={setKind} />
      </main>
      <LandingFooter />
    </div>
  );
}
