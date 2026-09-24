'use client';
import { avatarImage, formatEuros, formatLongDate, formatMonthYear, formatNumber, formatShortDate } from '@rekonect/api-client';
import { Button, C, Drawer, ErrorBox, Field, Modal, Select, Spinner, TextInput, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAdmin } from '@/lib/api';
import { FAMILY_STATUS_COLOR, familyInitials } from '@/lib/labels';

type Dialog = 'gift' | 'payments' | 'delete' | null;
const actionStyle = { height: 44, borderRadius: 12, border: '1px solid rgba(22,24,43,.1)', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700, width: '100%' } as const;

/** Fiche famille (lecture seule) et actions support. */
export function FamilyDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const api = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const family = useQuery({ queryKey: ['family', id], queryFn: () => api.family(id!), enabled: !!id });
  const f = family.data;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['family', id] });
    void qc.invalidateQueries({ queryKey: ['families'] });
  };
  const resend = useMutation({
    mutationFn: () => api.resendLogin(id!),
    onSuccess: (r) => toast(`Email de connexion renvoyé à ${r.email}`, 'success'),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const disable = useMutation({
    mutationFn: (disabled: boolean) => api.setUserDisabled(id!, disabled),
    onSuccess: (_r, disabled) => {
      toast(disabled ? 'Accès suspendu' : 'Accès rétabli', 'success');
      refresh();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const lastName = f?.name.replace(/^Famille /, '') ?? '';
  const admin = f?.parents[0];
  return (
    <>
      <Drawer
        open={!!id}
        kicker="FICHE FAMILLE"
        onClose={onClose}
        footer={
          <Button height={44} block shadow={false} onClick={onClose} style={{ flex: 1, fontSize: 14 }}>
            Fermer
          </Button>
        }
      >
        {family.isLoading && <Spinner />}
        {family.error && <ErrorBox error={family.error} onRetry={() => family.refetch()} />}
        {f && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
              <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#EEEFFB', color: '#3C41A8', fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{familyInitials(lastName, admin?.name ?? '')}</span>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.03em' }}>{f.name}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {f.city ?? 'Ville non renseignée'} · inscrite {formatMonthYear(f.createdAt)}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
              <div style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 11, color: C.muted }}>Plan</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{f.planName}</div>
                {f.subscription?.compUntil && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>offert jusqu’au {formatShortDate(f.subscription.compUntil)}</div>}
              </div>
              <div style={{ background: '#F6F4F1', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 11, color: C.muted }}>Statut</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, color: f.disabledAt ? C.redText : FAMILY_STATUS_COLOR[f.status] }}>{f.disabledAt ? 'Accès suspendu' : f.statusLabel}</div>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 10 }}>PARENTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
              {f.parents.map((p) => (
                <div key={p.email} style={{ border: '1px solid rgba(22,24,43,.08)', borderRadius: 14, padding: '13px 14px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {p.email} · {p.role}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 10 }}>ENFANTS · {f.children.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
              {f.children.map((k) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(22,24,43,.08)', borderRadius: 14, padding: '11px 14px' }}>
                  <img src={k.avatarUrl?.startsWith('http') || k.avatarUrl?.startsWith('/') ? k.avatarUrl : avatarImage(k.id)} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', background: '#EDE7FF' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{k.displayName}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {k.age} ans · {k.levelName}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{formatNumber(k.totalPoints)} pts</div>
                </div>
              ))}
              {f.children.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Aucun profil enfant.</div>}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 10 }}>ACTIONS SUPPORT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button type="button" className="rk-row" onClick={() => setDialog('gift')} style={actionStyle}>
                Offrir un mois d'abonnement
              </button>
              <button type="button" className="rk-row" onClick={() => resend.mutate()} disabled={resend.isPending} style={actionStyle}>
                {resend.isPending ? 'Envoi…' : "Renvoyer l'email de connexion"}
              </button>
              <button type="button" className="rk-row" onClick={() => setDialog('payments')} style={actionStyle}>
                Voir l'historique de paiement
              </button>
              <button type="button" className="rk-row" onClick={() => disable.mutate(!f.disabledAt)} disabled={disable.isPending} style={actionStyle}>
                {f.disabledAt ? "Rétablir l'accès au compte" : "Suspendre l'accès au compte"}
              </button>
              <button type="button" onClick={() => setDialog('delete')} style={{ ...actionStyle, border: 'none', background: '#FBE9EC', color: '#AE3A50' }}>
                Supprimer le compte (RGPD)
              </button>
            </div>
          </>
        )}
      </Drawer>
      {f && <GiftDialog open={dialog === 'gift'} familyId={f.id} onClose={() => setDialog(null)} onDone={refresh} />}
      {f && <PaymentsDialog open={dialog === 'payments'} familyId={f.id} onClose={() => setDialog(null)} />}
      {f && admin && (
        <DeleteDialog
          open={dialog === 'delete'}
          familyId={f.id}
          email={admin.email}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void qc.invalidateQueries({ queryKey: ['families'] });
            void qc.invalidateQueries({ queryKey: ['family-stats'] });
            onClose();
          }}
        />
      )}
    </>
  );
}

function GiftDialog({ open, familyId, onClose, onDone }: { open: boolean; familyId: string; onClose: () => void; onDone: () => void }) {
  const api = useAdmin();
  const toast = useToast();
  const [months, setMonths] = useState('1');
  const [plan, setPlan] = useState('family');
  const gift = useMutation({
    mutationFn: () => api.giftMonths(familyId, Number(months), plan),
    onSuccess: (r) => {
      toast(`Abonnement offert jusqu’au ${formatLongDate(r.compUntil)}`, 'success');
      onDone();
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open={open}
      title="Offrir un abonnement"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={gift.isPending} onClick={() => gift.mutate()}>
            Offrir
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Plan" htmlFor="gift-plan">
          <Select id="gift-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="family">Famille</option>
            <option value="family_plus">Famille+</option>
          </Select>
        </Field>
        <Field label="Durée" htmlFor="gift-months">
          <Select id="gift-months" value={months} onChange={(e) => setMonths(e.target.value)}>
            {[1, 2, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m} mois
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>Sans paiement : la famille profite du plan pendant la durée choisie, cumulable avec un geste précédent.</div>
    </Modal>
  );
}

function PaymentsDialog({ open, familyId, onClose }: { open: boolean; familyId: string; onClose: () => void }) {
  const api = useAdmin();
  const payments = useQuery({ queryKey: ['family-payments', familyId], queryFn: () => api.familyPayments(familyId), enabled: open });
  return (
    <Modal open={open} title="Historique de paiement" onClose={onClose} width={560}>
      {payments.isLoading && <Spinner />}
      {payments.error && <ErrorBox error={payments.error} />}
      {payments.data && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 8 }}>FACTURES</div>
          {payments.data.invoices.length === 0 && <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Aucune facture.</div>}
          {payments.data.invoices.map((i) => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid rgba(22,24,43,.05)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{i.number ?? formatShortDate(i.issuedAt)}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{formatEuros(i.amountPaidCents || i.amountDueCents)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, width: 64, textAlign: 'right', color: i.status === 'paid' ? '#4A7A5F' : '#AE3A50' }}>{i.status === 'paid' ? 'Payée' : 'Impayée'}</span>
              {i.pdfUrl && (
                <a href={i.pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700 }}>
                  PDF
                </a>
              )}
            </div>
          ))}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.muted, margin: '18px 0 8px' }}>ÉVÉNEMENTS</div>
          {payments.data.events.map((e) => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', gap: 12, padding: '9px 0', borderTop: '1px solid rgba(22,24,43,.05)', fontSize: 13 }}>
              <span style={{ color: C.muted, fontSize: 12 }}>{formatShortDate(e.occurredAt)}</span>
              <span style={{ color: C.text2 }}>{e.description ?? e.type}</span>
              <span style={{ textAlign: 'right', fontWeight: 800 }}>{e.amountCents != null ? formatEuros(e.amountCents, { signed: true, decimals: 'always' }) : ''}</span>
            </div>
          ))}
          {payments.data.events.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Aucun événement.</div>}
        </>
      )}
    </Modal>
  );
}

function DeleteDialog({ open, familyId, email, onClose, onDone }: { open: boolean; familyId: string; email: string; onClose: () => void; onDone: () => void }) {
  const api = useAdmin();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const del = useMutation({
    mutationFn: () => api.deleteFamily(familyId, confirm),
    onSuccess: () => {
      toast('Compte et données supprimés', 'success');
      setConfirm('');
      onDone();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open={open}
      title="Supprimer le compte (RGPD)"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="dangerSoft" disabled={confirm.trim().toLowerCase() !== email.toLowerCase()} loading={del.isPending} onClick={() => del.mutate()}>
            Supprimer définitivement
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.55, marginBottom: 14 }}>
        Le compte parent, les profils enfants, l’historique d’activités et les appareils seront effacés. Cette action est irréversible. Les statistiques partenaires, déjà anonymes, sont conservées.
      </div>
      <Field label={`Tapez ${email} pour confirmer`} htmlFor="del-confirm">
        <TextInput id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </Field>
    </Modal>
  );
}
