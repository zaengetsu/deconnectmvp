import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.deconnect.mvp',
  appName: 'Deconnect',
  webDir: 'dist',

  // ─── Server (dev only — comment out for production builds) ──
  // server: {
  //   url: 'http://192.168.x.x:5173',
  //   cleartext: true,
  // },

  plugins: {
    // ─── Splash Screen ──────────────────────────────────────
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f0e17',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    // ─── Push Notifications ─────────────────────────────────
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // ─── Status Bar ─────────────────────────────────────────
    // overlaysWebView: true → la WebView s'étend SOUS la status bar et le
    // Dynamic Island, exactement comme les apps natives plein écran.
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },

  // ─── iOS specific ────────────────────────────────────────
  ios: {
    // contentInset: 'never' → on laisse Ionic/CSS gérer les safe areas
    // via env(safe-area-inset-*) plutôt que de forcer un inset natif
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: false,
    preferredContentMode: 'mobile',
  },

  // ─── Android specific ────────────────────────────────────
  android: {
    backgroundColor: '#0f0e17',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true for dev if needed
  },
};

export default config;
