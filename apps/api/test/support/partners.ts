import { randomUUID } from 'node:crypto';
import { auth, createAdmin, uniqueEmail } from './fixtures';
import type { Harness } from './harness';

export const LYON = { lat: 45.7606, lng: 4.8594 }; // Part-Dieu
export const VILLEURBANNE = { lat: 45.7719, lng: 4.8902 };
export const PARIS = { lat: 48.8698, lng: 2.3247 };

export interface PartnerSession {
  token: string;
  partnerId: string;
  userId: string;
  email: string;
}

/** Accepte une invitation à partir de l'URL renvoyée par l'API. */
export async function acceptInvitation(h: Harness, url: string, fullName = 'Julie Bernard'): Promise<{ token: string; userId: string }> {
  const token = decodeURIComponent(new URL(url).searchParams.get('token')!);
  const res = await h.http.post('/v1/auth/partner-invitations/accept').send({ token, fullName, password: 'mot-de-passe-pro' }).expect(200);
  return { token: res.body.accessToken, userId: res.body.user.id };
}

/** Partenaire créé par l'admin Rekonect, responsable invité et connecté. */
export async function createPartner(
  h: Harness,
  opts: { name?: string; kind?: string; planId?: 'partner_local' | 'partner_network' | 'partner_public'; adminToken?: string } = {},
): Promise<PartnerSession & { adminToken: string }> {
  const adminToken = opts.adminToken ?? (await createAdmin(h)).token;
  const email = uniqueEmail('partner');
  const res = await h.http
    .post('/v1/admin/partners')
    .set(auth(adminToken))
    .send({ name: opts.name ?? 'Decathlon France', kind: opts.kind ?? 'brand', ownerEmail: email, planId: opts.planId ?? 'partner_network', color: '#3FA0C9' })
    .expect(201);
  const session = await acceptInvitation(h, res.body.invitation.url);
  return { token: session.token, userId: session.userId, partnerId: res.body.id, email, adminToken };
}

/**
 * Famille insérée directement en base (rapide) : pour les volumes d'audience.
 * consent = a accepté les offres partenaires.
 */
export async function seedFamily(
  h: Harness,
  opts: { at?: { lat: number; lng: number } | null; postalCode?: string; consent?: boolean; plan?: 'free' | 'family' | 'family_plus'; ages?: number[]; activeRecently?: boolean } = {},
) {
  const id = randomUUID();
  const email = `seed.${id}@test.rekonect.app`;
  await h.prisma.user.create({ data: { id, email, role: 'parent' } });
  await h.prisma.profile.create({ data: { id, email, fullName: 'Parent Test', latitude: opts.at?.lat ?? null, longitude: opts.at?.lng ?? null, postalCode: opts.postalCode ?? null } });
  await h.prisma.notificationPreference.create({ data: { parentId: id, partnerOffers: opts.consent ?? true } });
  const plan = opts.plan ?? 'free';
  await h.prisma.subscription.create({ data: { parentId: id, plan, status: 'active', amountCents: plan === 'free' ? 0 : plan === 'family' ? 499 : 799 } });
  const children = [];
  for (const age of opts.ages ?? [9]) {
    children.push(await h.prisma.child.create({ data: { parentId: id, displayName: `Enfant ${age}`, age } }));
  }
  if (opts.activeRecently) {
    const activity = await h.prisma.activity.findFirstOrThrow({ where: { activityType: 'catalog' } });
    await h.prisma.childActivity.create({ data: { childId: children[0].id, activityId: activity.id, status: 'validated', validatedAt: h.clock.now() } });
  }
  return { parentId: id, children };
}

/** Consentement + localisation d'une vraie famille (API). */
export async function optIn(h: Harness, parentToken: string, at: { lat: number; lng: number } | null = LYON, postalCode = '69003') {
  await h.http.put('/v1/notification-preferences').set(auth(parentToken)).send({ partnerOffers: true }).expect(200);
  await h.http.patch('/v1/profile').set(auth(parentToken)).send({ latitude: at?.lat ?? null, longitude: at?.lng ?? null, postalCode }).expect(200);
}

export async function createPlace(h: Harness, p: PartnerSession, name = 'Decathlon Lyon Part-Dieu', at = LYON) {
  const res = await h.http
    .post(`/v1/partner/${p.partnerId}/places`)
    .set(auth(p.token))
    .send({ name, address: '17 rue du Dr Bouchut', postalCode: '69003', city: 'Lyon', latitude: at.lat, longitude: at.lng, managerName: 'Karim B.' })
    .expect(201);
  return res.body.id as string;
}

/** Crée, soumet et fait approuver une offre ; renvoie l'offre publiée. */
export async function publishOffer(h: Harness, p: PartnerSession & { adminToken: string }, body: Record<string, unknown>) {
  const created = await h.http.post(`/v1/partner/${p.partnerId}/offers`).set(auth(p.token)).send(body).expect(201);
  await h.http.post(`/v1/partner-offers/${created.body.id}/submit`).set(auth(p.token)).expect(200);
  const approved = await h.http.post(`/v1/admin/moderation/offers/${created.body.id}/approve`).set(auth(p.adminToken)).expect(200);
  return approved.body;
}
