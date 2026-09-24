'use client';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { C } from './tokens';

type ToastTone = 'default' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);

/** Retours d'action discrets (« Offre approuvée », « Lien copié ») en bas de l'écran. */
export function ToastProvider({ children, duration = 3200 }: { children: ReactNode; duration?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback(
    (message: string, tone: ToastTone = 'default') => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-2), { id, message, tone }]);
      setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), duration);
    },
    [duration],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="rk-toast"
            style={{ background: t.tone === 'error' ? C.redText : C.ink, color: '#fff', borderRadius: 999, padding: '11px 18px', fontSize: 13, fontWeight: 700, boxShadow: '0 12px 30px -12px rgba(22,24,43,.5)', display: 'flex', alignItems: 'center', gap: 9 }}
          >
            {t.tone === 'success' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green }} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
