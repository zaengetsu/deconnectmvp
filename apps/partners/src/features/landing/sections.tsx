'use client';
import { BRAND, CornerRing, Halo, Pattern, Rings, type PatternKind } from '@rekonect/ui';
import { useState } from 'react';
import { AUDIENCES, type AudienceId, OFFER_TYPES, type OfferTone, SEGMENTS, STEPS, TRUST } from './content';
import s from './landing.module.css';
import { Container, Kicker, MiniCard, SectionTitle } from './ui';

/* ── Bandeau « Conçu pour » ─────────────────────────────────────────────── */

export function SegmentsBand() {
  return (
    <section aria-label="Conçu pour" style={{ background: '#fff', borderBottom: '1px solid rgba(22,24,43,.07)' }}>
      <Container style={{ paddingTop: 26, paddingBottom: 26, display: 'flex', alignItems: 'center', gap: '14px 34px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', color: '#8A8FA6' }}>CONÇU POUR</span>
        {SEGMENTS.map((sg) => (
          <span key={sg.name} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 800, color: '#4A4E66' }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: sg.round ? '50%' : 3, background: sg.color }} />
            {sg.name}
          </span>
        ))}
      </Container>
    </section>
  );
}

/* ── Comment ça marche ──────────────────────────────────────────────────── */

export function HowItWorks() {
  return (
    <section id="comment" data-screen-label="Comment ça marche" aria-labelledby="comment-title">
      <Container style={{ paddingTop: 110, paddingBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 48 }}>
          <div style={{ flex: 1, minWidth: 'min(100%,300px)' }}>
            <Kicker>COMMENT ÇA MARCHE</Kicker>
            <SectionTitle id="comment-title" maxWidth="18ch">L'effort d'abord, la récompense chez vous.</SectionTitle>
          </div>
          <p style={{ fontSize: 16, color: '#4A4E66', lineHeight: 1.6, maxWidth: '44ch', margin: 0 }}>
            Vous ne payez pas pour être vu. L'offre se débloque seulement quand l'enfant a réalisé de vraies activités, validées par ses parents.
          </p>
        </div>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>
          {STEPS.map((st) => (
            <StepCard key={st.n} {...st} />
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function StepCard({ n, color, ring, title, text, tags }: (typeof STEPS)[number]) {
  return (
    <li className={s.card} style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 28, padding: 28, minHeight: 340, display: 'flex', flexDirection: 'column' }}>
      <CornerRing size={200} width={24} color={ring} alpha={ring === BRAND.indigo ? 0.07 : 0.14} overflow={0.3} />
      <div aria-hidden style={{ position: 'relative', fontSize: 64, fontWeight: 800, letterSpacing: '-.05em', lineHeight: 1, color }}>{n}</div>
      <h3 style={{ position: 'relative', fontSize: 22, fontWeight: 800, letterSpacing: '-.025em', margin: '22px 0 0' }}>{title}</h3>
      <p style={{ position: 'relative', fontSize: 15, color: '#4A4E66', lineHeight: 1.6, margin: '10px 0 0', textWrap: 'pretty' }}>{text}</p>
      <div style={{ flex: 1 }} />
      <div style={{ position: 'relative', marginTop: 22, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tags.map((t) => (
          <span key={t} style={{ height: 30, padding: '0 12px', borderRadius: 999, background: BRAND.cream, fontSize: 12, fontWeight: 700, color: '#4A4E66', display: 'flex', alignItems: 'center' }}>{t}</span>
        ))}
      </div>
    </li>
  );
}

/* ── Types d'offres ─────────────────────────────────────────────────────── */

const OFFER_TONES: Record<OfferTone, { bg: string; fg: string; chipBg: string; chipFg: string; pattern: PatternKind; line: string; accent?: string }> = {
  coral: { bg: BRAND.peach, fg: BRAND.ink, chipBg: BRAND.ink, chipFg: '#fff', pattern: 'hatch', line: 'rgba(255,255,255,.2)' },
  indigo: { bg: BRAND.indigo, fg: '#fff', chipBg: '#fff', chipFg: BRAND.indigo, pattern: 'links', line: 'rgba(255,255,255,.1)', accent: 'rgba(255,148,105,.3)' },
  ink: { bg: BRAND.ink, fg: '#fff', chipBg: BRAND.peach, chipFg: BRAND.ink, pattern: 'dots', line: 'rgba(255,255,255,.14)' },
};

export function OfferTypes() {
  return (
    <section aria-label="Trois types d'offres">
      <Container style={{ paddingTop: 40, paddingBottom: 110 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>
          {OFFER_TYPES.map((t) => (
            <OfferTypeCard key={t.title} {...t} />
          ))}
        </div>
      </Container>
    </section>
  );
}

export function OfferTypeCard({ tone, chip, title, text, example, exampleSub, badge, tilt }: (typeof OFFER_TYPES)[number]) {
  const t = OFFER_TONES[tone];
  return (
    <article className={s.card} style={{ borderRadius: 28, overflow: 'hidden', background: t.bg, color: t.fg, position: 'relative', padding: 26, minHeight: 260, display: 'flex', flexDirection: 'column' }}>
      <Pattern kind={t.pattern} line={t.line} accent={t.accent} opacity={0.9} />
      <span style={{ position: 'relative', display: 'inline-flex', alignSelf: 'flex-start', height: 28, padding: '0 12px', borderRadius: 999, background: t.chipBg, color: t.chipFg, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', alignItems: 'center' }}>{chip}</span>
      <h3 style={{ position: 'relative', fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', margin: '18px 0 0', lineHeight: 1.15 }}>{title}</h3>
      <p style={{ position: 'relative', fontSize: 15, lineHeight: 1.55, margin: '10px 0 0', opacity: 0.85, maxWidth: '34ch' }}>{text}</p>
      <div style={{ flex: 1 }} />
      <MiniCard title={example} sub={exampleSub} badge={badge} style={{ position: 'relative', marginTop: 22, boxShadow: '0 18px 30px -16px rgba(0,0,0,.45)', transform: `rotate(${tilt}deg)` }} />
    </article>
  );
}

/* ── Pour qui ───────────────────────────────────────────────────────────── */

export function Audiences() {
  const [id, setId] = useState<AudienceId>('ens');
  const a = AUDIENCES[id];
  return (
    <section id="pourqui" data-screen-label="Pour qui" aria-labelledby="pourqui-title" style={{ background: '#fff', borderTop: '1px solid rgba(22,24,43,.07)', borderBottom: '1px solid rgba(22,24,43,.07)' }}>
      <Container className={s.section}>
        <Kicker>POUR QUI</Kicker>
        <SectionTitle id="pourqui-title" maxWidth="22ch" style={{ marginBottom: 32 }}>Un compte national, un magasin ou une ville.</SectionTitle>
        <div role="tablist" aria-label="Type de partenaire" style={{ display: 'flex', gap: 6, background: '#F1EEE9', padding: 5, borderRadius: 999, width: 'max-content', maxWidth: '100%', flexWrap: 'wrap', marginBottom: 28 }}>
          {(Object.keys(AUDIENCES) as AudienceId[]).map((k) => {
            const on = k === id;
            return (
              <button key={k} type="button" role="tab" id={`aud-${k}`} aria-selected={on} aria-controls="aud-panel" className={s.chip} onClick={() => setId(k)} style={{ height: 42, padding: '0 20px', borderRadius: 999, fontSize: 14, fontWeight: 800, background: on ? '#fff' : 'transparent', color: on ? BRAND.ink : '#8A8FA6', boxShadow: on ? '0 6px 16px -8px rgba(22,24,43,.3)' : 'none' }}>
                {AUDIENCES[k].tab}
              </button>
            );
          })}
        </div>
        <div id="aud-panel" role="tabpanel" aria-labelledby={`aud-${id}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 20, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 30, background: a.color, color: '#fff', padding: 32, minHeight: 400, display: 'flex', flexDirection: 'column', transition: 'background .2s' }}>
            <Pattern kind="links" fade={200} line="rgba(255,255,255,.12)" accent="rgba(255,255,255,.2)" />
            <Rings at={{ x: '10%', y: '105%' }} size={340} count={1} strength={1.6} />
            <Halo at={{ x: '10%', y: '105%' }} size={220} intensity={0.45} />
            <div style={{ position: 'relative', fontSize: 12, fontWeight: 800, letterSpacing: '.12em', opacity: 0.8 }}>{a.kicker}</div>
            <p style={{ position: 'relative', fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.15, margin: '12px 0 0', maxWidth: '18ch' }}>{a.quote}</p>
            <div style={{ flex: 1 }} />
            <ul style={{ position: 'relative', listStyle: 'none', padding: 0, margin: '28px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {a.examples.map((ex) => (
                <li key={ex.text} style={{ background: '#fff', color: BRAND.ink, borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 14px 26px -16px rgba(0,0,0,.5)' }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND.peach, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{ex.text}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#8A8FA6', whiteSpace: 'nowrap' }}>{ex.scope}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {a.points.map((p) => (
              <li key={p.title} style={{ background: BRAND.cream, borderRadius: 22, padding: '22px 24px', display: 'flex', gap: 16 }}>
                <span style={{ width: 40, height: 40, borderRadius: 13, background: '#fff', border: '1px solid rgba(22,24,43,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <img src={p.img} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                </span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.015em', margin: 0 }}>{p.title}</h3>
                  <p style={{ fontSize: 14, color: '#4A4E66', lineHeight: 1.55, margin: '4px 0 0' }}>{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

/* ── Confiance ──────────────────────────────────────────────────────────── */

export function Trust() {
  return (
    <section aria-labelledby="trust-title">
      <Container className={s.section}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 34, background: BRAND.ink, color: '#fff', padding: '56px clamp(24px,5vw,64px)' }}>
          <Pattern kind="dots" fade={270} fadeStop={70} line="rgba(255,255,255,.1)" />
          <Halo at="top-right" size={300} intensity={0.4} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 40, alignItems: 'start' }}>
            <div>
              <Kicker color={BRAND.peach}>UN CADRE POUR LES ENFANTS</Kicker>
              <SectionTitle id="trust-title" size="md">Pas de publicité. Pas de données nominatives.</SectionTitle>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, margin: '14px 0 0', maxWidth: '42ch' }}>
                Les parents gardent la main. Votre offre apparaît comme une récompense possible, jamais comme une bannière.
              </p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              {TRUST.map((t) => (
                <li key={t.title} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: 20 }}>
                  <div aria-hidden style={{ width: 30, height: 30, borderRadius: '50%', border: `2.5px solid ${BRAND.peach}`, marginBottom: 14 }} />
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{t.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', lineHeight: 1.55, marginTop: 5 }}>{t.text}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
