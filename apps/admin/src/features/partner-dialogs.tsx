'use client';
import { type AdminPartnerRow, fieldErrors, formatNumber } from '@rekonect/api-client';
import { Button, C, Drawer, Field, Modal, Select, TextInput, useToast } from '@rekonect/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAdmin } from '@/lib/api';
import { PARTNER_KINDS, PARTNER_STATUS } from '@/lib/labels';

const COLORS = ['#3FA0C9', '#5CB88F', '#7C6BD4', '#E8B33F', '#E2607F', '#16182B', '#3C41A8', '#FF9469'];

/** Inviter un partenaire : création du compte + invitation du responsable par email. */
export function InvitePartnerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', kind: 'brand', subtitle: '', ownerEmail: '', planId: 'partner_network', status: 'onboarding', color: COLORS[0] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [link, setLink] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => {
    setLink(null);
    setErrors({});
    setForm({ name: '', kind: 'brand', subtitle: '', ownerEmail: '', planId: 'partner_network', status: 'onboarding', color: COLORS[0] });
    onClose();
  };
  const create = useMutation({
    mutationFn: () => api.createPartner({ ...form, subtitle: form.subtitle || undefined }),
    onSuccess: (r) => {
      setLink(r.invitation.url);
      toast(`Invitation envoyée à ${form.ownerEmail}`, 'success');
      void qc.invalidateQueries({ queryKey: ['partners'] });
      void qc.invalidateQueries({ queryKey: ['partner-stats'] });
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast((e as Error).message, 'error');
    },
  });
  return (
    <Modal
      open={open}
      title={link ? 'Partenaire invité' : 'Inviter un partenaire'}
      onClose={close}
      width={520}
      footer={
        link ? (
          <Button onClick={close}>Terminer</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              Annuler
            </Button>
            <Button loading={create.isPending} onClick={() => create.mutate()}>
              Envoyer l’invitation
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
          Le responsable reçoit un email pour créer son accès. Le lien est valable 7 jours :
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <TextInput readOnly value={link} aria-label="Lien d’invitation" style={{ fontSize: 12, fontFamily: 'ui-monospace,Menlo,monospace' }} />
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard?.writeText(link);
                toast('Lien copié', 'success');
              }}
            >
              Copier
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nom" htmlFor="p-name" error={errors.name}>
            <TextInput id="p-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Decathlon France" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Type" htmlFor="p-kind">
              <Select id="p-kind" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                {PARTNER_KINDS.filter((k) => k.id !== 'store').map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Plan" htmlFor="p-plan">
              <Select id="p-plan" value={form.planId} onChange={(e) => set('planId', e.target.value)}>
                <option value="partner_local">Partenaire local</option>
                <option value="partner_network">Réseau</option>
                <option value="partner_public">Collectivité &amp; CSE</option>
              </Select>
            </Field>
          </div>
          <Field label="Sous-titre (facultatif)" htmlFor="p-sub">
            <TextInput id="p-sub" value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Enseigne nationale" />
          </Field>
          <Field label="Email du responsable" htmlFor="p-owner" error={errors.ownerEmail}>
            <TextInput id="p-owner" type="email" value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} placeholder="julie.bernard@decathlon.com" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Démarrage" htmlFor="p-status">
              <Select id="p-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="onboarding">Intégration</option>
                <option value="trial">Essai</option>
                <option value="active">Actif</option>
              </Select>
            </Field>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text2, marginBottom: 6 }}>Couleur</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={form.color === c} onClick={() => set('color', c)} style={{ width: 26, height: 26, borderRadius: 8, background: c, outline: form.color === c ? `2px solid ${C.ink}` : 'none', outlineOffset: 2 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Fiche partenaire : indicateurs et changement de statut (suspendre met ses offres en pause). */
export function PartnerDrawer({ partner, onClose }: { partner: AdminPartnerRow | null; onClose: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const setStatus = useMutation({
    mutationFn: (status: AdminPartnerRow['status']) => api.setPartnerStatus(partner!.id, status),
    onSuccess: (_r, status) => {
      toast(status === 'suspended' ? 'Partenaire suspendu, ses offres sont en pause' : `Statut : ${PARTNER_STATUS[status].label}`, 'success');
      void qc.invalidateQueries({ queryKey: ['partners'] });
      void qc.invalidateQueries({ queryKey: ['partner-stats'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const st = partner ? PARTNER_STATUS[partner.status] : null;
  return (
    <Drawer open={!!partner} kicker="PARTENAIRE" onClose={onClose} footer={<Button height={44} block shadow={false} onClick={onClose} style={{ flex: 1, fontSize: 14 }}>Fermer</Button>}>
      {partner && st && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: partner.color, color: '#fff', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{partner.initials}</span>
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.03em' }}>{partner.name}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                {partner.kindLabel} · {partner.plan}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 24 }}>
            {[
              [formatNumber(partner.places), 'Lieux'],
              [formatNumber(partner.activeOffers), 'Offres actives'],
              [formatNumber(partner.members), 'Membres'],
            ].map(([v, l]) => (
              <div key={l} style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 10 }}>STATUT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ height: 26, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: st.bg, color: st.fg }}>{st.label}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(['active', 'trial', 'onboarding'] as const)
              .filter((s) => s !== partner.status)
              .map((s) => (
                <button key={s} type="button" className="rk-row" disabled={setStatus.isPending} onClick={() => setStatus.mutate(s)} style={{ height: 44, borderRadius: 12, border: '1px solid rgba(22,24,43,.1)', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700 }}>
                  Passer en « {PARTNER_STATUS[s].label} »
                </button>
              ))}
            {partner.status !== 'suspended' && (
              <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate('suspended')} style={{ height: 44, borderRadius: 12, background: '#FBE9EC', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700, color: '#AE3A50' }}>
                Suspendre (met ses offres en pause)
              </button>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
