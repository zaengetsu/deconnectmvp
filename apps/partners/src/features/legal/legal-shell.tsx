'use client';
import { BRAND, LogoMark } from '@rekonect/ui';
import type { ReactNode } from 'react';
import { LandingFooter } from '../landing/footer';
import { Container } from '../landing/ui';

/** Gabarit des pages publiques d'information (confidentialité, support), sans session. */
export function LegalShell({ kicker, title, intro, children }: { kicker: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: BRAND.cream, color: BRAND.ink, display: 'flex', flexDirection: 'column' }}>
      <header>
        <Container style={{ paddingTop: 22, paddingBottom: 22 }}>
          <a href="/" aria-label="Rekonect, accueil" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: BRAND.ink, textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span style={{ fontSize: 17, fontWeight: 800 }}>Rekonect</span>
          </a>
        </Container>
      </header>
      <main style={{ flex: 1 }}>
        <Container style={{ maxWidth: 820, paddingTop: 24, paddingBottom: 90 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', color: BRAND.peachText }}>{kicker}</div>
          <h1 style={{ fontSize: 'clamp(32px,4vw,46px)', fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.08, margin: '12px 0 16px' }}>{title}</h1>
          <div style={{ fontSize: 17, color: '#4A4E66', lineHeight: 1.65, marginBottom: 36 }}>{intro}</div>
          {children}
        </Container>
      </main>
      <LandingFooter />
    </div>
  );
}

/** Section titrée d'une page d'information. */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ marginBottom: 34 }}>
      <h2 id={id} style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 10px' }}>{title}</h2>
      <div style={{ fontSize: 15.5, color: '#3A3E57', lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}
