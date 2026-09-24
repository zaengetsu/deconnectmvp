'use client';
import { BRAND, Halo, LogoMark, Pattern, Rings, Sprinkles, Staged, Sticker, Target, useSession } from '@rekonect/ui';
import type { ReactNode } from 'react';
import { HERO_STATS } from './content';
import s from './landing.module.css';
import { Container, CtaLink } from './ui';

const LINKS = [
  { href: '#comment', label: 'Comment ça marche' },
  { href: '#pourqui', label: 'Pour qui' },
  { href: '#tarifs', label: 'Tarifs' },
];

/** Marque « Rekonect PARTENAIRES » (version sombre). */
export function PartnersWordmark({ size = 32 }: { size?: number }) {
  return (
    <a href="/" aria-label="Rekonect Partenaires, accueil" style={{ display: 'flex', alignItems: 'center', gap: 11, color: '#fff' }}>
      <LogoMark size={size} a="#fff" b={BRAND.peach} stroke={2.5} />
      <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.03em' }}>Rekonect</span>
      <span className={s.navTag} style={{ height: 22, padding: '0 8px', borderRadius: 6, background: 'rgba(255,148,105,.18)', color: BRAND.peach, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', display: 'flex', alignItems: 'center' }}>PARTENAIRES</span>
    </a>
  );
}

export function LandingNav() {
  const { status } = useSession();
  const signedIn = status === 'authenticated';
  return (
    <Container className={s.nav} style={{ position: 'relative', paddingTop: 22, paddingBottom: 22, display: 'flex', alignItems: 'center' }}>
      <nav aria-label="Navigation de la page" style={{ display: 'contents' }}>
        <PartnersWordmark />
        <div style={{ flex: 1 }} />
        <div className={s.navLinks} style={{ display: 'flex', gap: 26, fontSize: 14, fontWeight: 600 }}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={s.navLink}>
              {l.label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CtaLink href={signedIn ? '/dashboard' : '/login'} variant="outline" size="sm" className={signedIn ? undefined : s.navCtaSecondary}>
            {signedIn ? 'Mon espace' : 'Se connecter'}
          </CtaLink>
          {!signedIn && (
            <CtaLink href="#contact" size="sm" style={{ boxShadow: 'none' }}>
              Devenir partenaire
            </CtaLink>
          )}
        </div>
      </nav>
    </Container>
  );
}

export function Hero() {
  return (
    <section data-screen-label="Hero" aria-labelledby="hero-title" style={{ position: 'relative', overflow: 'hidden', background: BRAND.ink, color: '#fff' }}>
      <Pattern kind="links" fade={220} fadeStop={45} line="rgba(255,255,255,.07)" accent="rgba(255,148,105,.28)" />
      <Rings at={{ x: '78%', y: '58%' }} size={720} count={1} strength={0.55} />
      <Rings at={{ x: '76%', y: '62%' }} size={500} count={1} strength={0.67} />
      <Halo at={{ x: '73%', y: '66%' }} size={300} intensity={0.55} />

      <LandingNav />

      <Container style={{ position: 'relative', paddingTop: 56, paddingBottom: 96, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,440px),1fr))', gap: 48, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px 0 6px', borderRadius: 999, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.16)', fontSize: 12, fontWeight: 700 }}>
            <span style={{ height: 22, padding: '0 8px', borderRadius: 999, background: BRAND.peach, color: BRAND.ink, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center' }}>NOUVEAU</span>
            Offres ciblées par magasin et par zone
          </div>
          <h1 id="hero-title" style={{ fontSize: 'clamp(40px,5.4vw,68px)', fontWeight: 800, letterSpacing: '-.045em', lineHeight: 1.02, margin: '22px 0 0', textWrap: 'balance' }}>
            Récompensez les enfants qui <span style={{ color: BRAND.peach }}>bougent</span>, lisent et créent.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: 'rgba(255,255,255,.75)', margin: '22px 0 0', maxWidth: '52ch', textWrap: 'pretty' }}>
            Rekonect aide les parents à remplacer le temps d'écran par des activités. Votre enseigne, votre ville ou votre CSE offre la récompense au bout de l'effort, et les familles viennent la chercher chez vous.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 32, flexWrap: 'wrap' }}>
            <CtaLink href="#contact" size="lg">Proposer une première offre</CtaLink>
            <CtaLink href="#comment" size="lg" variant="glass">Voir comment ça marche</CtaLink>
          </div>
          {HERO_STATS.length > 0 && (
            <dl style={{ display: 'flex', gap: 36, margin: '44px 0 0', flexWrap: 'wrap' }}>
              {HERO_STATS.map((st) => (
                <div key={st.label}>
                  <dt style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em' }}>{st.value}</dt>
                  <dd style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '2px 0 0' }}>{st.label}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <HeroVisual />
      </Container>
    </section>
  );
}

/** Composition type de la charte : téléphone, cartes inclinées, stickers, formes. */
export function HeroVisual() {
  return (
    <div className={s.visual} aria-hidden>
      <PhoneMock />
      <Staged tilt={-6} radius={20} padding={15} style={{ position: 'absolute', left: 0, top: 90, width: 200, boxShadow: '0 30px 50px -20px rgba(0,0,0,.55)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: '#8A8FA6' }}>CETTE SEMAINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <Target size={52} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em' }}>86</div>
            <div style={{ fontSize: 11, color: '#8A8FA6' }}>défis vélo réussis</div>
          </div>
        </div>
      </Staged>
      <Staged tilt={5} radius={20} padding={15} style={{ position: 'absolute', right: 0, bottom: 70, width: 210, boxShadow: '0 30px 50px -20px rgba(0,0,0,.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: BRAND.sage, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Bon scanné en caisse</span>
        </div>
        <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 700, marginTop: 10, letterSpacing: '.06em' }}>RK7P-2M4Q</div>
        <div style={{ fontSize: 11, color: '#8A8FA6', marginTop: 3 }}>Samedi 14:32 · rayon cycles</div>
      </Staged>
      <Sticker tone="indigo" badge="★" size="lg" tilt={-4} shadow style={{ position: 'absolute', left: 34, bottom: 120 }}>
        Défi réussi
      </Sticker>
      <Sprinkles />
    </div>
  );
}

function PhoneMock() {
  return (
    <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%) rotate(-4deg)', width: 270, borderRadius: 44, background: '#0B0C14', padding: 9, boxShadow: '0 50px 80px -30px rgba(0,0,0,.7)' }}>
      <div style={{ borderRadius: 36, overflow: 'hidden', background: BRAND.cream, height: 530, color: BRAND.ink }}>
        <div style={{ padding: '34px 18px 16px', background: BRAND.indigo, color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <Pattern kind="links" line="rgba(255,255,255,.08)" accent="rgba(255,148,105,.3)" />
          <div style={{ position: 'relative', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.65)' }}>Salut Léa</div>
          <div style={{ position: 'relative', fontSize: 20, fontWeight: 800, letterSpacing: '-.03em', marginTop: 2 }}>Mes défis</div>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 8px 24px -10px rgba(22,24,43,.2)' }}>
            <div style={{ height: 92, background: BRAND.ocean, position: 'relative' }}>
              <Pattern kind="hatch" line="rgba(255,255,255,.25)" />
              <span style={{ position: 'absolute', left: 10, top: 10, height: 22, padding: '0 8px', borderRadius: 999, background: 'rgba(255,255,255,.94)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center' }}>Offert par votre magasin de sport</span>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Atelier « répare ton vélo »</div>
              <div style={{ fontSize: 11, color: '#8A8FA6', marginTop: 3 }}>10 activités vélo en 30 jours</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#8A8FA6', margin: '10px 0 4px' }}>
                <span>6 / 10</span>
                <span>60 %</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: '#F1EEE9', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '60%', background: BRAND.peach }} />
              </div>
            </div>
          </div>
          <PhoneRow img="/assets/categories/track.png" tint="#FFEDE4" title="30 min de vélo" sub="Aujourd'hui" end={<span style={{ height: 22, padding: '0 8px', borderRadius: 999, background: BRAND.peach, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center' }}>+25</span>} />
          <PhoneRow img="/assets/categories/eco.png" tint="#E9F1EC" title="Balade au parc" sub="Hier · validé" end={<span style={{ fontSize: 11, fontWeight: 800, color: '#4A7A5F' }}>✓</span>} />
        </div>
      </div>
    </div>
  );
}

function PhoneRow({ img, tint, title, sub, end }: { img: string; tint: string; title: string; sub: string; end: ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 34, height: 34, borderRadius: 11, background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={img} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 800 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 10, color: '#8A8FA6' }}>{sub}</span>
      </span>
      {end}
    </div>
  );
}
