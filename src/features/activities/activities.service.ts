import { supabase } from '../../lib/supabase';
import type { Activity, ActivityCategory, ChildActivity } from '../../types/database.types';
import type { ActivityFormData } from '../../lib/validations';

export const activitiesService = {
  // ─── Categories ──────────────────────────────────────────
  async getCategories(): Promise<ActivityCategory[]> {
    const { data, error } = await supabase
      .from('activity_categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // ─── Activities ──────────────────────────────────────────
  async getActivities(filters?: {
    category_id?: string;
    difficulty?: string;
    min_age?: number;
    max_age?: number;
  }): Promise<Activity[]> {
    let query = supabase
      .from('activities')
      .select('*, category:activity_categories(*)')
      .eq('is_active', true)
      .order('title', { ascending: true });

    if (filters?.category_id) {
      query = query.eq('category_id', filters.category_id);
    }
    if (filters?.difficulty) {
      query = query.eq('difficulty', filters.difficulty);
    }
    if (filters?.min_age) {
      query = query.lte('min_age', filters.min_age);
    }
    if (filters?.max_age) {
      query = query.gte('max_age', filters.max_age);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getActivity(activityId: string): Promise<Activity> {
    const { data, error } = await supabase
      .from('activities')
      .select('*, category:activity_categories(*)')
      .eq('id', activityId)
      .single();

    if (error) throw error;
    return data;
  },

  async createCustomActivity(parentId: string, formData: ActivityFormData): Promise<Activity> {
    const { data, error } = await supabase
      .from('activities')
      .insert({
        ...formData,
        created_by: parentId,
        activity_type: 'custom_parent' as const,
        is_public: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getParentCustomActivities(parentId: string): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*, category:activity_categories(*)')
      .eq('created_by', parentId)
      .eq('activity_type', 'custom_parent')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // ─── Child Activities ────────────────────────────────────
  async getChildActivities(childId: string, status?: string): Promise<ChildActivity[]> {
    let query = supabase
      .from('child_activities')
      .select('*, activity:activities(*, category:activity_categories(*))')
      .eq('child_id', childId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async selectActivity(childId: string, activityId: string): Promise<ChildActivity> {
    const { data, error } = await supabase
      .from('child_activities')
      .insert({
        child_id: childId,
        activity_id: activityId,
        status: 'selected',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async submitActivity(
    childActivityId: string,
    childNote?: string,
    proofUrl?: string,
    proofType?: string
  ): Promise<ChildActivity> {
    const { data, error } = await supabase
      .from('child_activities')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        child_note: childNote,
        ...(proofUrl ? { proof_url: proofUrl, proof_type: proofType } : {}),
      })
      .eq('id', childActivityId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Parent-only: get all pending validations
  async getPendingValidations(parentId: string): Promise<ChildActivity[]> {
    const { data, error } = await supabase
      .from('child_activities')
      .select('*, activity:activities(*), child:children!inner(*)')
      .eq('child.parent_id', parentId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Parent validates activity — calls RPC for safe points handling
  async validateActivity(childActivityId: string, parentId: string, parentNote?: string): Promise<void> {
    const { error } = await supabase.rpc('validate_child_activity', {
      p_child_activity_id: childActivityId,
      p_parent_id: parentId,
      p_parent_note: parentNote || null,
    });

    if (error) throw error;
  },

  async rejectActivity(childActivityId: string, parentId: string, rejectionReason: string): Promise<void> {
    const { error } = await supabase
      .from('child_activities')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        validated_by: parentId,
        rejection_reason: rejectionReason,
      })
      .eq('id', childActivityId);

    if (error) throw error;
  },

  // ─── Daily Challenges ─────────────────────────────────────
  async getDailyChallenges(childId: string): Promise<Activity[]> {
    const { data, error } = await supabase.rpc('get_daily_challenges', {
      p_child_id: childId,
    });

    if (error) throw error;
    return (data || []) as Activity[];
  },

  // ─── CRUD Custom Activities ───────────────────────────────
  async updateActivity(activityId: string, updates: Partial<ActivityFormData>): Promise<Activity> {
    const { data, error } = await supabase
      .from('activities')
      .update(updates)
      .eq('id', activityId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteActivity(activityId: string): Promise<void> {
    const { error } = await supabase
      .from('activities')
      .update({ is_active: false })
      .eq('id', activityId);

    if (error) throw error;
  },

  // ─── Assign activities to a child (parent action) ─────────
  async assignActivitiesToChild(childId: string, activityIds: string[]): Promise<void> {
    // Seules les assignations ACTIVES bloquent la ré-assignation
    // (available, selected, submitted) — les activités validées peuvent être ré-assignées
    const { data: existing } = await supabase
      .from('child_activities')
      .select('activity_id, status')
      .eq('child_id', childId)
      .in('activity_id', activityIds)
      .in('status', ['available', 'selected', 'submitted']);

    const currentlyActive = new Set((existing || []).map((r: any) => r.activity_id));
    const toInsert = activityIds
      .filter(id => !currentlyActive.has(id))
      .map(activity_id => ({
        child_id: childId,
        activity_id,
        status: 'available' as const,
      }));

    if (toInsert.length === 0) return;

    const { error } = await supabase.from('child_activities').insert(toInsert);
    if (error) throw error;
  },
};
