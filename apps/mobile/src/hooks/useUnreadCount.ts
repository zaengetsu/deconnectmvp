import { useEffect, useState, useCallback, useRef } from 'react';
import { notificationService } from '../features/notifications/notification.service';
import { useAuthStore } from '../stores/auth.store';
import { useAppStore } from '../stores/app.store';

/**
 * Compteur de notifications non lues, pour les pastilles des barres d'onglets.
 *
 * S'abonne au Realtime pour se mettre à jour sans polling, et nettoie son
 * canal au démontage (la limite Supabase est d'environ 100 canaux).
 */
export function useUnreadCount() {
  const { user } = useAuthStore();
  const { mode, selectedChild } = useAppStore();
  const [count, setCount] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const recipientType: 'parent' | 'child' = mode === 'child' && selectedChild ? 'child' : 'parent';
  const recipientId = mode === 'child' && selectedChild ? selectedChild.id : user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!recipientId) return;
    setCount(await notificationService.getUnreadCount(recipientType, recipientId));
  }, [recipientType, recipientId]);

  useEffect(() => {
    if (!recipientId) return;

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Chargement initial hors du corps synchrone de l'effet
    let cancelled = false;
    void (async () => {
      const initial = await notificationService.getUnreadCount(recipientType, recipientId);
      if (!cancelled) setCount(initial);
    })();

    unsubscribeRef.current = notificationService.subscribeToNotifications(
      recipientType,
      recipientId,
      () => setCount(prev => prev + 1),
    );

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [recipientType, recipientId]);

  return { count, refresh };
}
