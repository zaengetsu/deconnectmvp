import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { seed } from '../../prisma/seed';
import { applyMigrations } from './migrate';

/** Crée une base jetable, applique les migrations et charge le catalogue. */
export default async function globalSetup(): Promise<void> {
  const admin = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
  const name = `rekonect_test_${process.pid}_${Date.now()}`;
  const client = new Client({ connectionString: admin });
  await client.connect();
  await client.query(`CREATE DATABASE ${name}`);
  await client.end();

  const url = new URL(admin);
  url.pathname = `/${name}`;
  await applyMigrations(url.toString());
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  await seed(prisma);
  await prisma.$disconnect();

  writeFileSync(join(__dirname, '.test-db.json'), JSON.stringify({ url: url.toString(), admin, name }));
}
