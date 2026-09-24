import { BRAND, LogoMark } from '@rekonect/ui';
import { Container } from './ui';

export function LandingFooter() {
  return (
    <footer style={{ background: BRAND.ink, color: 'rgba(255,255,255,.6)' }}>
      <Container style={{ paddingTop: 34, paddingBottom: 34, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
          <LogoMark size={26} a="#fff" b={BRAND.peach} stroke={2.5} />
          <span style={{ fontSize: 15, fontWeight: 800 }}>Rekonect</span>
        </div>
        <div style={{ flex: 1 }} />
        <a href="/login" style={{ color: 'rgba(255,255,255,.6)' }}>Espace partenaire</a>
        <a href="#" style={{ color: 'rgba(255,255,255,.6)' }}>L'app pour les familles</a>
        <a href="#" style={{ color: 'rgba(255,255,255,.6)' }}>Mentions légales</a>
        <a href="#" style={{ color: 'rgba(255,255,255,.6)' }}>Confidentialité</a>
        <span>© 2026 Rekonect</span>
      </Container>
    </footer>
  );
}
