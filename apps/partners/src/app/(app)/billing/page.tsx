'use client';
import { type PartnerMember, type PartnerRole, type Plan, formatEuros, formatMonthLong, formatNumber, initialsOf } from '@rekonect/api-client';
import { Button, C, ErrorBox, Field, Modal, Select, Spinner, Stack, TextInput, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ROLE_LABELS } from '@/lib/labels';
import { usePartner, usePartnerApi } from '@/lib/partner';

const card = { background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 22, padding: 22 } as const;
const bar = (l: string, v: string, pct: number) => ({ l, v, w: `${Math.max(0, Math.min(100, pct))}%` });
const cap = (n: unknown) => (n == null ? 'illimité' : formatNumber(Number(n)));

export default function BillingPage() {
  const api = usePartnerApi();
  const { partnerId, detail, can } = usePartner();
  const [plansOpen, setPlansOpen] = useState(false);
  const billing = useQuery({ queryKey: ['billing', partnerId], queryFn: () => api.billing(partnerId!), enabled: !!partnerId && detail?.kind !== 'store', retry: false });
  const offers = useQuery({ queryKey: ['offers', partnerId, 'all'], queryFn: () => api.offers(partnerId!), enabled: !!partnerId });
  const toast = useToast();
  const portal = useMutation({
    mutationFn: () => api.portal(partnerId!),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (!detail) return <Spinner />;

  const inherited = detail.kind === 'store' || (billing.error as { status?: number } | null)?.status === 403;
  const b = billing.data;
  const limits = b?.limits ?? detail.plan.limits;
  const activeOffers = (offers.data ?? []).filter((o) => ['published', 'pending_review', 'pending_brand', 'paused'].includes(o.status)).length;
  const usage = [
    detail.kind === 'brand' ? bar('Magasins connectés', `${formatNumber(b?.usage.stores ?? detail.stores.length)} / ${cap(limits.maxPlaces)}`, limits.maxPlaces ? ((b?.usage.stores ?? 0) / Number(limits.maxPlaces)) * 100 : 100) : bar('Lieux', `${formatNumber(b?.usage.places ?? detail._count.places)} / ${cap(limits.maxPlaces)}`, limits.maxPlaces ? ((b?.usage.places ?? detail._count.places) / Number(limits.maxPlaces)) * 100 : 100),
    bar(inherited ? 'Offres locales actives' : 'Offres actives', `${formatNumber(activeOffers)} / ${cap(limits.maxActiveOffers)}`, limits.maxActiveOffers ? (activeOffers / Number(limits.maxActiveOffers)) * 100 : Math.min(100, activeOffers * 10)),
    ...(Number(limits.includedFamilyLicenses) > 0 || (b?.usage.licensesTotal ?? 0) > 0
      ? [bar('Licences Famille', `${formatNumber(b?.usage.licensesUsed ?? 0)} / ${formatNumber(b?.usage.licensesTotal || Number(limits.includedFamilyLicenses))}`, ((b?.usage.licensesUsed ?? 0) / Math.max(1, b?.usage.licensesTotal || Number(limits.includedFamilyLicenses))) * 100)]
      : limits.maxRadiusKm
        ? [bar('Rayon de ciblage max', `${limits.maxRadiusKm} km`, 100)]
        : []),
  ];
  const price = inherited
    ? `facturé à ${detail.parentPartner?.name ?? 'votre enseigne'}`
    : b?.plan.monthlyPriceCents == null
      ? 'convention annuelle'
      : b.plan.monthlyPriceCents === 0
        ? 'gratuit'
        : b.interval === 'year' && b.plan.annualPriceCents
          ? `${formatEuros(b.plan.annualPriceCents)} / an`
          : `${formatEuros(b.plan.monthlyPriceCents)} / mois`;

  return (
    <Stack gap={20}>
      <div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: 0 }}>Compte &amp; facturation</h1>
        <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>
          {detail.name} · {detail.kindLabel}
          {detail.parentPartner ? ` · rattaché à ${detail.parentPartner.name}` : ` · plan ${detail.plan.name}`}
        </p>
      </div>
      {billing.error && !inherited && <ErrorBox error={billing.error} onRetry={() => billing.refetch()} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}>
        <div style={{ ...card, border: '1.5px solid #3C41A8' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted }}>VOTRE PLAN</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em' }}>{inherited ? `Inclus dans ${detail.plan.name}` : (b?.plan.name ?? detail.plan.name)}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>{price}</span>
          </div>
          {b?.cancelAtPeriodEnd && <div style={{ fontSize: 12, color: '#AE3A50', fontWeight: 700, marginTop: 6 }}>Résiliation programmée en fin de période</div>}
          {b?.status === 'past_due' && <div style={{ fontSize: 12, color: '#AE3A50', fontWeight: 700, marginTop: 6 }}>Paiement en attente : mettez à jour votre moyen de paiement</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            {usage.map((u) => (
              <div key={u.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                  <span>{u.l}</span>
                  <span style={{ color: C.muted }}>{u.v}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: '#F1EEE9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: u.w, background: '#3C41A8', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
          {!inherited && can.manage && (
            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <button type="button" onClick={() => setPlansOpen(true)} style={{ flex: 1, height: 42, borderRadius: 999, border: '1.5px solid rgba(22,24,43,.14)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Changer de plan
              </button>
              {b?.hasPaymentMethod && (
                <button type="button" onClick={() => portal.mutate()} disabled={portal.isPending} style={{ height: 42, padding: '0 16px', borderRadius: 999, border: '1.5px solid rgba(22,24,43,.14)', fontSize: 13, fontWeight: 700 }}>
                  Paiement
                </button>
              )}
            </div>
          )}
        </div>
        <Team members={detail.members} />
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 14 }}>Factures</div>
          {inherited && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Votre magasin est inclus dans l’abonnement de {detail.parentPartner?.name ?? 'votre enseigne'} : aucune facture à votre nom.</div>}
          {b?.invoices?.map((i) => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid rgba(22,24,43,.05)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{formatMonthLong(i.periodStart ?? i.issuedAt)}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{formatEuros(i.amountPaidCents || i.amountDueCents)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: i.status === 'paid' ? '#4A7A5F' : '#AE3A50', width: 52, textAlign: 'right' }}>{i.status === 'paid' ? 'Payée' : 'À régler'}</span>
              {i.pdfUrl ? (
                <a href={i.pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: '#3C41A8' }}>
                  PDF
                </a>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>—</span>
              )}
            </div>
          ))}
          {b && !b.invoices?.length && <div style={{ fontSize: 13, color: C.muted }}>Aucune facture pour l’instant.</div>}
        </div>
      </div>
      {!inherited && <PlansDialog open={plansOpen} current={b?.plan.id ?? detail.plan.id} paymentsEnabled={!!b?.paymentsEnabled} onClose={() => setPlansOpen(false)} />}
    </Stack>
  );
}

function Team({ members }: { members: PartnerMember[] }) {
  const api = usePartnerApi();
  const { partnerId, can } = usePartner();
  const qc = useQueryClient();
  const toast = useToast();
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<PartnerMember | null>(null);
  const [form, setForm] = useState({ email: '', role: 'editor' as PartnerRole, title: '' });
  const [link, setLink] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['partner', partnerId] });
  const send = useMutation({
    mutationFn: () => api.invite(partnerId!, { email: form.email.trim(), role: form.role, title: form.title.trim() || undefined }),
    onSuccess: (r) => {
      toast(`Invitation envoyée à ${form.email}`, 'success');
      setLink(r.url);
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const update = useMutation({
    mutationFn: (role: PartnerRole) => api.updateMember(partnerId!, edit!.id, { role }),
    onSuccess: () => {
      toast('Rôle mis à jour', 'success');
      setEdit(null);
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const revoke = useMutation({
    mutationFn: () => api.revokeMember(partnerId!, edit!.id),
    onSuccess: () => {
      toast('Accès retiré', 'success');
      setEdit(null);
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const closeInvite = () => {
    setInvite(false);
    setLink(null);
    setForm({ email: '', role: 'editor', title: '' });
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Équipe</div>
        {can.manage && (
          <button type="button" onClick={() => setInvite(true)} style={{ fontSize: 12, fontWeight: 700, color: '#3C41A8' }}>
            + Inviter
          </button>
        )}
      </div>
      {members.map((m) => (
        <button key={m.id} type="button" disabled={!can.manage} onClick={() => setEdit(m)} className={can.manage ? 'rk-row' : undefined} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid rgba(22,24,43,.05)' }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#F1EEE9', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{m.fullName ? initialsOf(m.fullName) : m.initials}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{m.fullName ?? m.email}</span>
            <span style={{ display: 'block', fontSize: 11, color: C.muted }}>
              {[m.title, ROLE_LABELS[m.role]].filter(Boolean).join(' · ')}
              {m.status === 'invited' ? ' · invitation envoyée' : ''}
            </span>
          </span>
        </button>
      ))}
      <Modal
        open={invite}
        title={link ? 'Invitation envoyée' : 'Inviter un membre'}
        onClose={closeInvite}
        footer={
          link ? (
            <Button variant="dark" onClick={closeInvite}>
              Terminer
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={closeInvite}>
                Annuler
              </Button>
              <Button variant="dark" disabled={!form.email.includes('@')} loading={send.isPending} onClick={() => send.mutate()}>
                Inviter
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
            Un email a été envoyé. Vous pouvez aussi transmettre ce lien (valable 7 jours) :
            <TextInput readOnly value={link} aria-label="Lien d’invitation" style={{ marginTop: 10, fontSize: 12, fontFamily: 'ui-monospace,Menlo,monospace' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Email" htmlFor="inv-email">
              <TextInput id="inv-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Rôle" htmlFor="inv-role">
                <Select id="inv-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as PartnerRole }))}>
                  <option value="owner">Admin</option>
                  <option value="editor">Édition des offres</option>
                  <option value="viewer">Lecture</option>
                  <option value="reception">Accueil / caisse</option>
                </Select>
              </Field>
              <Field label="Fonction (facultatif)" htmlFor="inv-title">
                <TextInput id="inv-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Marketing national" />
              </Field>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!edit}
        title={edit?.fullName ?? edit?.email ?? ''}
        onClose={() => setEdit(null)}
        footer={
          <Button variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate()} style={{ marginRight: 'auto' }}>
            Retirer l’accès
          </Button>
        }
      >
        <Field label="Rôle" htmlFor="edit-role">
          <Select id="edit-role" value={edit?.role ?? 'viewer'} disabled={update.isPending} onChange={(e) => update.mutate(e.target.value as PartnerRole)}>
            <option value="owner">Admin</option>
            <option value="editor">Édition des offres</option>
            <option value="viewer">Lecture</option>
            <option value="reception">Accueil / caisse</option>
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

function PlansDialog({ open, current, paymentsEnabled, onClose }: { open: boolean; current: string; paymentsEnabled: boolean; onClose: () => void }) {
  const api = usePartnerApi();
  const { partnerId } = usePartner();
  const toast = useToast();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['partner-plans'], queryFn: api.plans, enabled: open });
  const choose = useMutation({
    mutationFn: (p: Plan) => api.checkout(partnerId!, p.id, 'month'),
    onSuccess: (r) => {
      if (r?.url) window.location.assign(r.url);
      else {
        toast('Plan mis à jour', 'success');
        void qc.invalidateQueries({ queryKey: ['billing'] });
        void qc.invalidateQueries({ queryKey: ['partner'] });
        onClose();
      }
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal open={open} title="Changer de plan" onClose={onClose} width={620}>
      {!paymentsEnabled && <div style={{ background: '#FBF0DA', borderRadius: 12, padding: '11px 14px', fontSize: 13, color: C.text2, marginBottom: 14 }}>Le paiement en ligne n’est pas encore activé : contactez partenaires@rekonect.app pour changer de plan.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {plans.data?.map((p) => (
          <div key={p.id} style={{ border: `1.5px solid ${p.id === current ? '#3C41A8' : 'rgba(22,24,43,.1)'}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color }} />
              <span style={{ fontSize: 14, fontWeight: 800 }}>{p.name}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{p.monthlyPriceCents == null ? 'Sur devis' : `${formatEuros(p.monthlyPriceCents)}`}</div>
            <div style={{ fontSize: 12, color: C.muted, flex: 1 }}>{p.tagline}</div>
            {p.id === current ? (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#3C41A8' }}>Plan actuel</div>
            ) : p.monthlyPriceCents == null ? (
              <a href="mailto:partenaires@rekonect.app" style={{ fontSize: 12, fontWeight: 700 }}>
                Nous contacter
              </a>
            ) : (
              <Button variant="dark" height={34} disabled={!paymentsEnabled} loading={choose.isPending && choose.variables?.id === p.id} onClick={() => choose.mutate(p)}>
                Choisir
              </Button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
