'use client';
import { type AdminPartnerRow, formatEuros, formatNumber } from '@rekonect/api-client';
import { Button, C, CountBadge, ErrorBox, PageHeader, Segmented, Skeleton, Stack, StatCard } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { InvitePartnerDialog, PartnerDrawer } from '@/features/partner-dialogs';
import { PartnerLeads } from '@/features/partner-leads';
import { useAdmin } from '@/lib/api';
import { PARTNER_STATUS } from '@/lib/labels';

const TEMPLATE = 'minmax(220px,2fr) 130px 110px 100px 90px 120px 110px';

export default function PartnersPage() {
  const api = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get('id');
  const tab = params.get('tab') === 'leads' ? 'leads' : 'accounts';
  const newLeads = useQuery({ queryKey: ['partner-leads', 'new'], queryFn: () => api.partnerLeads('new') });
  const [invite, setInvite] = useState(false);
  const stats = useQuery({ queryKey: ['partner-stats'], queryFn: api.partnerStats });
  const list = useQuery({ queryKey: ['partners'], queryFn: () => api.partners() });

  const setTab = (t: 'accounts' | 'leads') => {
    const next = new URLSearchParams(params.toString());
    if (t === 'leads') next.set('tab', 'leads');
    else next.delete('tab');
    next.delete('id');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setId = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('id', id);
    else next.delete('id');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const s = stats.data;
  return (
    <Stack gap={20}>
      <PageHeader
        title="Partenaires"
        subtitle="Enseignes, magasins, collectivités et comités d'entreprise"
        actions={
          <Button shadow={false} onClick={() => setInvite(true)}>
            + Inviter un partenaire
          </Button>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <StatCard value={s ? formatNumber(s.accounts) : '…'} label="Comptes partenaires" />
        <StatCard value={s ? formatNumber(s.activeOffers) : '…'} label="Offres actives" />
        <StatCard value={s ? formatNumber(s.vouchersUsed30d) : '…'} label="Bons utilisés (30 j)" />
        <StatCard value={s ? formatEuros(Math.round(s.partnerMrrCents / 100) * 100) : '…'} label="MRR partenaires" />
      </div>
      <Segmented
        ariaLabel="Vue"
        value={tab}
        onChange={setTab}
        style={{ alignSelf: 'flex-start' }}
        options={[
          { id: 'accounts', label: 'Comptes' },
          { id: 'leads', label: 'Demandes de contact', badge: newLeads.data?.counts.new ? <CountBadge>{newLeads.data.counts.new}</CountBadge> : undefined },
        ]}
      />
      {tab === 'leads' ? (
        <PartnerLeads />
      ) : (
        <>
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      <div role="table" aria-label="Partenaires" style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, padding: '14px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderBottom: '1px solid rgba(22,24,43,.07)', background: '#FBFAF8' }}>
          <div>PARTENAIRE</div>
          <div>TYPE</div>
          <div>PLAN</div>
          <div style={{ textAlign: 'right' }}>LIEUX</div>
          <div style={{ textAlign: 'right' }}>OFFRES</div>
          <div style={{ textAlign: 'right' }}>ENFANTS TOUCHÉS</div>
          <div>STATUT</div>
        </div>
        {list.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} height={60} radius={0} />)}
        {list.data?.map((p) => <PartnerRow key={p.id} p={p} onOpen={() => setId(p.id)} />)}
        {list.data?.length === 0 && <div style={{ padding: '28px 20px', fontSize: 13, color: C.muted, textAlign: 'center' }}>Aucun partenaire pour l’instant.</div>}
      </div>
        </>
      )}
      <InvitePartnerDialog open={invite} onClose={() => setInvite(false)} />
      <PartnerDrawer partner={list.data?.find((p) => p.id === openId) ?? null} onClose={() => setId(null)} />
    </Stack>
  );
}

function PartnerRow({ p, onOpen }: { p: AdminPartnerRow; onOpen: () => void }) {
  const st = PARTNER_STATUS[p.status];
  return (
    <button type="button" role="row" aria-label={p.name} className="rk-row" onClick={onOpen} style={{ display: 'grid', width: '100%', gridTemplateColumns: TEMPLATE, gap: 16, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(22,24,43,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, paddingLeft: p.depth ? 28 : 0 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: p.color, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{p.initials}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.subtitle}</span>
        </span>
      </div>
      <div style={{ fontSize: 13, color: C.text2 }}>{p.kindLabel}</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.plan}</div>
      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{p.places ? formatNumber(p.places) : '—'}</div>
      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{formatNumber(p.activeOffers)}</div>
      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{p.kidsReached30d ? formatNumber(p.kidsReached30d) : '—'}</div>
      <div>
        <span style={{ height: 26, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: st.bg, color: st.fg }}>{st.label}</span>
      </div>
    </button>
  );
}
