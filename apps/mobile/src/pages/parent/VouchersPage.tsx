import React, { useCallback, useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useRkBack } from '../../hooks/useRkBack';
import { RkSheet } from '../../components/rk/RkShell';
import { offersService, type VoucherClaim, type VoucherProgress } from '../../features/offers/offers.service';

/**
 * Portefeuille de bons : avantages partenaires débloqués par les activités des enfants.
 * Chaque bon porte un QR code (le code RK) scanné en caisse ; aucune donnée d'enfant n'est transmise au partenaire.
 */

const card: React.CSSProperties = { background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 22, overflow: 'hidden' };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', textTransform: 'uppercase', margin: '10px 4px 2px' };
const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null);

export function claimState(c: VoucherClaim, now = new Date()): 'ready' | 'used' | 'expired' {
  if (c.status === 'redeemed') return 'used';
  const end = c.expiresAt ?? c.offer.endsAt;
  if (c.status !== 'unlocked' || (end && new Date(end) <= now)) return 'expired';
  return 'ready';
}

const VouchersPage: React.FC = () => {
  const back = useRkBack('/parent/settings');
  const { claimId } = useParams<{ claimId?: string }>();
  const [claims, setClaims] = useState<VoucherClaim[] | null>(null);
  const [progress, setProgress] = useState<VoucherProgress[]>([]);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [postalCode, setPostalCode] = useState('');
  const [open, setOpen] = useState<VoucherClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await offersService.consent();
      setConsent(c);
      const [list, prog] = await Promise.all([offersService.claims(), c ? offersService.progress() : Promise.resolve([])]);
      setClaims(list);
      if (claimId) setOpen(list.find((x) => x.id === claimId) ?? null);
      setProgress(prog);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setClaims([]);
    }
  }, [claimId]);
  useIonViewWillEnter(() => void load());
  useEffect(() => void load(), [load]);

  const enable = async (value: boolean) => {
    setBusy(true);
    try {
      await offersService.setConsent(value, postalCode.trim() || undefined);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const markUsed = async (c: VoucherClaim) => {
    setBusy(true);
    try {
      await offersService.markUsed(c.id);
      setOpen(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = (claims ?? []).filter((c) => claimState(c) === 'ready');
  const past = (claims ?? []).filter((c) => claimState(c) !== 'ready');

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>
          <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px', background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)' }}>
            <button onClick={back} aria-label="Retour" style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 12 }}>
              ← Réglages
            </button>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--rk-text)', margin: 0 }}>Bons &amp; avantages</h1>
            <p style={{ fontSize: 14, color: 'var(--rk-text3)', margin: '6px 0 0' }}>Débloqués grâce aux efforts de vos enfants</p>
          </div>

          <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && (
              <div role="alert" style={{ background: 'var(--rk-raspsoft)', color: 'var(--rk-rasp)', borderRadius: 16, padding: '13px 15px', fontSize: 14, fontWeight: 600 }}>
                {error}
              </div>
            )}

            {consent === false && (
              <div style={{ ...card, padding: 18 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)' }}>Activer les avantages partenaires</div>
                <p style={{ fontSize: 14, color: 'var(--rk-text2)', lineHeight: 1.55, margin: '8px 0 14px' }}>
                  Des magasins, clubs et équipements près de chez vous offrent des bons quand vos enfants pratiquent des activités hors écran. Seul votre code postal sert au ciblage : aucune donnée n’est transmise aux partenaires.
                </p>
                <input
                  aria-label="Code postal"
                  inputMode="numeric"
                  maxLength={5}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Code postal (ex. 69003)"
                  style={{ width: '100%', height: 50, borderRadius: 16, border: '1.5px solid var(--rk-border)', background: 'var(--rk-surface)', padding: '0 16px', fontSize: 15, fontWeight: 600, color: 'var(--rk-text)', marginBottom: 12, fontFamily: 'inherit' }}
                />
                <button
                  onClick={() => enable(true)}
                  disabled={busy || postalCode.length !== 5}
                  style={{ width: '100%', height: 50, borderRadius: 999, background: 'var(--rk-indigo)', color: 'var(--rk-indigofg)', fontSize: 15, fontWeight: 700, opacity: postalCode.length === 5 ? 1 : 0.5 }}
                >
                  {busy ? '…' : 'Activer'}
                </button>
              </div>
            )}

            {ready.length > 0 && <div style={eyebrow}>À utiliser</div>}
            {ready.map((c) => (
              <button key={c.id} onClick={() => setOpen(c)} style={{ ...card, textAlign: 'left', display: 'block', width: '100%' }}>
                <div style={{ height: 78, background: c.offer.partner.color, backgroundImage: c.offer.imageUrl ? `url(${c.offer.imageUrl})` : 'repeating-linear-gradient(115deg, rgba(255,255,255,.25) 0 2px, transparent 2px 13px)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: 12, height: 24, padding: '0 9px', borderRadius: 999, background: 'rgba(255,255,255,.92)', fontSize: 11, fontWeight: 800, color: '#16182B', display: 'flex', alignItems: 'center' }}>{c.offer.partner.name}</span>
                  {c.offer.discountLabel && <span style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 22, fontWeight: 800, color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,.25)' }}>{c.offer.discountLabel}</span>}
                </div>
                <div style={{ padding: '14px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--rk-text)' }}>{c.offer.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 3 }}>
                      {c.child ? `Grâce à ${c.child.displayName}` : 'Grâce à toute la famille'}
                      {dateFr(c.expiresAt ?? c.offer.endsAt) ? ` · jusqu’au ${dateFr(c.expiresAt ?? c.offer.endsAt)}` : ''}
                    </div>
                  </div>
                  <span style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'var(--rk-accent)', color: 'var(--rk-accentink)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center' }}>Voir le bon</span>
                </div>
              </button>
            ))}

            {progress.length > 0 && <div style={eyebrow}>En cours</div>}
            {progress.map((p) => (
              <div key={p.offerId} style={{ ...card, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: p.partner.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--rk-text)' }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                      {p.partner.name} · {p.condition}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--rk-text3)', margin: '12px 0 5px' }}>
                  <span>
                    {p.done} / {p.target} activités
                  </span>
                  <span>{p.percent} %</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--rk-track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.percent}%`, background: 'var(--rk-accent)', borderRadius: 999 }} />
                </div>
              </div>
            ))}

            {claims && claims.length === 0 && consent && progress.length === 0 && (
              <div style={{ ...card, padding: 22, textAlign: 'center', fontSize: 14, color: 'var(--rk-text2)', lineHeight: 1.55 }}>
                Pas encore de bon. Les avantages partenaires apparaîtront ici dès qu’une offre sera disponible près de chez vous.
              </div>
            )}

            {past.length > 0 && <div style={eyebrow}>Utilisés ou expirés</div>}
            {past.map((c) => (
              <div key={c.id} style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.offer.partner.color }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{c.offer.title}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--rk-text3)' }}>{claimState(c) === 'used' ? `Utilisé ${dateFr(c.redeemedAt) ?? ''}` : 'Expiré'}</span>
              </div>
            ))}

            {consent && (
              <button onClick={() => enable(false)} disabled={busy} style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-text3)', marginTop: 10 }}>
                Ne plus recevoir d’avantages partenaires
              </button>
            )}
          </div>

          <RkSheet open={!!open} onClose={() => setOpen(null)} eyebrow={open?.offer.partner.name} title={open?.offer.title} subtitle={open?.offer.redemptionMethod === 'online_code' ? 'Code à saisir lors de votre commande en ligne' : 'Présentez ce QR code en caisse ou à l’accueil'}>
            {open && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                {open.qrPayload && open.offer.redemptionMethod !== 'online_code' && (
                  <div style={{ background: '#fff', padding: 16, borderRadius: 20, border: '1px solid var(--rk-border)' }}>
                    <QRCodeSVG value={open.qrPayload} size={200} level="M" aria-label={`QR code du bon ${open.code}`} />
                  </div>
                )}
                {open.code && <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 24, fontWeight: 800, letterSpacing: '.08em', color: 'var(--rk-text)' }}>{open.code}</div>}
                {open.offer.terms && <div style={{ fontSize: 12, color: 'var(--rk-text3)', lineHeight: 1.5, textAlign: 'center' }}>{open.offer.terms}</div>}
                {open.offer.redemptionMethod === 'online_code' && (
                  <button onClick={() => markUsed(open)} disabled={busy} style={{ width: '100%', height: 50, borderRadius: 999, border: '1.5px solid var(--rk-border)', color: 'var(--rk-text)', fontSize: 15, fontWeight: 700 }}>
                    J’ai utilisé ce code
                  </button>
                )}
              </div>
            )}
          </RkSheet>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default VouchersPage;
