'use client';
import { formatRelative, type PartnerLead, type PartnerLeadStatus } from '@rekonect/api-client';
import { C, CountBadge, Dot, EmptyState, ErrorBox, Pill, Segmented, Select, Skeleton, TONES, type Tone, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAdmin } from '@/lib/api';

/** Statuts d'une demande « Être rappelé » (landing partenaires). */
export const LEAD_STATUS: Record<PartnerLeadStatus, { label: string; tone: Tone }> = {
  new: { label: 'Nouvelle', tone: 'coral' },
  contacted: { label: 'Rappelée', tone: 'blue' },
  converted: { label: 'Devenue partenaire', tone: 'green' },
  archived: { label: 'Archivée', tone: 'muted' },
};
const FILTERS: { id: 'all' | PartnerLeadStatus; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'new', label: 'Nouvelles' },
  { id: 'contacted', label: 'Rappelées' },
  { id: 'converted', label: 'Converties' },
  { id: 'archived', label: 'Archivées' },
];
const TEMPLATE = 'minmax(220px,1.6fr) 120px minmax(200px,1.2fr) 110px 190px';

/** File des demandes de contact reçues depuis la landing partenaires. */
export function PartnerLeads() {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | PartnerLeadStatus>('new');
  const list = useQuery({ queryKey: ['partner-leads', filter], queryFn: () => api.partnerLeads(filter === 'all' ? undefined : filter) });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PartnerLeadStatus }) => api.setPartnerLeadStatus(id, status),
    onSuccess: (lead) => {
      toast(`${lead.organization} : ${LEAD_STATUS[lead.status].label.toLowerCase()}`, 'success');
      void qc.invalidateQueries({ queryKey: ['partner-leads'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Segmented
        ariaLabel="Statut des demandes"
        value={filter}
        onChange={setFilter}
        style={{ alignSelf: 'flex-start' }}
        options={FILTERS.map((f) => {
          const n = f.id === 'all' ? total : (counts[f.id] ?? 0);
          return { id: f.id, label: f.label, badge: n ? <CountBadge>{n}</CountBadge> : undefined };
        })}
      />
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      <div role="table" aria-label="Demandes de contact" style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, padding: '14px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderBottom: `1px solid ${C.headBorder}`, background: C.surfaceAlt }}>
          <div>CONTACT</div>
          <div>TYPE</div>
          <div>MESSAGE</div>
          <div>REÇUE</div>
          <div>STATUT</div>
        </div>
        {list.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={0} />)}
        {list.data?.items.map((l) => <LeadRow key={l.id} lead={l} busy={update.isPending && update.variables?.id === l.id} onStatus={(status) => update.mutate({ id: l.id, status })} />)}
        {list.data?.items.length === 0 && (
          <EmptyState title={filter === 'new' ? 'Aucune nouvelle demande' : 'Aucune demande'}>
            Les demandes « Être rappelé » de la page partenaires arrivent ici, et par email si PARTNER_LEADS_EMAIL est renseigné.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function LeadRow({ lead, busy, onStatus }: { lead: PartnerLead; busy: boolean; onStatus: (s: PartnerLeadStatus) => void }) {
  const st = LEAD_STATUS[lead.status];
  return (
    <div role="row" aria-label={lead.organization} style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${C.rowBorder}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.organization}</div>
        <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lead.fullName} · <a href={`mailto:${lead.email}`}>{lead.email}</a>
        </div>
      </div>
      <div>
        <Pill tone="neutral">{lead.kindLabel}</Pill>
      </div>
      <div style={{ fontSize: 13, color: lead.message ? C.text2 : C.muted, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{lead.message || '—'}</div>
      <div style={{ fontSize: 12, color: C.muted }}>{formatRelative(lead.createdAt)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dot color={TONES[st.tone][1]} size={8} />
        <Select aria-label={`Statut de ${lead.organization}`} value={lead.status} disabled={busy} onChange={(e) => onStatus(e.target.value as PartnerLeadStatus)} style={{ height: 34, fontSize: 13, flex: 1, minWidth: 0 }}>
          {(Object.keys(LEAD_STATUS) as PartnerLeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS[s].label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
