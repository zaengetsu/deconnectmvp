import { api, withQuery } from '../../lib/api';
import { realtime } from '../../lib/realtime';
import { devicePushToken, sessionStore } from '../../lib/session';

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

interface ApiNotification {
  id: string;
  type: string | null;
  title: string;
  body: string;
  icon: string | null;
  route: string | null;
  data: Record<string, unknown> | null;
  priority: AppNotification['priority'];
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  sentAt: string;
}

/** Notification de l'API → forme lue par les écrans (héritée de la table Supabase). */
export function toAppNotification(n: ApiNotification, recipientType: 'parent' | 'child', recipientId: string): AppNotification {
  return {
    id: n.id,
    recipient_type: recipientType,
    recipient_id: recipientId,
    title: n.title,
    body: n.body,
    icon: n.icon ?? '🔔',
    route: n.route,
    data: n.data ?? {},
    is_read: n.isRead,
    created_at: n.sentAt,
    type: n.type,
    priority: n.priority,
    entity_type: n.entityType,
    entity_id: n.entityId,
    status: 'sent',
  };
}

async function list(recipientType: 'parent' | 'child', recipientId: string, limit: number): Promise<AppNotification[]> {
  const res = await api<{ items: ApiNotification[] }>('GET', withQuery('/v1/notifications', { limit: Math.min(100, limit) }));
  return res.items.map((n) => toAppNotification(n, recipientType, recipientId));
}

/**
 * Centre de notifications. Le destinataire est celui de la session (parent ou enfant) :
 * les paramètres recipientType / recipientId ne servent plus qu'à remplir les objets renvoyés.
 * Les notifications sont créées uniquement par le serveur, à partir des événements métier.
 */
export const notificationService = {
  getParentNotifications(parentId: string, limit = 30): Promise<AppNotification[]> {
    return list('parent', parentId, limit);
  },

  getChildNotifications(childId: string, limit = 30): Promise<AppNotification[]> {
    return list('child', childId, limit);
  },

  async getUnreadCount(_recipientType?: 'parent' | 'child', _recipientId?: string): Promise<number> {
    try {
      return (await api<{ count: number }>('GET', '/v1/notifications/unread-count')).count ?? 0;
    } catch {
      return 0;
    }
  },

  async markAsRead(notificationId: string): Promise<void> {
    await api('POST', `/v1/notifications/${notificationId}/read`).catch(() => undefined);
  },

  async markAllRead(_recipientType?: 'parent' | 'child', _recipientId?: string): Promise<void> {
    await api('POST', '/v1/notifications/read-all').catch(() => undefined);
  },

  // ─── Jetons push ─────────────────────────────────────────
  /**
   * Un jeton appartient à un seul destinataire (repris si l'appareil change de compte) ;
   * l'environnement APNs est mémorisé (sandbox en développement).
   */
  async savePushToken(_userId: string, token: string, platform: 'ios' | 'android' | 'web', _childId?: string | null): Promise<void> {
    const environment = import.meta.env.DEV ? 'development' : 'production';
    devicePushToken.set(token);
    try {
      await api('POST', '/v1/push-tokens', { token, platform, environment });
    } catch (e) {
      console.warn('[NotificationService] Jeton push non enregistré :', e);
    }
  },

  async removePushToken(token: string): Promise<void> {
    await api('POST', '/v1/push-tokens/unregister', { token }).catch(() => undefined);
  },

  // ─── Suppression (5.13) ──────────────────────────────────
  async deleteNotification(notificationId: string): Promise<void> {
    await api('DELETE', `/v1/notifications/${notificationId}`).catch((e) => console.error('[NotificationService] delete failed:', e));
  },

  async deleteAllRead(_recipientType?: 'parent' | 'child', _recipientId?: string): Promise<void> {
    await api('POST', '/v1/notifications/remove-read').catch((e) => console.error('[NotificationService] deleteAllRead failed:', e));
  },

  // ─── Temps réel ──────────────────────────────────────────
  /** Nouvelle notification pour la session courante (WebSocket de l'API). */
  subscribeToNotifications(
    recipientType: 'parent' | 'child',
    recipientId: string,
    onNewNotification: (notification: AppNotification) => void,
  ) {
    return realtime.subscribe(async (id) => {
      if (!(await sessionStore.get())) return;
      const latest = await list(recipientType, recipientId, 10).catch(() => []);
      const n = latest.find((x) => x.id === id);
      if (n) onNewNotification(n);
    });
  },
};
