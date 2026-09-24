import { api } from '../../lib/api';

export interface VoucherClaim {
  id: string;
  status: 'unlocked' | 'redeemed' | 'expired' | 'cancelled';
  code: string | null;
  qrPayload: string | null;
  unlockedAt: string;
  redeemedAt: string | null;
  expiresAt: string | null;
  child: { id: string; displayName: string } | null;
  offer: {
    id: string;
    title: string;
    description: string | null;
    terms: string | null;
    discountLabel: string | null;
    imageUrl: string | null;
    endsAt: string | null;
    redemptionMethod: 'qr' | 'online_code' | 'reception';
    partner: { name: string; logoUrl: string | null; websiteUrl: string | null; color: string };
  };
}

export interface VoucherProgress {
  offerId: string;
  title: string;
  partner: { name: string; color: string; logoUrl: string | null };
  condition: string;
  done: number;
  target: number;
  percent: number;
  endsAt: string | null;
}

/** Portefeuille de bons partenaires de la famille. */
export const offersService = {
  claims: () => api<VoucherClaim[]>('GET', '/v1/offer-claims'),
  progress: () => api<VoucherProgress[]>('GET', '/v1/offer-progress'),
  markUsed: (claimId: string) => api<unknown>('POST', `/v1/offer-claims/${claimId}/redeem`, {}),
  impression: (offerId: string) => api<unknown>('POST', `/v1/offers/${offerId}/impression`, {}).catch(() => undefined),

  /** Consentement aux avantages partenaires (désactivé par défaut) + localisation approximative. */
  async consent(): Promise<boolean> {
    const prefs = await api<{ partnerOffers?: boolean }>('GET', '/v1/notification-preferences');
    return !!prefs?.partnerOffers;
  },
  async setConsent(enabled: boolean, postalCode?: string) {
    if (enabled && postalCode) {
      const place = await locatePostalCode(postalCode);
      await api('PATCH', '/v1/profile', { postalCode, ...(place ? { city: place.city, latitude: place.lat, longitude: place.lng } : {}) });
    }
    await api('PUT', '/v1/notification-preferences', { partnerOffers: enabled });
  },
};

/** Centre de la commune (Base adresse nationale) : suffisant pour le ciblage « à moins de 15 km ». */
export async function locatePostalCode(postalCode: string, fetchFn: typeof fetch = fetch): Promise<{ city: string; lat: number; lng: number } | null> {
  if (!/^\d{5}$/.test(postalCode)) return null;
  try {
    const res = await fetchFn(`https://api-adresse.data.gouv.fr/search/?q=${postalCode}&type=municipality&limit=1`);
    const body = (await res.json()) as { features?: { properties: { city: string }; geometry: { coordinates: [number, number] } }[] };
    const f = body.features?.[0];
    return f ? { city: f.properties.city, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : null;
  } catch {
    return null;
  }
}
