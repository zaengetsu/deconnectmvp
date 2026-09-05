import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationService } from '../features/notifications/notification.service';
import { supabase } from '../lib/supabase';

describe('notificationService', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Push tokens : routage parent vs enfant (5.12) ──────────────
  describe('savePushToken', () => {
    it('rattache le token au parent quand il n\'y a pas d\'enfant', async () => {
      const chain = { upsert: vi.fn().mockResolvedValue({ error: null }) };
      vi.mocked(supabase.from).mockReturnValue(chain as never);

      await notificationService.savePushToken('parent-1', 'tok-abc', 'ios');

      expect(supabase.from).toHaveBeenCalledWith('push_tokens');
      const payload = chain.upsert.mock.calls[0][0];
      expect(payload.user_id).toBe('parent-1');
      expect(payload.child_id).toBeNull();
      expect(payload.platform).toBe('ios');
    });

    it('rattache le token à l\'enfant en mode enfant', async () => {
      const chain = { upsert: vi.fn().mockResolvedValue({ error: null }) };
      vi.mocked(supabase.from).mockReturnValue(chain as never);

      await notificationService.savePushToken('anon-1', 'tok-xyz', 'android', 'child-7');

      const payload = chain.upsert.mock.calls[0][0];
      // Sans child_id, aucune notification enfant ne peut être routée
      expect(payload.child_id).toBe('child-7');
      expect(payload.user_id).toBeNull();
    });

    it('dédoublonne sur le token (multi-device)', async () => {
      const chain = { upsert: vi.fn().mockResolvedValue({ error: null }) };
      vi.mocked(supabase.from).mockReturnValue(chain as never);

      await notificationService.savePushToken('parent-1', 'tok-abc', 'ios');

      expect(chain.upsert.mock.calls[0][1]).toEqual({ onConflict: 'token' });
    });
  });

  // ─── Centre de notifications (5.13) ─────────────────────────────
  describe('lecture', () => {
    it('ne renvoie que les notifications du destinataire, du plus récent au plus ancien', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [{ id: 'n1' }], error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(chain as never);

      const result = await notificationService.getParentNotifications('parent-1');

      expect(chain.eq).toHaveBeenCalledWith('recipient_type', 'parent');
      expect(chain.eq).toHaveBeenCalledWith('recipient_id', 'parent-1');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toHaveLength(1);
    });

    it('sépare bien les notifications de deux enfants (multi-enfants)', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(chain as never);

      await notificationService.getChildNotifications('child-A');
      expect(chain.eq).toHaveBeenCalledWith('recipient_id', 'child-A');

      vi.clearAllMocks();
      vi.mocked(supabase.from).mockReturnValue(chain as never);
      await notificationService.getChildNotifications('child-B');
      expect(chain.eq).toHaveBeenCalledWith('recipient_id', 'child-B');
    });

    it('compte les non-lues', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: 4, error: null }),
      };
      chain.eq = vi.fn().mockImplementation(function (this: unknown, field: string) {
        if (field === 'is_read') return Promise.resolve({ count: 4, error: null });
        return chain;
      }) as never;
      vi.mocked(supabase.from).mockReturnValue(chain as never);

      const count = await notificationService.getUnreadCount('parent', 'parent-1');
      expect(count).toBe(4);
    });

    it('renvoie 0 si le compteur échoue plutôt que de casser l\'écran', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function (field: string) {
          if (field === 'is_read') return Promise.resolve({ count: null, error: { message: 'boom' } });
          return chain;
        }),
      };
      vi.mocked(supabase.from).mockReturnValue(chain as never);

      expect(await notificationService.getUnreadCount('child', 'child-1')).toBe(0);
    });
  });

  // ─── Realtime : un canal par destinataire ───────────────────────
  it('s\'abonne au canal du destinataire et sait s\'en désabonner', () => {
    const unsubscribe = notificationService.subscribeToNotifications('child', 'child-1', () => {});
    expect(supabase.channel).toHaveBeenCalledWith(expect.stringMatching(/^notifications:child:child-1/));

    unsubscribe();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
