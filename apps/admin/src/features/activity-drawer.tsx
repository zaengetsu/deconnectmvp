'use client';
import { type AdminActivityInput, type Category, type CatalogStatus, type Difficulty, categoryImage, fieldErrors, formatNumber } from '@rekonect/api-client';
import { Button, C, Drawer, ErrorBox, Field, Select, Spinner, TextArea, TextInput, ToggleRow, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/lib/api';
import { CATALOG_STATUS, DIFFICULTY, REPORT_REASONS } from '@/lib/labels';

interface Form {
  title: string;
  instructions: string;
  categoryId: string;
  points: string;
  difficulty: Difficulty;
  minAge: string;
  maxAge: string;
  catalogStatus: CatalogStatus;
  proofRequired: boolean;
  partnerEligible: boolean;
}
const EMPTY: Form = { title: '', instructions: '', categoryId: '', points: '20', difficulty: 'easy', minAge: '6', maxAge: '12', catalogStatus: 'draft', proofRequired: false, partnerEligible: true };

const boxLabel = { fontSize: 12, fontWeight: 700, color: C.text2, marginBottom: 6 } as const;

export function toInput(f: Form): AdminActivityInput {
  return {
    title: f.title.trim(),
    instructions: f.instructions.trim() || null,
    categoryId: f.categoryId || null,
    points: Number(f.points),
    difficulty: f.difficulty,
    minAge: Number(f.minAge),
    maxAge: Number(f.maxAge),
    catalogStatus: f.catalogStatus,
    proofRequired: f.proofRequired,
    partnerEligible: f.partnerEligible,
  };
}

/** Fiche d'une activité native : statistiques, édition, signalements. `id = 'new'` pour une création. */
export function ActivityDrawer({ id, categories, onClose }: { id: string | null; categories: (Category & { count?: number })[]; onClose: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = id === 'new';
  const detail = useQuery({ queryKey: ['activity', id], queryFn: () => api.activity(id!), enabled: !!id && !isNew });
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setErrors({});
    if (isNew) setForm(EMPTY);
    else if (detail.data) {
      const a = detail.data;
      setForm({
        title: a.title,
        instructions: a.instructions ?? a.description ?? '',
        categoryId: a.categoryId ?? '',
        points: String(a.points),
        difficulty: a.difficulty,
        minAge: String(a.minAge),
        maxAge: String(a.maxAge),
        catalogStatus: a.catalogStatus,
        proofRequired: a.proofRequired,
        partnerEligible: a.partnerEligible,
      });
    }
  }, [isNew, detail.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const done = (message: string) => {
    toast(message, 'success');
    void qc.invalidateQueries({ queryKey: ['activities'] });
    void qc.invalidateQueries({ queryKey: ['activity', id] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const input = toInput(form);
      const local: Record<string, string> = {};
      if (input.title.length < 2) local.title = 'Titre trop court';
      if (!Number.isFinite(input.points) || input.points < 0) local.points = 'Nombre de points invalide';
      if (input.minAge > input.maxAge) local.age = "L'âge minimum dépasse l'âge maximum";
      if (Object.keys(local).length) {
        setErrors(local);
        throw new Error(Object.values(local)[0]);
      }
      return isNew ? api.createActivity(input) : api.updateActivity(id!, input);
    },
    onSuccess: () => done(isNew ? 'Activité créée' : 'Activité enregistrée'),
    onError: (e) => {
      setErrors((prev) => ({ ...prev, ...fieldErrors(e) }));
      toast((e as Error).message, 'error');
    },
  });
  const resolve = useMutation({
    mutationFn: (status: 'published' | 'archived') => api.resolveReports(id!, status === 'published' ? 'Vérifiée et republiée' : 'Retirée du catalogue', status),
    onSuccess: (_r, status) => done(status === 'published' ? 'Signalements clos, activité republiée' : 'Activité archivée'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const a = detail.data;
  const cat = categories.find((c) => c.id === form.categoryId) ?? a?.category ?? null;
  const st = CATALOG_STATUS[form.catalogStatus];

  return (
    <Drawer
      open={!!id}
      kicker={isNew ? 'NOUVELLE ACTIVITÉ' : 'ACTIVITÉ NATIVE'}
      onClose={onClose}
      footer={
        <>
          <Button height={44} block onClick={() => save.mutate()} loading={save.isPending} shadow={false} style={{ flex: 1, fontSize: 14 }}>
            Enregistrer
          </Button>
          <Button variant="outline" height={44} onClick={onClose} style={{ width: 110, padding: 0, fontSize: 14 }}>
            Annuler
          </Button>
        </>
      }
    >
      {!isNew && detail.isLoading && <Spinner />}
      {detail.error && <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />}
      {(isNew || a) && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: '#F1EEE9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={categoryImage(cat?.slug)} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
            </span>
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.03em' }}>{form.title || 'Nouvelle activité'}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                {cat?.name ?? 'Sans catégorie'} · {st.label}
              </div>
            </div>
          </div>

          {a && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 24 }}>
              <div style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{formatNumber(a.assigned30d)}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Assignations 30 j</div>
              </div>
              <div style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{a.validationRate == null ? '—' : `${Math.round(a.validationRate)} %`}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Validées</div>
              </div>
              <div style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{formatNumber(a.families)}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Familles</div>
              </div>
            </div>
          )}

          {a && a.reports.length > 0 && (
            <div style={{ background: '#FBF0DA', borderRadius: 14, padding: '13px 14px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#96681A', marginBottom: 6 }}>
                {a.reports.length} signalement{a.reports.length > 1 ? 's' : ''} ouvert{a.reports.length > 1 ? 's' : ''}
              </div>
              {a.reports.map((r) => (
                <div key={r.id} style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
                  • {REPORT_REASONS[r.reason] ?? r.reason}
                  {r.details ? ` — « ${r.details} »` : ''}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Button height={34} shadow={false} loading={resolve.isPending && resolve.variables === 'published'} onClick={() => resolve.mutate('published')}>
                  Clore et republier
                </Button>
                <Button height={34} variant="dangerSoft" loading={resolve.isPending && resolve.variables === 'archived'} onClick={() => resolve.mutate('archived')}>
                  Archiver
                </Button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Titre" htmlFor="act-title" error={errors.title}>
              <TextInput id="act-title" value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} style={{ borderColor: errors.title ? undefined : '#3C41A8' }} />
            </Field>
            <Field label="Consigne affichée à l'enfant" htmlFor="act-instr">
              <TextArea id="act-instr" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
            </Field>
            <Field label="Catégorie" htmlFor="act-cat">
              <Select id="act-cat" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">Sans catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label htmlFor="act-points" style={{ display: 'block', ...boxLabel }}>
                  Points
                </label>
                <TextInput id="act-points" type="number" min={0} max={1000} weight={700} value={form.points} onChange={(e) => set('points', e.target.value)} invalid={!!errors.points} />
              </div>
              <div>
                <label htmlFor="act-diff" style={{ display: 'block', ...boxLabel }}>
                  Difficulté
                </label>
                <Select id="act-diff" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
                  {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY[d].label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <div style={boxLabel}>Âge</div>
                <div className="rk-input" style={{ height: 46, borderRadius: 12, border: `1.5px solid ${errors.age ? C.redText : 'rgba(22,24,43,.14)'}`, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 2, fontSize: 14, fontWeight: 600 }}>
                  <input aria-label="Âge minimum" type="number" min={3} max={18} value={form.minAge} onChange={(e) => set('minAge', e.target.value)} style={{ width: 30, border: 'none', outline: 'none', fontSize: 14, fontWeight: 600, textAlign: 'right', background: 'transparent' }} />
                  –
                  <input aria-label="Âge maximum" type="number" min={3} max={18} value={form.maxAge} onChange={(e) => set('maxAge', e.target.value)} style={{ width: 30, border: 'none', outline: 'none', fontSize: 14, fontWeight: 600, background: 'transparent' }} />
                </div>
              </div>
            </div>
            {errors.age && <div role="alert" style={{ fontSize: 12, fontWeight: 600, color: C.redText, marginTop: -8 }}>{errors.age}</div>}
            <div style={{ border: '1px solid rgba(22,24,43,.08)', borderRadius: 14, overflow: 'hidden' }}>
              <ToggleRow label="Photo de preuve obligatoire" checked={form.proofRequired} onChange={(v) => set('proofRequired', v)} />
              <ToggleRow
                label="Visible dans le catalogue enfant"
                checked={form.catalogStatus === 'published' || form.catalogStatus === 'flagged'}
                onChange={(v) => set('catalogStatus', v ? 'published' : a?.catalogStatus === 'archived' ? 'archived' : 'draft')}
              />
              <ToggleRow label="Éligible aux offres partenaires" checked={form.partnerEligible} onChange={(v) => set('partnerEligible', v)} last />
            </div>
            {!isNew && form.catalogStatus !== 'archived' && (
              <button type="button" onClick={() => set('catalogStatus', 'archived')} style={{ fontSize: 13, fontWeight: 700, color: C.redText, alignSelf: 'flex-start' }}>
                Archiver l’activité
              </button>
            )}
            {form.catalogStatus === 'archived' && (
              <div style={{ fontSize: 12, color: C.muted }}>
                Archivée : retirée du catalogue à l’enregistrement.{' '}
                <button type="button" onClick={() => set('catalogStatus', 'draft')} style={{ fontWeight: 700, color: C.primary }}>
                  Annuler l’archivage
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
