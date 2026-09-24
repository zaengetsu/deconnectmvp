import { describe, it, expect, vi, beforeEach } from 'vitest';
import { childSession } from '../features/auth/child.session';
import { supabase } from '../lib/supabase';
import { Preferences } from '@capacitor/preferences';

/**
 * Session enfant — le « pont » sur la session parent a été retiré :
 * l'enfant doit obtenir sa propre identité, et un PIN refusé ne doit
 * jamais laisser de session ouverte.
 */
describe('childSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
    vi.mocked(supabase.auth.signInAnonymously).mockResolvedValue({
      data: { user: { id: 'anon-1', is_anonymous: true } }, error: null,
    } as never);
  });

  it('reconnaît une session enfant', () => {
    expect(childSession.isChildUser({ is_anonymous: true })).toBe(true);
    expect(childSession.isChildUser({ is_anonymous: false })).toBe(false);
    expect(childSession.isChildUser(null)).toBe(false);
  });

  it('ouvre une session anonyme et lie l\'appareil à l\'enfant', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true, child: { id: 'c1', display_name: 'Léa' } }, error: null,
    } as never);

    const result = await childSession.login('c1', '1234');

    expect(supabase.auth.signInAnonymously).toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('child_pin_login', {
      p_child_id: 'c1',
      p_pin: '1234',
      p_auth_user_id: 'anon-1',
    });
    expect(result.success).toBe(true);
    expect(Preferences.set).toHaveBeenCalled();
  });

  it('ferme la session anonyme si le PIN est refusé', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: false, error: 'PIN incorrect', attempts_left: 3 }, error: null,
    } as never);

    const result = await childSession.login('c1', '0000');

    expect(result.success).toBe(false);
    expect(result.attempts_left).toBe(3);
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(Preferences.set).not.toHaveBeenCalled();
  });

  it('remonte le verrouillage après trop d\'essais', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: false, error: 'Trop de tentatives.', locked_until: '2026-09-04T20:00:00Z' }, error: null,
    } as never);

    const result = await childSession.login('c1', '0000');
    expect(result.locked_until).toBeDefined();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('ferme la session parent avant d\'ouvrir la session enfant', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'parent-1', is_anonymous: false } } },
    } as never);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true, child: { id: 'c1' } }, error: null,
    } as never);

    await childSession.login('c1', '1234');

    // L'enfant ne doit jamais porter le jeton du parent
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(supabase.auth.signInAnonymously).toHaveBeenCalled();
  });

  it('réutilise la session anonyme existante', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'anon-existant', is_anonymous: true } } },
    } as never);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true, child: { id: 'c1' } }, error: null,
    } as never);

    await childSession.login('c1', '1234');

    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('child_pin_login', expect.objectContaining({
      p_auth_user_id: 'anon-existant',
    }));
  });

  it('le lien QR transmet l\'identité de l\'appareil', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true, child: { id: 'c1' }, parent_name: 'Marie' }, error: null,
    } as never);

    await childSession.claimLink('TOKEN123', '1234', 'device-abc');

    expect(supabase.rpc).toHaveBeenCalledWith('claim_child_link_token', {
      p_token: 'TOKEN123',
      p_pin: '1234',
      p_device_id: 'device-abc',
      p_auth_user_id: 'anon-1',
    });
  });

  it('end() efface la session locale et déconnecte', async () => {
    await childSession.end();
    expect(Preferences.remove).toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});

describe('message quand les connexions anonymes sont désactivées', () => {
  it('explique quoi activer au lieu de « vérifie ta connexion »', async () => {
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null }, error: null } as never);
    vi.mocked(supabase.auth.signInAnonymously).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Anonymous sign-ins are disabled', status: 422 },
    } as never);
    const { childSession } = await import('../features/auth/child.session');
    const res = await childSession.login('child-1', '1234');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Anonymous sign-ins/);
  });
});
