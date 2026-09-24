'use client';
import type { Offer } from '@rekonect/api-client';
import { Button, C, Chips, ErrorBox, Field, Modal, PageHeader, Skeleton, Stack, TextArea, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { matchesFilter, OfferCard } from '@/features/offer-card';
import { usePartner, usePartnerApi } from '@/lib/partner';

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'active', label: 'Actives' },
  { id: 'in_review', label: 'En validation' },
  { id: 'child_reward', label: 'Récompenses enfant' },
  { id: 'parent_voucher', label: 'Bons parents' },
  { id: 'draft', label: 'Brouillons' },
];

export default function OffersPage() {
  const api = usePartnerApi();
  const { partnerId, detail, can } = usePartner();
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const offers = useQuery({ queryKey: ['offers', partnerId, 'all'], queryFn: () => api.offers(partnerId!), enabled: !!partnerId });
  const isBrand = (detail?.stores.length ?? 0) > 0;
  const storeOffers = useQuery({ queryKey: ['store-offers', partnerId], queryFn: () => api.storeOffers(partnerId!), enabled: !!partnerId && isBrand && can.edit });
  const list = (offers.data ?? []).filter((o) => matchesFilter(o, filter));

  return (
    <Stack gap={20}>
      <PageHeader
        title="Offres"
        subtitle="Récompenses pour les enfants, bons pour les parents, défis sponsorisés"
        actions={
          can.edit && (
            <Button variant="dark" onClick={() => router.push('/offers/new')}>
              + Nouvelle offre
            </Button>
          )
        }
      />
      {storeOffers.data && storeOffers.data.length > 0 && <StoreReview offers={storeOffers.data} />}
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {offers.error && <ErrorBox error={offers.error} onRetry={() => offers.refetch()} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
        {offers.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} height={300} radius={20} />)}
        {list.map((o) => (
          <OfferCard key={o.id} o={o} onOpen={() => router.push(`/offers/${o.id}`)} />
        ))}
      </div>
      {offers.data && list.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 28, textAlign: 'center', fontSize: 14, color: C.muted }}>
          {offers.data.length === 0 ? 'Vous n’avez pas encore d’offre.' : 'Aucune offre dans cette sélection.'}
          {can.edit && offers.data.length === 0 && (
            <div style={{ marginTop: 14 }}>
              <Button variant="coral" onClick={() => router.push('/offers/new')}>
                Créer ma première offre
              </Button>
            </div>
          )}
        </div>
      )}
    </Stack>
  );
}

/** Enseigne : offres locales des magasins à valider avant l'équipe Rekonect. */
function StoreReview({ offers }: { offers: Offer[] }) {
  const api = usePartnerApi();
  const qc = useQueryClient();
  const toast = useToast();
  const [changes, setChanges] = useState<Offer | null>(null);
  const [note, setNote] = useState('');
  const pending = offers.filter((o) => o.status === 'pending_brand');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['store-offers'] });
  const approve = useMutation({
    mutationFn: (id: string) => api.brandApprove(id),
    onSuccess: () => {
      toast('Offre transmise à l’équipe Rekonect', 'success');
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const request = useMutation({
    mutationFn: () => api.brandRequestChanges(changes!.id, note.trim()),
    onSuccess: () => {
      toast('Modification demandée au magasin', 'success');
      setChanges(null);
      setNote('');
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (pending.length === 0) return null;
  return (
    <div style={{ background: '#FBF0DA', borderRadius: 20, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#96681A', marginBottom: 12 }}>
        {pending.length} offre{pending.length > 1 ? 's' : ''} de vos magasins à valider
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pending.map((o) => (
          <div key={o.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{o.title}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {o.partner?.name} · {o.condition} · {o.scope}
              </div>
            </div>
            <Button height={34} shadow={false} loading={approve.isPending && approve.variables === o.id} onClick={() => approve.mutate(o.id)}>
              Valider
            </Button>
            <Button height={34} variant="outline" onClick={() => setChanges(o)}>
              Demander une modif.
            </Button>
          </div>
        ))}
      </div>
      <Modal
        open={!!changes}
        title="Demander une modification"
        onClose={() => setChanges(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setChanges(null)}>
              Annuler
            </Button>
            <Button disabled={note.trim().length < 3} loading={request.isPending} onClick={() => request.mutate()}>
              Envoyer
            </Button>
          </>
        }
      >
        <Field label={`Message pour ${changes?.partner?.name ?? 'le magasin'}`} htmlFor="brand-note">
          <TextArea id="brand-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
