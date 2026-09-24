'use client';
import { type PromoCode, formatEuros, formatNumber, formatShortDate } from '@rekonect/api-client';
import { C, ErrorBox, PageHeader, Segmented, Skeleton, Stack, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PlanDrawer } from '@/features/plan-drawer';
import { PromoDialog, describePromo } from '@/features/promo-dialog';
import { useAdmin } from '@/lib/api';
import { EVENT_COLOR } from '@/lib/labels';
import { planAlt, planPrice, roundEuro, subscribersLabel } from '@/lib/plans';

export default function PlansPage() {
  const api = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get('tab') === 'partner' ? 'partner' : 'family';
  const planId = params.get('plan');
  const [promoOpen, setPromoOpen] = useState(false);
  const overview = useQuery({ queryKey: ['billing-overview'], queryFn: api.billingOverview });
  const plans = useQuery({ queryKey: ['plans', tab], queryFn: () => api.plans(tab) });
  const events = useQuery({ queryKey: ['billing-events'], queryFn: api.billingEvents });
  const promos = useQuery({ queryKey: ['promo-codes'], queryFn: api.promoCodes });

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) (v ? next.set(k, v) : next.delete(k));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const o = overview.data;
  return (
    <Stack gap={20}>
      <PageHeader
        title="Plans & abonnements"
        subtitle={o ? `Revenu mensuel récurrent : ${formatEuros(roundEuro(o.mrrCents))} · familles ${formatEuros(roundEuro(o.familyMrrCents))} · partenaires ${formatEuros(roundEuro(o.partnerMrrCents))}` : ' '}
        actions={
          <Segmented
            ariaLabel="Offres"
            height={34}
            padding="0 16px"
            value={tab}
            onChange={(v) => setParam({ tab: v === 'partner' ? 'partner' : null, plan: null })}
            options={[
              { id: 'family', label: 'Offres familles' },
              { id: 'partner', label: 'Offres partenaires' },
            ]}
          />
        }
      />
      {plans.error && <ErrorBox error={plans.error} onRetry={() => plans.refetch()} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        {!plans.data && [0, 1, 2].map((i) => <Skeleton key={i} height={420} radius={22} />)}
        {plans.data?.map((p) => {
          const { price, per } = planPrice(p);
          const featured = !!p.tag && p.sortOrder === 2;
          return (
            <article key={p.id} aria-label={p.name} style={{ background: '#fff', border: `1.5px solid ${featured ? '#3C41A8' : 'rgba(22,24,43,.08)'}`, borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', opacity: p.isActive ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: p.color }} />
                <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>{p.name}</span>
                {p.tag && <span style={{ height: 22, padding: '0 9px', borderRadius: 999, background: '#FFEDE4', color: '#C2582A', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', letterSpacing: '.05em' }}>{p.tag}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 16 }}>
                <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.04em' }}>{price}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{per}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{planAlt(p)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '18px 0' }}>
                <div style={{ background: '#F6F4F1', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(p.subscribers)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{subscribersLabel(p)}</div>
                </div>
                <div style={{ background: '#F6F4F1', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{p.mrrCents ? formatEuros(roundEuro(p.mrrCents)) : '—'}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>MRR</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                {p.features.map((ft) => (
                  <div key={ft} style={{ display: 'flex', gap: 9, fontSize: 13, lineHeight: 1.4, color: C.text2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, marginTop: 6, flexShrink: 0 }} />
                    {ft}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setParam({ plan: p.id })} style={{ height: 42, borderRadius: 999, border: '1.5px solid rgba(22,24,43,.14)', fontSize: 13, fontWeight: 700, textAlign: 'center', marginTop: 20 }}>
                Modifier le plan
              </button>
            </article>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 12px', fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>Derniers événements</div>
          {events.data?.map((e) => {
            const amount = e.amountCents ?? 0;
            const failed = e.type === 'payment_failed';
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) minmax(0,1.2fr) 90px', gap: 14, alignItems: 'center', padding: '12px 20px', borderTop: '1px solid rgba(22,24,43,.05)' }}>
                <div style={{ fontSize: 12, color: C.muted }}>{formatShortDate(e.occurredAt)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.who}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: EVENT_COLOR[e.type] ?? C.muted, flexShrink: 0 }} />
                  {e.description ?? e.type}
                </div>
                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: failed || amount < 0 ? '#AE3A50' : amount > 0 ? '#4A7A5F' : '#8A8FA6' }}>
                  {e.amountCents == null ? '—' : failed ? formatEuros(Math.abs(amount), { decimals: 'always' }) : formatEuros(amount, { signed: true, decimals: 'always' })}
                </div>
              </div>
            );
          })}
          {events.data?.length === 0 && <div style={{ padding: '14px 20px 20px', fontSize: 13, color: C.muted }}>Aucun événement pour l’instant.</div>}
        </div>
        <PromoCodes codes={promos.data} onCreate={() => setPromoOpen(true)} />
      </div>
      <PlanDrawer planId={planId} plans={plans.data ?? []} onClose={() => setParam({ plan: null })} />
      <PromoDialog open={promoOpen} onClose={() => setPromoOpen(false)} />
    </Stack>
  );
}

function PromoCodes({ codes, onCreate }: { codes?: PromoCode[]; onCreate: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: (p: PromoCode) => api.setPromoActive(p.id, !p.isActive),
    onSuccess: (_r, p) => {
      toast(p.isActive ? `Code ${p.code} désactivé` : `Code ${p.code} réactivé`, 'success');
      void qc.invalidateQueries({ queryKey: ['promo-codes'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Codes promo</div>
        <button type="button" onClick={onCreate} style={{ fontSize: 12, fontWeight: 700, color: '#3C41A8' }}>
          + Créer
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {codes?.map((p) => (
          <div key={p.id} style={{ background: '#F6F4F1', borderRadius: 14, padding: '13px 14px', opacity: p.state === 'active' ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 700, flex: 1 }}>{p.code}</span>
              <button type="button" title={p.isActive ? 'Désactiver' : 'Réactiver'} onClick={() => toggle.mutate(p)} style={{ fontSize: 11, fontWeight: 700, color: p.state === 'active' ? '#4A7A5F' : '#8A8FA6' }}>
                {p.state === 'active' ? 'Actif' : p.isActive ? 'Expiré' : 'Désactivé'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>{describePromo(p)}</div>
          </div>
        ))}
        {codes?.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Aucun code pour l’instant.</div>}
      </div>
    </div>
  );
}
