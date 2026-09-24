import type { HttpClient } from './client';
import type * as T from './types';

const q = encodeURIComponent;

/** Authentification commune aux deux portails. */
export function authApi(http: HttpClient) {
  return {
    async login(email: string, password: string) {
      const res = await http.request<T.AuthResult>('POST', '/v1/auth/login', { body: { email, password }, anonymous: true });
      http.setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      return res.user;
    },
    async acceptPartnerInvitation(token: string, fullName: string, password: string) {
      const res = await http.request<T.AuthResult>('POST', '/v1/auth/partner-invitations/accept', { body: { token, fullName, password }, anonymous: true });
      http.setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      return res.user;
    },
    forgotPassword: (email: string) => http.request<{ success: true }>('POST', '/v1/auth/password/forgot', { body: { email }, anonymous: true }),
    resetPassword: (token: string, password: string) => http.request<{ success: true }>('POST', '/v1/auth/password/reset', { body: { token, password }, anonymous: true }),
    me: async () => (await http.request<{ kind: 'user'; user: T.Me; partners?: { id: string; name: string; role: string }[] }>('GET', '/v1/auth/me')).user,
    async logout() {
      const s = http.session;
      try {
        if (s) await http.request('POST', '/v1/auth/logout', { body: { refreshToken: s.refreshToken } });
      } finally {
        http.setSession(null);
      }
    },
  };
}

export function adminApi(http: HttpClient) {
  const get = <R>(path: string, query?: Parameters<HttpClient['url']>[1]) => http.request<R>('GET', `/v1/admin${path}`, { query });
  const post = <R>(path: string, body?: unknown) => http.request<R>('POST', `/v1/admin${path}`, { body: body ?? {} });
  const patch = <R>(path: string, body: unknown) => http.request<R>('PATCH', `/v1/admin${path}`, { body });
  return {
    overview: (days: number) => get<T.AdminOverview>('/overview', { days }),
    activeFamilies: () => get<T.ActiveFamiliesMonth[]>('/overview/active-families'),
    topActivities: (days: number) => get<T.TopActivity[]>('/overview/top-activities', { days }),
    topRewards: (days: number) => get<T.TopReward[]>('/overview/top-rewards', { days }),
    navCounts: () => get<{ pendingOffers: number }>('/nav-counts'),
    search: (term: string) => get<T.SearchResults>('/search', { q: term }),

    activities: (query: { categoryId?: string; status?: string; q?: string; cursor?: string; limit?: number }) => get<T.AdminActivityList>('/activities', { limit: 20, ...query }),
    activity: (id: string) => get<T.AdminActivityDetail>(`/activities/${q(id)}`),
    createActivity: (input: T.AdminActivityInput) => post<T.AdminActivity>('/activities', input),
    updateActivity: (id: string, input: Partial<T.AdminActivityInput>) => patch<T.AdminActivity>(`/activities/${q(id)}`, input),
    importActivities: (csv: string) => post<{ created: number; errors: { line: number; message: string }[] }>('/activities/import', { csv }),
    reports: () => get<T.ActivityReport[]>('/activity-reports'),
    resolveReports: (activityId: string, resolution: string, status?: 'published' | 'archived') => post<{ success: true }>(`/activities/${q(activityId)}/resolve-reports`, { resolution, status }),
    categories: () => http.request<T.Category[]>('GET', '/v1/activity-categories'),

    rewards: () => get<T.CatalogRewards>('/rewards'),
    createReward: (input: { title: string; description?: string; requiredPoints: number; rewardCategory?: string }) => post<T.CatalogReward>('/rewards', input),
    updateReward: (id: string, input: Partial<{ title: string; description: string; requiredPoints: number; rewardCategory: string; isActive: boolean }>) => patch<T.CatalogReward>(`/rewards/${q(id)}`, input),

    moderation: () => get<T.ModerationItem[]>('/moderation/offers'),
    approveOffer: (id: string) => post<T.Offer>(`/moderation/offers/${q(id)}/approve`),
    rejectOffer: (id: string, reason: string) => post<T.Offer>(`/moderation/offers/${q(id)}/reject`, { reason }),
    requestOfferChanges: (id: string, note: string) => post<T.Offer>(`/moderation/offers/${q(id)}/request-changes`, { note }),

    familyStats: () => get<T.FamilyStats>('/families/stats'),
    families: (query: { q?: string; plan?: string; status?: string; cursor?: string; limit?: number }) => get<T.Page<T.AdminFamilyRow>>('/families', { limit: 25, ...query }),
    familiesCsv: (query: { q?: string; plan?: string; status?: string }) => http.download('/v1/admin/families.csv', query),
    family: (id: string) => get<T.AdminFamilyDetail>(`/families/${q(id)}`),
    familyPayments: (id: string) => get<{ invoices: T.Invoice[]; events: T.SubscriptionEventRow[] }>(`/families/${q(id)}/payments`),
    giftMonths: (id: string, months: number, planId: string) => post<{ compPlan: string; compUntil: string }>(`/families/${q(id)}/gift`, { months, planId }),
    resendLogin: (id: string) => post<{ success: true; email: string }>(`/families/${q(id)}/resend-login`),
    deleteFamily: (id: string, confirmEmail: string) => http.request<{ success: true }>('DELETE', `/v1/admin/families/${q(id)}`, { body: { confirmEmail } }),
    setUserDisabled: (id: string, disabled: boolean) => patch<{ success: true }>(`/users/${q(id)}/disabled`, { disabled }),

    billingOverview: () => get<T.BillingOverview>('/billing/overview'),
    billingEvents: () => get<T.SubscriptionEventRow[]>('/billing/events'),
    plans: (audience: 'family' | 'partner') => get<T.AdminPlan[]>('/plans', { audience }),
    updatePlan: (id: string, input: Partial<Pick<T.Plan, 'name' | 'tagline' | 'tag' | 'monthlyPriceCents' | 'annualPriceCents' | 'features' | 'isPublic' | 'isActive'>> & { limits?: Record<string, number | boolean | null> }) =>
      patch<T.Plan>(`/plans/${q(id)}`, input),
    promoCodes: () => get<T.PromoCode[]>('/promo-codes'),
    createPromoCode: (input: Record<string, unknown>) => post<T.PromoCode>('/promo-codes', input),
    setPromoActive: (id: string, isActive: boolean) => patch<{ success: true }>(`/promo-codes/${q(id)}`, { isActive }),

    partners: (term?: string) => get<T.AdminPartnerRow[]>('/partners', { q: term }),
    partnerStats: () => get<T.PartnerStats>('/partner-stats'),
    createPartner: (input: { name: string; kind: string; ownerEmail: string; planId: string; subtitle?: string; color?: string; status?: string; parentPartnerId?: string }) =>
      post<{ id: string; invitation: { url: string; email: string } }>('/partners', input),
    setPartnerStatus: (id: string, status: T.AdminPartnerRow['status']) => patch<{ id: string; status: string }>(`/partners/${q(id)}/status`, { status }),
  };
}

export function partnerApi(http: HttpClient) {
  const base = (id: string) => `/v1/partner/${q(id)}`;
  return {
    accounts: () => http.request<T.PartnerAccount[]>('GET', '/v1/partner-accounts'),
    detail: (id: string) => http.request<T.PartnerDetail>('GET', base(id)),
    update: (id: string, input: Record<string, unknown>) => http.request<T.PartnerDetail>('PATCH', base(id), { body: input }),
    dashboard: (id: string, days = 30) => http.request<T.PartnerDashboard>('GET', `${base(id)}/dashboard`, { query: { days } }),

    offers: (id: string, filter: { display?: string; kind?: string } = {}) => http.request<T.Offer[]>('GET', `${base(id)}/offers`, { query: filter }),
    storeOffers: (id: string) => http.request<T.Offer[]>('GET', `${base(id)}/store-offers`),
    offerStats: (offerId: string) =>
      http.request<{ views: number | null; unlocks: number | null; redemptions: number | null; redemptionRate: number | null; stockLeft: number | null; masked: boolean }>('GET', `/v1/partner-offers/${q(offerId)}/stats`),
    offer: (offerId: string) => http.request<T.Offer & { codesAvailable: number }>('GET', `/v1/partner-offers/${q(offerId)}`),
    createOffer: (id: string, input: T.OfferInput) => http.request<T.Offer>('POST', `${base(id)}/offers`, { body: input }),
    updateOffer: (offerId: string, input: Partial<T.OfferInput>) => http.request<T.Offer>('PATCH', `/v1/partner-offers/${q(offerId)}`, { body: input }),
    deleteOffer: (offerId: string) => http.request<{ success: true }>('DELETE', `/v1/partner-offers/${q(offerId)}`),
    submitOffer: (offerId: string) => http.request<T.Offer>('POST', `/v1/partner-offers/${q(offerId)}/submit`, { body: {} }),
    pauseOffer: (offerId: string) => http.request<T.Offer>('POST', `/v1/partner-offers/${q(offerId)}/pause`, { body: {} }),
    resumeOffer: (offerId: string) => http.request<T.Offer>('POST', `/v1/partner-offers/${q(offerId)}/resume`, { body: {} }),
    brandApprove: (offerId: string) => http.request<T.Offer>('POST', `/v1/partner-offers/${q(offerId)}/brand-approve`, { body: {} }),
    brandRequestChanges: (offerId: string, note: string) => http.request<T.Offer>('POST', `/v1/partner-offers/${q(offerId)}/brand-request-changes`, { body: { note } }),

    places: (id: string) => http.request<T.Place[]>('GET', `${base(id)}/places`),
    createPlace: (id: string, input: Omit<Partial<T.Place>, 'id'> & { name: string }) => http.request<T.Place>('POST', `${base(id)}/places`, { body: input }),
    updatePlace: (id: string, placeId: string, input: Partial<T.Place> & { isActive?: boolean }) => http.request<T.Place>('PATCH', `${base(id)}/places/${q(placeId)}`, { body: input }),
    createStore: (id: string, input: { name: string; address?: string; postalCode?: string; city?: string; latitude?: number; longitude?: number; managerName?: string; managerEmail: string }) =>
      http.request<{ id: string; invitation: { url: string } }>('POST', `${base(id)}/stores`, { body: input }),

    audience: (id: string) => http.request<T.AudienceZones>('GET', `${base(id)}/audience`),
    estimate: (id: string, t: { targetType: string; placeId?: string; radiusKm?: number; postalCodes?: string[]; promoCodeId?: string; minAge?: number; maxAge?: number }) =>
      http.request<T.AudienceCounts>('GET', `${base(id)}/audience/estimate`, { query: t }),
    accessCodes: (id: string) => http.request<T.PromoCode[]>('GET', `${base(id)}/access-codes`),

    redemptions: (id: string) => http.request<T.Redemption[]>('GET', `${base(id)}/redemptions`),
    redemptionsCsv: (id: string) => http.download(`${base(id)}/redemptions.csv`),
    verify: (id: string, input: { code: string; redeem: boolean; placeId?: string; basketAmountCents?: number }) =>
      http.request<T.VerifyResult>('POST', `${base(id)}/redemptions/verify`, { body: input }),

    invite: (id: string, input: { email: string; role: T.PartnerRole; title?: string }) => http.request<{ memberId: string; url: string }>('POST', `${base(id)}/members`, { body: input }),
    updateMember: (id: string, memberId: string, input: { role?: T.PartnerRole; title?: string | null }) => http.request('PATCH', `${base(id)}/members/${q(memberId)}`, { body: input }),
    revokeMember: (id: string, memberId: string) => http.request<{ success: true }>('DELETE', `${base(id)}/members/${q(memberId)}`),

    billing: (id: string) => http.request<T.BillingSummary>('GET', `${base(id)}/billing`),
    plans: () => http.request<T.Plan[]>('GET', '/v1/billing/plans', { query: { audience: 'partner' } }),
    checkout: (id: string, planId: string, interval: 'month' | 'year') => http.request<{ url?: string }>('POST', `${base(id)}/billing/checkout`, { body: { planId, interval } }),
    portal: (id: string) => http.request<{ url: string }>('POST', `${base(id)}/billing/portal`, { body: {} }),

    uploadImage: (id: string, dataUrl: string) => http.request<{ id: string; url: string }>('POST', `${base(id)}/media`, { body: { dataUrl } }),
    categories: () => http.request<T.Category[]>('GET', '/v1/activity-categories'),
    activities: (query: { categoryId?: string; q?: string } = {}) => http.request<{ id: string; title: string; categoryId: string | null }[]>('GET', '/v1/activities', { query: { origin: 'catalog', ...query } }),
  };
}
