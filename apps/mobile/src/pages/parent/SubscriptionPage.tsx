import React, { useCallback, useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useRkBack } from '../../hooks/useRkBack';
import { RkSheet } from '../../components/rk/RkShell';
import { billingService, euros, type FamilyPlan, type FamilySubscription, type Invoice } from '../../features/billing/billing.service';
import { RkHeader } from '../../components/rk/RkDecor';

/**
 * « Mon abonnement » : plan actuel, limites utilisées, changement de plan (Stripe),
 * code offert (CSE, mairie) et factures. Le paiement se fait sur la page sécurisée Stripe.
 */

export function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) window.open(url, '_system');
  else window.location.assign(url);
}

const LIMIT_ROWS: { key: string; usage: 'children' | 'customActivities' | 'coParents'; label: string }[] = [
  { key: 'maxChildren', usage: 'children', label: 'Profils enfants' },
  { key: 'maxCustomActivities', usage: 'customActivities', label: 'Activités personnalisées' },
  { key: 'maxCoParents', usage: 'coParents', label: 'Co-parents' },
];

const card: React.CSSProperties = { background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 22, padding: 18 };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', textTransform: 'uppercase', margin: '4px 4px 10px' };
const primary: React.CSSProperties = { width: '100%', height: 50, borderRadius: 999, background: 'var(--rk-indigo)', color: 'var(--rk-indigofg)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const outline: React.CSSProperties = { width: '100%', height: 46, borderRadius: 999, border: '1.5px solid var(--rk-border)', color: 'var(--rk-text)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' };

const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

const SubscriptionPage: React.FC = () => {
  const back = useRkBack('/parent/settings');
  const location = useLocation();
  const [sub, setSub] = useState<FamilySubscription | null>(null);
  const [plans, setPlans] = useState<FamilyPlan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p, i] = await Promise.all([billingService.subscription(), billingService.plans(), billingService.invoices().catch(() => [])]);
      setSub(s);
      setPlans(p);
      setInvoices(i);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useIonViewWillEnter(() => void load());
  useEffect(() => {
    void load();
    const status = new URLSearchParams(location.search).get('checkout');
    if (status === 'success') setNotice('Merci ! Votre abonnement est activé. Il peut falloir quelques secondes pour le voir ici.');
    if (status === 'cancel') setNotice('Paiement annulé : aucun montant n’a été prélevé.');
  }, [load, location.search]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const choose = (plan: FamilyPlan) =>
    run(plan.id, async () => {
      if (sub?.hasPaymentMethod && sub.status !== 'cancelled') {
        await billingService.changePlan(plan.id, interval);
        setNotice(`Vous passez au plan ${plan.name}.`);
      } else {
        const { url } = await billingService.checkout(plan.id, interval);
        openExternal(url);
      }
    });

  const redeem = () =>
    run('code', async () => {
      const r = await billingService.redeem(code.trim());
      setCodeOpen(false);
      setCode('');
      setNotice(r.kind === 'comp' ? `Code accepté : plan offert${r.sponsor ? ` par ${r.sponsor}` : ''} jusqu’au ${dateFr(r.compUntil)}.` : `Code « ${r.code} » valide : la réduction s’appliquera au paiement.`);
    });

  const current = sub?.plan.id ?? 'free';
  const priceOf = (p: FamilyPlan) => (interval === 'year' ? p.annualPriceCents : p.monthlyPriceCents);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>
          <RkHeader>
            <button onClick={back} aria-label="Retour" style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 12 }}>
              ← Réglages
            </button>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--rk-text)', margin: 0 }}>Mon abonnement</h1>
            <p style={{ fontSize: 14, color: 'var(--rk-text3)', margin: '6px 0 0' }}>Plan, limites et factures de la famille</p>
          </RkHeader>

          <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {notice && (
              <div role="status" style={{ background: 'var(--rk-sagesoft)', color: 'var(--rk-text)', borderRadius: 16, padding: '13px 15px', fontSize: 14, lineHeight: 1.5 }}>
                {notice}
              </div>
            )}
            {error && (
              <div role="alert" style={{ background: 'var(--rk-raspsoft)', color: 'var(--rk-rasp)', borderRadius: 16, padding: '13px 15px', fontSize: 14, fontWeight: 600 }}>
                {error}
              </div>
            )}

            {sub && (
              <div style={{ ...card, border: '1.5px solid var(--rk-indigo)' }}>
                <div style={eyebrow}>Votre plan</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 4px' }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.03em' }}>{sub.plan.name}</span>
                  {sub.plan.monthlyPriceCents ? <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text3)' }}>{euros(sub.interval === 'year' ? sub.plan.annualPriceCents : sub.plan.monthlyPriceCents)} / {sub.interval === 'year' ? 'an' : 'mois'}</span> : null}
                </div>
                <div style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '6px 4px 0', lineHeight: 1.5 }}>
                  {sub.source === 'comp' && sub.compUntil ? `Offert jusqu’au ${dateFr(sub.compUntil)}` : sub.cancelAtPeriodEnd && sub.currentPeriodEnd ? `Se termine le ${dateFr(sub.currentPeriodEnd)}` : sub.currentPeriodEnd ? `Prochain renouvellement le ${dateFr(sub.currentPeriodEnd)}` : 'Gratuit, sans engagement'}
                  {sub.status === 'past_due' ? ' · paiement en attente' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '16px 4px 4px' }}>
                  {LIMIT_ROWS.map((row) => {
                    const max = sub.limits[row.key] as number | null | undefined;
                    const used = sub.usage[row.usage] ?? 0;
                    if (max === undefined) return null;
                    const pct = max == null ? 12 : max === 0 ? 100 : Math.min(100, (used / max) * 100);
                    return (
                      <div key={row.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: 'var(--rk-text)', marginBottom: 6 }}>
                          <span>{row.label}</span>
                          <span style={{ color: 'var(--rk-text3)' }}>
                            {used} / {max == null ? 'illimité' : max}
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'var(--rk-track)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: max != null && used >= max ? 'var(--rk-accent)' : 'var(--rk-indigo)', borderRadius: 999 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  {sub.hasPaymentMethod && (
                    <button style={outline} disabled={!!busy} onClick={() => run('portal', async () => openExternal((await billingService.portal()).url))}>
                      Moyen de paiement et factures
                    </button>
                  )}
                  {sub.hasPaymentMethod && !sub.cancelAtPeriodEnd && sub.plan.id !== 'free' && (
                    <button style={{ ...outline, color: 'var(--rk-rasp)' }} disabled={!!busy} onClick={() => run('cancel', billingService.cancel, 'Résiliation enregistrée : vous gardez votre plan jusqu’à la fin de la période.')}>
                      Résilier
                    </button>
                  )}
                  {sub.cancelAtPeriodEnd && (
                    <button style={outline} disabled={!!busy} onClick={() => run('resume', billingService.resume, 'Votre abonnement continue.')}>
                      Annuler la résiliation
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', margin: '8px 4px 0' }}>
              <div style={{ ...eyebrow, margin: 0, flex: 1 }}>Plans</div>
              <div role="tablist" style={{ display: 'flex', gap: 4, background: 'var(--rk-track)', padding: 3, borderRadius: 11 }}>
                {(['month', 'year'] as const).map((i) => (
                  <button key={i} role="tab" aria-selected={interval === i} onClick={() => setInterval(i)} style={{ height: 30, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: interval === i ? 'var(--rk-surface)' : 'transparent', color: interval === i ? 'var(--rk-text)' : 'var(--rk-text3)' }}>
                    {i === 'month' ? 'Mensuel' : 'Annuel'}
                  </button>
                ))}
              </div>
            </div>

            {plans.map((p) => {
              const isCurrent = p.id === current;
              const price = priceOf(p);
              return (
                <div key={p.id} style={{ ...card, border: isCurrent ? '1.5px solid var(--rk-indigo)' : card.border }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: p.color }} />
                    <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)', flex: 1 }}>{p.name}</span>
                    {p.tag && <span style={{ height: 22, padding: '0 9px', borderRadius: 999, background: 'var(--rk-accentsoft)', color: 'var(--rk-text)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', letterSpacing: '.05em' }}>{p.tag}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.04em' }}>{price ? euros(price) : '0 €'}</span>
                    {price ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)' }}>/ {interval === 'year' ? 'an' : 'mois'}</span> : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: '12px 0 14px' }}>
                    {p.features.map((f) => (
                      <div key={f} style={{ display: 'flex', gap: 9, fontSize: 13, color: 'var(--rk-text2)', lineHeight: 1.4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, marginTop: 6, flexShrink: 0 }} />
                        {f}
                      </div>
                    ))}
                  </div>
                  {isCurrent ? (
                    <div style={{ ...outline, border: 'none', background: 'var(--rk-indigosoft)', color: 'var(--rk-indigo)' }}>Plan actuel</div>
                  ) : p.id === 'free' ? null : (
                    <button style={{ ...primary, opacity: sub && !sub.paymentsEnabled ? 0.5 : 1 }} disabled={!!busy || (sub ? !sub.paymentsEnabled : true)} onClick={() => choose(p)}>
                      {busy === p.id ? '…' : sub?.hasPaymentMethod ? `Passer à ${p.name}` : `Choisir ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
            {sub && !sub.paymentsEnabled && <div style={{ fontSize: 12, color: 'var(--rk-text3)', textAlign: 'center' }}>Le paiement en ligne sera bientôt disponible.</div>}

            <button style={outline} onClick={() => setCodeOpen(true)}>
              J’ai un code (CSE, mairie, offre)
            </button>

            {invoices.length > 0 && (
              <div style={card}>
                <div style={eyebrow}>Factures</div>
                {invoices.map((i) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: '1px solid var(--rk-line)' }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{new Date(i.periodStart ?? i.issuedAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--rk-text)' }}>{euros(i.amountPaidCents || i.amountDueCents)}</span>
                    {i.pdfUrl && (
                      <button onClick={() => openExternal(i.pdfUrl!)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-indigo)' }}>
                        PDF
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <RkSheet open={codeOpen} onClose={() => setCodeOpen(false)} title="J’ai un code" subtitle="Code transmis par votre CSE, votre mairie ou une offre Rekonect.">
            <input
              aria-label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CSE-AIRBUS"
              autoCapitalize="characters"
              style={{ width: '100%', height: 52, borderRadius: 16, border: '1.5px solid var(--rk-border)', background: 'var(--rk-surface)', padding: '0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '.04em', color: 'var(--rk-text)', marginBottom: 16, fontFamily: 'inherit' }}
            />
            <button style={{ ...primary, opacity: code.trim().length >= 3 ? 1 : 0.5 }} disabled={code.trim().length < 3 || busy === 'code'} onClick={redeem}>
              {busy === 'code' ? '…' : 'Utiliser ce code'}
            </button>
          </RkSheet>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default SubscriptionPage;
