import { describe, it, expect } from 'vitest';
import { buildChildLinkUrl, parseChildLink } from '../lib/childLink';

const TOKEN = 'a3f1c2d4e5f60718293a4b5c6d7e8f90';

describe('lien appareil enfant — QR / deep link / code', () => {
  it('le QR encode un deep link rekonect:// que le scanner relit', () => {
    const url = buildChildLinkUrl(TOKEN, 'K7M3PQ', 'Léa');
    expect(url.startsWith('rekonect://link?')).toBe(true);
    expect(parseChildLink(url)).toEqual({ token: TOKEN, childName: 'Léa' });
  });
  it('accepte l’ancien QR JSON et le jeton nu', () => {
    expect(parseChildLink(JSON.stringify({ type: 'deconnect_link', token: TOKEN, child: 'Tom' })))
      .toEqual({ token: TOKEN, childName: 'Tom' });
    expect(parseChildLink(TOKEN.toUpperCase())).toEqual({ token: TOKEN, childName: '' });
  });
  it('accepte le code court, tapé n’importe comment', () => {
    expect(parseChildLink('k7m 3pq')).toEqual({ token: 'K7M3PQ', childName: '' });
    expect(parseChildLink('K7M-3PQ')).toEqual({ token: 'K7M3PQ', childName: '' });
  });
  it('un deep link sans jeton mais avec code court passe par le code', () => {
    expect(parseChildLink('rekonect://link?c=k7m3pq&n=L%C3%A9a')).toEqual({ token: 'K7M3PQ', childName: 'Léa' });
  });
  it('rejette ce qui n’est pas un lien Rekonect', () => {
    expect(parseChildLink('https://example.com/whatever')).toBeNull();
    expect(parseChildLink('{"type":"other"}')).toBeNull();
    expect(parseChildLink('bonjour')).toBeNull();
    expect(parseChildLink('')).toBeNull();
  });
});
