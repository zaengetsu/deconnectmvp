import { api } from '../../lib/api';

export interface FamilyPlan {
  id: 'free' | 'family' | 'family_plus';
  name: string;
  tagline: string | null;
  tag: string | null;
  color: string;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  features: string[];
  limits: Record<string, number | boolean | null>;
}

export interface FamilySubscription {
  plan: { id: string; name: string; color: string; monthlyPriceCents: number | null; annualPriceCents: number | null; features: string[] };
  limits: Record<string, number | boolean | null>;
  usage: { children?: number; customActivities?: number; coParents?: number };
  source: 'paid' | 'comp' | 'free' | string;
  status: string;
  interval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  compUntil: string | null;
  hasPaymentMethod: boolean;
  paymentsEnabled: boolean;
}

export interface Invoice {
  id: string;
  number: string | null;
  amountPaidCents: number;
  amountDueCents: number;
  status: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
  periodStart: string | null;
  issuedAt: string;
}

/** Abonnement de la famille (plans, paiement Stripe, codes). */
export const billingService = {
  plans: () => api<FamilyPlan[]>('GET', '/v1/billing/plans?audience=family'),
  subscription: () => api<FamilySubscription>('GET', '/v1/billing/subscription'),
  invoices: () => api<Invoice[]>('GET', '/v1/billing/invoices'),
  /** Premier abonnement : renvoie l'URL de paiement Stripe. */
  checkout: (planId: string, interval: 'month' | 'year', promoCode?: string) => api<{ url: string }>('POST', '/v1/billing/checkout', { planId, interval, ...(promoCode ? { promoCode } : {}) }),
  /** Abonné : changement immédiat (au prorata). */
  changePlan: (planId: string, interval: 'month' | 'year') => api<unknown>('POST', '/v1/billing/change-plan', { planId, interval }),
  portal: () => api<{ url: string }>('POST', '/v1/billing/portal', {}),
  cancel: () => api<unknown>('POST', '/v1/billing/cancel', {}),
  resume: () => api<unknown>('POST', '/v1/billing/resume', {}),
  /** Code offert (CSE, mairie, mois gratuits). */
  redeem: (code: string) =>
    api<{ kind: 'comp'; code: string; planId: string; compUntil: string; sponsor: string | null } | { kind: 'discount'; code: string; description: string; percentOff: number | null; amountOffCents: number | null; planId: string | null }>('POST', '/v1/billing/redeem', { code }),
};

export const euros = (cents: number | null | undefined) => (cents == null ? '—' : `${(cents / 100).toFixed(cents % 100 ? 2 : 0).replace('.', ',')} €`);
