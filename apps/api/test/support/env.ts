// Variables d'environnement des tests d'intégration (la base est créée par global-setup).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = JSON.parse(readFileSync(join(__dirname, '.test-db.json'), 'utf8')) as { url: string };
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: state.url,
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-42',
  NOTIFICATIONS_ENGINE: 'api',
  RUN_JOBS: 'false',
  BREVO_API_KEY: '',
  PARTNER_LEADS_EMAIL: 'equipe@rekonect.test',
  APNS_KEY_ID: '',
  FCM_SERVICE_ACCOUNT_JSON: '',
  SUPABASE_JWT_SECRET: 'supabase-test-secret-supabase-test-secret',
});
