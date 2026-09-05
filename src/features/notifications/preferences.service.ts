import { supabase } from '../../lib/supabase';

/**
 * Préférences de notification (5.15).
 *
 * Une ligne par destinataire : le parent (child_id NULL) ou un enfant.
 * Le modèle vit dans notification_preferences (migrations 001 + 025) — on
 * n'ouvre pas un second système de préférences à côté.
 */
export interface NotificationPreferences {
  id: string;
  parent_id: string;
  child_id: string | null;

  // Canaux
  push_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;

  // Activités
  activity_completed: boolean;
  activity_validation: boolean;
  activity_planned: boolean;

  // Récompenses
  reward_unlocked: boolean;
  reward_pending: boolean;

  // Famille
  family_activities: boolean;
  family_invitations: boolean;

  // Progression
  goals: boolean;
  daily_summary: boolean;
  weekly_summary: boolean;

  // Temps d'écran
  screen_time_goal: boolean;
  screen_time_summary: boolean;

  // Communication
  tips: boolean;
  product_news: boolean;

  // Quiet hours
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
}

export type PreferenceKey = keyof Omit<
  NotificationPreferences,
  'id' | 'parent_id' | 'child_id' | 'quiet_hours_start' | 'quiet_hours_end' | 'timezone'
>;

export const preferencesService = {
  /** Préférences du parent (crée la ligne par défaut si besoin). */
  async getParentPreferences(parentId: string): Promise<NotificationPreferences | null> {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('parent_id', parentId)
      .is('child_id', null)
      .maybeSingle();

    if (error) {
      console.error('[PreferencesService] fetch failed:', error);
      return null;
    }
    if (data) return data as NotificationPreferences;

    const { data: created, error: insertError } = await supabase
      .from('notification_preferences')
      .insert({ parent_id: parentId })
      .select()
      .single();

    if (insertError) {
      console.error('[PreferencesService] create failed:', insertError);
      return null;
    }
    return created as NotificationPreferences;
  },

  async getChildPreferences(childId: string): Promise<NotificationPreferences | null> {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('child_id', childId)
      .maybeSingle();

    if (error) {
      console.error('[PreferencesService] fetch child failed:', error);
      return null;
    }
    return (data as NotificationPreferences) ?? null;
  },

  async update(id: string, patch: Partial<NotificationPreferences>): Promise<void> {
    const { error } = await supabase
      .from('notification_preferences')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  /** Quiet hours : « HH:MM » ou null pour désactiver. */
  async setQuietHours(id: string, start: string | null, end: string | null): Promise<void> {
    await preferencesService.update(id, { quiet_hours_start: start, quiet_hours_end: end });
  },
};
