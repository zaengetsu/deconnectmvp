/* eslint-disable no-console */
// Jeu de démonstration réaliste, créé par les vrais parcours de l'API (inscriptions, activités, offres,
// modération…) pour présenter le back-office et le portail partenaires. À ne jamais lancer en production.
//   API_URL=http://localhost:3000 DATABASE_URL=... pnpm --filter @rekonect/api demo:data
import { config as loadDotenv } from 'dotenv';
loadDotenv({ quiet: true });
import { PrismaPg } from '@prisma/adapter-pg';
import { hashSecret } from '../src/platform/crypto';
import { PrismaClient } from '../src/generated/prisma/client';

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD ?? 'rekonect-demo-2026';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function call<T = any>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const LYON = { lat: 45.7606, lng: 4.8594 };
const around = (c: { lat: number; lng: number }, i: number) => ({ lat: c.lat + ((i * 37) % 11 - 5) * 0.006, lng: c.lng + ((i * 53) % 13 - 6) * 0.007 });

const FAMILIES: [string, string, string, number[], 'free' | 'family' | 'family_plus', string][] = [
  ['Marie', 'Dupont', 'Lyon', [9, 12], 'family', '69003'],
  ['Sophie', 'Martin', 'Lyon', [7, 10, 13], 'family_plus', '69006'],
  ['Julien', 'Bernard', 'Villeurbanne', [8], 'free', '69100'],
  ['Claire', 'Petit', 'Lyon', [6, 11], 'family', '69007'],
  ['Karim', 'Leroy', 'Lyon', [5, 8, 11, 14], 'family_plus', '69008'],
  ['Emma', 'Durand', 'Bron', [10], 'free', '69500'],
  ['Thomas', 'Moreau', 'Lyon', [9, 12], 'family', '69002'],
  ['Nadia', 'Simon', 'Villeurbanne', [7], 'free', '69100'],
  ['Paul', 'Laurent', 'Lyon', [6, 9, 13], 'family', '69003'],
  ['Anaïs', 'Michel', 'Lyon', [8, 11], 'free', '69009'],
  ['Hugo', 'Garnier', 'Lyon', [10, 12], 'free', '69001'],
  ['Inès', 'Roux', 'Lyon', [7, 9], 'family', '69004'],
];
const KIDS = ['Léa', 'Tom', 'Inès', 'Hugo', 'Jade', 'Noah', 'Lina', 'Adam', 'Rose', 'Gabriel', 'Mila', 'Louis', 'Emma', 'Lucas', 'Clara'];
const PRICE = { free: 0, family: 499, family_plus: 799 };

async function main() {
  if ((await prisma.user.count({ where: { email: 'admin@rekonect.app' } })) > 0) {
    console.log('Jeu de démonstration déjà présent.');
    return;
  }
  // ─── Équipe Rekonect ───
  await prisma.user.create({ data: { email: 'admin@rekonect.app', fullName: 'Camille Rousseau', role: 'admin', passwordHash: await hashSecret(PASSWORD), emailVerifiedAt: new Date() } });
  const admin = (await call('POST', '/v1/auth/login', { email: 'admin@rekonect.app', password: PASSWORD })).accessToken as string;

  // ─── Familles ───
  const catalog = await prisma.activity.findMany({ where: { activityType: 'catalog' }, orderBy: { title: 'asc' } });
  const families: { token: string; userId: string; email: string; children: { id: string; token: string }[] }[] = [];
  let k = 0;
  for (const [i, [first, last, city, ages, plan, postalCode]] of FAMILIES.entries()) {
    const email = `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${last.toLowerCase()}@exemple.fr`;
    const reg = await call('POST', '/v1/auth/register', { email, password: PASSWORD, fullName: `${first} ${last}` });
    const token = reg.accessToken as string;
    const at = around(LYON, i);
    await call('PATCH', '/v1/profile', { city, postalCode, latitude: at.lat, longitude: at.lng }, token);
    await call('PUT', '/v1/notification-preferences', { partnerOffers: i % 4 !== 3, dailySummary: i % 3 === 0 }, token);
    if (plan !== 'free') await prisma.subscription.updateMany({ where: { parentId: reg.user.id }, data: { plan, status: i === 3 ? 'past_due' : 'active', amountCents: PRICE[plan], billingInterval: i % 5 === 1 ? 'year' : 'month', startedAt: new Date() } });
    const children: { id: string; token: string }[] = [];
    for (const age of plan === 'free' ? ages.slice(0, 1) : ages) {
      const child = await call('POST', '/v1/children', { displayName: KIDS[k++ % KIDS.length], age }, token);
      if (i % 3 !== 2 || children.length === 0) {
        const code = await call('POST', `/v1/children/${child.id}/link-code`, {}, token);
        const session = await call('POST', '/v1/auth/child/link', { code: code.code, pin: '1234', deviceId: `demo-${child.id}` });
        children.push({ id: child.id, token: session.accessToken });
      }
    }
    families.push({ token, userId: reg.user.id, email, children });
  }

  // Activités réalisées (validées ou refusées) pour alimenter les statistiques.
  for (const [i, f] of families.entries()) {
    for (const [j, c] of f.children.entries()) {
      const count = 2 + ((i + j) % 4);
      for (let n = 0; n < count; n++) {
        const a = catalog[(i * 7 + j * 3 + n * 5) % catalog.length];
        const ca = await call('POST', '/v1/child-activities', { activityId: a.id }, c.token);
        await call('POST', `/v1/child-activities/${ca.id}/submit`, { note: 'Fait !' }, c.token);
        if ((i + n) % 9 === 4) await call('POST', `/v1/child-activities/${ca.id}/reject`, { reason: 'Il manque la photo' }, f.token);
        else await call('POST', `/v1/child-activities/${ca.id}/validate`, {}, f.token);
      }
    }
  }
  // Une récompense demandée puis approuvée dans quelques familles.
  for (const f of families.slice(0, 6)) {
    const cat = await call('GET', '/v1/rewards/catalog', undefined, f.token);
    const pick = cat.find((r: { requiredPoints: number; rewardType: string }) => r.rewardType !== 'partner' && r.requiredPoints <= 60) ?? cat[0];
    const mine = await call('POST', `/v1/rewards/catalog/${pick.id}/activate`, { requiredPoints: 20 }, f.token);
    const req = await call('POST', `/v1/rewards/${mine.id}/request`, {}, f.children[0].token).catch(() => null);
    if (req) await call('POST', `/v1/reward-requests/${req.id}/approve`, {}, f.token);
  }
  // Une activité signalée par trois familles.
  const flagged = catalog.find((a) => a.title.toLowerCase().includes('range')) ?? catalog[3];
  for (const f of families.slice(0, 3)) await call('POST', `/v1/activities/${flagged.id}/report`, { reason: 'duplicate', details: 'Ressemble à une autre activité' }, f.token);

  // ─── Partenaires ───
  const partner = async (name: string, kind: string, planId: string, color: string, first: string, subtitle: string, status = 'active') => {
    const slug = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
    const email = `${slug(first)}@${slug(name).replace(/\./g, '')}.fr`;
    const res = await call('POST', '/v1/admin/partners', { name, kind, planId, color, subtitle, ownerEmail: email, status }, admin);
    const token = decodeURIComponent(new URL(res.invitation.url).searchParams.get('token')!);
    const acc = await call('POST', '/v1/auth/partner-invitations/accept', { token, fullName: first, password: PASSWORD });
    return { id: res.id as string, token: acc.accessToken as string, email };
  };
  const decathlon = await partner('Decathlon France', 'brand', 'partner_network', '#3FA0C9', 'Julie Bernard', 'Enseigne nationale');
  await prisma.subscription.updateMany({ where: { partnerId: decathlon.id }, data: { amountCents: 29000, startedAt: new Date() } });
  const store = await call('POST', `/v1/partner/${decathlon.id}/stores`, { name: 'Decathlon Lyon Part-Dieu', address: '17 rue du Dr Bouchut', postalCode: '69003', city: 'Lyon', latitude: 45.7606, longitude: 4.8594, managerName: 'Karim B.', managerEmail: 'karim.b@decathlon.fr' }, decathlon.token);
  const storeToken = (await call('POST', '/v1/auth/partner-invitations/accept', { token: decodeURIComponent(new URL(store.invitation.url).searchParams.get('token')!), fullName: 'Karim B.', password: PASSWORD })).accessToken;
  await call('POST', `/v1/partner/${decathlon.id}/stores`, { name: 'Decathlon Villeurbanne', address: 'Rue de la Poudrette', postalCode: '69100', city: 'Villeurbanne', latitude: 45.7719, longitude: 4.8902, managerName: 'Samir D.', managerEmail: 'samir.d@decathlon.fr' }, decathlon.token);
  const inv = await call('POST', `/v1/partner/${decathlon.id}/members`, { email: 'marc.tessier@decathlon.fr', role: 'editor', title: 'Marketing national' }, decathlon.token);
  await call('POST', '/v1/auth/partner-invitations/accept', { token: decodeURIComponent(new URL(inv.url).searchParams.get('token')!), fullName: 'Marc Tessier', password: PASSWORD });
  const ville = await partner('Ville de Lyon', 'public_institution', 'partner_public', '#5CB88F', 'Nathalie R.', 'Direction des sports');
  await prisma.subscription.updateMany({ where: { partnerId: ville.id }, data: { amountCents: 121800, startedAt: new Date() } });
  const cse = await partner('CSE Airbus Toulouse', 'cse', 'partner_public', '#7C6BD4', 'Sébastien L.', 'Comité social et économique');
  await partner('Nature & Découvertes', 'brand', 'partner_network', '#E8B33F', 'Élise M.', 'Enseigne nationale', 'onboarding');
  const librairie = await partner('Librairie Passages', 'local_business', 'partner_local', '#E2607F', 'Olivier P.', 'Lyon 2e', 'trial');
  const pathe = await partner('Pathé Bellecour', 'retailer', 'partner_local', '#16182B', 'Léna F.', 'Lyon 2e');

  const sport = await prisma.activityCategory.findUniqueOrThrow({ where: { slug: 'sport' } });
  const lecture = await prisma.activityCategory.findUniqueOrThrow({ where: { slug: 'lecture' } });
  const publish = async (p: { id: string; token: string }, body: Record<string, unknown>, decide: 'publish' | 'pending' | 'draft' = 'publish') => {
    const o = await call('POST', `/v1/partner/${p.id}/offers`, body, p.token);
    if (decide === 'draft') return o;
    await call('POST', `/v1/partner-offers/${o.id}/submit`, {}, p.token);
    if (decide === 'publish') await call('POST', `/v1/admin/moderation/offers/${o.id}/approve`, {}, admin);
    return o;
  };
  const places = await call('GET', `/v1/partner/${decathlon.id}/places`, undefined, decathlon.token);
  await publish(decathlon, { kind: 'parent_voucher', title: '−10 % rayon cycles', triggerType: 'category_validated', triggerCategoryId: sport.id, triggerThreshold: 2, triggerWindowDays: 30, targetType: 'radius', targetPlaceId: places[0].id, targetRadiusKm: 20, stockTotal: 3000, discountLabel: '−10 %' });
  await publish(decathlon, { kind: 'child_reward', title: 'Gourde enfant offerte', requiredPoints: 250, stockTotal: 1500, targetType: 'radius', targetPlaceId: places[0].id, targetRadiusKm: 15 });
  await publish(decathlon, { kind: 'sponsored_activity', title: 'Défi « 100 km à vélo en famille »', categoryId: sport.id, durationMinutes: 60, stockTotal: 10000 });
  await publish(decathlon, { kind: 'parent_voucher', title: '−15 % sur le rayon vélo', triggerType: 'category_validated', triggerCategoryId: sport.id, triggerThreshold: 10, triggerWindowDays: 30, stockTotal: 5000, startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-12-31T22:59:59.000Z' }, 'pending');
  const atelier = await call('POST', `/v1/partner/${store.id}/offers`, { kind: 'child_reward', title: 'Atelier « répare ton vélo » offert', requiredPoints: 300, stockTotal: 40, targetType: 'radius', targetPlaceId: places[0].id, targetRadiusKm: 15, startsAt: '2026-10-12T12:00:00.000Z', endsAt: '2026-10-12T16:00:00.000Z' }, storeToken);
  await call('POST', `/v1/partner-offers/${atelier.id}/submit`, {}, storeToken);
  await call('POST', `/v1/partner-offers/${atelier.id}/brand-approve`, {}, decathlon.token);
  const villePlace = await call('POST', `/v1/partner/${ville.id}/places`, { name: 'Patinoire Charlemagne', address: '100 cours Charlemagne', postalCode: '69002', city: 'Lyon', latitude: 45.742, longitude: 4.8189, managerName: 'Service des sports', accessLevel: 'reception' }, ville.token);
  await publish(ville, { kind: 'child_reward', title: 'Entrée patinoire Charlemagne', requiredPoints: 120, stockTotal: 1500, targetType: 'radius', targetPlaceId: villePlace.id, targetRadiusKm: 12 });
  await publish(ville, { kind: 'child_reward', title: 'Entrée gratuite à la piscine municipale', requiredPoints: 150, stockTotal: 2000, targetType: 'area', targetPostalCodes: ['69001', '69002', '69003', '69004', '69005', '69006', '69007', '69008', '69009'] }, 'pending');
  const code = await call('POST', '/v1/admin/promo-codes', { code: 'CSE-AIRBUS', description: 'Plan Famille offert par le CSE', kind: 'sponsored', durationMonths: 12, planId: 'family', sponsorPartnerId: cse.id, maxRedemptions: 800 }, admin);
  await publish(cse, { kind: 'parent_voucher', title: 'Chèque culture de 20 €', triggerType: 'streak_days', triggerThreshold: 30, targetType: 'code', targetPromoCodeId: code.id, stockTotal: 800 }, 'pending');
  await publish(librairie, { kind: 'child_reward', title: 'Marque-page illustré offert', requiredPoints: 60, stockTotal: 200, targetType: 'area', targetPostalCodes: ['69002'] });
  await publish(librairie, { kind: 'parent_voucher', title: '−5 € sur un livre jeunesse', triggerType: 'category_validated', triggerCategoryId: lecture.id, triggerThreshold: 4, triggerWindowDays: 30, targetType: 'area', targetPostalCodes: ['69002', '69003'], stockTotal: 300 }, 'draft');
  await call('PATCH', `/v1/admin/partners/${pathe.id}/status`, { status: 'suspended' }, admin);

  await call('POST', '/v1/admin/promo-codes', { code: 'RENTREE26', description: 'Campagne de rentrée', kind: 'percent', percentOff: 30, durationMonths: 3 }, admin);
  await call('POST', '/v1/admin/promo-codes', { code: 'NOEL25', description: 'Noël 2025', kind: 'free_months', durationMonths: 1, planId: 'family', expiresAt: '2026-01-05T23:00:00.000Z' }, admin).catch(() => undefined);

  // Nouvelle série d'activités : déclenche les bons « −10 % rayon cycles » des familles consentantes.
  const sportActs = catalog.filter((a) => a.categoryId === sport.id);
  for (const f of families.slice(0, 8)) {
    for (let n = 0; n < 2; n++) {
      const a = sportActs[n % sportActs.length];
      const ca = await call('POST', '/v1/child-activities', { activityId: a.id }, f.children[0].token);
      await call('POST', `/v1/child-activities/${ca.id}/submit`, {}, f.children[0].token);
      await call('POST', `/v1/child-activities/${ca.id}/validate`, {}, f.token);
    }
  }
  await new Promise((r) => setTimeout(r, 4000)); // laisser le worker traiter l'outbox
  const claims = await prisma.offerClaim.findMany({ where: { code: { not: null } }, take: 3 });
  for (const c of claims.slice(0, 2)) await call('POST', `/v1/partner/${decathlon.id}/redemptions/verify`, { code: c.code, redeem: true, placeId: places[0].id, basketAmountCents: 5400 }, decathlon.token).catch(() => undefined);

  // Historique d'abonnement pour la page Plans.
  const events: [number, string, string, number | null][] = [
    [4, 'upgraded', 'Passage à Famille+', 300],
    [1, 'created', 'Nouvel abonnement Famille (annuel)', 4900],
    [3, 'payment_failed', 'Paiement échoué · carte expirée', 499],
    [10, 'canceled', 'Résiliation · « enfants trop grands »', -499],
    [0, 'created', 'Nouvel abonnement Famille', 499],
  ];
  for (const [i, type, description, amount] of events) {
    await prisma.subscriptionEvent.create({ data: { parentId: families[i].userId, type, description, amountCents: amount, occurredAt: new Date(Date.now() - (events.length - i) * 3_600_000 * 7) } });
  }
  await prisma.subscriptionEvent.create({ data: { partnerId: cse.id, type: 'licenses_purchased', description: 'Achat de 200 licences Famille', amountCents: 62000, occurredAt: new Date(Date.now() - 30 * 3_600_000) } });
  await prisma.subscriptionEvent.create({ data: { partnerId: librairie.id, type: 'trial_started', description: 'Essai partenaire local démarré', amountCents: 0, occurredAt: new Date(Date.now() - 20 * 3_600_000) } });

  console.log(`Démo prête. Mot de passe commun : ${PASSWORD}`);
  console.log('  Back-office : admin@rekonect.app');
  console.log(`  Partenaire enseigne : ${decathlon.email}  ·  magasin : karim.b@decathlon.fr  ·  collectivité : ${ville.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
