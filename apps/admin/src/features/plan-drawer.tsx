'use client';
import { type AdminPlan, formatNumber } from '@rekonect/api-client';
import { Button, C, Drawer, Field, TextArea, TextInput, Toggle, useToast } from '@rekonect/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/lib/api';
import { LIMIT_LABELS, subscribersLabel } from '@/lib/plans';

type Limits = Record<string, number | boolean | null>;

/** « 4,99 » → 499 ; vide → null (sur devis). */
export function eurosToCents(v: string): number | null {
  const t = v.replace(/\s|€/g, '').replace(',', '.');
  if (!t) return null;
  const n = Math.round(Number(t) * 100);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
const centsToEuros = (c: number | null) => (c == null ? '' : (c / 100).toFixed(c % 100 ? 2 : 0).replace('.', ','));

/** Modifier un plan : prix (synchronisés avec Stripe), limites, fonctionnalités affichées. */
export function PlanDrawer({ planId, plans, onClose }: { planId: string | null; plans: AdminPlan[]; onClose: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const plan = plans.find((p) => p.id === planId) ?? null;
  const [monthly, setMonthly] = useState('');
  const [annual, setAnnual] = useState('');
  const [limits, setLimits] = useState<Limits>({});
  const [features, setFeatures] = useState('');

  useEffect(() => {
    if (!plan) return;
    setMonthly(centsToEuros(plan.monthlyPriceCents));
    setAnnual(centsToEuros(plan.annualPriceCents));
    setLimits({ ...plan.limits });
    setFeatures(plan.features.join('\n'));
  }, [plan]);

  const save = useMutation({
    mutationFn: () => {
      const m = eurosToCents(monthly);
      const a = eurosToCents(annual);
      if (Number.isNaN(m) || Number.isNaN(a)) throw new Error('Prix invalide');
      return api.updatePlan(plan!.id, {
        monthlyPriceCents: m,
        annualPriceCents: a,
        limits,
        features: features.split('\n').map((f) => f.trim()).filter(Boolean),
      });
    },
    onSuccess: () => {
      toast('Plan enregistré · appliqué au prochain renouvellement', 'success');
      void qc.invalidateQueries({ queryKey: ['plans'] });
      void qc.invalidateQueries({ queryKey: ['billing-overview'] });
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const keys = Object.keys(LIMIT_LABELS).filter((k) => plan && k in plan.limits);
  return (
    <Drawer
      open={!!plan}
      kicker="PLAN"
      onClose={onClose}
      footer={
        <>
          <Button height={44} block shadow={false} loading={save.isPending} onClick={() => save.mutate()} style={{ flex: 1, fontSize: 14 }}>
            Enregistrer
          </Button>
          <Button variant="outline" height={44} onClick={onClose} style={{ width: 110, padding: 0, fontSize: 14 }}>
            Annuler
          </Button>
        </>
      }
    >
      {plan && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: plan.color }} />
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em' }}>{plan.name}</div>
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 22 }}>
            {formatNumber(plan.subscribers)} {subscribersLabel(plan)} · les changements s'appliquent au prochain renouvellement
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <Field label="Prix mensuel" htmlFor="plan-monthly" hint={plan.monthlyPriceCents == null ? 'Vide = sur devis' : undefined}>
              <TextInput id="plan-monthly" inputMode="decimal" weight={800} value={monthly} onChange={(e) => setMonthly(e.target.value)} style={{ fontSize: 15, borderColor: '#3C41A8' }} placeholder="Sur devis" />
            </Field>
            <Field label="Prix annuel" htmlFor="plan-annual">
              <TextInput id="plan-annual" inputMode="decimal" weight={700} value={annual} onChange={(e) => setAnnual(e.target.value)} style={{ fontSize: 15 }} placeholder="—" />
            </Field>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 10 }}>LIMITES &amp; FONCTIONNALITÉS</div>
          <div style={{ border: '1px solid rgba(22,24,43,.08)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
            {keys.map((k) => {
              const v = limits[k];
              const isBool = typeof plan.limits[k] === 'boolean';
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid rgba(22,24,43,.06)' }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{LIMIT_LABELS[k]}</div>
                  {isBool ? (
                    <Toggle checked={v === true} onChange={(c) => setLimits((l) => ({ ...l, [k]: c }))} label={LIMIT_LABELS[k]} />
                  ) : (
                    <input
                      aria-label={LIMIT_LABELS[k]}
                      inputMode="numeric"
                      value={v == null ? '∞' : String(v)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setLimits((l) => ({ ...l, [k]: raw === '' ? null : Number(raw) }));
                      }}
                      title="Laisser vide pour illimité"
                      style={{ height: 32, width: 64, padding: '0 10px', borderRadius: 9, background: '#F1EEE9', border: 'none', textAlign: 'center', fontSize: 13, fontWeight: 800, outline: 'none' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <Field label="Fonctionnalités affichées (une par ligne)" htmlFor="plan-features">
            <TextArea id="plan-features" value={features} onChange={(e) => setFeatures(e.target.value)} style={{ minHeight: 110 }} />
          </Field>
          <div style={{ background: '#FBF0DA', borderRadius: 14, padding: '13px 14px', fontSize: 12, color: C.text2, lineHeight: 1.55, marginTop: 20 }}>
            Une baisse de limite ne supprime aucune donnée : les profils au-delà passent en lecture seule jusqu'au prochain changement de plan.
          </div>
        </>
      )}
    </Drawer>
  );
}
