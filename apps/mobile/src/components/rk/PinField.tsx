import React, { useEffect, useRef, useState } from 'react';

/**
 * Saisie d'un code PIN à 4 chiffres : UN seul champ (invisible) qui reçoit le
 * clavier numérique, quatre cases qui l'affichent. Pas de focus à déplacer de
 * case en case — ce qui échoue sur iOS — et le clavier s'ouvre au premier tap.
 * Appelle `onComplete` dès le 4e chiffre.
 */
const PinField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** 'dark' = fond encre (écran de liaison), 'light' = surface Rekonect */
  tone?: 'dark' | 'light';
}> = ({ value, onChange, onComplete, label, disabled, autoFocus = true, tone = 'dark' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, '').slice(0, 4);

  useEffect(() => {
    if (autoFocus) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [autoFocus]);

  const handle = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, 4);
    onChange(next);
    if (next.length === 4) {
      inputRef.current?.blur();
      onComplete?.(next);
    }
  };

  const dark = tone === 'dark';
  const cells = [0, 1, 2, 3];
  const active = Math.min(digits.length, 3);

  return (
    <div style={{ marginBottom: 28 }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, textAlign: 'center', color: dark ? 'rgba(255,255,255,.6)' : 'var(--rk-text3)' }}>
          {label}
        </div>
      )}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{ display: 'flex', gap: 14, justifyContent: 'center', position: 'relative', cursor: 'text' }}
      >
        {cells.map(i => {
          const d = digits[i] ?? '';
          const isCaret = focused && i === active && digits.length < 4;
          return (
            <div key={i} style={{
              width: 56, height: 68, borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, fontFamily: 'ui-monospace,Menlo,monospace',
              color: dark ? '#fff' : 'var(--rk-text)',
              border: `1.5px solid ${d || isCaret ? (dark ? '#FF9469' : 'var(--rk-indigo)') : (dark ? 'rgba(255,255,255,.18)' : 'var(--rk-border)')}`,
              background: dark ? (d ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.05)') : 'var(--rk-surface)',
              transition: 'border-color .12s',
            }}>
              {d ? '•' : isCaret ? <span style={{ width: 2, height: 26, background: '#FF9469', borderRadius: 1, animation: 'rk-blink 1s steps(2) infinite' }} /> : ''}
            </div>
          );
        })}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={4}
          value={digits}
          disabled={disabled}
          onChange={e => handle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={label ?? 'Code PIN'}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, fontSize: 16, // 16px : évite le zoom iOS
            border: 'none', background: 'transparent', caretColor: 'transparent', color: 'transparent',
          }}
        />
      </div>
      <style>{`@keyframes rk-blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
};

export default PinField;
