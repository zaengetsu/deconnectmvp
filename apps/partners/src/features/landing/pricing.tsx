'use client';
import { formatEuros, HttpClient, type PartnerLeadKind, publicApi } from '@rekonect/api-client';
import { BRAND, Pattern } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { API_URL } from '@/lib/config';
import { FALLBACK_PLANS, PLAN_STYLE } from './content';
import s from './landing.module.css';
import { Container, CtaLink, Kicker, SectionTitle } from './ui';

type PlanView = (typeof FALLBACK_PLANS)[number];

/** Client sans session : la grille tarifaire est publique. */
export function usePublicApi() {
  return useMemo(() => publicApi(new HttpClient({ baseUrl: API_URL })), []);
}

/** Prix d'un plan : « 29 € » / « Sur devis ». */
export function planPrice(cents: number | null): { price: string; per: string } {
  return cents == null ? { price: 'Sur devis', per: '' } : { price: formatEuros(cents), per: '/ mois' };
}

export function Pricing({ onChoose }: { onChoose: (kind: PartnerLeadKind) => void }) {
  const api = usePublicApi();
  const plans = useQuery({ queryKey: ['public-partner-plans'], queryFn: api.partnerPlans, retry: 1, staleTime: 5 * 60_000 });
  const list: PlanView[] = plans.data?.length ? plans.data : FALLBACK_PLANS;
  return (
    <section id="tarifs" data-screen-label="Tarifs" aria-labelledby="tarifs-title">
      <Container style={{ paddingBottom: 110 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Kicker>TARIFS</Kicker>
          <SectionTitle id="tarifs-title">Simple, sans engagement</SectionTitle>
          <p style={{ fontSize: 16, color: '#4A4E66', margin: '12px 0 0' }}>30 jours d'essai sur le plan Partenaire local.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16, alignItems: 'stretch' }}>
          {list.map((p) => (
            <PlanCard key={p.id} plan={p} onChoose={onChoose} />
          ))}
        </div>
      </Container>
    </section>
  );
}

export function PlanCard({ plan, onChoose }: { plan: PlanView; onChoose: (kind: PartnerLeadKind) => void }) {
  const st = PLAN_STYLE[plan.id] ?? { featured: false, cta: 'Nous contacter', kind: 'store' as const };
  const f = st.featured;
  const { price, per } = planPrice(plan.monthlyPriceCents);
  return (
    <article
      data-plan={plan.id}
      className={s.card}
      style={{
        position: 'relative', overflow: 'hidden', background: f ? BRAND.indigo : '#fff', color: f ? '#fff' : BRAND.ink,
        border: `1.5px solid ${f ? BRAND.indigo : 'rgba(22,24,43,.08)'}`, borderRadius: 28, padding: 28, display: 'flex', flexDirection: 'column',
        boxShadow: f ? '0 40px 60px -30px rgba(60,65,168,.7)' : 'none',
      }}
    >
      {f && <Pattern kind="links" fade={200} fadeStop={45} line="rgba(255,255,255,.1)" accent="rgba(255,148,105,.3)" />}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', flex: 1, margin: 0 }}>{plan.name}</h3>
        {plan.tag && <span style={{ height: 24, padding: '0 10px', borderRadius: 999, background: BRAND.peach, color: BRAND.ink, fontSize: 10, fontWeight: 800, letterSpacing: '.06em', display: 'flex', alignItems: 'center' }}>{plan.tag}</span>}
      </div>
      {plan.tagline && <div style={{ position: 'relative', fontSize: 14, opacity: 0.7, marginTop: 4 }}>{plan.tagline}</div>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 22 }}>
        <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.045em' }}>{price}</span>
        {per && <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.65 }}>{per}</span>}
      </div>
      <div style={{ position: 'relative', height: 1, background: f ? 'rgba(255,255,255,.18)' : 'rgba(22,24,43,.08)', margin: '22px 0' }} />
      <ul style={{ position: 'relative', listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
        {plan.features.map((feat) => (
          <li key={feat} style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45 }}>
            <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', background: BRAND.peach, color: BRAND.ink, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>✓</span>
            {feat}
          </li>
        ))}
      </ul>
      <CtaLink href="#contact" variant={f ? 'coral' : 'ink'} onClick={() => onChoose(st.kind)} style={{ position: 'relative', marginTop: 26, boxShadow: 'none' }}>
        {st.cta}
      </CtaLink>
    </article>
  );
}
