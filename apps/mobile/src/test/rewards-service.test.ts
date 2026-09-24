import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rewardsService } from '../features/rewards/rewards.service';
import { supabase } from '../lib/supabase';

describe('rewardsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getRewards ───────────────────────────────────────────────
  describe('getRewards', () => {
    it('fetches rewards for a parent', async () => {
      const mockRewards = [
        { id: 'r1', title: 'Sortie cinéma', required_points: 100, reward_type: 'custom', is_active: true },
        { id: 'r2', title: 'Parc d\'attractions', required_points: 300, reward_type: 'custom', is_active: true },
      ];
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRewards, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await rewardsService.getRewards('parent-1');
      expect(supabase.from).toHaveBeenCalledWith('rewards');
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Sortie cinéma');
    });

    it('throws on Supabase error', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await expect(rewardsService.getRewards('parent-1')).rejects.toBeDefined();
    });
  });

  // ─── createReward ─────────────────────────────────────────────
  describe('createReward', () => {
    it('creates a reward with correct data', async () => {
      const rewardData = { parent_id: 'p1', title: 'Glace', required_points: 50 };
      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'r1', ...rewardData }, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await rewardsService.createReward(rewardData);
      expect(result.title).toBe('Glace');
      expect(result.required_points).toBe(50);
    });
  });

  // ─── getPendingRewardRequests ─────────────────────────────────
  describe('getPendingRewardRequests', () => {
    it('fetches pending reward requests', async () => {
      const mockRequests = [
        { id: 'rr1', status: 'pending', reward: { title: 'Sortie' }, child: { display_name: 'Lucas' } },
      ];
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRequests, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await rewardsService.getPendingRewardRequests('parent-1');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });
  });
});
