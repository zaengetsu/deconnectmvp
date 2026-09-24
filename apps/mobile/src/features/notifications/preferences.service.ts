import { api, withQuery } from '../../lib/api';
import { camel, compact, snake } from '../../lib/case';

/**
 * Préférences de notification (5.15).
 *
 * Une ligne par destinataire : le parent (child_id NULL) ou un enfant.
 * Le modèle vit dans notification_preferences (migrations 001 + 025) — on
 * n'ouvre pas un second système de préférences à côté. Lu et modifié via l'API.
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

  // Avantages partenaires (consentement explicite, désactivé par défaut)
  partner_offers: boolean;

  // Relances d'encouragement (enfants et parent), plafonnées côté serveur
  encouragements: boolean;

  // Quiet hours
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
}

export type PreferenceKey = keyof Omit<
  NotificationPreferences,
  'id' | 'parent_id' | 'child_id' | 'quiet_hours_start' | 'quiet_hours_end' | 'timezone'
>;

/** Destinataire de chaque ligne chargée : l'API adresse les préférences par enfant, pas par identifiant. */
const owners = new Map<string, string | null>();

async function load(childId?: string): Promise<NotificationPreferences | null> {
  try {
    const prefs = snake<NotificationPreferences>(await api('GET', withQuery('/v1/notification-preferences', { childId })));
    owners.set(prefs.id, prefs.child_id ?? null);
    return prefs;
  } catch (e) {
    console.error('[PreferencesService] fetch failed:', e);
    return null;
  }
}

export const preferencesService = {
  /** Préférences du parent (la ligne par défaut est créée par le serveur si besoin). */
  getParentPreferences(_parentId?: string): Promise<NotificationPreferences | null> {
    return load();
  },

  getChildPreferences(childId: string): Promise<NotificationPreferences | null> {
    return load(childId);
  },

  async update(id: string, patch: Partial<NotificationPreferences>): Promise<void> {
    const { id: _id, parent_id: _p, child_id: _c, ...fields } = patch;
    const childId = owners.get(id) ?? undefined;
    await api('PUT', withQuery('/v1/notification-preferences', { childId }), compact(camel<Record<string, unknown>>(fields)));
  },

  /** Quiet hours : « HH:MM » ou null pour désactiver. */
  async setQuietHours(id: string, start: string | null, end: string | null): Promise<void> {
    await preferencesService.update(id, { quiet_hours_start: start, quiet_hours_end: end });
  },
};
