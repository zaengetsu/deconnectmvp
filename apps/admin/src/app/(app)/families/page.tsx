'use client';
import { type AdminFamilyRow, formatMonthYear, formatNumber, formatPercent, formatRelative } from '@rekonect/api-client';
import { Button, C, Chips, ErrorBox, PageHeader, Skeleton, Stack, StatCard, saveBlob, useToast } from '@rekonect/ui';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FamilyDrawer } from '@/features/family-drawer';
import { useAdmin } from '@/lib/api';
import { FAMILY_STATUS_COLOR, familyInitials, PLAN_BADGE } from '@/lib/labels';

const TEMPLATE = 'minmax(200px,1.6fr) minmax(120px,1fr) 70px 110px 120px 130px 100px';
const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'free', label: 'Gratuit' },
  { id: 'family', label: 'Famille' },
  { id: 'family_plus', label: 'Famille+' },
  { id: 'past_due', label: 'Paiement échoué' },
];

export default function FamiliesPage() {
  const api = useAdmin();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = params.get('filter') ?? (params.get('status') === 'past_due' ? 'past_due' : 'all');
  const openId = params.get('id');
  const query = filter === 'all' ? {} : filter === 'past_due' ? { status: 'past_due' } : { plan: filter };

  const stats = useQuery({ queryKey: ['family-stats'], queryFn: api.familyStats });
  const list = useInfiniteQuery({
    queryKey: ['families', filter],
    queryFn: ({ pageParam }) => api.families({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) (v ? next.set(k, v) : next.delete(k));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const exportCsv = useMutation({
    mutationFn: () => api.familiesCsv(query),
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const s = stats.data;
  return (
    <Stack gap={20}>
      <PageHeader
        title="Familles"
        subtitle={s ? `${formatNumber(s.families)} familles inscrites · ${formatNumber(s.children)} enfants` : ' '}
        actions={
          <Button variant="outline" loading={exportCsv.isPending} onClick={() => exportCsv.mutate()} style={{ padding: '0 16px' }}>
            Exporter
          </Button>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <StatCard value={s ? `+${formatNumber(s.newFamilies30d)}` : '…'} label="Nouvelles familles (30 j)" />
        <StatCard value={s ? formatNumber(s.childrenPerFamily, 2) : '…'} label="Enfants par famille" />
        <StatCard value={s ? formatPercent(s.deviceLinkedRate, 0) : '…'} label="Appareil enfant lié" />
        <StatCard value={s ? formatNumber(s.inactive30d) : '…'} label="Inactives depuis 30 j" color="#96681A" />
      </div>
      <Chips options={FILTERS} value={filter} onChange={(v) => setParam({ filter: v === 'all' ? null : v, status: null })} />
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      <div role="table" aria-label="Familles" style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, padding: '14px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderBottom: '1px solid rgba(22,24,43,.07)', background: '#FBFAF8' }}>
          <div>FAMILLE</div>
          <div>VILLE</div>
          <div style={{ textAlign: 'right' }}>ENFANTS</div>
          <div>PLAN</div>
          <div>INSCRITE</div>
          <div>DERNIÈRE ACTIVITÉ</div>
          <div>STATUT</div>
        </div>
        {list.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={58} radius={0} />)}
        {rows.map((f) => (
          <FamilyRow key={f.id} f={f} onOpen={() => setParam({ id: f.id })} />
        ))}
        {!list.isLoading && rows.length === 0 && <div style={{ padding: '28px 20px', fontSize: 13, color: C.muted, textAlign: 'center' }}>Aucune famille dans cette sélection.</div>}
        {list.hasNextPage && (
          <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'center' }}>
            <button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} style={{ height: 30, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(22,24,43,.12)', fontSize: 12, fontWeight: 700, color: C.text2 }}>
              {list.isFetchingNextPage ? 'Chargement…' : 'Afficher plus'}
            </button>
          </div>
        )}
      </div>
      <FamilyDrawer id={openId} onClose={() => setParam({ id: null })} />
    </Stack>
  );
}

function FamilyRow({ f, onOpen }: { f: AdminFamilyRow; onOpen: () => void }) {
  const [pb, pf] = PLAN_BADGE[f.plan] ?? PLAN_BADGE.free;
  const color = FAMILY_STATUS_COLOR[f.status];
  const lastName = f.name.replace(/^Famille /, '');
  return (
    <button type="button" role="row" aria-label={f.name} className="rk-row" onClick={onOpen} style={{ display: 'grid', width: '100%', gridTemplateColumns: TEMPLATE, gap: 16, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(22,24,43,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#EEEFFB', color: '#3C41A8', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{familyInitials(lastName, f.parentName)}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{f.name}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.parentName}</span>
        </span>
      </div>
      <div style={{ fontSize: 13, color: C.text2 }}>{f.city ?? '—'}</div>
      <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 800 }}>{f.children}</div>
      <div>
        <span style={{ height: 24, padding: '0 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: pb, color: pf }}>{f.planName}</span>
      </div>
      <div style={{ fontSize: 13, color: C.text2 }}>{formatMonthYear(f.createdAt)}</div>
      <div style={{ fontSize: 13, color: C.text2 }}>{f.lastActivityAt ? formatRelative(f.lastActivityAt) : '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
        {f.statusLabel}
      </div>
    </button>
  );
}
