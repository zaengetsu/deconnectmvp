import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route } from 'react-router-dom';

const { billing, offers } = vi.hoisted(() => {
const sub = {
  plan: { id: 'free', name: 'Gratuit', color: '#B9BCE8', monthlyPriceCents: 0, annualPriceCents: 0, features: [] },
  limits: { maxChildren: 1, maxCustomActivities: 5, maxCoParents: 0 },
  usage: { children: 1, customActivities: 2, coParents: 0 },
  source: 'free', status: 'active', interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, compUntil: null, hasPaymentMethod: false, paymentsEnabled: true,
};
const plans = [
  { id: 'free', name: 'Gratuit', tagline: null, tag: null, color: '#B9BCE8', monthlyPriceCents: 0, annualPriceCents: 0, features: ['1 enfant'], limits: {} },
  { id: 'family', name: 'Famille', tagline: null, tag: 'LE PLUS CHOISI', color: '#3C41A8', monthlyPriceCents: 499, annualPriceCents: 4900, features: ["Jusqu'à 4 enfants"], limits: {} },
];
const billing = {
  subscription: vi.fn().mockResolvedValue(sub),
  plans: vi.fn().mockResolvedValue(plans),
  invoices: vi.fn().mockResolvedValue([]),
  checkout: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/1' }),
  changePlan: vi.fn(),
  portal: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
  redeem: vi.fn().mockResolvedValue({ kind: 'comp', code: 'CSE-AIRBUS', planId: 'family', compUntil: '2027-09-24T00:00:00Z', sponsor: 'CSE Airbus' }),
};
const claim = {
  id: 'cl1', status: 'unlocked', code: 'RK4M-82QA', qrPayload: 'rekonect:voucher:RK4M-82QA', unlockedAt: '2026-09-20', redeemedAt: null, expiresAt: null,
  child: { id: 'k', displayName: 'Emma' },
  offer: { id: 'o', title: '−10 % rayon cycles', description: null, terms: 'Valable en magasin', discountLabel: '−10 %', imageUrl: null, endsAt: null, redemptionMethod: 'qr', partner: { name: 'Decathlon', logoUrl: null, websiteUrl: null, color: '#3FA0C9' } },
};
const offers = {
  consent: vi.fn().mockResolvedValue(true),
  claims: vi.fn().mockResolvedValue([claim]),
  progress: vi.fn().mockResolvedValue([{ offerId: 'o2', title: 'Gourde offerte', partner: { name: 'Decathlon', color: '#3FA0C9', logoUrl: null }, condition: '5 activités Sport', done: 3, target: 5, percent: 60, endsAt: null }]),
  setConsent: vi.fn(),
  markUsed: vi.fn(),
};
  return { billing, offers };
});

vi.mock('../features/billing/billing.service', async () => ({ ...(await vi.importActual<object>('../features/billing/billing.service')), billingService: billing }));
vi.mock('../features/offers/offers.service', async () => ({ ...(await vi.importActual<object>('../features/offers/offers.service')), offersService: offers }));
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
import VouchersPage from '../pages/parent/VouchersPage';
import { RkShell } from '../components/rk/RkShell';

async function mount(ui: React.ReactElement, path: string, route = path) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <RkShell space="parent">
          <Route path={route}>{ui}</Route>
        </RkShell>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const click = async (text: string) => {
    const el = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    if (!el) throw new Error(`Bouton introuvable : ${text}`);
    await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
  };
  return { host, root, click };
}

describe('Mon abonnement', () => {
  it('plan actuel, limites, choix d’un plan (paiement Stripe), code CSE', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true });
    const { host, root, click } = await mount(<SubscriptionPage />, '/parent/subscription?checkout=success', '/parent/subscription');
    const text = host.textContent ?? '';
    expect(text).toContain('Mon abonnement');
    expect(text).toContain('Votre abonnement est activé');
    expect(text).toContain('Profils enfants');
    expect(text).toContain('1 / 1');
    expect(text).toContain('4,99 €');
    await click('Choisir Famille');
    expect(billing.checkout).toHaveBeenCalledWith('family', 'month');
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/1');
    await click('Annuel');
    expect(host.textContent).toContain('49 €');
    await click('J’ai un code (CSE, mairie, offre)');
    const input = host.querySelector('input[aria-label="Code"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'cse-airbus');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Utiliser ce code');
    expect(billing.redeem).toHaveBeenCalledWith('CSE-AIRBUS');
    expect(host.textContent).toContain('offert par CSE Airbus');
    root.unmount();
  });
});

describe('Bons & avantages', () => {
  it('bon à utiliser avec QR code, progression, lien profond vers un bon', async () => {
    const { host, root, click } = await mount(<VouchersPage />, '/parent/offers/cl1', '/parent/offers/:claimId');
    const text = host.textContent ?? '';
    expect(text).toContain('−10 % rayon cycles');
    expect(text).toContain('Grâce à Emma');
    expect(text).toContain('3 / 5 activités');
    expect(host.querySelector('svg[aria-label="QR code du bon RK4M-82QA"]')).not.toBeNull();
    expect(text).toContain('RK4M-82QA');
    root.unmount();
    offers.consent.mockResolvedValueOnce(false);
    const second = await mount(<VouchersPage />, '/parent/vouchers');
    expect(second.host.textContent).toContain('Activer les avantages partenaires');
    const card = [...second.host.querySelectorAll('button')].find((b) => b.textContent?.includes('Voir le bon'))!;
    await act(async () => { card.click(); });
    expect(second.host.querySelector('svg[aria-label="QR code du bon RK4M-82QA"]')).not.toBeNull();
    second.root.unmount();
    void click;
  });
});
