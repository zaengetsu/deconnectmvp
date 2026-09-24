'use client';
import { categoryImage, formatDelta, formatDuration, formatEuros, formatLongDate, formatNumber, formatPercent } from '@rekonect/api-client';
import { C, Card, CardLink, CardTitle, ErrorBox, HeroBanner, KpiCard, Segmented, Skeleton, Stack } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAdmin } from '@/lib/api';
import { capitalize, PLAN_DOT, REPORT_REASONS } from '@/lib/labels';

type Range = '7' | '30' | '365';
const RANGES = [
  { id: '7' as const, label: '7 jours' },
  { id: '30' as const, label: '30 jours' },
  { id: '365' as const, label: '12 mois' },
];
const PERIOD_WORD: Record<Range, string> = { '7': 'cette semaine', '30': 'ce mois-ci', '365': 'cette année' };
const PLAN_FILL: Record<string, string> = { free: '#D9DAF3', family: '#3C41A8', family_plus: '#FF9469' };

function waitLabel(iso: string | null, now: Date) {
  if (!iso) return 'Aucune offre en attente';
  const h = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'La plus ancienne vient d’arriver';
  if (h < 24) return `La plus ancienne attend depuis ${h} h`;
  const d = Math.floor(h / 24);
  return `La plus ancienne attend depuis ${d} jour${d > 1 ? 's' : ''}`;
}

function Alert({ count, title, sub, bg, fg, onClick }: { count: number; title: string; sub: string; bg: string; fg: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 16, padding: '14px 16px' }}>
      <span style={{ width: 34, height: 34, borderRadius: 11, background: bg, color: fg, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{formatNumber(count)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>{sub}</span>
      </span>
      <span style={{ fontSize: 16, color: C.muted }}>›</span>
    </button>
  );
}

export default function OverviewPage() {
  const api = useAdmin();
  const router = useRouter();
  const [range, setRange] = useState<Range>('30');
  const days = Number(range);
  const overview = useQuery({ queryKey: ['overview', days], queryFn: () => api.overview(days) });
  const months = useQuery({ queryKey: ['active-families'], queryFn: api.activeFamilies });
  const billing = useQuery({ queryKey: ['billing-overview'], queryFn: api.billingOverview });
  const topActs = useQuery({ queryKey: ['top-activities', days], queryFn: () => api.topActivities(days) });
  const topRews = useQuery({ queryKey: ['top-rewards', days], queryFn: () => api.topRewards(days) });

  const o = overview.data;
  const now = o ? new Date(o.asOf) : new Date();
  const maxMonth = Math.max(1, ...(months.data ?? []).map((m) => m.paid + m.free));
  const scale = 190 / (maxMonth * 1.042);

  return (
    <Stack gap={22}>
      <HeroBanner
        tone="ink"
        kicker="BACK-OFFICE REKONECT"
        title="Vue d'ensemble"
        subtitle={o ? `Données au ${formatLongDate(o.asOf)}` : ' '}
        aside={<Segmented ariaLabel="Période" options={RANGES} value={range} onChange={setRange} track="rgba(255,255,255,.9)" />}
      />
      {overview.error && <ErrorBox error={overview.error} onRetry={() => overview.refetch()} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        {o ? (
          <>
            <Alert count={o.alerts.pendingOffers} title="Offres partenaires à modérer" sub={waitLabel(o.alerts.oldestPendingAt, now)} bg="#FFEDE4" fg="#C2582A" onClick={() => router.push('/rewards?tab=partner')} />
            <Alert count={o.alerts.failedPayments} title="Paiements échoués" sub={o.alerts.failedPayments ? 'Relance automatique envoyée · nouvelle tentative par Stripe' : 'Aucun impayé en cours'} bg="#FBE9EC" fg="#AE3A50" onClick={() => router.push('/plans')} />
            <Alert
              count={o.alerts.flaggedActivities}
              title="Activités signalées"
              sub={o.alerts.flagReasons.length ? capitalize(o.alerts.flagReasons.map((r) => REPORT_REASONS[r] ?? r).join(', ')) : 'Aucun signalement ouvert'}
              bg="#FBF0DA"
              fg="#96681A"
              onClick={() => router.push('/activities?status=flagged')}
            />
          </>
        ) : (
          [0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={16} />)
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        {o ? (
          <>
            <KpiCard label="Familles actives" value={formatNumber(o.kpis.activeFamilies.value)} delta={o.kpis.activeFamilies.delta != null ? formatDelta(o.kpis.activeFamilies.delta) : null} deltaTone={(o.kpis.activeFamilies.delta ?? 0) < 0 ? 'red' : 'green'} sub={`${formatNumber(o.kpis.activeFamilies.newFamilies)} nouvelle${o.kpis.activeFamilies.newFamilies > 1 ? 's' : ''} ${PERIOD_WORD[range]}`} />
            <KpiCard label="Enfants inscrits" value={formatNumber(o.kpis.children.value)} delta={o.kpis.children.delta != null ? formatDelta(o.kpis.children.delta) : null} deltaTone={(o.kpis.children.delta ?? 0) < 0 ? 'red' : 'green'} sub={`${formatNumber(o.kpis.children.perFamily, 2)} enfant par famille`} />
            <KpiCard label="Activités validées" value={formatNumber(o.kpis.validatedActivities.value)} delta={o.kpis.validatedActivities.delta != null ? formatDelta(o.kpis.validatedActivities.delta) : null} deltaTone={(o.kpis.validatedActivities.delta ?? 0) < 0 ? 'red' : 'green'} sub={`${formatNumber(o.kpis.validatedActivities.perActiveChild, Number.isInteger(o.kpis.validatedActivities.perActiveChild) ? 0 : 1)} par enfant actif`} />
            <KpiCard label="Revenu mensuel" value={formatEuros(Math.round(o.kpis.mrr.valueCents / 100) * 100)} delta={o.kpis.mrr.delta != null ? formatDelta(o.kpis.mrr.delta) : null} deltaTone={(o.kpis.mrr.delta ?? 0) < 0 ? 'red' : 'green'} sub={`dont ${formatEuros(Math.round(o.kpis.mrr.partnerCents / 100) * 100)} partenaires`} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={128} radius={20} />)
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)', gap: 12 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Familles actives</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.text2 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#3C41A8' }} />
              Payantes
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: C.text2 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#D9DAF3' }} />
              Gratuites
            </div>
          </div>
          <div role="img" aria-label="Familles actives par mois" style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 200, paddingBottom: 4, borderBottom: '1px solid rgba(22,24,43,.08)' }}>
            {(months.data ?? Array.from({ length: 12 }, (_, i) => ({ label: '', month: String(i), paid: 0, free: 0 }))).map((m) => (
              <div key={m.month} title={`${m.month} : ${m.paid} payantes, ${m.free} gratuites`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', gap: 2 }}>
                <div style={{ height: `${m.free * scale}px`, borderRadius: '6px 6px 2px 2px', background: '#D9DAF3' }} />
                <div style={{ height: `${m.paid * scale}px`, borderRadius: '2px 2px 6px 6px', background: '#3C41A8' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 9 }}>
            {(months.data ?? []).map((m) => (
              <div key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.muted }}>
                {m.label}
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 18 }}>Répartition des plans</div>
          <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', gap: 3, marginBottom: 20 }}>
            {(billing.data?.distribution ?? []).filter((d) => d.percent > 0).map((d) => (
              <div key={d.planId} style={{ width: `${d.percent}%`, background: PLAN_FILL[d.planId] ?? d.color }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {(billing.data?.distribution ?? []).map((d) => (
              <div key={d.planId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: PLAN_DOT[d.planId] ?? d.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(d.count)}</span>
                <span style={{ width: 48, textAlign: 'right', fontSize: 12, color: C.muted }}>{formatPercent(d.percent, 1)}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(22,24,43,.07)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.03em' }}>{formatPercent(billing.data?.conversionRate, 1)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Conversion gratuit → payant</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.03em' }}>{formatPercent(billing.data?.churnRate, 1)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Churn mensuel</div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 12 }}>
        <Card>
          <CardTitle action={<CardLink onClick={() => router.push('/activities')}>Catalogue →</CardLink>}>Activités qui fonctionnent</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 72px 110px', gap: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, paddingBottom: 9, borderBottom: '1px solid rgba(22,24,43,.07)' }}>
            <div>ACTIVITÉ</div>
            <div style={{ textAlign: 'right' }}>VALIDÉES</div>
            <div>TAUX DE VALIDATION</div>
          </div>
          {(topActs.data ?? []).map((a) => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 72px 110px', gap: 14, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid rgba(22,24,43,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: '#F1EEE9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <img src={categoryImage(a.categorySlug)} alt="" style={{ width: 17, height: 17, objectFit: 'contain' }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{a.category ?? 'Sans catégorie'}</span>
                </span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(a.validated)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#F1EEE9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${a.validationRate ?? 0}%`, background: '#6E9E85', borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, width: 30, whiteSpace: 'nowrap' }}>{a.validationRate == null ? '—' : `${Math.round(a.validationRate)} %`}</span>
              </div>
            </div>
          ))}
          {topActs.data?.length === 0 && <div style={{ fontSize: 13, color: C.muted, padding: '14px 0' }}>Aucune activité validée sur la période.</div>}
        </Card>

        <Card>
          <CardTitle action={<CardLink onClick={() => router.push('/rewards')}>Voir tout →</CardLink>}>Récompenses les plus échangées</CardTitle>
          {(topRews.data ?? []).map((r) => (
            <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(22,24,43,.05)' }}>
              <span style={{ width: 24, fontSize: 12, fontWeight: 800, color: C.muted }}>{r.rank}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 1 }}>{r.source}</span>
              </span>
              {r.partner && <span style={{ height: 22, padding: '0 8px', borderRadius: 999, background: '#FFEDE4', color: '#C2582A', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', letterSpacing: '.04em' }}>PARTENAIRE</span>}
              <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', width: 54, textAlign: 'right' }}>{formatNumber(r.exchanges)}</span>
            </div>
          ))}
          {topRews.data?.length === 0 && <div style={{ fontSize: 13, color: C.muted, padding: '14px 0' }}>Aucun échange sur la période.</div>}
        </Card>

        <Card>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 16 }}>Santé de la plateforme</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { v: formatDuration(o?.health.avgValidationDelaySeconds), l: 'Délai de validation', s: 'Temps moyen entre « C’est fait » et la réponse du parent' },
              { v: formatPercent(o?.health.refusalRate, 1), l: 'Taux de refus', s: `Sur les ${days === 365 ? '12 derniers mois' : `${days} derniers jours`}` },
              { v: formatNumber(o?.health.streaks7Plus), l: 'Séries de 7 jours et +', s: 'Enfants actifs chaque jour cette semaine' },
              { v: formatPercent(o?.health.notificationsEnabledRate, 0), l: 'Notifications activées', s: 'Côté parents' },
            ].map((h) => (
              <div key={h.l} style={{ background: '#F6F4F1', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.03em' }}>{o ? h.v : '…'}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, marginTop: 3 }}>{h.l}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>{h.s}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Stack>
  );
}
