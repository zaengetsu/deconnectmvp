import { describe, it, expect, vi } from 'vitest';
import { stepSection } from '../hooks/useSwipe';

describe('glissement entre sections', () => {
  const order = ['mine', 'catalog'] as const;
  it('avance et recule dans l’ordre', () => {
    const set = vi.fn();
    expect(stepSection(order, 'mine', 1, set)).toBe(true);
    expect(set).toHaveBeenCalledWith('catalog');
    expect(stepSection(order, 'catalog', -1, set)).toBe(true);
    expect(set).toHaveBeenLastCalledWith('mine');
  });
  it('au bord, rend la main (le geste remonte aux onglets)', () => {
    const set = vi.fn();
    expect(stepSection(order, 'catalog', 1, set)).toBe(false);
    expect(stepSection(order, 'mine', -1, set)).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});
