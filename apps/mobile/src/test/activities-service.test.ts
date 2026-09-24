import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activitiesService } from '../features/activities/activities.service';
import { supabase } from '../lib/supabase';

describe('activitiesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getCategories ────────────────────────────────────────────
  describe('getCategories', () => {
    it('returns all 8 categories from brief (incl. cuisine)', async () => {
      const mockCategories = [
        { id: '1', slug: 'sport',           name: 'Sport' },
        { id: '2', slug: 'creativite',      name: 'Créativité' },
        { id: '3', slug: 'nature',          name: 'Nature' },
        { id: '4', slug: 'vie-quotidienne', name: 'Vie quotidienne' },
        { id: '5', slug: 'social',          name: 'Social' },
        { id: '6', slug: 'lecture',         name: 'Lecture' },
        { id: '7', slug: 'famille',         name: 'Famille' },
        { id: '8', slug: 'cuisine',         name: 'Cuisine' }, // added in brief alignment
      ];
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await activitiesService.getCategories();
      expect(result).toHaveLength(8);
      const slugs = result.map(c => c.slug);
      expect(slugs).toContain('sport');
      expect(slugs).toContain('cuisine');
      expect(slugs).toContain('famille');
    });

    it('throws on error', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);
      await expect(activitiesService.getCategories()).rejects.toBeDefined();
    });
  });

  // ─── getActivities ────────────────────────────────────────────
  describe('getActivities', () => {
    // Helper: builds a self-referencing mock chain
    // getActivities does: let query = supabase.from().select().eq().order()
    // then: query = query.eq('difficulty', ...) — so every method must return `chain`
    // and the final await is on the resolved chain itself
    const makeChain = (data: any[]) => {
      const chain: any = {};
      const resolve = vi.fn().mockResolvedValue({ data, error: null });
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq     = vi.fn().mockReturnValue(chain);
      chain.lte    = vi.fn().mockReturnValue(chain);
      chain.gte    = vi.fn().mockReturnValue(chain);
      chain.order  = vi.fn().mockReturnValue(chain);
      // Make chain thenable so `await query` resolves
      chain.then   = (onFulfilled: any) => Promise.resolve({ data, error: null }).then(onFulfilled);
      return chain;
    };

    it('returns activities list', async () => {
      const mockActivities = [
        { id: 'a1', title: 'Faire 20 minutes de vélo', points: 15, difficulty: 'easy' },
        { id: 'a2', title: 'Ranger sa chambre', points: 15, difficulty: 'easy' },
      ];
      vi.mocked(supabase.from).mockReturnValue(makeChain(mockActivities) as any);

      const result = await activitiesService.getActivities();
      expect(result).toHaveLength(2);
    });

    it('accepts difficulty filter and returns result', async () => {
      const chain = makeChain([]);
      vi.mocked(supabase.from).mockReturnValue(chain as any);

      const result = await activitiesService.getActivities({ difficulty: 'hard' });
      expect(result).toEqual([]);
      expect(chain.eq).toHaveBeenCalledWith('difficulty', 'hard');
    });
  });

  // ─── selectActivity (child picks a mission) ───────────────────
  describe('selectActivity', () => {
    it('creates a child_activity with status selected', async () => {
      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'ca1', child_id: 'c1', activity_id: 'a1', status: 'selected' },
          error: null,
        }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await activitiesService.selectActivity('c1', 'a1');
      expect(result.status).toBe('selected');
    });
  });

  // ─── submitActivity (child submits proof) ─────────────────────
  describe('submitActivity', () => {
    it('updates status to submitted with note', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'ca1', status: 'submitted', child_note: 'Je l\'ai fait !' },
          error: null,
        }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await activitiesService.submitActivity('ca1', 'Je l\'ai fait !');
      expect(result.status).toBe('submitted');
      expect(result.child_note).toBe('Je l\'ai fait !');
    });
  });

  // ─── validateActivity (parent validates) ─────────────────────
  describe('validateActivity', () => {
    it('calls validate_child_activity RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);

      await activitiesService.validateActivity('ca1', 'parent-1', 'Bravo !');
      expect(supabase.rpc).toHaveBeenCalledWith('validate_child_activity', {
        p_child_activity_id: 'ca1',
        p_parent_id: 'parent-1',
        p_parent_note: 'Bravo !',
      });
    });

    it('throws when RPC returns error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'RPC error' } } as any);
      await expect(activitiesService.validateActivity('ca1', 'p1')).rejects.toBeDefined();
    });
  });

  // ─── rejectActivity (parent rejects) ─────────────────────────
  describe('rejectActivity', () => {
    it('updates status to rejected with reason', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await activitiesService.rejectActivity('ca1', 'p1', 'Pas terminé');
      expect(supabase.from).toHaveBeenCalledWith('child_activities');
    });
  });

  // ─── getPendingValidations ────────────────────────────────────
  describe('getPendingValidations', () => {
    it('returns submitted activities for a parent', async () => {
      const mockPending = [
        { id: 'ca1', status: 'submitted', child: { display_name: 'Lucas' }, activity: { title: 'Vélo' } },
      ];
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockPending, error: null }),
      };
      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      const result = await activitiesService.getPendingValidations('parent-1');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('submitted');
    });
  });
});
