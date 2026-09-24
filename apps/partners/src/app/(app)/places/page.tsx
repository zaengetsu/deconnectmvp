'use client';
import { type Place, formatNumber } from '@rekonect/api-client';
import { Button, C, ErrorBox, Skeleton, Stack } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PlaceDialog } from '@/features/place-dialog';
import { ACCESS_LABEL, placesCopy, placesNote } from '@/lib/labels';
import { usePartner, usePartnerApi } from '@/lib/partner';

const TEMPLATE = 'minmax(220px,2fr) minmax(140px,1.2fr) 110px 130px 120px 100px';

export default function PlacesPage() {
  const api = usePartnerApi();
  const { partnerId, detail, can } = usePartner();
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const places = useQuery({ queryKey: ['places', partnerId], queryFn: () => api.places(partnerId!), enabled: !!partnerId });
  const copy = placesCopy(detail);
  const count = detail?.kind === 'brand' ? (detail?.stores.length ?? 0) : (places.data?.length ?? 0);

  return (
    <Stack gap={20}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: 0 }}>{copy.title}</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>{copy.sub(count)}</p>
        </div>
        {can.manage && (
          <Button variant="dark" onClick={() => setEditing('new')}>
            + Ajouter un lieu
          </Button>
        )}
      </div>
      {places.error && <ErrorBox error={places.error} onRetry={() => places.refetch()} />}
      <div role="table" aria-label={copy.title} style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, padding: '14px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderBottom: '1px solid rgba(22,24,43,.07)', background: '#FBFAF8' }}>
          <div>LIEU</div>
          <div>RESPONSABLE</div>
          <div style={{ textAlign: 'right' }}>OFFRES LOCALES</div>
          <div style={{ textAlign: 'right' }}>ENFANTS À 10 KM</div>
          <div style={{ textAlign: 'right' }}>BONS UTILISÉS</div>
          <div>ACCÈS</div>
        </div>
        {places.isLoading && [0, 1].map((i) => <Skeleton key={i} height={60} radius={0} />)}
        {places.data?.map((p) => {
          const read = p.accessLevel === 'read';
          return (
            <button key={p.id} type="button" role="row" aria-label={p.name} className="rk-row" disabled={!can.manage} onClick={() => setEditing(p)} style={{ display: 'grid', width: '100%', gridTemplateColumns: TEMPLATE, gap: 16, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid rgba(22,24,43,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF9469', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.muted }}>{[p.address, p.postalCode].filter(Boolean).join(', ') || p.city || 'Adresse à compléter'}</span>
                </span>
              </div>
              <div style={{ fontSize: 13, color: C.text2 }}>{p.managerName ?? '—'}</div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{formatNumber(p.localOffers ?? 0)}</div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{p.kidsWithin10km == null ? '< 20' : formatNumber(p.kidsWithin10km)}</div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(p.vouchersUsed ?? 0)}</div>
              <div>
                <span style={{ height: 24, padding: '0 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: read ? '#F1EEE9' : '#EEEFFB', color: read ? '#4A4E66' : '#3C41A8' }}>{ACCESS_LABEL[p.accessLevel] ?? p.accessLevel}</span>
              </div>
            </button>
          );
        })}
        {places.data?.length === 0 && <div style={{ padding: '28px 20px', fontSize: 13, color: C.muted, textAlign: 'center' }}>Aucun lieu pour l’instant.</div>}
      </div>
      <div style={{ background: '#EEEFFB', borderRadius: 16, padding: '16px 18px', fontSize: 13, color: C.text2, lineHeight: 1.55, maxWidth: '90ch' }}>{placesNote(detail)}</div>
      <PlaceDialog value={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}
