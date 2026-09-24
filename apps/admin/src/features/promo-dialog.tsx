'use client';
import { type PromoCode, fieldErrors, formatEuros, formatNumber } from '@rekonect/api-client';
import { Button, Field, Modal, Select, TextInput, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAdmin } from '@/lib/api';

const PLAN_NAMES: Record<string, string> = { family: 'Famille', family_plus: 'Famille+' };

/** « −30 % pendant 3 mois · 412 utilisations », « Plan Famille offert 12 mois · payé par le CSE · 188 / 800 ». */
export function describePromo(p: PromoCode): string {
  const uses = p.maxRedemptions ? `${formatNumber(p.redemptions)} / ${formatNumber(p.maxRedemptions)}` : `${formatNumber(p.redemptions)} utilisation${p.redemptions > 1 ? 's' : ''}`;
  const months = p.durationMonths ? `${p.durationMonths} mois` : '';
  switch (p.kind) {
    case 'percent':
      return `−${p.percentOff} %${months ? ` pendant ${months}` : ''} · ${uses}`;
    case 'amount':
      return `−${formatEuros(p.amountOffCents)}${months ? ` pendant ${months}` : ''} · ${uses}`;
    case 'free_months':
      return `${months} offert${p.durationMonths && p.durationMonths > 1 ? 's' : ''} · ${uses}`;
    case 'sponsored':
      return `Plan ${PLAN_NAMES[p.planId ?? 'family'] ?? 'Famille'} offert ${months} · payé par ${p.sponsor?.name ?? 'le partenaire'} · ${uses}`;
  }
}

export function PromoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ code: '', description: '', kind: 'percent', percentOff: '20', amountOff: '', durationMonths: '3', planId: 'family', sponsorPartnerId: '', maxRedemptions: '', expiresAt: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const partners = useQuery({ queryKey: ['partners'], queryFn: () => api.partners(), enabled: open && form.kind === 'sponsored' });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      api.createPromoCode({
        code: form.code,
        description: form.description,
        kind: form.kind,
        percentOff: form.kind === 'percent' ? Number(form.percentOff) : undefined,
        amountOffCents: form.kind === 'amount' ? Math.round(Number(form.amountOff.replace(',', '.')) * 100) : undefined,
        durationMonths: form.durationMonths ? Number(form.durationMonths) : undefined,
        planId: form.kind === 'free_months' || form.kind === 'sponsored' ? form.planId : undefined,
        sponsorPartnerId: form.kind === 'sponsored' ? form.sponsorPartnerId || undefined : undefined,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : undefined,
      }),
    onSuccess: (p) => {
      toast(`Code ${p.code} créé`, 'success');
      void qc.invalidateQueries({ queryKey: ['promo-codes'] });
      setErrors({});
      onClose();
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast((e as Error).message, 'error');
    },
  });

  return (
    <Modal
      open={open}
      title="Nouveau code promo"
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Créer le code
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Code" htmlFor="promo-code" error={errors.code}>
            <TextInput id="promo-code" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="RENTREE26" style={{ fontFamily: 'ui-monospace,Menlo,monospace' }} />
          </Field>
          <Field label="Type" htmlFor="promo-kind">
            <Select id="promo-kind" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="percent">Réduction en %</option>
              <option value="amount">Réduction en €</option>
              <option value="free_months">Mois offerts</option>
              <option value="sponsored">Payé par un partenaire (CSE, mairie)</option>
            </Select>
          </Field>
        </div>
        <Field label="Description interne" htmlFor="promo-desc" error={errors.description}>
          <TextInput id="promo-desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Campagne de rentrée" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {form.kind === 'percent' && (
            <Field label="Réduction (%)" htmlFor="promo-pct">
              <TextInput id="promo-pct" type="number" min={1} max={100} value={form.percentOff} onChange={(e) => set('percentOff', e.target.value)} />
            </Field>
          )}
          {form.kind === 'amount' && (
            <Field label="Réduction (€)" htmlFor="promo-amt">
              <TextInput id="promo-amt" inputMode="decimal" value={form.amountOff} onChange={(e) => set('amountOff', e.target.value)} />
            </Field>
          )}
          {(form.kind === 'free_months' || form.kind === 'sponsored') && (
            <Field label="Plan offert" htmlFor="promo-plan">
              <Select id="promo-plan" value={form.planId} onChange={(e) => set('planId', e.target.value)}>
                <option value="family">Famille</option>
                <option value="family_plus">Famille+</option>
              </Select>
            </Field>
          )}
          <Field label="Durée (mois)" htmlFor="promo-months">
            <TextInput id="promo-months" type="number" min={1} max={36} value={form.durationMonths} onChange={(e) => set('durationMonths', e.target.value)} />
          </Field>
        </div>
        {form.kind === 'sponsored' && (
          <Field label="Partenaire qui finance" htmlFor="promo-sponsor">
            <Select id="promo-sponsor" value={form.sponsorPartnerId} onChange={(e) => set('sponsorPartnerId', e.target.value)}>
              <option value="">Choisir…</option>
              {partners.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Utilisations max" htmlFor="promo-max" hint="Vide = illimité">
            <TextInput id="promo-max" type="number" min={1} value={form.maxRedemptions} onChange={(e) => set('maxRedemptions', e.target.value)} />
          </Field>
          <Field label="Expire le" htmlFor="promo-exp">
            <TextInput id="promo-exp" type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
