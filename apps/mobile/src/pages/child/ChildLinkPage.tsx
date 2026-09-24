import { useRkBack } from '../../hooks/useRkBack';
import React, { useEffect, useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import jsQR from 'jsqr';
import { useAppStore } from '../../stores/app.store';
import { useAuthStore } from '../../stores/auth.store';
import { childSession } from '../../features/auth/child.session';
import { parseChildLink } from '../../lib/childLink';
import PinField from '../../components/rk/PinField';
import { AlertCircle } from 'lucide-react';
import type { Child } from '../../types/database.types';

type Step = 'intro' | 'scan' | 'code' | 'pin' | 'success';

// ─── QR decode helpers ───────────────────────────────────────────────────────

/**
 * Decode a QR code from a base64 data URI using jsQR.
 * Draws the image to an off-screen canvas, extracts pixel data, passes to jsQR.
 */
function decodeQrFromDataUrl(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Une photo brute fait 3000–4000 px : jsQR y est lent et rate souvent.
      // On décode à plusieurs échelles, image entière puis centre recadré.
      const tryAt = (maxSide: number, crop: number): string | null => {
        const sw = img.width * crop, sh = img.height * crop;
        const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
        const k = Math.min(1, maxSide / Math.max(sw, sh));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(sw * k); canvas.height = Math.round(sh * k);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
        return code?.data ?? null;
      };
      for (const [side, crop] of [[1000, 1], [1400, 1], [1000, 0.6], [1800, 0.45], [800, 1]] as const) {
        const r = tryAt(side, crop);
        if (r) { resolve(r); return; }
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const ChildLinkPage: React.FC = () => {
  const history = useHistory();
  const back = useRkBack('/onboarding'); // maquette : childlink ← ob3
  const { selectChild } = useAppStore();
  const [step, setStep] = useState<Step>('intro');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [childName, setChildName] = useState('');

  // Un seul PIN, saisi une seule fois : le parent l'a sous les yeux dans sa
  // feuille QR, et l'enfant peut le refaire depuis la fiche parent si besoin.
  const [pin, setPin] = useState('');

  const [linkedChild, setLinkedChild] = useState<Child | null>(null);

  // Web scanner ref (html5-qrcode — only used outside Capacitor)
  const webScannerRef = useRef<Html5Qrcode | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // ── QR result handler ─────────────────────────────────────────────────
  const handleScanResult = (text: string) => {
    const parsed = parseChildLink(text);
    if (!parsed) { setError("QR code non reconnu. Vérifie que c'est le code affiché dans l'app du parent."); return; }
    stopWebScanner();
    setError(null);
    setLinkToken(parsed.token);
    setChildName(parsed.childName);
    setStep('pin');
  };

  // ── Arrivée par deep link (QR scanné avec l'appareil photo du téléphone) ──
  // App.tsx transforme rekonect://link?t=…&n=… en /child-link?t=…&n=…
  const location = useLocation();
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!q.has('t') && !q.has('c')) return;
    const parsed = parseChildLink(`rekonect://link?${q.toString()}`);
    // hors du rendu synchrone de l'effet (règle react-hooks/set-state-in-effect)
    const id = window.setTimeout(() => {
      if (parsed) {
        setLinkToken(parsed.token);
        setChildName(parsed.childName);
        setStep('pin');
      } else {
        setError('Ce lien est invalide ou expiré.');
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.search]);

  // ── Saisie manuelle du code court (6 caractères, affiché sous le QR côté parent) ──
  const [manualCode, setManualCode] = useState('');
  const cleanCode = manualCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const submitManualCode = () => {
    const parsed = parseChildLink(cleanCode);
    if (!parsed) { setError('Le code fait 6 caractères.'); return; }
    setError(null);
    setLinkToken(parsed.token);   // claim_child_link_token accepte le code court
    setChildName('');
    setStep('pin');
  };

  // ── Stop web scanner ──────────────────────────────────────────────────
  const stopWebScanner = () => {
    if (webScannerRef.current) {
      webScannerRef.current.stop().catch(() => {});
      webScannerRef.current = null;
    }
  };

  useEffect(() => () => { stopWebScanner(); }, []);

  // ── Repli natif : photo → jsQR (si la caméra live n'est pas disponible) ──
  const doNativeScan = async () => {
    setError(null);
    try {
      const permissions = await Camera.requestPermissions({ permissions: ['camera'] });
      if (permissions.camera === 'denied') {
        setError("Accès à la caméra refusé. Active-le dans les réglages de l'app.");
        return;
      }

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
        correctOrientation: true,
        presentationStyle: 'fullscreen',
      });

      if (!photo.dataUrl) {
        setError("Impossible de lire la photo. Réessaie.");
        return;
      }

      const decoded = await decodeQrFromDataUrl(photo.dataUrl);
      if (!decoded) {
        setError("Aucun QR code détecté. Réessaie en te rapprochant.");
        return;
      }

      handleScanResult(decoded);
    } catch (err: unknown) {
      // User pressed cancel → go back to intro
      if (
        (err instanceof Error && (err.message?.includes('cancel') || err.message?.includes('Cancel'))) ||
        (typeof err === 'string' && err.toLowerCase().includes('cancel'))
      ) {
        if (liveOk !== true) { stopWebScanner(); setStep('intro'); }
        return;
      }
      setError("Impossible d'accéder à la caméra. Vérifie les permissions dans les réglages.");
    }
  };

  // ── Scan live (html5-qrcode sur getUserMedia) — dans le navigateur ET dans
  //    la WebView native (iOS ≥ 14.3, Android via la permission CAMERA).
  //    Décodage continu à 10 i/s : bien plus fiable qu'une photo unique.
  const [liveOk, setLiveOk] = useState<boolean | null>(null);
  const startLiveScan = async (): Promise<boolean> => {
    await new Promise(r => setTimeout(r, 250)); // laisse #qr-reader se monter
    try {
      if (isNative) {
        const perm = await Camera.requestPermissions({ permissions: ['camera'] });
        if (perm.camera === 'denied') throw new Error('denied');
      }
      const scanner = new Html5Qrcode('qr-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      webScannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const side = Math.floor(Math.min(w, h) * 0.72); return { width: side, height: side }; } },
        (decodedText) => { handleScanResult(decodedText); },
        () => {},
      );
      setLiveOk(true);
      return true;
    } catch (e) {
      console.warn('[childlink] live scan unavailable:', e);
      webScannerRef.current = null;
      setLiveOk(false);
      return false;
    }
  };

  // ── Démarrage unifié : live d'abord, photo en repli sur natif ─────────
  const startScanner = async () => {
    setStep('scan');
    setError(null);
    const ok = await startLiveScan();
    if (!ok && isNative) await doNativeScan();
    if (!ok && !isNative) setError("Impossible d'accéder à la caméra. Vérifie les permissions du navigateur.");
  };

  const submitLink = async (pinCode: string) => {
    if (!linkToken) return;
    setLoading(true); setError(null);
    try {
      // Session enfant propre : ouvre une session anonyme et lie l'appareil
      // à children.auth_user_id (le pont sur la session parent est retiré).
      const data = await childSession.claimLink(
        linkToken, pinCode, navigator.userAgent.slice(0, 100)
      );
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) { setError(result.error || 'Erreur de liaison'); setPin(''); return; }
      const child = result.child as Child;
      localStorage.setItem('deconnect_child_id', child.id);
      localStorage.setItem('deconnect_child', JSON.stringify(child));
      // La session anonyme a été ouverte hors du store : on l'y aligne AVANT
      // d'entrer dans /child, sinon la garde de route renverrait au login.
      await useAuthStore.getState().syncSession();
      selectChild(child);
      setLinkedChild(child); setStep('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de liaison');
      setPin('');
    } finally { setLoading(false); }
  };

  const enterChildMode = () => {
    if (linkedChild) { selectChild(linkedChild); history.replace('/child/home'); }
  };

  // Succès : on n'attend pas indéfiniment sur l'écran — entrée automatique après 2 s
  const [countdown, setCountdown] = useState(2);
  useEffect(() => {
    if (step !== 'success' || !linkedChild) return;
    const tick = window.setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    const go = window.setTimeout(() => { selectChild(linkedChild); history.replace('/child/home'); }, 2000);
    return () => { window.clearInterval(tick); window.clearTimeout(go); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, linkedChild?.id]);

  const centeredPage: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', padding: 32, textAlign: 'center',
    background: '#16182B',
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.14) 1.2px, transparent 1.3px)',
    backgroundSize: '15px 15px',
    color: '#fff', fontFamily: "'Manrope', system-ui, sans-serif",
  };
  const ghostBtn: React.CSSProperties = {
    width: '100%', maxWidth: 300, height: 52, borderRadius: 999,
    background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 14, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', cursor: 'pointer',
  };
  const accentBtn: React.CSSProperties = {
    width: '100%', maxWidth: 300, height: 54, borderRadius: 999,
    background: '#FF9469', color: '#3A1D0E', fontSize: 15, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', cursor: 'pointer',
    boxShadow: '0 10px 24px -6px rgba(255,148,105,.6)',
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY>

        {/* ── INTRO ── */}
        {step === 'intro' && (
          <div className="rk-app rk-screen" style={{ ...centeredPage, alignItems: 'stretch', textAlign: 'left', padding: 0 }}>
            <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 26px 0' }}>
              <button onClick={back} style={{
                fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.55)', marginBottom: 22,
                background: 'none', border: 'none', cursor: 'pointer',
              }}>← Retour</button>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>Scanne le QR code</h1>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', margin: '8px 0 0', lineHeight: 1.55, maxWidth: '30ch' }}>
                Demande à ton parent d'ouvrir ta fiche dans son application.
              </p>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
              <button onClick={startScanner} aria-label="Scanner" style={{
                width: 230, height: 230, position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
              }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 26, background: 'rgba(255,255,255,.05)' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, width: 46, height: 46, borderTop: '3.5px solid #FF9469', borderLeft: '3.5px solid #FF9469', borderRadius: '22px 0 0 0' }} />
                <div style={{ position: 'absolute', top: 0, right: 0, width: 46, height: 46, borderTop: '3.5px solid #FF9469', borderRight: '3.5px solid #FF9469', borderRadius: '0 22px 0 0' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 46, height: 46, borderBottom: '3.5px solid #FF9469', borderLeft: '3.5px solid #FF9469', borderRadius: '0 0 0 22px' }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 46, height: 46, borderBottom: '3.5px solid #FF9469', borderRight: '3.5px solid #FF9469', borderRadius: '0 0 22px 0' }} />
                <div style={{ position: 'absolute', left: 14, right: 14, top: '50%', height: 2, background: '#FF9469', boxShadow: '0 0 16px 2px rgba(255,148,105,.8)' }} />
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.7)', paddingTop: 70,
                }}>Toucher pour scanner</div>
              </button>
            </div>

            <div style={{ padding: '0 26px calc(44px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <button onClick={startScanner} style={accentBtn}>Scanner le QR code</button>
              <button onClick={() => { setError(null); setStep('code'); }} style={ghostBtn}>Entrer un code à la place</button>
            </div>
          </div>
        )}

        {/* ── CODE (saisie manuelle du code court affiché sous le QR côté parent) ── */}
        {step === 'code' && (
          <div className="rk-app rk-screen" style={{ ...centeredPage, alignItems: 'stretch', textAlign: 'left', padding: 0 }}>
            <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 26px 0' }}>
              <button onClick={() => { setStep('intro'); setError(null); }} style={{
                fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.55)', marginBottom: 22,
                background: 'none', border: 'none', cursor: 'pointer',
              }}>← Retour</button>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>Entre le code</h1>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', margin: '8px 0 0', lineHeight: 1.55, maxWidth: '32ch' }}>
                Ton parent le voit sous le QR code, dans ta fiche : 6 lettres et chiffres.
              </p>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 26, gap: 18 }}>
              <input
                value={cleanCode.length > 3 ? `${cleanCode.slice(0, 3)} ${cleanCode.slice(3)}` : cleanCode}
                onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitManualCode(); }}
                placeholder="ABC 123"
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                maxLength={7}
                aria-label="Code de liaison"
                style={{
                  width: '100%', maxWidth: 300, height: 72, borderRadius: 20, textAlign: 'center',
                  background: 'rgba(255,255,255,.08)', border: `2px solid ${error ? '#E2607F' : cleanCode.length === 6 ? '#FF9469' : 'rgba(255,255,255,.18)'}`,
                  color: '#fff', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 30, fontWeight: 700,
                  letterSpacing: '.18em', outline: 'none',
                }}
              />
              {error && <div style={{ color: '#FFB3C2', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{error}</div>}
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', textAlign: 'center', maxWidth: '30ch', lineHeight: 1.5 }}>
                Le code est valable 15 minutes. Pas de différence entre majuscules et minuscules.
              </div>
            </div>

            <div style={{ padding: '0 26px calc(44px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <button onClick={submitManualCode} disabled={cleanCode.length !== 6} style={{ ...accentBtn, opacity: cleanCode.length === 6 ? 1 : .45 }}>Continuer</button>
              <button onClick={() => { setError(null); startScanner(); }} style={ghostBtn}>Scanner le QR code à la place</button>
            </div>
          </div>
        )}

        {/* ── SCAN ── */}
        {step === 'scan' && (
          <div className="rk-app" style={{
            minHeight: '100vh', background: '#16182B',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.14) 1.2px, transparent 1.3px)',
            backgroundSize: '15px 15px', color: '#fff',
          }}>
            <div style={{ padding: '56px 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => { stopWebScanner(); setStep('intro'); setError(null); }}
                style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.55)', background: 'none', border: 'none', cursor: 'pointer' }}>
                ← Retour
              </button>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>Scanne le QR code</h2>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '100%', maxWidth: 350, borderRadius: 24, overflow: 'hidden', background: 'rgba(255,255,255,.04)' }}>
                <div id="qr-reader" style={{ width: '100%' }} />
              </div>
            </div>

            {error && (
              <div style={{ margin: '14px 20px 0', padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.15)', color: '#FFB3C2', fontSize: 14, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <AlertCircle size={16} strokeWidth={2} /> {error}
              </div>
            )}

            <p style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', fontSize: 13, padding: '16px 32px 8px', lineHeight: 1.55 }}>
              {liveOk === false
                ? "La caméra en direct n'est pas disponible : prends le QR code en photo."
                : 'Pointe la caméra vers le QR code affiché sur le téléphone de ton parent. La lecture est automatique.'}
            </p>

            <div style={{ padding: '8px 26px calc(32px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              {isNative && (
                <button onClick={doNativeScan} style={liveOk === false ? accentBtn : ghostBtn}>
                  {liveOk === false ? 'Prendre une photo du QR code' : 'Prendre une photo à la place'}
                </button>
              )}
              <button onClick={() => { stopWebScanner(); setError(null); setStep('code'); }} style={ghostBtn}>Entrer le code à la place</button>
            </div>
          </div>
        )}

        {/* ── PIN ── */}
        {step === 'pin' && (
          <div style={centeredPage}>
            <div style={{ width: 52, height: 52, position: 'relative', marginBottom: 22 }}>
              <div style={{ position: 'absolute', left: 0, top: 13, width: 29, height: 29, borderRadius: '50%', border: '3px solid #fff' }} />
              <div style={{ position: 'absolute', left: 19, top: 13, width: 29, height: 29, borderRadius: '50%', border: '3px solid #FF9469' }} />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 6 }}>
              Choisis ton code secret
            </h2>
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, marginBottom: 32, maxWidth: 280, lineHeight: 1.55 }}>
              {childName && <span>Bienvenue <strong style={{ color: '#fff' }}>{childName}</strong> ! </span>}
              Ce code à 4 chiffres te permettra d'ouvrir ton espace.
            </p>
            {error && (
              <div style={{ background: 'rgba(216,85,107,.18)', color: '#FFB3C0', padding: '10px 16px', borderRadius: 12, marginBottom: 16, fontSize: 14, width: '100%', maxWidth: 300, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <AlertCircle size={14} strokeWidth={2} /> {error}
              </div>
            )}
            <PinField
              value={pin}
              onChange={v => { setPin(v); if (error) setError(null); }}
              onComplete={code => { void submitLink(code); }}
              label="Ton code PIN (4 chiffres)"
              disabled={loading}
            />
            {error && !loading && (
              <button onClick={() => { setPin(''); setError(null); }} style={{
                fontSize: 13, fontWeight: 700, color: '#FF9469', background: 'none', border: 'none', cursor: 'pointer',
              }}>Réessayer</button>
            )}
            {loading && (
              <div style={{ color: '#FF9469', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 16, height: 16, border: '2px solid #FF9469', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'dc-spin 0.8s linear infinite' }} />
                Liaison en cours...
              </div>
            )}
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && linkedChild && (
          <div style={centeredPage}>
            <div style={{
              width: 74, height: 74, borderRadius: '50%', background: '#FF9469',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
              boxShadow: '0 10px 24px -6px rgba(255,148,105,.6)',
            }}>
              <div style={{ width: 22, height: 13, borderLeft: '3.5px solid #3A1D0E', borderBottom: '3.5px solid #3A1D0E', transform: 'rotate(-45deg) translate(2px,-3px)' }} />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 8 }}>Appareil relié !</h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.85)', marginBottom: 4 }}>
              Bienvenue <strong>{linkedChild.display_name}</strong> !
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', marginBottom: 36, maxWidth: 280, lineHeight: 1.55 }}>
              Ton espace est prêt et tes parents sont prévenus. La prochaine fois, ton code PIN suffira.
            </p>
            <button onClick={enterChildMode} style={accentBtn}>
              Entrer dans mon espace{countdown > 0 ? ` · ${countdown}` : ''}
            </button>
          </div>
        )}

      </IonContent>
    </IonPage>
  );
};

export default ChildLinkPage;
