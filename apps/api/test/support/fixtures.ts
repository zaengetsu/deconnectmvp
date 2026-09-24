import type { Harness } from './harness';

let seq = 0;
export const uniqueEmail = (prefix = 'parent') => `${prefix}.${Date.now()}.${++seq}@test.rekonect.app`;

export interface ParentSession {
  token: string;
  refreshToken: string;
  userId: string;
  email: string;
}

export interface ChildSession {
  token: string;
  refreshToken: string;
  childId: string;
  parentId: string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Donne à la famille un plan payant actif (sans passer par Stripe). */
export async function setFamilyPlan(h: Harness, parentId: string, plan: 'free' | 'family' | 'family_plus' = 'family_plus') {
  const amount = { free: 0, family: 499, family_plus: 799 }[plan];
  await h.prisma.subscription.updateMany({ where: { parentId }, data: { plan, status: 'active', amountCents: amount } });
}

export async function registerParent(h: Harness, fullName = 'Camille Martin'): Promise<ParentSession> {
  const email = uniqueEmail();
  const res = await h.http.post('/v1/auth/register').send({ email, password: 'motdepasse-solide', fullName }).expect(201);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, userId: res.body.user.id, email };
}

export async function createChild(h: Harness, parent: ParentSession, displayName = 'Emma', age = 10): Promise<string> {
  const res = await h.http.post('/v1/children').set(auth(parent.token)).send({ displayName, age }).expect(201);
  return res.body.id;
}

/** Relie l'appareil de l'enfant via le code court et renvoie la session enfant. */
export async function linkChild(h: Harness, parent: ParentSession, childId: string, pin = '1234'): Promise<ChildSession> {
  const code = await h.http.post(`/v1/children/${childId}/link-code`).set(auth(parent.token)).expect(201);
  const res = await h.http.post('/v1/auth/child/link').send({ code: code.body.code, pin, deviceId: 'device-1' }).expect(200);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, childId, parentId: parent.userId };
}

export async function familyWithChild(h: Harness, opts: { name?: string; age?: number } = {}) {
  const parent = await registerParent(h);
  const childId = await createChild(h, parent, opts.name ?? 'Emma', opts.age ?? 10);
  const child = await linkChild(h, parent, childId);
  return { parent, child, childId };
}

export async function catalogActivity(h: Harness, filter: { minAge?: number } = {}) {
  const a = await h.prisma.activity.findFirst({
    where: { activityType: 'catalog', isActive: true, ...(filter.minAge != null ? { minAge: { lte: filter.minAge }, maxAge: { gte: filter.minAge } } : {}) },
    orderBy: { title: 'asc' },
  });
  if (!a) throw new Error('Catalogue vide : le seed n’a pas été appliqué');
  return a;
}

/** Enfant : choisit une activité, l'envoie ; parent : la valide. Renvoie l'id child_activity. */
export async function completeActivity(h: Harness, parent: ParentSession, child: ChildSession, activityId: string): Promise<string> {
  const ca = await h.http.post('/v1/child-activities').set(auth(child.token)).send({ activityId }).expect(201);
  await h.http.post(`/v1/child-activities/${ca.body.id}/submit`).set(auth(child.token)).send({ note: 'fait !' }).expect(200);
  await h.http.post(`/v1/child-activities/${ca.body.id}/validate`).set(auth(parent.token)).send({}).expect(200);
  return ca.body.id;
}

export async function createAdmin(h: Harness): Promise<{ token: string; userId: string }> {
  const { hashSecret } = await import('../../src/platform/crypto');
  const email = uniqueEmail('admin');
  const user = await h.prisma.user.create({ data: { email, role: 'admin', fullName: 'Admin', passwordHash: await hashSecret('admin-password') } });
  const res = await h.http.post('/v1/auth/login').send({ email, password: 'admin-password' }).expect(200);
  return { token: res.body.accessToken, userId: user.id };
}

export async function notificationsOf(h: Harness, recipientId: string, type?: string) {
  return h.prisma.notification.findMany({ where: { recipientId, ...(type ? { type } : {}) }, orderBy: { createdAt: 'asc' } });
}
