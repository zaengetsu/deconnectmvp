import { useEffect, useState, useCallback, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { pushService } from '../features/notifications/push.service';
import { notificationService, type AppNotification } from '../features/notifications/notification.service';
import { useAuthStore } from '../stores/auth.store';
import { useAppStore } from '../stores/app.store';

/**
 * usePushNotifications
 * - Registers push tokens (native) and saves to DB
 * - Subscribes to real-time in-app notifications
 * - Provides toast state for in-app notification banners
 *
 * IMPORTANT: Uses a ref to track the active Realtime channel unsubscribe
 * function, ensuring we never accumulate stale channels. Accumulated
 * channels eventually exhaust the Supabase Realtime connection limit
 * (~100 channels), after which ALL data fetching stops working.
 */
export function usePushNotifications() {
  const { user } = useAuthStore();
  const { selectedChild, mode } = useAppStore();
  const history = useHistory();
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Track the active unsubscribe function so we can clean up properly
  const unsubscribeRef = useRef<(() => void) | null>(null);
  // Track push init to avoid re-registering
  const pushInitializedRef = useRef(false);

  // Refresh unread count
  const refreshUnread = useCallback(async () => {
    if (mode === 'child' && selectedChild) {
      const count = await notificationService.getUnreadCount('child', selectedChild.id);
      setUnreadCount(count);
    } else if (user) {
      const count = await notificationService.getUnreadCount('parent', user.id);
      setUnreadCount(count);
    }
  }, [user, selectedChild, mode]);

  // Push token registration — only once per app lifecycle
  useEffect(() => {
    if (!user || pushInitializedRef.current) return;
    pushInitializedRef.current = true;

    pushService.initialize(
      (notification) => {
        console.info('[Push] Foreground:', notification.title);
      },
      (action) => {
        const data = action.notification.data as Record<string, string>;
        if (data?.route) history.push(data.route);
      }
    ).then((token) => {
      if (token) {
        const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
        notificationService.savePushToken(user.id, token, platform);
        console.info('[Push] Token saved');
      }
    });

    return () => {
      pushService.cleanup();
      pushInitializedRef.current = false;
    };
  }, [user]);

  // Realtime subscription — re-subscribe only when recipient changes
  useEffect(() => {
    if (!user) return;

    const recipientType = mode === 'child' && selectedChild ? 'child' : 'parent';
    const recipientId = mode === 'child' && selectedChild ? selectedChild.id : user.id;

    // Clean up the PREVIOUS channel BEFORE creating a new one
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    let mounted = true;

    const unsubscribe = notificationService.subscribeToNotifications(
      recipientType,
      recipientId,
      (notification) => {
        if (!mounted) return;
        setToast(notification);
        setUnreadCount(prev => prev + 1);
        setTimeout(() => { if (mounted) setToast(null); }, 5000);
      }
    );

    unsubscribeRef.current = unsubscribe;

    // Initial unread count
    refreshUnread();

    return () => {
      mounted = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user?.id, selectedChild?.id, mode]);

  const dismissToast = useCallback(() => setToast(null), []);

  const navigateToNotification = useCallback((notification: AppNotification) => {
    if (notification.route) {
      history.push(notification.route);
    }
    notificationService.markAsRead(notification.id);
    setToast(null);
    refreshUnread();
  }, [history, refreshUnread]);

  return { toast, unreadCount, dismissToast, navigateToNotification, refreshUnread };
}

