import { describe, it, expect, vi, beforeEach } from 'vitest';
import { childrenService } from '../features/children/children.service';
import { supabase } from '../lib/supabase';

describe('childrenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getChildren', () => {
    it('calls supabase with correct params', async () => {
      const mockData = [{ id: 'c1', display_name: 'Lucas', age: 10 }];
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await childrenService.getChildren('parent-1');
      expect(supabase.from).toHaveBeenCalledWith('children');
      expect(result).toEqual(mockData);
    });

    it('throws on error', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await expect(childrenService.getChildren('p1')).rejects.toBeDefined();
    });
  });

  describe('createChild', () => {
    it('calls insert with correct data', async () => {
      const childData = { parent_id: 'p1', display_name: 'Lucas', age: 10 };
      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'c1', ...childData }, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await childrenService.createChild(childData);
      expect(result.display_name).toBe('Lucas');
    });
  });

  describe('deactivateChild', () => {
    it('calls update with is_active false', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await childrenService.deactivateChild('c1');
      expect(supabase.from).toHaveBeenCalledWith('children');
    });
  });
});
