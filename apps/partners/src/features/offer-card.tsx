'use client';
import type { Offer } from '@rekonect/api-client';
import { C } from '@rekonect/ui';
import { KIND_BG, OFFER_STATUS } from '@/lib/labels';
import { offerDates, usageLine } from '@/lib/offers';

export function matchesFilter(o: Offer, f: string) {
  if (f === 'all') return true;
  if (f === 'child_reward' || f === 'parent_voucher') return o.kind === f;
  if (f === 'in_review') return o.displayStatus === 'in_review' || o.displayStatus === 'changes_requested';
  if (f === 'draft') return o.displayStatus === 'draft' || o.displayStatus === 'rejected';
  return o.displayStatus === f;
}

export function OfferCard({ o, onOpen }: { o: Offer; onOpen?: () => void }) {
  const u = usageLine(o);
  const [sb, sf] = OFFER_STATUS[o.displayStatus];
  return (
    <button type="button" aria-label={o.title} onClick={onOpen} style={{ background: '#fff', border: '1px solid rgba(22,24,43,.08)', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
      <div
        style={{
          height: 110,
          width: '100%',
          background: KIND_BG[o.kind],
          backgroundImage: o.imageUrl ? `url(${o.imageUrl})` : 'repeating-linear-gradient(115deg, rgba(255,255,255,.25) 0 2px, transparent 2px 13px)',
          backgroundSize: o.imageUrl ? 'cover' : undefined,
          backgroundPosition: 'center',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '12px 14px',
        }}
      >
        <span style={{ height: 24, padding: '0 9px', borderRadius: 999, background: 'rgba(255,255,255,.92)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', color: '#16182B' }}>{o.kindLabel}</span>
        <span style={{ position: 'absolute', top: 12, right: 12, height: 26, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', background: sb, color: sf }}>{o.displayStatusLabel}</span>
      </div>
      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, width: '100%' }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25 }}>{o.title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            ['Condition', o.condition],
            ['Portée', o.scope],
            ['Période', offerDates(o)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 9, fontSize: 12, color: C.text2, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: C.muted, width: 74, flexShrink: 0 }}>{k}</span>
              {v}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5 }}>
            <span>{u.used}</span>
            <span>{u.pct}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: '#F6F4F1', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: u.width, background: '#3C41A8', borderRadius: 999 }} />
          </div>
        </div>
      </div>
    </button>
  );
}

