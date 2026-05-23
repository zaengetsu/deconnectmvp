import { supabase } from '../../lib/supabase';
import type { Child, ChildInsert, ChildUpdate } from '../../types/database.types';

export const childrenService = {
  async getChildren(parentId: string): Promise<Child[]> {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('parent_id', parentId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getChild(childId: string): Promise<Child> {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('id', childId)
      .single();

    if (error) throw error;
    return data;
  },

  async createChild(child: ChildInsert): Promise<Child> {
    const { data, error } = await supabase
      .from('children')
      .insert(child)
      .select()
      .single();

    // 409 = unique constraint (double-submit) — fetch existing instead
    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('children')
          .select('*')
          .eq('parent_id', child.parent_id)
          .eq('display_name', child.display_name)
          .single();
        if (existing) return existing;
      }
      throw error;
    }
    return data;
  },

  async updateChild(childId: string, updates: ChildUpdate): Promise<Child> {
    const { data, error } = await supabase
      .from('children')
      .update(updates)
      .eq('id', childId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deactivateChild(childId: string): Promise<void> {
    const { error } = await supabase
      .from('children')
      .update({ is_active: false })
      .eq('id', childId);

    if (error) throw error;
  },
};
