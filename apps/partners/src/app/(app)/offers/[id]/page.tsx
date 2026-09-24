'use client';
import { formatNumber } from '@rekonect/api-client';
import { Button, C, ErrorBox, Modal, Spinner, Stack, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { OfferCard } from '@/features/offer-card';
import { OfferEditor } from '@/features/offer-editor';
import { usePartner, usePartnerApi } from '@/lib/partner';

const EDITABLE = ['draft', 'rejected', 'changes_requested'];

export default function OfferPage() {
  const { id } = useParams<{ id: string }>();
  const api = usePartnerApi();
  const { can } = usePartner();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const offer = useQuery({ queryKey: ['offer', id], queryFn: () => api.offer(id) });
  const stats = useQuery({ queryKey: ['offer-stats', id], queryFn: () => api.offerStats(id), enabled: !!offer.data && !EDITABLE.includes(offer.data.status) });
  const act = useMutation({
    mutationFn: async (action: "pause" | "resume" | "submit" | "delete"): Promise<unknown> =>
      action === 'pause' ? api.pauseOffer(id) : action === 'resume' ? api.resumeOffer(id) : action === 'submit' ? api.submitOffer(id) : api.deleteOffer(id),
    onSuccess: (_r, action) => {
      toast({ pause: 'Offre mise en pause', resume: 'Offre relancée', submit: 'Offre envoyée en validation', delete: 'Brouillon supprimé' }[action], 'success');
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['offer', id] });
      if (action === 'delete') router.push('/offers');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (offer.isLoading) return <Spinner />;
  if (offer.error) return <ErrorBox error={offer.error} onRetry={() => offer.refetch()} />;
  const o = offer.data!;
  if (EDITABLE.includes(o.status) && can.edit)
    return (
      <Stack gap={16}>
        <OfferEditor offer={o} />
        {o.status === 'draft' && (
          <button type="button" onClick={() => setConfirmDelete(true)} style={{ fontSize: 13, fontWeight: 700, color: C.redText, alignSelf: 'flex-start' }}>
            Supprimer le brouillon
          </button>
        )}
        <Modal
          open={confirmDelete}
          title="Supprimer ce brouillon ?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
              <Button variant="dangerSoft" loading={act.isPending} onClick={() => act.mutate('delete')}>
                Supprimer
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14, color: C.text2 }}>« {o.title} » sera définitivement supprimé.</div>
        </Modal>
      </Stack>
    );

  const s = stats.data;
  const val = (v: number | null | undefined) => (v == null ? '< 10' : formatNumber(v));
  return (
    <Stack gap={20}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <button type="button" onClick={() => router.push('/offers')} style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>
            ← Offres
          </button>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: '6px 0 0' }}>{o.title}</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>
            {o.kindLabel} · {o.displayStatusLabel}
          </p>
        </div>
        {can.edit && o.status === 'published' && (
          <Button variant="outline" loading={act.isPending} onClick={() => act.mutate('pause')}>
            Mettre en pause
          </Button>
        )}
        {can.edit && o.status === 'paused' && (
          <Button variant="coral" loading={act.isPending} onClick={() => act.mutate('resume')}>
            Relancer l’offre
          </Button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <OfferCard o={o} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {[
              [val(s?.views), 'Personnes ayant vu l’offre'],
              [val(s?.unlocks), 'Récompenses obtenues'],
              [val(s?.redemptions), 'Bons utilisés'],
              [s?.stockLeft == null ? '∞' : formatNumber(s.stockLeft), 'Stock restant'],
            ].map(([v, l]) => (
              <div key={l} style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 18, padding: '16px 18px' }}>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em' }}>{stats.isLoading ? '…' : v}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
          {s?.masked && <div style={{ background: '#EEEFFB', borderRadius: 14, padding: '13px 14px', fontSize: 12, color: C.text2, lineHeight: 1.5 }}>Les volumes inférieurs à 10 restent masqués pour préserver l’anonymat des familles.</div>}
          {o.status === 'pending_review' || o.status === 'pending_brand' ? (
            <div style={{ background: '#FBF0DA', borderRadius: 14, padding: '13px 14px', fontSize: 13, color: C.text2 }}>
              {o.status === 'pending_brand' ? 'En attente de validation par votre enseigne.' : "En cours de vérification par l'équipe Rekonect (48 h maximum)."}
            </div>
          ) : null}
          {o.description && (
            <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 18, padding: '16px 18px', fontSize: 13, color: C.text2, lineHeight: 1.55 }}>{o.description}</div>
          )}
        </div>
      </div>
    </Stack>
  );
}
