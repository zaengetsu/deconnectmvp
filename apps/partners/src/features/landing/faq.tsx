'use client';
import { BRAND } from '@rekonect/ui';
import { useState } from 'react';
import { FAQ } from './content';
import s from './landing.module.css';

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section data-screen-label="FAQ" aria-labelledby="faq-title" style={{ maxWidth: 900, margin: '0 auto', padding: '0 clamp(16px,4vw,32px) 110px' }}>
      <h2 id="faq-title" style={{ fontSize: 'clamp(28px,3vw,38px)', fontWeight: 800, letterSpacing: '-.035em', margin: '0 0 24px' }}>Questions fréquentes</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FAQ.map((f, i) => (
          <FaqItem key={f.q} id={`faq-${i}`} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
        ))}
      </div>
    </section>
  );
}

export function FaqItem({ id, q, a, open, onToggle }: { id: string; q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden' }}>
      <h3 style={{ margin: 0 }}>
        <button type="button" id={`${id}-q`} aria-expanded={open} aria-controls={`${id}-a`} onClick={onToggle} className={s.faqButton} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px 22px', textAlign: 'left' }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 800, letterSpacing: '-.01em' }}>{q}</span>
          <span aria-hidden style={{ width: 32, height: 32, borderRadius: '50%', background: open ? BRAND.ink : '#F1EEE9', color: open ? '#fff' : BRAND.ink, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{open ? '−' : '+'}</span>
        </button>
      </h3>
      <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} hidden={!open} style={{ padding: '0 22px 22px', fontSize: 15, color: '#4A4E66', lineHeight: 1.65, maxWidth: '70ch' }}>
        {a}
      </div>
    </div>
  );
}
