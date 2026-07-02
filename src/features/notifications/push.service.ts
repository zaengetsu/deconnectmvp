import { PushNotifications, type Token, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export type NotificationHandler = (notification: PushNotificationSchema) => void;
export type NotificationActionHandler = (action: ActionPerformed) => void;

export const pushService = {
  /**
   * Initialize push notifications.
   * Call once after login — registers device and sets up listeners.
   */
  async initialize(
    onNotification?: NotificationHandler,
    onAction?: NotificationActionHandler
  ): Promise<string | null> {
    // Only works on native platforms
    if (!Capacitor.isNativePlatform()) {
      console.info('[PushService] Skipping — not a native platform');
      return null;
    }

    try {
      // Request permission
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.warn('[PushService] Push permission denied');
        return null;
      }

      // Register with FCM (Android) or APNs (iOS).
      // On Android this requires google-services.json + Firebase configured.
      // If Firebase is not initialized, this throws — caught gracefully below.
      await PushNotifications.register();

      return new Promise((resolve) => {
        PushNotifications.addListener('registration', (token: Token) => {
          console.info('[PushService] Device token:', token.value);
          resolve(token.value);
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('[PushService] Registration error:', err);
          resolve(null);
        });

        if (onNotification) {
          PushNotifications.addListener('pushNotificationReceived', onNotification);
        }

        if (onAction) {
          PushNotifications.addListener('pushNotificationActionPerformed', onAction);
        }
      });

    } catch (err) {
      // Firebase not configured (missing google-services.json on Android).
      // App continues to work — push notifications simply unavailable.
      console.warn('[PushService] Push unavailable — Firebase not configured:', err);
      return null;
    }
  },


  /**
   * Remove all push notification listeners.
   * Call on logout.
   */
  async cleanup(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await PushNotifications.removeAllListeners();
  },

  /**
   * Check if push notifications are supported on this platform.
   */
  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  },
};
