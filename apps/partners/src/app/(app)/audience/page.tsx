'use client';
import { formatNumber } from '@rekonect/api-client';
import { C, ErrorBox, Skeleton, Stack } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { usePartner, usePartnerApi } from '@/lib/partner';

/** Position d'un lieu dans le cadre de la carte (marge de 18 % pour garder les cercles visibles). */
function project(lat: number, lng: number, b: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  const spanLng = b.maxLng - b.minLng || 1;
  const spanLat = b.maxLat - b.minLat || 1;
  const x = b.maxLng === b.minLng ? 50 : 18 + ((lng - b.minLng) / spanLng) * 64;
  const y = b.maxLat === b.minLat ? 45 : 14 + ((b.maxLat - lat) / spanLat) * 58;
  return { x: `${x}%`, y: `${y}%` };
}

export default function AudiencePage() {
  const api = usePartnerApi();
  const { partnerId } = usePartner();
  const aud = useQuery({ queryKey: ['audience', partnerId], queryFn: () => api.audience(partnerId!), enabled: !!partnerId });
  const data = aud.data;
  const zones = (data?.zones ?? []).filter((z) => z.latitude != null && z.longitude != null);
  const maxKids = Math.max(1, ...zones.map((z) => z.kids ?? 0));
  const bands = data?.ages.bands ?? [];
  const maxPct = Math.max(1, ...bands.map((b) => b.percent ?? 0));
  const sorted = [...bands].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  const color = (id: string) => (sorted.slice(0, 2).some((b) => b.id === id && (b.percent ?? 0) > 0) ? '#3C41A8' : sorted[2]?.id === id ? '#B9BCE8' : '#D9DAF3');

  return (
    <Stack gap={20}>
      <div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: 0 }}>Audience &amp; zones</h1>
        <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>Où sont les familles actives autour de vos lieux. Volumes arrondis à la dizaine, zones de moins de 20 familles masquées.</p>
      </div>
      {aud.error && <ErrorBox error={aud.error} onRetry={() => aud.refetch()} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)', gap: 12 }}>
        <div role="img" aria-label="Carte des zones autour de vos lieux" style={{ background: '#E9EDF2', borderRadius: 20, minHeight: 460, position: 'relative', overflow: 'hidden', backgroundImage: 'radial-gradient(circle, rgba(22,24,43,.1) 1.2px, transparent 1.3px)', backgroundSize: '14px 14px', border: '1px solid rgba(22,24,43,.08)' }}>
          {data?.bounds &&
            zones.map((z) => {
              const pos = project(z.latitude!, z.longitude!, data.bounds!);
              const r = `${Math.round(80 + 80 * ((z.kids ?? 0) / maxKids))}px`;
              return (
                <div key={z.placeId}>
                  <div style={{ position: 'absolute', left: pos.x, top: pos.y, width: r, height: r, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'rgba(60,65,168,.12)', border: '1.5px solid rgba(60,65,168,.45)' }} />
                  <div style={{ position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#FF9469', border: '3px solid #fff', boxShadow: '0 2px 6px rgba(22,24,43,.3)' }} />
                    <span style={{ background: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 4px 12px -4px rgba(22,24,43,.25)' }}>
                      {z.name} · {z.masked ? '< 20' : formatNumber(z.kids)}
                    </span>
                  </div>
                </div>
              );
            })}
          {data && zones.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: C.muted, padding: 30, textAlign: 'center' }}>Ajoutez l’adresse de vos lieux (latitude et longitude) pour voir les zones.</div>}
          <div style={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', gap: 14, background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: C.text2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF9469' }} />
              Vos lieux
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(60,65,168,.25)', border: '1.5px solid rgba(60,65,168,.5)' }} />
              Zone de {data?.radiusKm ?? 10} km
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 14 }}>Par zone</div>
            {!data && <Skeleton height={120} />}
            {data?.zones.map((z) => (
              <div key={z.placeId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid rgba(22,24,43,.05)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{z.city ? `${z.name} · ${z.city}` : z.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 1 }}>{z.masked ? 'Moins de 20 familles' : `${formatNumber(z.families)} familles · ${formatNumber(z.activeFamilies)} actives`}</span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{z.masked ? '—' : formatNumber(z.kids)}</span>
              </div>
            ))}
            {data?.zones.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Aucun lieu géolocalisé.</div>}
          </div>
          <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 14 }}>Âge des enfants</div>
            {data?.ages.masked ? (
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>La répartition s’affiche à partir de 20 enfants dans vos zones.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100 }}>
                {bands.map((b) => (
                  <div key={b.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{b.percent ?? 0} %</span>
                    <div style={{ width: '100%', height: `${Math.round(((b.percent ?? 0) / maxPct) * 100)}%`, minHeight: 4, borderRadius: 7, background: color(b.id) }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>{b.label.replace(' ans', '').replace(' et +', '+')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Stack>
  );
}
