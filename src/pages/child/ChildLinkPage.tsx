import React, { useEffect, useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../stores/app.store';
import { Smartphone, QrCode, Lock, AlertCircle, CheckCircle, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import type { Child } from '../../types/database.types';

type Step = 'intro' | 'scan' | 'pin' | 'success';

const ChildLinkPage: React.FC = () => {
  const history = useHistory();
  const { selectChild } = useAppStore();
  const [step, setStep] = useState<Step>('intro');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [childName, setChildName] = useState('');

  const [pin, setPin]               = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [pinStep, setPinStep]       = useState<'create' | 'confirm'>('create');
  const pinRefs        = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [linkedChild, setLinkedChild] = useState<Child | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const startScanner = async () => {
    setStep('scan');
    setError(null);
    await new Promise(r => setTimeout(r, 300));
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => { handleScanResult(decodedText); scanner.stop().catch(() => {}); },
        () => {}
      );
    } catch {
      setError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; }
  };

  useEffect(() => { return () => { stopScanner(); }; }, []);

  const handleScanResult = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (data.type !== 'deconnect_link' || !data.token) {
        setError("QR code non reconnu. Vérifiez que c'est le bon code."); return;
      }
      setLinkToken(data.token); setChildName(data.child || ''); setStep('pin'); stopScanner();
    } catch {
      setError("QR code invalide. Scannez le code depuis l'app du parent.");
    }
  };

  const handlePinInput = (index: number, value: string, isPrimary: boolean) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    if (isPrimary) {
      const next = [...pin]; next[index] = digit; setPin(next);
      if (digit && index < 3) pinRefs.current[index + 1]?.focus();
      if (digit && index === 3 && next.every(d => d !== '')) {
        setTimeout(() => { setPinStep('confirm'); setTimeout(() => confirmPinRefs.current[0]?.focus(), 100); }, 200);
      }
    } else {
      const next = [...confirmPin]; next[index] = digit; setConfirmPin(next);
      if (digit && index < 3) confirmPinRefs.current[index + 1]?.focus();
      if (digit && index === 3 && next.every(d => d !== '')) {
        const full = next.join('');
        if (full !== pin.join('')) {
          setError('Les PINs ne correspondent pas'); setConfirmPin(['', '', '', '']);
          setTimeout(() => confirmPinRefs.current[0]?.focus(), 100);
        } else { setError(null); submitLink(full); }
      }
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent, isPrimary: boolean) => {
    if (e.key === 'Backspace') {
      const arr = isPrimary ? pin : confirmPin;
      const setArr = isPrimary ? setPin : setConfirmPin;
      const refs = isPrimary ? pinRefs : confirmPinRefs;
      if (!arr[index] && index > 0) {
        const next = [...arr]; next[index - 1] = ''; setArr(next); refs.current[index - 1]?.focus();
      }
    }
  };

  const submitLink = async (pinCode: string) => {
    if (!linkToken) return;
    setLoading(true); setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('claim_child_link_token', {
        p_token: linkToken, p_pin: pinCode, p_device_id: navigator.userAgent.slice(0, 100),
      });
      if (rpcError) throw rpcError;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) { setError(result.error || 'Erreur de liaison'); return; }
      const child = result.child as Child;
      localStorage.setItem('deconnect_child_id', child.id);
      localStorage.setItem('deconnect_child', JSON.stringify(child));
      setLinkedChild(child); setStep('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de liaison');
    } finally { setLoading(false); }
  };

  const enterChildMode = () => {
    if (linkedChild) { selectChild(linkedChild); history.replace('/child/home'); }
  };

  // ── PIN Input ──
  const PinInput = ({ isPrimary, label }: { isPrimary: boolean; label: string }) => {
    const arr  = isPrimary ? pin : confirmPin;
    const refs = isPrimary ? pinRefs : confirmPinRefs;
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, textAlign: 'center', color: 'var(--dc-text-light)' }}>{label}</div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          {arr.map((d, i) => (
            <input key={i} ref={el => { refs.current[i] = el; }}
              type="tel" inputMode="numeric" maxLength={1} value={d}
              onChange={e => handlePinInput(i, e.target.value, isPrimary)}
              onKeyDown={e => handlePinKeyDown(i, e, isPrimary)}
              style={{
                width: 56, height: 64, textAlign: 'center', fontSize: 28, fontWeight: 900,
                borderRadius: 16, border: `3px solid ${d ? 'var(--dc-blue)' : 'var(--dc-border)'}`,
                background: d ? 'var(--dc-blue-light)' : 'white', outline: 'none',
                fontFamily: 'inherit', transition: 'all 0.15s', color: 'var(--dc-text)',
              }}
              autoFocus={i === 0}
            />
          ))}
        </div>
      </div>
    );
  };

  const centeredPage: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', padding: 32, textAlign: 'center',
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY>

        {/* ── INTRO ── */}
        {step === 'intro' && (
          <div style={centeredPage}>
            <div style={{
              width: 110, height: 110, borderRadius: 32,
              background: 'linear-gradient(135deg, var(--dc-blue) 0%, var(--dc-blue-mid) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(21,101,192,0.3)', marginBottom: 32,
            }}>
              <Smartphone size={50} color="white" strokeWidth={1.5} />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Bienvenue !</h1>
            <p style={{ fontSize: 15, color: 'var(--dc-text-light)', lineHeight: 1.6, marginBottom: 40, maxWidth: 300 }}>
              Demande à ton parent de t'afficher le <strong>QR code</strong> depuis son téléphone, puis scanne-le pour accéder à ton espace.
            </p>
            <button onClick={startScanner} className="dc-btn dc-btn-green dc-btn-lg"
              style={{ width: '100%', maxWidth: 300, borderRadius: 20 }}>
              <QrCode size={20} strokeWidth={2} />
              Scanner le QR code
            </button>
            <button onClick={() => history.replace('/login')}
              style={{ marginTop: 20, background: 'none', border: 'none', color: 'var(--dc-text-light)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              Je suis un parent <ArrowRight size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* ── SCAN ── */}
        {step === 'scan' && (
          <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
            <div style={{ padding: '56px 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => { stopScanner(); setStep('intro'); }}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 12, padding: '8px 14px', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeft size={14} strokeWidth={2} /> Retour
              </button>
              <h2 style={{ color: 'white', fontSize: 17, fontWeight: 800, margin: 0 }}>Scanner le QR code</h2>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <div id="qr-reader" style={{ width: '100%', maxWidth: 350 }} />
            </div>
            {error && (
              <div style={{ margin: '0 20px', padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.15)', color: '#FF6B6B', fontSize: 14, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <AlertCircle size={16} strokeWidth={2} /> {error}
              </div>
            )}
            <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: 13, padding: '16px 32px' }}>
              Pointe la caméra vers le QR code affiché sur le téléphone de ton parent
            </p>
          </div>
        )}

        {/* ── PIN ── */}
        {step === 'pin' && (
          <div style={centeredPage}>
            <div style={{
              width: 80, height: 80, borderRadius: 24,
              background: 'linear-gradient(135deg, var(--dc-blue), var(--dc-blue-mid))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
              boxShadow: '0 6px 24px rgba(21,101,192,0.3)',
            }}>
              <Lock size={36} color="white" strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
              {pinStep === 'create' ? 'Choisis ton code secret' : 'Confirme ton code'}
            </h2>
            <p style={{ color: 'var(--dc-text-light)', fontSize: 14, marginBottom: 32, maxWidth: 280 }}>
              {childName && <span>Bienvenue <strong>{childName}</strong> ! </span>}
              {pinStep === 'create'
                ? "Ce code à 4 chiffres te permettra d'ouvrir ton espace."
                : 'Entre le même code une deuxième fois.'}
            </p>
            {error && (
              <div style={{ background: 'var(--dc-danger-light)', color: 'var(--dc-danger)', padding: '10px 16px', borderRadius: 12, marginBottom: 16, fontSize: 14, width: '100%', maxWidth: 300, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <AlertCircle size={14} strokeWidth={2} /> {error}
              </div>
            )}
            {pinStep === 'create'
              ? <PinInput isPrimary={true} label="Crée ton code PIN (4 chiffres)" />
              : <PinInput isPrimary={false} label="Confirme ton code PIN" />
            }
            {loading && (
              <div style={{ color: 'var(--dc-blue)', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 16, height: 16, border: '2px solid var(--dc-blue)', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'dc-spin 0.8s linear infinite' }} />
                Liaison en cours...
              </div>
            )}
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && linkedChild && (
          <div style={centeredPage}>
            <div style={{
              width: 100, height: 100, borderRadius: 30,
              background: 'linear-gradient(135deg, var(--dc-green), var(--dc-green-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px var(--dc-green-shadow)', marginBottom: 24,
              animation: 'dc-scale-in 0.4s ease',
            }}>
              <CheckCircle size={50} color="white" strokeWidth={1.5} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>C'est parti !</h1>
            <p style={{ fontSize: 16, color: 'var(--dc-text)', marginBottom: 4 }}>
              Bienvenue <strong>{linkedChild.display_name}</strong> !
            </p>
            <p style={{ fontSize: 14, color: 'var(--dc-text-light)', marginBottom: 40, maxWidth: 280 }}>
              Ton espace est prêt. Tu peux maintenant faire des activités et gagner des points.
            </p>
            <button onClick={enterChildMode} className="dc-btn dc-btn-green dc-btn-lg"
              style={{ width: '100%', maxWidth: 300, borderRadius: 20 }}>
              <Zap size={20} strokeWidth={2.5} />
              Entrer dans mon espace
            </button>
          </div>
        )}

      </IonContent>
    </IonPage>
  );
};

export default ChildLinkPage;
