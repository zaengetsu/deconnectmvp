import { describe, it, expect } from 'vitest';
import { parentOf } from '../hooks/useRkBack';

describe('écran parent de chaque route (retour au doigt / repli du bouton ←)', () => {
  it.each([
    ['/parent/children/abc/assign', '/parent/children/abc'],
    ['/parent/children/abc', '/parent/children'],
    ['/parent/create-child', '/parent/children'],
    ['/parent/create-activity', '/parent/activities'],
    ['/parent/activities', '/parent/dashboard'],
    ['/parent/create-reward', '/parent/rewards'],
    ['/parent/settings', '/parent/dashboard'],
    ['/parent/account', '/parent/settings'],
    ['/parent/notification-preferences', '/parent/settings'],
    ['/parent/notifications', '/parent/dashboard'],
    ['/child/points', '/child/home'],
    ['/child/notifications', '/child/home'],
    ['/family', '/parent/settings'],
  ])('%s → %s', (from, to) => {
    expect(parentOf(from)).toBe(to);
  });

  it('les écrans racines des onglets n’ont pas de parent (le swipe change d’onglet)', () => {
    for (const p of ['/parent/dashboard', '/parent/children', '/parent/validations', '/parent/rewards',
                     '/child/home', '/child/activities', '/child/rewards', '/child/profile']) {
      expect(parentOf(p)).toBeNull();
    }
  });
});
