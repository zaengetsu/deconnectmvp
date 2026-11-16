import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route } from 'react-router-dom';

// Sur iOS, pas d'achat hors App Store (Review Guidelines 3.1.1 / 3.1.3) : plan et limites seulement.
const { billing } = vi.hoisted(() => ({
  billing: {
    subscription: vi.fn().mockResolvedValue({
      plan: { id: 'family', name: 'Famille', color: '#3C41A8', monthlyPriceCents: 499, annualPriceCents: 4900, features: [] },
      limits: { maxChildren: 4, maxCustomActivities: null, maxCoParents: 1 },
      usage: { children: 2, customActivities: 3, coParents: 0 },
      source: 'stripe', status: 'past_due', interval: 'month', currentPeriodEnd: '2026-12-15T00:00:00Z', cancelAtPeriodEnd: false, compUntil: null, hasPaymentMethod: true, paymentsEnabled: true,
    }),
    plans: vi.fn().mockResolvedValue([{ id: 'premium', name: 'Premium', tagline: null, tag: null, color: '#FF9469', monthlyPriceCents: 999, annualPriceCents: 9900, features: ['Illimité'], limits: {} }]),
    invoices: vi.fn().mockResolvedValue([{ id: 'in_1', periodStart: '2026-11-01', issuedAt: '2026-11-01', amountPaidCents: 499, amountDueCents: 499, pdfUrl: 'https://pay.stripe.com/x' }]),
  },
}));

vi.mock('@capacitor/core', async () => {
  const actual = await vi.importActual<typeof import('@capacitor/core')>('@capacitor/core');
  return { ...actual, Capacitor: { ...actual.Capacitor, getPlatform: () => 'ios', isNativePlatform: () => true } };
});
vi.mock('../features/billing/billing.service', async () => ({ ...(await vi.importActual<object>('../features/billing/billing.service')), billingService: billing }));
vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual<typeof import('@ionic/react')>('@ionic/react');
  return {
    ...actual,
    IonPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    IonContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useIonViewWillEnter: () => {},
    useIonRouter: () => ({ canGoBack: () => false, goBack: vi.fn(), push: vi.fn() }),
  };
});

import SubscriptionPage from '../pages/parent/SubscriptionPage';
import { RkShell } from '../components/rk/RkShell';

describe('Mon abonnement sur iOS', () => {
  it('affiche le plan et les limites, sans prix, paiement, code ni factures', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/parent/subscription']}>
          <RkShell space="parent">
            <Route path="/parent/subscription"><SubscriptionPage /></Route>
          </RkShell>
        </MemoryRouter>,
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const text = host.textContent ?? '';
    expect(text).toContain('Famille');
    expect(text).toContain('Profils enfants');
    expect(text).toContain('Plan et limites de la famille');
    for (const absent of ['€', 'Premium', 'paiement', 'Moyen de paiement', 'Résilier', 'J’ai un code', 'Factures', 'PDF', 'Choisir', 'Passer à']) {
      expect(text).not.toContain(absent);
    }
    act(() => root.unmount());
  });
});
