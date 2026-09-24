import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadDotenv({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'ts-node --transpile-only prisma/seed.ts' },
  // `prisma generate` n'a pas besoin de base : une URL factice suffit hors migrations.
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/rekonect' },
});
