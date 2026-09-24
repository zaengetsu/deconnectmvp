/* eslint-disable no-console */
// Données de référence (catalogue Rekonect extrait des migrations Supabase) + compte admin initial.
// Idempotent : peut être relancé sans créer de doublons.
//   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... pnpm db:seed
import { config as loadDotenv } from 'dotenv';
loadDotenv({ quiet: true });
import { PrismaPg } from '@prisma/adapter-pg';
import { hashSecret } from '../src/platform/crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import data from './seed-data.json';

export async function seed(prisma: PrismaClient, opts: { adminEmail?: string; adminPassword?: string } = {}) {
  for (const c of data.categories) {
    await prisma.activityCategory.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, description: c.description, icon: c.icon } });
  }
  const categories = new Map((await prisma.activityCategory.findMany()).map((c) => [c.slug, c.id]));

  for (const a of data.activities) {
    const { categorySlug, id, ...fields } = a;
    const categoryId = categorySlug ? (categories.get(categorySlug) ?? null) : null;
    await prisma.activity.upsert({
      where: { id },
      create: { id, ...fields, categoryId, activityType: 'catalog', isPublic: true },
      update: { ...fields, categoryId },
    });
  }

  if ((await prisma.badge.count()) === 0) await prisma.badge.createMany({ data: data.badges });

  if ((await prisma.reward.count({ where: { parentId: null, rewardType: 'catalog' } })) === 0) {
    await prisma.reward.createMany({ data: data.rewards.map((r) => ({ ...r, parentId: null, rewardType: 'catalog' })) });
  }

  if (opts.adminEmail && opts.adminPassword) {
    const email = opts.adminEmail.trim().toLowerCase();
    await prisma.user.upsert({
      where: { email },
      create: { email, role: 'admin', fullName: 'Admin Rekonect', passwordHash: await hashSecret(opts.adminPassword), emailVerifiedAt: new Date() },
      update: {},
    });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  seed(prisma, { adminEmail: process.env.SEED_ADMIN_EMAIL, adminPassword: process.env.SEED_ADMIN_PASSWORD })
    .then(() => console.log('Catalogue Rekonect chargé.'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
