import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Applique les migrations SQL de prisma/migrations sur une base vide.
 * En dehors des tests, on utilise `prisma migrate deploy` : les fichiers sont les mêmes.
 */
export async function applyMigrations(url: string): Promise<void> {
  const dir = join(__dirname, '../../prisma/migrations');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const name of readdirSync(dir).filter((d) => /^\d+_/.test(d)).sort()) {
      await client.query(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}
