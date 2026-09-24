import { useCallback } from 'react';
import { useIonRouter } from '@ionic/react';
import { useSwipe } from './useSwipe';

/**
 * Retour fiable : on remonte la pile Ionic quand elle existe, sinon on va
 * explicitement à l'écran parent (avec une animation de retour). Ne laisse
 * jamais un bouton « ← » sans effet — après un rechargement, un lien profond
 * ou une notification, la pile peut être vide.
 */
export function useRkBack(fallback: string) {
  const router = useIonRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.goBack();
    else router.push(fallback, 'back', 'replace');
  }, [router, fallback]);
}

/** Glisser vers la droite = retour (à poser sur la racine d'un écran hors onglets). */
export function useBackSwipe(back: () => void) {
  return useSwipe({ onRight: () => { back(); return true; } });
}

/** Écran parent logique de chaque route — pour le retour au doigt et le repli. */
export function parentOf(pathname: string): string | null {
  const rules: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
    [/^\/parent\/children\/([^/]+)\/assign$/, m => `/parent/children/${m[1]}`],
    [/^\/parent\/children\/[^/]+$/, '/parent/children'],
    [/^\/parent\/create-child$/, '/parent/children'],
    [/^\/parent\/activities$/, '/parent/dashboard'],
    [/^\/parent\/create-activity$/, '/parent/activities'],
    [/^\/parent\/create-reward$/, '/parent/rewards'],
    [/^\/parent\/settings$/, '/parent/dashboard'],
    [/^\/parent\/(account|notification-preferences)$/, '/parent/settings'],
    [/^\/parent\/notifications$/, '/parent/dashboard'],
    [/^\/child\/(points|notifications)$/, '/child/home'],
    [/^\/family$/, '/parent/settings'],
  ];
  for (const [re, to] of rules) {
    const m = pathname.match(re);
    if (m) return typeof to === 'function' ? to(m) : to;
  }
  return null;
}
