'use client';
import { type AdminActivity, categoryImage, formatNumber } from '@rekonect/api-client';
import { Button, C, Chips, ErrorBox, Modal, PageHeader, Skeleton, Stack, readAsText, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { ActivityDrawer } from '@/features/activity-drawer';
import { useAdmin } from '@/lib/api';
import { CATALOG_STATUS, DIFFICULTY } from '@/lib/labels';

const TEMPLATE = 'minmax(220px,2.2fr) 70px 90px 70px 110px minmax(140px,1.2fr) 110px';

export default function ActivitiesPage() {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [cat, setCat] = useState('all');
  const [cursors, setCursors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; errors: { line: number; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const status = params.get('status') ?? undefined;
  const openId = params.get('id');

  const cursor = cursors[cursors.length - 1];
  const list = useQuery({
    queryKey: ['activities', cat, status, cursor],
    queryFn: () => api.activities({ categoryId: cat === 'all' ? undefined : cat, status, cursor, limit: 20 }),
    placeholderData: (prev) => prev,
  });
  const data = list.data;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const importCsv = useMutation({
    mutationFn: async (file: File) => api.importActivities(await readAsText(file)),
    onSuccess: (res) => {
      setImportResult(res);
      void qc.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const chips = [
    { id: 'all', label: 'Tout', badge: data ? formatNumber(data.total) : undefined },
    ...(data?.categories ?? []).map((c) => ({ id: c.id, label: c.name, badge: formatNumber(c.count) })),
  ];

  return (
    <Stack gap={20}>
      <PageHeader
        title="Catalogue d'activités"
        subtitle={data ? `${formatNumber(data.total)} activités natives proposées à toutes les familles · ${formatNumber(data.published)} publiées` : ' '}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="Fichier CSV" onChange={(e) => e.target.files?.[0] && importCsv.mutate(e.target.files[0])} />
            <Button variant="outline" loading={importCsv.isPending} onClick={() => fileRef.current?.click()} style={{ padding: '0 16px' }}>
              Importer CSV
            </Button>
            <Button onClick={() => setParam('id', 'new')}>+ Nouvelle activité</Button>
          </>
        }
      />
      <Chips
        options={chips}
        value={cat}
        onChange={(v) => {
          setCat(v);
          setCursors([]);
        }}
      />
      {status && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text2 }}>
          Filtre : <strong>{CATALOG_STATUS[status as keyof typeof CATALOG_STATUS]?.label ?? status}</strong>
          <button type="button" onClick={() => setParam('status', null)} style={{ fontWeight: 700, color: C.primary }}>
            Retirer
          </button>
        </div>
      )}
      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      <div role="table" aria-label="Activités" style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: TEMPLATE, gap: 16, padding: '14px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderBottom: '1px solid rgba(22,24,43,.07)', background: '#FBFAF8' }}>
          <div>ACTIVITÉ</div>
          <div style={{ textAlign: 'right' }}>POINTS</div>
          <div>DIFFICULTÉ</div>
          <div>ÂGE</div>
          <div style={{ textAlign: 'right' }}>ASSIGNÉE (30 J)</div>
          <div>TAUX DE VALIDATION</div>
          <div>STATUT</div>
        </div>
        {!data && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={60} radius={0} style={{ borderBottom: '1px solid rgba(22,24,43,.05)' }} />)}
        {data?.items.map((a) => <ActivityRow key={a.id} a={a} onOpen={() => setParam('id', a.id)} />)}
        {data && data.items.length === 0 && <div style={{ padding: '28px 20px', fontSize: 13, color: C.muted, textAlign: 'center' }}>Aucune activité dans cette sélection.</div>}
        <div style={{ padding: '14px 20px', fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>{data ? `${data.items.length} activité${data.items.length > 1 ? 's' : ''} affichée${data.items.length > 1 ? 's' : ''}` : ''}</span>
          {cursors.length > 0 && (
            <button type="button" onClick={() => setCursors((c) => c.slice(0, -1))} style={{ height: 30, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(22,24,43,.12)', display: 'flex', alignItems: 'center', fontWeight: 700, color: C.text2 }}>
              Page précédente
            </button>
          )}
          <button
            type="button"
            disabled={!data?.nextCursor}
            onClick={() => data?.nextCursor && setCursors((c) => [...c, data.nextCursor!])}
            style={{ height: 30, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(22,24,43,.12)', display: 'flex', alignItems: 'center', fontWeight: 700, color: C.text2, opacity: data?.nextCursor ? 1 : 0.45 }}
          >
            Page suivante
          </button>
        </div>
      </div>

      <ActivityDrawer id={openId} categories={data?.categories ?? []} onClose={() => setParam('id', null)} />

      <Modal
        open={!!importResult}
        title="Import terminé"
        onClose={() => setImportResult(null)}
        footer={<Button onClick={() => setImportResult(null)}>Fermer</Button>}
      >
        <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
          {importResult?.created ?? 0} activité{(importResult?.created ?? 0) > 1 ? 's' : ''} ajoutée{(importResult?.created ?? 0) > 1 ? 's' : ''} en brouillon.
          {importResult && importResult.errors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, color: C.redText, marginBottom: 6 }}>Lignes ignorées</div>
              {importResult.errors.map((e) => (
                <div key={e.line} style={{ fontSize: 13 }}>
                  Ligne {e.line} : {e.message}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 12, color: C.muted }}>Format attendu : titre;catégorie;points;difficulté;âge min;âge max;consigne</div>
        </div>
      </Modal>
    </Stack>
  );
}

function ActivityRow({ a, onOpen }: { a: AdminActivity; onOpen: () => void }) {
  const st = CATALOG_STATUS[a.catalogStatus];
  const diff = DIFFICULTY[a.difficulty];
  return (
    <button type="button" role="row" aria-label={a.title} className="rk-row" onClick={onOpen} style={{ display: 'grid', width: '100%', gridTemplateColumns: TEMPLATE, gap: 16, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(22,24,43,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: '#F1EEE9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={categoryImage(a.category?.slug)} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1 }}>{a.category?.name ?? 'Sans catégorie'}</span>
        </span>
      </div>
      <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 800 }}>{a.points}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: diff.color }}>{diff.label}</div>
      <div style={{ fontSize: 13, color: C.text2 }}>
        {a.minAge}–{a.maxAge}
      </div>
      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{a.assigned30d ? formatNumber(a.assigned30d) : '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#F1EEE9', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${a.validationRate ?? 0}%`, background: '#6E9E85', borderRadius: 999 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, width: 32, whiteSpace: 'nowrap' }}>{a.validationRate == null ? '—' : `${Math.round(a.validationRate)} %`}</span>
      </div>
      <div>
        <span style={{ height: 26, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: st.bg, color: st.fg }}>{st.label}</span>
      </div>
    </button>
  );
}
