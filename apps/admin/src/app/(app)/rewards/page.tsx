'use client';
import { type CatalogReward, type ModerationItem, formatNumber, formatSince } from '@rekonect/api-client';
import { Button, C, CountBadge, ErrorBox, Field, Modal, PageHeader, Segmented, Skeleton, Stack, TextArea, Toggle, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { RewardDrawer } from '@/features/reward-drawer';
import { useAdmin } from '@/lib/api';
import { OFFER_KIND_BADGE, REWARD_CATEGORY } from '@/lib/labels';

const TEMPLATE = 'minmax(220px,2fr) 150px 110px 130px 130px 90px';
/** Cartes de synthèse : responsabilités et symboliques regroupées comme dans la maquette. */
const CARD_GROUPS = [
  { keys: ['privilege'], label: 'Privilèges', bg: '#EEEFFB' },
  { keys: ['family'], label: 'Moments familiaux', bg: '#FBE9EC' },
  { keys: ['experience'], label: 'Expériences', bg: '#FFEDE4' },
  { keys: ['responsibility', 'symbolic'], label: 'Responsabilités & symboliques', bg: '#E9F1EC' },
];

export default function RewardsPage() {
  const api = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get('tab') === 'partner' ? 'partner' : 'native';
  const editId = params.get('id');
  const rewards = useQuery({ queryKey: ['catalog-rewards'], queryFn: api.rewards });
  const queue = useQuery({ queryKey: ['moderation'], queryFn: api.moderation });
  const pending = (queue.data ?? []).filter((o) => !o.decided).length;

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) (v ? next.set(k, v) : next.delete(k));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Stack gap={20}>
      <PageHeader title="Récompenses" subtitle="Idées natives suggérées aux parents, et offres proposées par les partenaires" actions={<Button onClick={() => setParam({ id: 'new', tab: null })}>+ Nouvelle récompense native</Button>} />
      <Segmented
        ariaLabel="Type de récompenses"
        height={34}
        padding="0 16px"
        style={{ alignSelf: 'flex-start' }}
        value={tab}
        onChange={(v) => setParam({ tab: v === 'partner' ? 'partner' : null })}
        options={[
          { id: 'native', label: `Natives · ${rewards.data ? rewards.data.items.length : '…'}` },
          { id: 'partner', label: 'Offres partenaires', badge: <CountBadge>{pending}</CountBadge> },
        ]}
      />
      {tab === 'native' ? <NativeRewards data={rewards.data} error={rewards.error} retry={() => rewards.refetch()} onOpen={(id) => setParam({ id })} /> : <Moderation items={queue.data} error={queue.error} retry={() => queue.refetch()} />}
      <RewardDrawer id={editId} reward={rewards.data?.items.find((r) => r.id === editId) ?? null} onClose={() => setParam({ id: null })} />
    </Stack>
  );
}

function NativeRewards({ data, error, retry, onOpen }: { data?: { items: CatalogReward[]; categories: { key: string; ideas: number; share: number }[] }; error: unknown; retry: () => void; onOpen: (id: string) => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: (r: CatalogReward) => api.updateReward(r.id, { isActive: !r.isActive }),
    onSuccess: (_d, r) => {
      toast(r.isActive ? 'Récompense masquée' : 'Récompense visible', 'success');
      void qc.invalidateQueries({ queryKey: ['catalog-rewards'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (error) return <ErrorBox error={error} onRetry={retry} />;
  const groups = CARD_GROUPS.map((g, i) => {
    const cats = (data?.categories ?? []).filter((c) => g.keys.includes(c.key));
    const ideas = cats.reduce((s, c) => s + c.ideas, 0);
    const share = cats.reduce((s, c) => s + c.share, 0);
    return { ...g, sub: `${ideas} idée${ideas > 1 ? 's' : ''} · ${share} %${i === 0 ? ' des échanges' : ''}` };
  });
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
        {groups.map((g) => (
          <div key={g.label} style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 12, background: g.bg, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{g.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>{data ? g.sub : '…'}</span>
            </span>
          </div>
        ))}
      </div>
      <div role="table" aria-label="Récompenses natives" style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden', marginTop: 12 }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, padding: '14px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderBottom: '1px solid rgba(22,24,43,.07)', background: '#FBFAF8' }}>
          <div>RÉCOMPENSE</div>
          <div>CATÉGORIE</div>
          <div style={{ textAlign: 'right' }}>POINTS SUGGÉRÉS</div>
          <div style={{ textAlign: 'right' }}>FAMILLES L'UTILISANT</div>
          <div style={{ textAlign: 'right' }}>ÉCHANGES (30 J)</div>
          <div>VISIBLE</div>
        </div>
        {!data && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={50} radius={0} />)}
        {data?.items.map((r) => {
          const cat = REWARD_CATEGORY[r.rewardCategory ?? ''] ?? { label: r.categoryLabel, bg: '#F1EEE9', fg: '#4A4E66' };
          return (
            <div key={r.id} role="row" className="rk-row" style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid rgba(22,24,43,.05)', opacity: r.isActive ? 1 : 0.55 }}>
              <button type="button" onClick={() => onOpen(r.id)} style={{ fontSize: 14, fontWeight: 700 }}>
                {r.title}
              </button>
              <div>
                <span style={{ height: 24, padding: '0 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: cat.bg, color: cat.fg }}>{cat.label}</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 800 }}>{r.requiredPoints}</div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(r.families)}</div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(r.exchanges30d)}</div>
              <div>
                <Toggle checked={r.isActive} onChange={() => toggle.mutate(r)} label={`Visible : ${r.title}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DONE: Record<string, { label: string; bg: string; fg: string }> = {
  published: { label: 'Approuvée · en ligne', bg: '#E9F1EC', fg: '#4A7A5F' },
  paused: { label: 'Approuvée · en pause', bg: '#E9F1EC', fg: '#4A7A5F' },
  rejected: { label: 'Refusée', bg: '#FBE9EC', fg: '#AE3A50' },
  changes_requested: { label: 'Modification demandée', bg: '#FBF0DA', fg: '#96681A' },
};

function Moderation({ items, error, retry }: { items?: ModerationItem[]; error: unknown; retry: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ kind: 'reject' | 'changes'; offer: ModerationItem } | null>(null);
  const [text, setText] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['moderation'] });
    void qc.invalidateQueries({ queryKey: ['nav-counts'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => api.approveOffer(id),
    onSuccess: () => {
      toast('Offre approuvée et publiée', 'success');
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const decide = useMutation({
    mutationFn: () => (dialog!.kind === 'reject' ? api.rejectOffer(dialog!.offer.id, text.trim()) : api.requestOfferChanges(dialog!.offer.id, text.trim())),
    onSuccess: () => {
      toast(dialog!.kind === 'reject' ? 'Offre refusée, le partenaire est prévenu' : 'Modification demandée au partenaire', 'success');
      setDialog(null);
      setText('');
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (error) return <ErrorBox error={error} onRetry={retry} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, maxWidth: '80ch' }}>
        Chaque offre partenaire passe par une modération avant d'apparaître dans l'app. Vérifiez que la condition d'obtention est atteignable, que le ciblage respecte l'anonymat des familles et que le visuel convient à un public enfant.
      </div>
      {!items && <Skeleton height={160} radius={20} />}
      {items?.length === 0 && <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 28, textAlign: 'center', fontSize: 14, color: C.muted }}>Aucune offre en attente de modération.</div>}
      {items?.map((o) => {
        const [tb, tf] = OFFER_KIND_BADGE[o.kind] ?? ['#F1EEE9', '#4A4E66'];
        const done = DONE[o.status];
        return (
          <article key={o.id} aria-label={o.title} style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', gap: 16, minWidth: 0 }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: o.partner.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>{o.partnerInitials}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{o.partner.name}</span>
                  <span style={{ height: 22, padding: '0 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: tb, color: tf }}>{o.kindLabel}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>· soumise {formatSince(o.submittedAt)}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6 }}>{o.title}</div>
                {o.imageUrl && <img src={o.imageUrl} alt={`Visuel : ${o.title}`} style={{ marginTop: 12, width: 180, height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(22,24,43,.08)' }} />}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginTop: 14 }}>
                  {[
                    ['CONDITION', o.condition],
                    ['PORTÉE', o.scope],
                    ['STOCK · PÉRIODE', o.stockPeriod],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: '#F6F4F1', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.muted }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {o.description && <div style={{ fontSize: 13, color: C.text2, marginTop: 12, lineHeight: 1.5 }}>{o.description}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: 170 }}>
              {!o.decided ? (
                <>
                  <Button block shadow={false} loading={approve.isPending && approve.variables === o.id} onClick={() => approve.mutate(o.id)}>
                    Approuver
                  </Button>
                  <Button variant="outline" block onClick={() => setDialog({ kind: 'changes', offer: o })}>
                    Demander une modif.
                  </Button>
                  <Button variant="danger" block height={34} onClick={() => setDialog({ kind: 'reject', offer: o })}>
                    Refuser
                  </Button>
                </>
              ) : (
                <div style={{ height: 40, borderRadius: 999, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done?.bg ?? '#F1EEE9', color: done?.fg ?? '#4A4E66' }}>{done?.label ?? o.displayStatusLabel}</div>
              )}
            </div>
          </article>
        );
      })}
      <Modal
        open={!!dialog}
        title={dialog?.kind === 'reject' ? 'Refuser l’offre' : 'Demander une modification'}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Annuler
            </Button>
            <Button variant={dialog?.kind === 'reject' ? 'dangerSoft' : 'primary'} disabled={text.trim().length < 3} loading={decide.isPending} onClick={() => decide.mutate()}>
              {dialog?.kind === 'reject' ? 'Refuser l’offre' : 'Envoyer la demande'}
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 13, color: C.text2, marginBottom: 14 }}>{dialog?.offer.title} · {dialog?.offer.partner.name}</div>
        <Field label={dialog?.kind === 'reject' ? 'Motif du refus (envoyé au partenaire)' : 'Ce qu’il faut modifier (envoyé au partenaire)'} htmlFor="mod-text">
          <TextArea id="mod-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={dialog?.kind === 'reject' ? 'Ex. : visuel inadapté à un public enfant' : 'Ex. : précisez l’âge minimum'} />
        </Field>
      </Modal>
    </div>
  );
}
