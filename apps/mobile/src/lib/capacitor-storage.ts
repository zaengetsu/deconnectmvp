import { Preferences } from '@capacitor/preferences';
import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Capacitor-safe storage adapter for Supabase auth.
 *
 * On native iOS/Android, localStorage is unreliable inside a Capacitor WebView
 * (it can be cleared by the OS between app launches). This adapter persists the
 * Supabase session token via @capacitor/preferences instead, which maps to
 * NSUserDefaults on iOS and SharedPreferences on Android.
 */
export const capacitorStorage: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key });
      // If Preferences returns null, fall back to plain localStorage.
      // This covers sessions stored before the Capacitor adapter was added
      // (Supabase stores directly under the key, Preferences uses a prefix on web).
      if (value !== null) return value;
      return localStorage.getItem(key);
    } catch {
      return localStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await Preferences.set({ key, value });
    } catch {
      localStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await Preferences.remove({ key });
    } catch {
      localStorage.removeItem(key);
    }
  },
};
