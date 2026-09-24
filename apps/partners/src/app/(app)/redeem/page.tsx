'use client';
import { type VerifyResult, formatDateTime, formatShortDate } from '@rekonect/api-client';
import { C, ErrorBox, saveBlob, Select, Skeleton, Stack, useToast } from '@rekonect/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { QrScanner } from '@/features/qr-scanner';
import { parseVoucherInput } from '@/lib/voucher';
import { REDEMPTION_STATUS } from '@/lib/labels';
import { usePartner, usePartnerApi } from '@/lib/partner';

export default function RedeemPage() {
  const api = usePartnerApi();
  const { partnerId, can } = usePartner();
  const qc = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [basket, setBasket] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [scan, setScan] = useState(false);
  const code = parseVoucherInput(raw);
  const chars = code.replace('-', '').padEnd(8, ' ').slice(0, 8).split('');

  const list = useQuery({ queryKey: ['redemptions', partnerId], queryFn: () => api.redemptions(partnerId!), enabled: !!partnerId });
  const places = useQuery({ queryKey: ['places', partnerId], queryFn: () => api.places(partnerId!), enabled: !!partnerId && can.view });

  const verify = useMutation({
    mutationFn: ({ redeem, value }: { redeem: boolean; value: string }) => api.verify(partnerId!, { code: value, redeem, placeId: placeId || undefined, basketAmountCents: redeem && basket ? Math.round(Number(basket.replace(',', '.')) * 100) : undefined }),
    onSuccess: (r, { redeem }) => {
      setResult(r);
      if (redeem && r.valid) {
        toast('Bon marqué comme utilisé', 'success');
        void qc.invalidateQueries({ queryKey: ['redemptions'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      }
    },
    onError: (e) => {
      setResult(null);
      toast((e as { status?: number }).status === 404 ? 'Code inconnu : vérifiez la saisie' : (e as Error).message, 'error');
    },
  });
  const exportCsv = useMutation({
    mutationFn: () => api.redemptionsCsv(partnerId!),
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length >= 3) verify.mutate({ redeem: false, value: code });
  };
  const reset = () => {
    setRaw('');
    setResult(null);
    setBasket('');
    inputRef.current?.focus();
  };

  return (
    <Stack gap={20}>
      <div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em', margin: 0 }}>Bons &amp; échanges</h1>
        <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>Valider un bon présenté en caisse ou à l'accueil</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1fr) minmax(0,2fr)', gap: 12, alignItems: 'start' }}>
        <form onSubmit={submit} style={{ background: C.ink, color: '#fff', borderRadius: 22, padding: 24, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.1) 1.2px, transparent 1.3px)', backgroundSize: '14px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(255,255,255,.5)' }}>VALIDER UN CODE</div>
          <label style={{ display: 'flex', gap: 6, margin: '16px 0', position: 'relative', cursor: 'text' }}>
            {chars.map((ch, i) => (
              <div key={i} aria-hidden style={{ flex: 1, height: 52, borderRadius: 11, background: 'rgba(255,255,255,.1)', border: `1.5px solid ${ch.trim() ? 'rgba(255,148,105,.7)' : 'rgba(255,255,255,.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 20, fontWeight: 700 }}>
                {ch}
              </div>
            ))}
            <input
              ref={inputRef}
              aria-label="Code du bon"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setResult(null);
              }}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', fontSize: 16 }}
            />
          </label>
          <button type="submit" disabled={code.length < 3 || verify.isPending} style={{ width: '100%', height: 48, borderRadius: 999, background: C.coral, color: C.ink, fontSize: 14, fontWeight: 800, textAlign: 'center', opacity: code.length < 3 ? 0.6 : 1 }}>
            {verify.isPending && !verify.variables?.redeem ? 'Vérification…' : 'Vérifier le bon'}
          </button>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', textAlign: 'center', marginTop: 12 }}>
            ou scannez le QR code avec l'appareil de caisse
            {typeof window !== 'undefined' && 'BarcodeDetector' in window && (
              <>
                {' '}
                ·{' '}
                <button type="button" onClick={() => setScan(true)} style={{ color: '#fff', fontWeight: 700, textDecoration: 'underline' }}>
                  caméra
                </button>
              </>
            )}
          </div>
          {result && (
            <div role="status" style={{ marginTop: 18, background: '#fff', color: C.ink, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: result.valid ? C.green : result.reason === 'already_redeemed' ? '#D8556B' : '#8A8FA6', flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 800 }}>{result.valid ? (result.redeemed ? 'Bon utilisé' : 'Bon valide') : result.reason === 'already_redeemed' ? 'Déjà utilisé' : 'Bon expiré'}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>
                {result.offer.title}
                {result.offer.discountLabel ? ` · ${result.offer.discountLabel}` : ''}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                Obtenu le {formatShortDate(result.unlockedAt)}
                {result.expiresAt ? ` · expire le ${formatShortDate(result.expiresAt)}` : ''}
                {result.redeemedAt ? ` · utilisé le ${formatDateTime(result.redeemedAt)}` : ' · 1 utilisation'}
              </div>
              {result.valid && !result.redeemed && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: places.data && places.data.length > 1 ? '1fr 1fr' : '1fr', gap: 8, marginTop: 12 }}>
                    <input aria-label="Montant du panier (facultatif)" inputMode="decimal" placeholder="Panier (€, facultatif)" value={basket} onChange={(e) => setBasket(e.target.value)} className="rk-input" style={{ height: 40, borderRadius: 10, border: '1.5px solid rgba(22,24,43,.14)', padding: '0 12px', fontSize: 13, fontWeight: 600 }} />
                    {places.data && places.data.length > 1 && (
                      <Select aria-label="Lieu" value={placeId} onChange={(e) => setPlaceId(e.target.value)} style={{ height: 40, fontSize: 13 }}>
                        <option value="">Lieu…</option>
                        {places.data.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                  <button type="button" onClick={() => verify.mutate({ redeem: true, value: code })} disabled={verify.isPending} style={{ width: '100%', height: 40, borderRadius: 999, background: C.ink, color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
                    {verify.isPending && verify.variables?.redeem ? 'Enregistrement…' : 'Marquer comme utilisé'}
                  </button>
                </>
              )}
              {(result.redeemed || !result.valid) && (
                <button type="button" onClick={reset} style={{ width: '100%', height: 40, borderRadius: 999, border: '1.5px solid rgba(22,24,43,.14)', fontSize: 13, fontWeight: 700, marginTop: 12, textAlign: 'center' }}>
                  Valider un autre bon
                </button>
              )}
            </div>
          )}
        </form>

        <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px 12px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Derniers échanges</div>
            {can.view && (
              <button type="button" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending} style={{ fontSize: 12, fontWeight: 700, color: '#3C41A8' }}>
                {exportCsv.isPending ? 'Export…' : 'Exporter CSV'}
              </button>
            )}
          </div>
          <div role="row" style={{ display: 'grid', gridTemplateColumns: '110px 110px minmax(0,1.6fr) minmax(0,1fr) 100px', gap: 14, padding: '10px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.muted, borderTop: '1px solid rgba(22,24,43,.06)', background: '#FBFAF8' }}>
            <div>DATE</div>
            <div>CODE</div>
            <div>OFFRE</div>
            <div>LIEU</div>
            <div>STATUT</div>
          </div>
          {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
          {list.isLoading && <Skeleton height={120} radius={0} />}
          {list.data?.map((r) => {
            const [sb, sf] = REDEMPTION_STATUS[r.status] ?? ['#F1EEE9', '#8A8FA6'];
            return (
              <div key={r.id} role="row" style={{ display: 'grid', gridTemplateColumns: '110px 110px minmax(0,1.6fr) minmax(0,1fr) 100px', gap: 14, alignItems: 'center', padding: '12px 20px', borderTop: '1px solid rgba(22,24,43,.05)' }}>
                <div style={{ fontSize: 12, color: C.muted }}>{formatDateTime(r.at)}</div>
                <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, fontWeight: 700 }}>{r.code}</div>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.offerTitle}</div>
                <div style={{ fontSize: 12, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.place ?? '—'}</div>
                <div>
                  <span style={{ height: 24, padding: '0 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', background: sb, color: sf }}>{r.statusLabel}</span>
                </div>
              </div>
            );
          })}
          {list.data?.length === 0 && <div style={{ padding: '18px 20px 22px', fontSize: 13, color: C.muted, borderTop: '1px solid rgba(22,24,43,.05)' }}>Aucun bon obtenu pour l’instant.</div>}
        </div>
      </div>
      <QrScanner
        open={scan}
        onClose={() => setScan(false)}
        onCode={(text) => {
          setScan(false);
          setRaw(text);
          verify.mutate({ redeem: false, value: parseVoucherInput(text) });
        }}
      />
    </Stack>
  );
}
