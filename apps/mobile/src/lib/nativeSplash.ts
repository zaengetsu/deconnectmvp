import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Splash natif (iOS/Android) — un seul splash visible.
 *
 * Le splash natif reste affiché (`launchAutoHide: false`) jusqu'à ce que la
 * session soit prête, puis disparaît en fondu au-dessus du premier vrai écran.
 * Avant, il se masquait seul au bout de 1,5 s et laissait apparaître le splash
 * React (logo à une autre échelle) : l'utilisateur voyait deux splashs.
 */
let hidden = false;

export function hideNativeSplash(): void {
  if (hidden || !Capacitor.isNativePlatform()) return;
  hidden = true;
  void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {
    /* plugin absent : rien à masquer */
  });
}

/** Filet de sécurité : jamais bloqué sur le splash natif si l'init échoue. */
export function armNativeSplashFallback(ms = 7000): void {
  if (!Capacitor.isNativePlatform()) return;
  window.setTimeout(hideNativeSplash, ms);
}

/** Réinitialisation pour les tests. */
export function __resetNativeSplash(): void {
  hidden = false;
}
