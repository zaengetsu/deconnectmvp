'use client';
import { categoryImage, formatDelta, formatEuros, formatNumber } from '@rekonect/api-client';
import { C, ErrorBox, HeroBanner, KpiCard, Skeleton, Stack, useSession } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OFFER_STATUS } from '@/lib/labels';
import { usageLine } from '@/lib/offers';
import { usePartner, usePartnerApi } from '@/lib/partner';

const FUNNEL = {
  seen: ['Offre vue', 'enfants et parents', '#D9DAF3'],
  started: ['Défi commencé', 'au moins 1 activité', '#B9BCE8'],
  obtained: ['Récompense obtenue', 'condition remplie', '#FF9469'],
  used: ['Bon utilisé', 'en magasin ou en ligne', '#3C41A8'],
} as const;
const RANGES = [
  { days: 7, label: '7 derniers jours' },
  { days: 30, label: '30 derniers jours' },
  { days: 90, label: '90 derniers jours' },
];

/** Valeur masquée sous le seuil d'anonymat (moins de 10). */
const masked = (v: number | null) => (v == null ? '< 10' : formatNumber(v));
const deltaOf = (d: number | null) => (d == null ? null : formatDelta(d));

export default function DashboardPage() {
  const { user } = useSession();
  const { partnerId, detail } = usePartner();
  const api = usePartnerApi();
  const router = useRouter();
  const [days, setDays] = useState(30);
  const dash = useQuery({ queryKey: ['dashboard', partnerId, days], queryFn: () => api.dashboard(partnerId!, days), enabled: !!partnerId });
  const d = dash.data;
  const first = (user?.fullName ?? '').split(/\s+/)[0];
  const period = days === 7 ? 'cette semaine' : days === 30 ? 'ce mois-ci' : 'ces trois derniers mois';
  const intro = !d
    ? ' '
    : d.kpis.kidsReached.value != null
      ? `Vos offres ont touché ${formatNumber(d.kpis.kidsReached.value)} enfants ${period}.`
      : detail?.kind === 'store'
        ? 'Vos statistiques apparaîtront dès que 10 enfants auront vu vos offres.'
        : 'Vos statistiques s’affichent dès 10 enfants touchés, pour préserver l’anonymat des familles.';
  const top = d?.funnel[0]?.value ?? null;

  return (
    <Stack gap={20}>
      <HeroBanner
        kicker={detail?.name?.toUpperCase()}
        title={`Bonjour ${first}`}
        subtitle={intro}
        aside={
          <label style={{ position: 'relative', height: 38, padding: '0 16px', borderRadius: 999, background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.22)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {RANGES.find((r) => r.days === days)?.label} <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
            <select aria-label="Période" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {dash.error && <ErrorBox error={dash.error} onRetry={() => dash.refetch()} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
        {d ? (
          <>
            <KpiCard label="Enfants touchés" value={masked(d.kpis.kidsReached.value)} delta={deltaOf(d.kpis.kidsReached.delta)} deltaTone={(d.kpis.kidsReached.delta ?? 0) < 0 ? 'red' : 'green'} sub="ont vu au moins une offre" />
            <KpiCard label="Récompenses obtenues" value={masked(d.kpis.rewardsObtained.value)} delta={deltaOf(d.kpis.rewardsObtained.delta)} deltaTone={(d.kpis.rewardsObtained.delta ?? 0) < 0 ? 'red' : 'green'} sub="défis réussis ou points échangés" />
            <KpiCard label="Bons utilisés en magasin" value={masked(d.kpis.vouchersUsed.value)} delta={deltaOf(d.kpis.vouchersUsed.delta)} deltaTone={(d.kpis.vouchersUsed.delta ?? 0) < 0 ? 'red' : 'green'} sub={d.kpis.vouchersUsed.rate != null ? `${d.kpis.vouchersUsed.rate} % des bons obtenus` : 'bons scannés en caisse'} />
            <KpiCard label="Panier moyen associé" value={d.kpis.averageBasketCents.value != null ? formatEuros(Math.round(d.kpis.averageBasketCents.value / 100) * 100) : '—'} delta={deltaOf(d.kpis.averageBasketCents.delta)} sub="déclaré par les magasins" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={128} radius={20} />)
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(280px,1fr)', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>Du défi au passage en magasin</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 22 }}>Chaque étape, sur l'ensemble de vos offres actives</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(d?.funnel ?? []).map((f) => {
              const [label, sub, color] = FUNNEL[f.key];
              const w = f.value != null && top ? Math.max(4, Math.round((f.value / top) * 100)) : 4;
              return (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '170px minmax(0,1fr) 80px', gap: 16, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{sub}</div>
                  </div>
                  <div style={{ height: 30, borderRadius: 9, background: '#F6F4F1', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 9 }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{masked(f.value)}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>Activités qui déclenchent vos offres</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>Part des bons obtenus par type d'activité</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(d?.triggers ?? []).map((t) => (
              <div key={t.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <img src={categoryImage(t.categorySlug)} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{t.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{t.percent}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: '#F6F4F1', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${t.percent}%`, background: '#FF9469', borderRadius: 999 }} />
                </div>
              </div>
            ))}
            {d && d.triggers.length === 0 && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>La répartition apparaît à partir de 10 bons obtenus sur la période.</div>}
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px 12px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Vos offres en cours</div>
          <button type="button" onClick={() => router.push('/offers')} style={{ fontSize: 12, fontWeight: 700, color: '#3C41A8' }}>
            Toutes les offres →
          </button>
        </div>
        {(d?.activeOffers ?? []).slice(0, 3).map((o) => {
          const u = usageLine(o);
          const [sb, sf] = OFFER_STATUS[o.displayStatus];
          return (
            <button key={o.id} type="button" className="rk-row" onClick={() => router.push(`/offers/${o.id}`)} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.3fr) 180px 110px', gap: 18, alignItems: 'center', padding: '13px 20px', borderTop: '1px solid rgba(22,24,43,.05)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{o.title}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {o.kindLabel} · {o.scope}
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.45 }}>{o.condition}</div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5 }}>
                  <span>{u.used}</span>
                  <span>{u.pct}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: '#F6F4F1', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: u.width, background: '#3C41A8', borderRadius: 999 }} />
                </div>
              </div>
              <div>
                <span style={{ height: 26, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: sb, color: sf }}>{o.displayStatusLabel}</span>
              </div>
            </button>
          );
        })}
        {d && d.activeOffers.length === 0 && (
          <div style={{ padding: '16px 20px 22px', fontSize: 13, color: C.muted, borderTop: '1px solid rgba(22,24,43,.05)' }}>
            Aucune offre active pour l’instant.{' '}
            <button type="button" onClick={() => router.push('/offers/new')} style={{ fontWeight: 700, color: C.primary }}>
              Créer une offre
            </button>
          </div>
        )}
      </div>
    </Stack>
  );
}
