import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

export default async function globalTeardown(): Promise<void> {
  const file = join(__dirname, '.test-db.json');
  const { admin, name } = JSON.parse(readFileSync(file, 'utf8')) as { admin: string; name: string };
  const client = new Client({ connectionString: admin });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await client.end();
  rmSync(file, { force: true });
}
