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
    StatusBar: {
      style: 'DARK',           // white icons on dark bg
      backgroundColor: '#0f0e17',
      overlaysWebView: false,
    },
  },

  // ─── iOS specific ────────────────────────────────────────
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: false,       // Ionic handles its own scroll
    backgroundColor: '#0f0e17',
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
