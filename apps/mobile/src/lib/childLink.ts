/**
 * Lien appareil enfant — format du QR et lecture tolérante.
 *
 * Le QR encode un deep link `rekonect://link?t=<jeton>&c=<code>&n=<prénom>` :
 *  - scanné DANS l'app → on lit le jeton directement ;
 *  - scanné avec l'appareil photo du téléphone → iOS/Android proposent
 *    d'ouvrir Rekonect, qui reçoit l'URL (App.appUrlOpen) et enchaîne sur le PIN.
 * On accepte aussi les anciens formats (JSON, jeton nu) et le code court.
 */
export const LINK_SCHEME = 'rekonect';
export const LINK_HOST = 'link';

export interface ChildLinkPayload {
  /** Jeton complet (32 hex) ou code court (6 caractères) — les deux sont acceptés par claim_child_link_token */
  token: string;
  childName: string;
}

export function buildChildLinkUrl(token: string, code?: string | null, childName?: string | null): string {
  const p = new URLSearchParams();
  p.set('t', token);
  if (code) p.set('c', code);
  if (childName) p.set('n', childName);
  return `${LINK_SCHEME}://${LINK_HOST}?${p.toString()}`;
}

const HEX32 = /^[0-9a-fA-F]{32}$/;
const SHORT = /^[A-Za-z0-9]{6}$/;

/** Renvoie null si le texte n'est pas un lien Rekonect reconnaissable. */
export function parseChildLink(text: string): ChildLinkPayload | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;

  // 1) deep link rekonect://link?… ou URL https://…/link?… (universal link à venir)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const isOurs =
        u.protocol === `${LINK_SCHEME}:` ||
        u.pathname.replace(/\/+$/, '').endsWith('/link') ||
        u.searchParams.has('t');
      if (!isOurs) return null;
      const t = u.searchParams.get('t') || u.searchParams.get('token') || '';
      const c = u.searchParams.get('c') || u.searchParams.get('code') || '';
      const token = HEX32.test(t) ? t.toLowerCase() : SHORT.test(c) ? c.toUpperCase() : '';
      if (!token) return null;
      return { token, childName: u.searchParams.get('n') || u.searchParams.get('child') || '' };
    } catch { return null; }
  }

  // 2) ancien QR JSON { type: 'deconnect_link', token, child }
  if (raw.startsWith('{')) {
    try {
      const data = JSON.parse(raw) as { type?: string; token?: string; child?: string };
      if (data?.type === 'deconnect_link' && typeof data.token === 'string' && HEX32.test(data.token)) {
        return { token: data.token.toLowerCase(), childName: data.child || '' };
      }
    } catch { /* pas du JSON */ }
    return null;
  }

  // 3) jeton nu ou code court tapé/scanné
  if (HEX32.test(raw)) return { token: raw.toLowerCase(), childName: '' };
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (SHORT.test(compact)) return { token: compact, childName: '' };
  return null;
}
