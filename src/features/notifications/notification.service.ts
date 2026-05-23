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
    platform: 'ios' | 'android' | 'web'
  ): Promise<void> {
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      );

    if (error) console.error('[NotificationService] Failed to save push token:', error);
  },

  // ─── Real-time subscription ────────────────────────────
  subscribeToNotifications(
    recipientType: 'parent' | 'child',
    recipientId: string,
    onNewNotification: (notification: AppNotification) => void
  ) {
    const channel = supabase
      .channel(`notifications:${recipientType}:${recipientId}`)
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
