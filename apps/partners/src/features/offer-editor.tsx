'use client';
import { type Offer, type OfferInput, type OfferKind, categoryImage, formatNumber } from '@rekonect/api-client';
import { AGE_BANDS } from '@rekonect/contracts';
import { Button, C, ErrorBox, readAsDataUrl, Select, TextArea, TextInput, useSession, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { usePartner, usePartnerApi } from '@/lib/partner';

type TypeId = 'kid' | 'parent' | 'defi';
type Target = 'national' | 'radius' | 'area' | 'code';
const KIND_OF: Record<TypeId, OfferKind> = { kid: 'child_reward', parent: 'parent_voucher', defi: 'sponsored_activity' };
const TYPE_OF: Record<OfferKind, TypeId> = { child_reward: 'kid', parent_voucher: 'parent', sponsored_activity: 'defi' };
const TYPES: { id: TypeId; n: string; s: string; ic: string }[] = [
  { id: 'kid', n: 'Récompense enfant', s: "L'enfant l'obtient avec ses points ou en réussissant un défi", ic: '#FFEDE4' },
  { id: 'parent', n: 'Bon pour les parents', s: "Réduction ou bon d'achat débloqué par les efforts de l'enfant", ic: '#EEEFFB' },
  { id: 'defi', n: 'Défi sponsorisé', s: 'Une activité à votre nom ajoutée au catalogue des familles', ic: '#E9F1EC' },
];
const METHODS = [
  { id: 'qr', label: 'QR code scanné en caisse' },
  { id: 'online_code', label: 'Code promo en ligne' },
  { id: 'reception', label: "Présentation à l'accueil" },
] as const;
const BANDS = AGE_BANDS.filter((b) => b.id !== '15+');

export interface EditorForm {
  type: TypeId;
  title: string;
  description: string;
  imageUrl: string;
  cond: 'points' | 'acts';
  points: string;
  threshold: string;
  trigger: string; // id de catégorie, « streak_days » ou « goal_completed »
  windowDays: string;
  categoryId: string;
  durationMinutes: string;
  ages: string[];
  target: Target;
  placeId: string;
  radiusKm: string;
  postalCodes: string;
  promoCodeId: string;
  stock: string;
  perFamily: string;
  start: string;
  end: string;
  method: 'qr' | 'online_code' | 'reception';
  discountLabel: string;
}

export const emptyForm = (national: boolean): EditorForm => ({
  type: 'kid',
  title: '',
  description: '',
  imageUrl: '',
  cond: 'acts',
  points: '300',
  threshold: '10',
  trigger: '',
  windowDays: '30',
  categoryId: '',
  durationMinutes: '30',
  ages: ['7-9', '10-12'],
  target: national ? 'national' : 'radius',
  placeId: '',
  radiusKm: '15',
  postalCodes: '',
  promoCodeId: '',
  stock: '',
  perFamily: '1',
  start: '',
  end: '',
  method: 'qr',
  discountLabel: '',
});

const isoDay = (d: string | null) => (d ? new Date(d).toLocaleDateString('sv-SE') : '');

export function formFromOffer(o: Offer): EditorForm {
  const bands = BANDS.filter((b) => b.max >= o.minAge && b.min <= o.maxAge).map((b) => b.id);
  const acts = o.triggerType !== 'none' || o.kind === 'parent_voucher';
  return {
    type: TYPE_OF[o.kind],
    title: o.title,
    description: o.description ?? '',
    imageUrl: o.imageUrl ?? '',
    cond: o.kind === 'child_reward' && o.requiredPoints ? 'points' : acts ? 'acts' : 'points',
    points: String(o.requiredPoints ?? 300),
    threshold: String(o.triggerThreshold ?? 1),
    trigger: o.triggerType === 'category_validated' ? (o.triggerCategoryId ?? '') : o.triggerType === 'none' ? '' : o.triggerType,
    windowDays: String(o.triggerWindowDays ?? ''),
    categoryId: o.categoryId ?? '',
    durationMinutes: String(o.durationMinutes ?? 30),
    ages: bands,
    target: o.targetType,
    placeId: o.targetPlaceId ?? '',
    radiusKm: String(o.targetRadiusKm ?? 15),
    postalCodes: o.targetPostalCodes.join(', '),
    promoCodeId: o.targetPromoCodeId ?? '',
    stock: o.stockTotal ? String(o.stockTotal) : '',
    perFamily: String(o.perFamilyLimit),
    start: isoDay(o.startsAt),
    end: isoDay(o.endsAt),
    method: o.redemptionMethod,
    discountLabel: o.discountLabel ?? '',
  };
}

/** Formulaire → corps de l'API (règles de cohérence vérifiées côté serveur). */
export function toOfferInput(f: EditorForm): OfferInput {
  const kind = KIND_OF[f.type];
  const selected = BANDS.filter((b) => f.ages.includes(b.id));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/\s/g, '')));
  const byActs = kind === 'parent_voucher' || (kind === 'child_reward' && f.cond === 'acts');
  const trigger = !byActs ? {} : f.trigger === 'streak_days' || f.trigger === 'goal_completed' ? { triggerType: f.trigger, triggerThreshold: num(f.threshold) } : { triggerType: 'category_validated', triggerCategoryId: f.trigger || undefined, triggerThreshold: num(f.threshold), triggerWindowDays: num(f.windowDays) };
  return {
    kind,
    title: f.title.trim(),
    description: f.description.trim() || undefined,
    imageUrl: f.imageUrl || undefined,
    minAge: selected.length ? Math.min(...selected.map((b) => b.min)) : undefined,
    maxAge: selected.length ? Math.max(...selected.map((b) => b.max)) : undefined,
    ...(kind === 'child_reward' && f.cond === 'points' ? { requiredPoints: num(f.points) } : {}),
    ...trigger,
    ...(kind === 'sponsored_activity' ? { categoryId: f.categoryId || undefined, durationMinutes: num(f.durationMinutes) } : {}),
    targetType: f.target,
    ...(f.target === 'radius' ? { targetPlaceId: f.placeId || undefined, targetRadiusKm: num(f.radiusKm) } : {}),
    ...(f.target === 'area' ? { targetPostalCodes: f.postalCodes.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean) } : {}),
    ...(f.target === 'code' ? { targetPromoCodeId: f.promoCodeId || undefined } : {}),
    stockTotal: num(f.stock),
    perFamilyLimit: num(f.perFamily) ?? 1,
    startsAt: f.start ? new Date(`${f.start}T00:00:00`).toISOString() : undefined,
    endsAt: f.end ? new Date(`${f.end}T23:59:59`).toISOString() : undefined,
    redemptionMethod: f.method,
    discountLabel: f.discountLabel.trim() || undefined,
  };
}

const seg = (on: boolean): CSSProperties => ({ background: on ? '#fff' : 'transparent', color: on ? C.ink : C.muted });
const chipOn = (on: boolean): CSSProperties => ({ background: on ? C.ink : '#fff', color: on ? '#fff' : C.text2, border: `1px solid ${on ? C.ink : 'rgba(22,24,43,.1)'}` });
const label: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: C.text2, marginBottom: 6 };
const box = (focus = false): CSSProperties => ({ height: 46, borderRadius: 12, border: `1.5px solid ${focus ? C.coral : 'rgba(22,24,43,.14)'}`, padding: '0 14px', fontSize: 14, fontWeight: 700, width: '100%', background: '#fff' });
const inlineBox: CSSProperties = { height: 40, padding: '0 14px', borderRadius: 11, border: '1.5px solid rgba(22,24,43,.14)', display: 'flex', alignItems: 'center', fontWeight: 800, color: C.ink, fontSize: 14, background: '#fff' };

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.ink, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</span>
      </div>
      {children}
    </section>
  );
}

/** Création / édition d'une offre, avec aperçu dans l'app et audience estimée en direct. */
export function OfferEditor({ offer }: { offer?: Offer }) {
  const api = usePartnerApi();
  const { partnerId, detail, account } = usePartner();
  const { user } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const limits = detail?.plan.limits ?? {};
  const national = !!limits.nationalTargeting;
  const [f, setF] = useState<EditorForm>(() => (offer ? formFromOffer(offer) : emptyForm(national)));
  const [issues, setIssues] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof EditorForm>(k: K, v: EditorForm[K]) => setF((s) => ({ ...s, [k]: v }));

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: Infinity });
  const places = useQuery({ queryKey: ['places', partnerId], queryFn: () => api.places(partnerId!), enabled: !!partnerId });
  const codes = useQuery({ queryKey: ['access-codes', partnerId], queryFn: () => api.accessCodes(partnerId!), enabled: !!partnerId && !!limits.accessCodeTargeting });

  useEffect(() => {
    if (!f.placeId && places.data?.[0]) set('placeId', places.data[0].id);
  }, [places.data, f.placeId]);
  useEffect(() => {
    if (!f.trigger && categories.data?.length) {
      const sport = categories.data.find((c) => c.slug === 'sport') ?? categories.data[0];
      setF((s) => ({ ...s, trigger: sport.id, categoryId: s.categoryId || sport.id }));
    }
  }, [categories.data, f.trigger]);

  const input = useMemo(() => toOfferInput(f), [f]);
  const [debounced, setDebounced] = useState(input);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 350);
    return () => clearTimeout(t);
  }, [input]);
  const estimate = useQuery({
    queryKey: ['estimate', partnerId, debounced.targetType, debounced.targetPlaceId, debounced.targetRadiusKm, debounced.targetPostalCodes?.join(','), debounced.targetPromoCodeId, debounced.minAge, debounced.maxAge],
    queryFn: () =>
      api.estimate(partnerId!, {
        targetType: debounced.targetType ?? 'national',
        placeId: debounced.targetPlaceId,
        radiusKm: debounced.targetRadiusKm,
        postalCodes: debounced.targetPostalCodes,
        promoCodeId: debounced.targetPromoCodeId,
        minAge: debounced.minAge,
        maxAge: debounced.maxAge,
      }),
    enabled: !!partnerId && (debounced.targetType !== 'radius' || !!debounced.targetPlaceId) && (debounced.targetType !== 'code' || !!debounced.targetPromoCodeId),
    placeholderData: (p) => p,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 2 * 1024 * 1024) throw new Error('Image de 2 Mo maximum');
      return api.uploadImage(partnerId!, await readAsDataUrl(file));
    },
    onSuccess: (r) => set('imageUrl', r.url),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      setIssues([]);
      const body = toOfferInput(f);
      const saved = offer ? await api.updateOffer(offer.id, (({ kind: _k, ...rest }) => rest)(body)) : await api.createOffer(partnerId!, body);
      return submit ? api.submitOffer(saved.id) : saved;
    },
    onSuccess: (o, submit) => {
      toast(submit ? (o.status === 'pending_brand' ? 'Offre envoyée à votre enseigne pour validation' : 'Offre envoyée en validation · réponse sous 48 h') : 'Brouillon enregistré', 'success');
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['offer', o.id] });
      router.push(submit ? '/offers' : `/offers/${o.id}`);
    },
    onError: (e) => {
      const details = (e as { details?: { message: string }[] }).details;
      setIssues(Array.isArray(details) ? details.map((d) => d.message) : [(e as Error).message]);
      toast((e as Error).message, 'error');
    },
  });

  const kind = KIND_OF[f.type];
  const targets: { id: Target; n: string; s: string; ok: boolean }[] = [
    { id: 'national', n: 'National', s: 'Toutes les familles en France', ok: national },
    { id: 'radius', n: "Autour d'un lieu", s: `Rayon de 5 à ${limits.maxRadiusKm ?? 50} km`, ok: true },
    { id: 'area', n: 'Communes / codes postaux', s: 'Liste de zones précises', ok: true },
    { id: 'code', n: "Code d'accès", s: 'Habitants, salariés, adhérents', ok: !!limits.accessCodeTargeting },
  ];
  const radius = Number(f.radiusKm) || 10;
  const radiusPx = f.target === 'national' ? 230 : f.target === 'area' ? 180 : f.target === 'code' ? 90 : Math.min(170, 60 + radius * 5);
  const reach = estimate.data;
  const shown = (v: number | null | undefined) => (reach?.masked || v == null ? '< 20' : formatNumber(v));
  const cat = categories.data?.find((c) => c.id === f.trigger);
  const triggerLabel = f.trigger === 'streak_days' ? 'jours d’affilée' : f.trigger === 'goal_completed' ? 'objectifs familiaux' : `${cat?.name ?? 'activités'}`;
  const previewCond =
    kind === 'sponsored_activity'
      ? `Défi de ${f.durationMinutes || '30'} min · ${categories.data?.find((c) => c.id === f.categoryId)?.name ?? 'catalogue'}`
      : kind === 'child_reward' && f.cond === 'points'
        ? `Contre ${formatNumber(Number(f.points) || 0)} points`
        : f.trigger === 'streak_days'
          ? `${f.threshold} jours d'activité d'affilée`
          : f.trigger === 'goal_completed'
            ? 'Objectif familial de la semaine atteint'
            : `${f.threshold} activités ${cat?.name ?? ''} en ${f.windowDays || '30'} jours`.replace(/\s+/g, ' ');
  const who = f.type === 'parent' ? 'PARENT' : 'ENFANT';
  const childName = 'Léa';
  const suggestion = Math.max(1, Math.round((Number(f.points) || 0) / 20));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 28, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: 0 }}>{offer ? 'Modifier l’offre' : 'Nouvelle offre'}</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>{detail?.kind === 'store' ? `Validée par ${detail.parentPartner?.name ?? 'votre enseigne'} puis par l'équipe Rekonect sous 48 h` : "Vérifiée par l'équipe Rekonect sous 48 h avant publication"}</p>
        </div>
        {offer?.reviewNote && (
          <div style={{ background: '#FBF0DA', borderRadius: 14, padding: '13px 14px', fontSize: 13, color: C.text2 }}>
            <strong style={{ color: '#96681A' }}>Modification demandée :</strong> {offer.reviewNote}
          </div>
        )}
        {offer?.rejectionReason && (
          <div style={{ background: '#FBE9EC', borderRadius: 14, padding: '13px 14px', fontSize: 13, color: C.text2 }}>
            <strong style={{ color: '#AE3A50' }}>Offre refusée :</strong> {offer.rejectionReason}
          </div>
        )}

        <Section n={1} title="Type d'offre">
          <div role="radiogroup" aria-label="Type d'offre" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
            {TYPES.map((t) => {
              const on = f.type === t.id;
              const disabled = !!offer || (t.id === 'parent' && limits.parentVouchers === false);
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} disabled={disabled && !on} onClick={() => set('type', t.id)} style={{ borderRadius: 16, padding: 16, border: `1.5px solid ${on ? C.coral : 'rgba(22,24,43,.1)'}`, background: on ? '#FFF7F3' : '#fff', opacity: disabled && !on ? 0.45 : 1 }}>
                  <span style={{ display: 'block', width: 34, height: 34, borderRadius: 11, background: t.ic, marginBottom: 12 }} />
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{t.n}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.text2, marginTop: 4, lineHeight: 1.45 }}>{t.s}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section n={2} title="Contenu">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 180px', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="offer-title" style={label}>
                  Titre visible par la famille
                </label>
                <TextInput id="offer-title" value={f.title} onChange={(e) => set('title', e.target.value)} weight={700} focusColor={C.coral} style={{ borderColor: C.coral }} placeholder="−15 % sur le rayon vélo" />
              </div>
              <div>
                <label htmlFor="offer-desc" style={label}>
                  Description
                </label>
                <TextArea id="offer-desc" value={f.description} onChange={(e) => set('description', e.target.value)} focusColor={C.coral} style={{ minHeight: 74, fontSize: 13 }} placeholder="Ton enfant a bougé ! Profitez de −15 % sur tout le rayon vélo." />
              </div>
              {kind === 'parent_voucher' && (
                <div>
                  <label htmlFor="offer-discount" style={label}>
                    Avantage affiché sur le bon
                  </label>
                  <TextInput id="offer-discount" value={f.discountLabel} onChange={(e) => set('discountLabel', e.target.value)} focusColor={C.coral} placeholder="−15 %" style={{ maxWidth: 200 }} />
                </div>
              )}
            </div>
            <div>
              <div style={label}>Visuel</div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Visuel de l'offre" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) upload.mutate(file);
                }}
                style={{ height: 134, width: '100%', borderRadius: 14, border: '1.5px dashed rgba(22,24,43,.2)', background: f.imageUrl ? `center/cover url(${f.imageUrl})` : '#FBFAF8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, textAlign: 'center', padding: 10 }}
              >
                {!f.imageUrl && (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text2 }}>{upload.isPending ? 'Envoi…' : 'Déposer une image'}</span>
                    <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, color: C.muted }}>1200×800 · sans texte</span>
                  </>
                )}
              </button>
              {f.imageUrl && (
                <button type="button" onClick={() => set('imageUrl', '')} style={{ fontSize: 12, fontWeight: 700, color: C.redText, marginTop: 6 }}>
                  Retirer l’image
                </button>
              )}
            </div>
          </div>
        </Section>

        <Section n={3} title={kind === 'sponsored_activity' ? 'Le défi' : "Comment l'obtenir"}>
          {kind === 'sponsored_activity' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
              <div>
                <label htmlFor="offer-cat" style={label}>
                  Catégorie du défi
                </label>
                <Select id="offer-cat" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="offer-duration" style={label}>
                  Durée (min)
                </label>
                <TextInput id="offer-duration" type="number" min={5} max={600} value={f.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              {kind === 'child_reward' && (
                <div role="tablist" aria-label="Condition" style={{ display: 'flex', gap: 4, background: '#F1EEE9', padding: 4, borderRadius: 12, marginBottom: 16, maxWidth: 460 }}>
                  {(['points', 'acts'] as const).map((c) => (
                    <button key={c} type="button" role="tab" aria-selected={f.cond === c} onClick={() => set('cond', c)} style={{ flex: 1, height: 34, borderRadius: 9, fontSize: 13, fontWeight: 700, textAlign: 'center', ...seg(f.cond === c) }}>
                      {c === 'points' ? 'Contre des points' : 'Après des activités'}
                    </button>
                  ))}
                </div>
              )}
              {kind === 'child_reward' && f.cond === 'points' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ height: 50, minWidth: 120, borderRadius: 12, border: '1.5px solid rgba(22,24,43,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 12px' }}>
                    <input aria-label="Points" type="number" min={1} value={f.points} onChange={(e) => set('points', e.target.value)} style={{ width: 70, border: 'none', outline: 'none', fontSize: 20, fontWeight: 800, textAlign: 'right', background: 'transparent' }} />
                    <span style={{ fontSize: 20, fontWeight: 800 }}>pts</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5, flex: 1, minWidth: 220 }}>Environ {suggestion} activités moyennes. L'enfant dépense ses points : l'offre entre en concurrence avec les récompenses familiales.</div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14, fontWeight: 600, color: C.text2 }}>
                    <span>{f.trigger === 'streak_days' ? 'Être actif' : f.trigger === 'goal_completed' ? 'Atteindre' : 'Valider'}</span>
                    <input aria-label="Nombre" type="number" min={1} max={100} value={f.threshold} onChange={(e) => set('threshold', e.target.value)} style={{ ...inlineBox, width: 64, textAlign: 'center', outline: 'none' }} />
                    <span>{f.trigger === 'streak_days' ? 'jours d’affilée' : f.trigger === 'goal_completed' ? 'fois l’objectif familial' : 'activités'}</span>
                    <label style={{ ...inlineBox, padding: '0 12px', border: `1.5px solid ${C.coral}`, background: '#FFEDE4', gap: 8, position: 'relative' }}>
                      {cat && <img src={categoryImage(cat.slug)} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
                      {f.trigger === 'streak_days' ? 'Série' : f.trigger === 'goal_completed' ? 'Objectif' : (cat?.name ?? 'Catégorie')} ▾
                      <select aria-label="Déclencheur" value={f.trigger} onChange={(e) => set('trigger', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
                        {categories.data?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value="streak_days">Jours d’activité d’affilée</option>
                        <option value="goal_completed">Objectif familial de la semaine</option>
                      </select>
                    </label>
                    {f.trigger !== 'streak_days' && f.trigger !== 'goal_completed' && (
                      <>
                        <span>en</span>
                        <label style={{ ...inlineBox, position: 'relative' }}>
                          {f.windowDays ? `${f.windowDays} jours` : 'sans limite'}
                          <select aria-label="Période" value={f.windowDays} onChange={(e) => set('windowDays', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
                            {['7', '14', '30', '60', '90', ''].map((d) => (
                              <option key={d} value={d}>
                                {d ? `${d} jours` : 'sans limite'}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>Les points de l'enfant ne sont pas dépensés. C'est l'offre qui incite le plus à pratiquer ({triggerLabel}).</div>
                </>
              )}
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(22,24,43,.06)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, marginRight: 4 }}>Âge des enfants</span>
            {BANDS.map((b) => {
              const on = f.ages.includes(b.id);
              return (
                <button key={b.id} type="button" aria-pressed={on} onClick={() => set('ages', on ? f.ages.filter((a) => a !== b.id) : [...f.ages, b.id])} style={{ height: 32, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', ...chipOn(on) }}>
                  {b.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section n={4} title="Qui peut la voir">
          <div role="radiogroup" aria-label="Ciblage" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginBottom: 16 }}>
            {targets.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={f.target === t.id} disabled={!t.ok} onClick={() => set('target', t.id)} style={{ borderRadius: 14, padding: '13px 14px', border: `1.5px solid ${f.target === t.id ? C.ink : 'rgba(22,24,43,.1)'}`, background: f.target === t.id ? '#F6F4F1' : '#fff', opacity: t.ok ? 1 : 0.45 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{t.n}</span>
                <span style={{ display: 'block', fontSize: 11, color: C.text2, marginTop: 3, lineHeight: 1.4 }}>{t.ok ? t.s : 'Non inclus dans votre plan'}</span>
              </button>
            ))}
          </div>
          {f.target === 'radius' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 140px', gap: 10, marginBottom: 14 }}>
              <Select aria-label="Lieu" value={f.placeId} onChange={(e) => set('placeId', e.target.value)}>
                {places.data?.length ? null : <option value="">Ajoutez d’abord un lieu</option>}
                {places.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <div style={{ ...box(), display: 'flex', alignItems: 'center', gap: 6 }}>
                <input aria-label="Rayon en km" type="number" min={1} max={Number(limits.maxRadiusKm ?? 200)} value={f.radiusKm} onChange={(e) => set('radiusKm', e.target.value)} style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, fontWeight: 700, background: 'transparent' }} />
                km
              </div>
            </div>
          )}
          {f.target === 'area' && <TextInput aria-label="Codes postaux" value={f.postalCodes} onChange={(e) => set('postalCodes', e.target.value)} placeholder="69001, 69002, 69003" style={{ marginBottom: 14 }} />}
          {f.target === 'code' && (
            <Select aria-label="Code d'accès" value={f.promoCodeId} onChange={(e) => set('promoCodeId', e.target.value)} style={{ marginBottom: 14 }}>
              <option value="">Choisir le code d’accès…</option>
              {codes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 14, alignItems: 'stretch' }}>
            <div style={{ height: 180, borderRadius: 16, background: '#E9EDF2', backgroundImage: 'radial-gradient(circle, rgba(22,24,43,.12) 1.2px, transparent 1.3px)', backgroundSize: '13px 13px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: radiusPx, height: radiusPx, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'rgba(255,148,105,.2)', border: '2px solid #FF9469', transition: 'width .2s,height .2s' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 14, height: 14, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: C.ink, border: '3px solid #fff' }} />
              <div style={{ position: 'absolute', left: 12, bottom: 10, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, color: C.muted }}>carte · {targets.find((t) => t.id === f.target)?.n.toLowerCase()}</div>
            </div>
            <div aria-live="polite" style={{ background: C.ink, color: '#fff', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(255,255,255,.5)' }}>AUDIENCE ESTIMÉE</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', marginTop: 8 }}>{reach ? shown(reach.kids) : '…'}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>enfants éligibles</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>{reach ? shown(reach.families) : '…'} familles</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>dont {reach ? shown(reach.activeFamilies) : '…'} actives cette semaine</div>
            </div>
          </div>
        </Section>

        <Section n={5} title="Stock, dates et utilisation">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <div>
              <label htmlFor="offer-stock" style={label}>
                Quantité
              </label>
              <input id="offer-stock" className="rk-input" inputMode="numeric" value={f.stock} onChange={(e) => set('stock', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Illimitée" style={box()} />
            </div>
            <div>
              <label htmlFor="offer-per" style={label}>
                Par famille
              </label>
              <input id="offer-per" className="rk-input" type="number" min={1} max={50} value={f.perFamily} onChange={(e) => set('perFamily', e.target.value)} style={box()} />
            </div>
            <div>
              <label htmlFor="offer-start" style={label}>
                Début
              </label>
              <input id="offer-start" className="rk-input" type="date" value={f.start} onChange={(e) => set('start', e.target.value)} style={box()} />
            </div>
            <div>
              <label htmlFor="offer-end" style={label}>
                Fin
              </label>
              <input id="offer-end" className="rk-input" type="date" value={f.end} min={f.start || undefined} onChange={(e) => set('end', e.target.value)} style={box()} />
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text2, margin: '16px 0 8px' }}>Utilisation</div>
          <div role="radiogroup" aria-label="Utilisation" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {METHODS.map((m) => {
              const on = f.method === m.id;
              return (
                <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => set('method', m.id)} style={{ height: 36, padding: '0 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', background: on ? C.ink : '#fff', color: on ? '#fff' : C.text2, border: on ? 'none' : '1px solid rgba(22,24,43,.12)' }}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </Section>

        {issues.length > 0 && <ErrorBox error={new Error(issues.join(' · '))} />}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="outline" height={46} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)} style={{ fontSize: 14, padding: '0 20px' }}>
            Enregistrer le brouillon
          </Button>
          <Button variant="coral" height={46} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)} style={{ fontSize: 14, padding: '0 24px' }}>
            Envoyer en validation
          </Button>
        </div>
      </div>

      <div style={{ position: 'sticky', top: 90 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 10 }}>APERÇU DANS L'APP {who}</div>
        <div style={{ width: 300, borderRadius: 40, background: '#0B0C14', padding: 9, boxShadow: '0 30px 60px -30px rgba(22,24,43,.5)' }}>
          <div style={{ borderRadius: 32, overflow: 'hidden', background: '#F6F4F1', height: 560, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '34px 18px 14px', background: '#fff', borderBottom: '1px solid rgba(22,24,43,.08)' }}>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.03em' }}>{f.type === 'parent' ? 'Bons & avantages' : f.type === 'defi' ? 'Mes défis' : 'Récompenses'}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.type === 'parent' ? `Débloqués grâce aux efforts de ${childName}` : 'Offert par nos partenaires près de chez toi'}</div>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ height: 110, background: account?.color ?? C.primary, backgroundImage: f.imageUrl ? `url(${f.imageUrl})` : 'repeating-linear-gradient(115deg, rgba(255,255,255,.25) 0 2px, transparent 2px 13px)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: 10, height: 22, padding: '0 8px', borderRadius: 999, background: 'rgba(255,255,255,.92)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: account?.color ?? C.primary }} />
                    {(detail?.parentPartner?.name ?? account?.name ?? '').split(' ')[0]}
                  </span>
                </div>
                <div style={{ padding: 13 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{f.title || 'Titre de votre offre'}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{previewCond}</div>
                  {kind !== 'sponsored_activity' && !(kind === 'child_reward' && f.cond === 'points') && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>
                        <span>
                          {Math.round((Number(f.threshold) || 10) * 0.6)} / {f.threshold || 10} {f.trigger === 'streak_days' ? 'jours' : 'activités'}
                        </span>
                        <span>60 %</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: '#F1EEE9', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '60%', background: '#FF9469', borderRadius: 999 }} />
                      </div>
                    </div>
                  )}
                  <div style={{ height: 36, borderRadius: 999, background: '#FF9469', color: '#3A1D0E', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
                    {f.type === 'parent' ? 'Voir le bon' : f.type === 'defi' ? 'Relever le défi' : f.cond === 'points' ? 'Demander' : 'Continuer le défi'}
                  </div>
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.55 }}>
                <span style={{ width: 36, height: 36, borderRadius: 11, background: '#EEEFFB', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Veiller 30 min de plus</span>
                  <span style={{ display: 'block', fontSize: 10, color: C.muted }}>Récompense familiale · 60 pts</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        {user && <div style={{ fontSize: 11, color: C.muted, marginTop: 10, width: 300, lineHeight: 1.5 }}>Aperçu indicatif : la carte réelle reprend votre visuel et s’adapte à l’âge de l’enfant.</div>}
      </div>
    </div>
  );
}

