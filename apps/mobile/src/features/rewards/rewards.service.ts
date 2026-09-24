import { supabase } from '../../lib/supabase';
import type { Reward, RewardRequest } from '../../types/database.types';
import type { RewardFormData } from '../../lib/validations';

export const rewardsService = {
  // ─── Rewards ─────────────────────────────────────────────
  async getRewards(parentId: string, childId?: string): Promise<Reward[]> {
    let query = supabase
      .from('rewards')
      .select('*')
      .eq('parent_id', parentId)
      .eq('is_active', true)
      .order('required_points', { ascending: true });

    if (childId) {
      query = query.or(`child_id.eq.${childId},child_id.is.null`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getChildRewards(parentId: string, childId: string): Promise<Reward[]> {
    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('parent_id', parentId)
      .eq('is_active', true)
      .or(`child_id.eq.${childId},child_id.is.null`)
      .order('required_points', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createReward(parentId: string, formData: RewardFormData): Promise<Reward> {
    const { data, error } = await supabase
      .from('rewards')
      .insert({
        ...formData,
        parent_id: parentId,
        reward_type: 'custom' as const,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateReward(rewardId: string, updates: Partial<RewardFormData>): Promise<Reward> {
    const { data, error } = await supabase
      .from('rewards')
      .update(updates)
      .eq('id', rewardId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteReward(rewardId: string): Promise<void> {
    // Defense-in-depth: filter by parent_id explicitly, even though RLS
    // already enforces it. This prevents accidental deletion if RLS is
    // ever misconfigured.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { error } = await supabase
      .from('rewards')
      .update({ is_active: false })
      .eq('id', rewardId)
      .eq('parent_id', user.id); // explicit owner check

    if (error) throw error;
  },

  // ─── Catalog ──────────────────────────────────────────────
  async getCatalogRewards(): Promise<Reward[]> {
    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .is('parent_id', null)
      .eq('reward_type', 'catalog')
      .eq('is_active', true)
      .order('reward_category', { ascending: true })
      .order('required_points', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /** Copy a catalog reward into the parent's personal list */
  async activateCatalogReward(parentId: string, catalogReward: Reward, childId?: string): Promise<Reward> {
    const { data, error } = await supabase
      .from('rewards')
      .insert({
        parent_id: parentId,
        child_id: childId || null,
        title: catalogReward.title,
        description: catalogReward.description,
        required_points: catalogReward.required_points,
        reward_type: 'custom' as const,
        reward_category: catalogReward.reward_category,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // ─── Reward Requests ─────────────────────────────────────
  async requestReward(childId: string, rewardId: string): Promise<RewardRequest> {
    const { data, error } = await supabase
      .from('reward_requests')
      .insert({
        child_id: childId,
        reward_id: rewardId,
        status: 'pending',
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getChildRewardRequests(childId: string): Promise<RewardRequest[]> {
    const { data, error } = await supabase
      .from('reward_requests')
      .select('*, reward:rewards(*)')
      .eq('child_id', childId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getPendingRewardRequests(parentId: string): Promise<RewardRequest[]> {
    const { data, error } = await supabase
      .from('reward_requests')
      .select('*, reward:rewards(*), child:children!inner(*)')
      .eq('child.parent_id', parentId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async approveRewardRequest(requestId: string, parentId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_reward_request', {
      p_request_id: requestId,
      p_parent_id: parentId,
    });

    if (error) throw error;
  },

  async rejectRewardRequest(requestId: string, parentId: string, parentNote?: string): Promise<void> {
    const { error } = await supabase
      .from('reward_requests')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        handled_by: parentId,
        parent_note: parentNote,
      })
      .eq('id', requestId);

    if (error) throw error;
  },
};
