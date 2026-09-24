import { supabase } from '../../lib/supabase';

export interface AppNotification {
  id: string;
  recipient_type: 'parent' | 'child';
  recipient_id: string;
  title: string;
  body: string;
  icon: string;
  route: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  // Modèle v2 (migrations 025-028)
  type?: string | null;
  priority?: 'critical' | 'high' | 'normal' | 'low' | null;
  entity_type?: string | null;
  entity_id?: string | null;
  status?: string | null;
  group_key?: string | null;
}

/** Familles utilisées par le filtre du centre de notifications. */
export type NotificationFilter = 'all' | 'unread' | 'action' | 'activity' | 'reward';

const FILTER_TYPES: Record<Exclude<NotificationFilter, 'all' | 'unread'>, string[]> = {
  action:   ['activity_validation_required', 'reward_requested', 'reward_pending'],
  activity: ['activity_completed', 'activity_validated', 'activity_reminder', 'activity_planned', 'activity_rejected'],
  reward:   ['reward_requested', 'reward_pending', 'reward_approved', 'reward_unlocked', 'reward_rejected'],
};

/** Une notification qui attend une action du parent se distingue visuellement. */
export function isActionRequired(n: AppNotification): boolean {
  return n.priority === 'high' || n.priority === 'critical'
    || FILTER_TYPES.action.includes(n.type ?? '');
}

export function filterNotifications(list: AppNotification[], filter: NotificationFilter): AppNotification[] {
  if (filter === 'all') return list;
  if (filter === 'unread') return list.filter(n => !n.is_read);
  return list.filter(n => FILTER_TYPES[filter].includes(n.type ?? ''));
}

export const notificationService = {
  // ─── Fetch notifications ────────────────────────────────
  async getParentNotifications(parentId: string, limit = 30): Promise<AppNotification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_type', 'parent')
      .eq('recipient_id', parentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async getChildNotifications(childId: string, limit = 30): Promise<AppNotification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_type', 'child')
      .eq('recipient_id', childId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async getUnreadCount(recipientType: 'parent' | 'child', recipientId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
  },

  async markAsRead(notificationId: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  },

  async markAllRead(recipientType: 'parent' | 'child', recipientId: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .eq('is_read', false);
  },

  // ─── Create notification (client-side trigger) ──────────
  async createNotification(
    recipientType: 'parent' | 'child',
    recipientId: string,
    title: string,
    body: string,
    icon = '🔔',
    route?: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    await supabase.rpc('create_notification', {
      p_recipient_type: recipientType,
      p_recipient_id: recipientId,
      p_title: title,
      p_body: body,
      p_icon: icon,
      p_route: route || null,
      p_data: data,
    });
  },

  // ─── Push token management ─────────────────────────────
  async savePushToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    childId?: string | null
  ): Promise<void> {
    // Un token appartient soit à un parent, soit à un enfant — jamais aux deux.
    // Sans child_id, aucune notification enfant ne peut être routée vers le
    // bon appareil (cf. migration 024).
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: childId ? null : userId,
          child_id: childId ?? null,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      );

    if (error) console.error('[NotificationService] Failed to save push token:', error);
  },

  // ─── Suppression (5.13) ────────────────────────────────
  async deleteNotification(notificationId: string): Promise<void> {
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
    if (error) console.error('[NotificationService] delete failed:', error);
  },

  async deleteAllRead(recipientType: 'parent' | 'child', recipientId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .eq('is_read', true);
    if (error) console.error('[NotificationService] deleteAllRead failed:', error);
  },

  // ─── Real-time subscription ────────────────────────────
  subscribeToNotifications(
    recipientType: 'parent' | 'child',
    recipientId: string,
    onNewNotification: (notification: AppNotification) => void
  ) {
    const channelName = `notifications:${recipientType}:${recipientId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${recipientId}`,
        },
        (payload) => {
          onNewNotification(payload.new as AppNotification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
