import { describe, it, expect } from 'vitest';
import { matches, norm } from '../lib/search';

describe('recherche catalogue', () => {
  it('ignore la casse et les accents', () => {
    expect(norm('Vélo en forêt')).toBe('velo en foret');
    expect(matches('velo', 'Faire du Vélo')).toBe(true);
    expect(matches('FORÊT', 'balade en foret')).toBe(true);
  });
  it('cherche dans plusieurs champs et tolère les champs vides', () => {
    expect(matches('lecture', 'Lire 20 pages', null, 'Lecture')).toBe(true);
    expect(matches('basket', 'Lire 20 pages', undefined)).toBe(false);
  });
  it('une requête vide laisse tout passer', () => {
    expect(matches('', 'n’importe quoi')).toBe(true);
    expect(matches('   ', 'n’importe quoi')).toBe(true);
  });
});
