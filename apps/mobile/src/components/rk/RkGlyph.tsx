import React from 'react';

/**
 * Pictos des notifications et des badges : même famille que la barre d'onglets (grille 24 px,
 * trait 2,2 px arrondi, un détail pêche). Remplacent les émojis : l'API envoie une clé
 * (`reward`, `badge`…) ; une valeur inconnue, ancienne notification comprise, donne la cloche.
 */

type Props = { size?: number };

const svg = (size: number, children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const A = 'var(--rk-accent)';

const GLYPHS: Record<string, (s: number) => React.ReactNode> = {
  bell: (s) => svg(s, <><path d="M6.2 16.4V11a5.8 5.8 0 0 1 11.6 0v5.4l1.5 1.8H4.7Z" /><path d="M10 20.6a2.2 2.2 0 0 0 4 0" stroke={A} /></>),
  activity: (s) => svg(s, <><path d="M20.1 12a8.1 8.1 0 1 1-4.6-7.3" /><path d="M16 12a4 4 0 1 1-2.6-3.8" stroke={A} /><circle cx="12" cy="12" r="1.4" fill={A} stroke="none" /></>),
  review: (s) => svg(s, <><path d="M2.8 12s3.4-6.4 9.2-6.4 9.2 6.4 9.2 6.4-3.4 6.4-9.2 6.4S2.8 12 2.8 12Z" /><circle cx="12" cy="12" r="2.8" stroke={A} /></>),
  reminder: (s) => svg(s, <><circle cx="12" cy="13" r="7.6" /><path d="M12 9.2V13l2.6 1.8" stroke={A} /><path d="M5 4.4 3.4 6M19 4.4 20.6 6" /></>),
  validated: (s) => svg(s, <><rect x="3.2" y="4.4" width="17.6" height="15.4" rx="6" /><path d="m8.2 12.2 2.5 2.5 5.1-5.4" stroke={A} /></>),
  message: (s) => svg(s, <><path d="M4.2 17.6V7.2a3 3 0 0 1 3-3h9.6a3 3 0 0 1 3 3v6.6a3 3 0 0 1-3 3H9.4l-5.2 3.6Z" /><path d="M8.6 10.4h6.8" stroke={A} /></>),
  level: (s) => svg(s, <><path d="M5 20.4V9.8M12 20.4V4.6M19 20.4v-7.4" /><path d="m9.4 7.2 2.6-2.6 2.6 2.6" stroke={A} /></>),
  badge: (s) => svg(s, <><circle cx="12" cy="9.4" r="5.6" /><path d="m8.8 14.2-1.6 6.2 4.8-2.4 4.8 2.4-1.6-6.2" /><circle cx="12" cy="9.4" r="2" stroke={A} /></>),
  reward: (s) => svg(s, <><rect x="3.8" y="9.4" width="16.4" height="11" rx="3.4" /><rect x="2.9" y="5.6" width="18.2" height="3.8" rx="1.9" /><path d="M12 5.6v14.8" /><path d="M12 5.6c-1.4-3.2-5.1-2.3-4.3.6M12 5.6c1.4-3.2 5.1-2.3 4.3.6" stroke={A} /></>),
  device: (s) => svg(s, <><rect x="6.4" y="2.8" width="11.2" height="18.4" rx="3" /><path d="M10.6 17.8h2.8" stroke={A} /></>),
  friend: (s) => svg(s, <><circle cx="8.4" cy="7.6" r="2.9" /><path d="M3.9 19.8a4.5 4.5 0 0 1 9 0" /><circle cx="15.8" cy="7.6" r="2.9" stroke={A} /><path d="M11.3 19.8a4.5 4.5 0 0 1 9 0" stroke={A} /></>),
  challenge: (s) => svg(s, <><path d="M6 21V4.2" /><path d="M6 4.6h11.2l-2.4 3.6 2.4 3.6H6" stroke={A} /></>),
  family: (s) => svg(s, <><path d="M4 11.3c0-.5.3-1 .7-1.3l6.3-4.9a1.6 1.6 0 0 1 2 0l6.3 4.9c.4.3.7.8.7 1.3v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M12 17.4s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8Z" stroke={A} /></>),
  streak: (s) => svg(s, <><path d="M12 21c-3.9 0-6.6-2.7-6.6-6.3 0-3.4 2.6-5.4 3.7-8.7 2.2 1.4 3.3 3.3 3.5 5.2 1-1 1.5-2.2 1.6-3.4 2.3 1.8 4.4 4.3 4.4 7 0 3.5-2.7 6.2-6.6 6.2Z" /><path d="M12 21c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.3-2.4 2.7-3.9 1.4 1.5 2.7 2.3 2.7 3.9 0 1.5-1.1 2.6-2.7 2.6Z" stroke={A} /></>),
  summary: (s) => svg(s, <><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.4" /><path d="M8 16v-3.4M12 16V8M16 16v-5.4" stroke={A} /></>),
  screen: (s) => svg(s, <><rect x="6.4" y="2.8" width="11.2" height="18.4" rx="3" /><path d="m9.4 12.2 1.8 1.8 3.4-3.6" stroke={A} /></>),
  progress: (s) => svg(s, <><path d="M12 21v-8.6" /><path d="M12 12.4C12 8 9 5.4 4.6 5.4c0 4.4 3 7 7.4 7Z" /><path d="M12 14.6c0-3.4 2.4-5.6 6.6-5.6 0 3.6-2.4 5.6-6.6 5.6Z" stroke={A} /></>),
  voucher: (s) => svg(s, <><path d="M3.4 8.4V6.6a1.8 1.8 0 0 1 1.8-1.8h13.6a1.8 1.8 0 0 1 1.8 1.8v1.8a3.6 3.6 0 0 0 0 7.2v1.8a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8v-1.8a3.6 3.6 0 0 0 0-7.2Z" /><path d="M14 8.4v7.2" stroke={A} strokeDasharray="1.6 2.2" /></>),
  payment: (s) => svg(s, <><rect x="2.8" y="5.2" width="18.4" height="13.6" rx="3" /><path d="M2.8 9.6h18.4" /><path d="M6.8 15h3.4" stroke={A} /></>),
};

/** Picto d'une notification d'après sa clé ; cloche pour une clé inconnue (anciens émojis compris). */
export const RkGlyph: React.FC<Props & { kind: string | null | undefined }> = ({ kind, size = 18 }) => (
  <>{(GLYPHS[kind ?? ''] ?? GLYPHS.bell)(size)}</>
);

/** Médaille des badges, quelle que soit l'icône enregistrée en base. */
export const RkMedal: React.FC<Props> = ({ size = 20 }) => <>{GLYPHS.badge(size)}</>;
