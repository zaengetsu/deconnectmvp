import { useEffect, useState, useCallback } from 'react';
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
 */
export function usePushNotifications() {
  const { user } = useAuthStore();
  const { selectedChild, mode } = useAppStore();
  const history = useHistory();
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

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

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    // 1) Register push token on native
    pushService.initialize(
      (notification) => {
        if (!mounted) return;
        console.info('[Push] Foreground:', notification.title);
      },
      (action) => {
        if (!mounted) return;
        const data = action.notification.data as Record<string, string>;
        if (data?.route) history.push(data.route);
      }
    ).then((token) => {
      if (token && mounted) {
        const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
        notificationService.savePushToken(user.id, token, platform);
        console.info('[Push] Token saved');
      }
    });

    // 2) Subscribe to real-time notifications
    const recipientType = mode === 'child' && selectedChild ? 'child' : 'parent';
    const recipientId = mode === 'child' && selectedChild ? selectedChild.id : user.id;

    const unsubscribe = notificationService.subscribeToNotifications(
      recipientType,
      recipientId,
      (notification) => {
        if (!mounted) return;
        // Show toast
        setToast(notification);
        setUnreadCount(prev => prev + 1);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          if (mounted) setToast(null);
        }, 5000);
      }
    );

    // 3) Initial unread count
    refreshUnread();

    return () => {
      mounted = false;
      unsubscribe();
      pushService.cleanup();
    };
  }, [user, selectedChild, mode]);

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
