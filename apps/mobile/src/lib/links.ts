import { Capacitor } from '@capacitor/core';

/**
 * Pages publiques du site Rekonect (portail partenaires) : politique de confidentialité et
 * support, accessibles depuis l'app comme l'exige l'App Store (5.1.1). Ouvertes dans le
 * navigateur du système, hors de la WebView.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://rekonectprodb8ee8651-partners.functions.fnc.fr-par.scw.cloud').replace(/\/$/, '');
export const PRIVACY_URL = `${SITE_URL}/confidentialite`;
export const SUPPORT_URL = `${SITE_URL}/support`;

export function openLink(url: string): void {
  if (Capacitor.isNativePlatform()) window.open(url, '_system');
  else window.open(url, '_blank', 'noopener');
}
