import { Capacitor } from '@capacitor/core';

/**
 * Achat et gestion de l'abonnement dans l'app : partout sauf sur iOS. Apple impose l'achat
 * intégré pour un abonnement numérique et interdit d'orienter vers un paiement externe
 * (App Store Review Guidelines 3.1.1 et 3.1.3) ; sur iOS, l'écran « Mon abonnement » reste en
 * lecture seule (plan et limites) et un plan pris ailleurs reste reconnu.
 */
export const BILLING_IN_APP = Capacitor.getPlatform() !== 'ios';
