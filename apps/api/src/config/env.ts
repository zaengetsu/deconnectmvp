import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  /** URL publique de l'API (liens vers les visuels téléversés). */
  PUBLIC_API_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit contenir au moins 32 caractères'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  CHILD_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(180),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3001,http://localhost:3002'),
  APP_TIMEZONE: z.string().default('Europe/Paris'),
  NOTIFICATIONS_ENGINE: z.enum(['api', 'sql']).default('api'),
  RUN_JOBS: bool.default(true),
  /** Filtre d'âge sur le catalogue Rekonect : à activer une fois les tranches d'âge revues (toutes à 9-14 aujourd'hui). */
  CATALOG_AGE_FILTER: bool.default(false),

  APNS_KEY_ID: z.string().default(''),
  APNS_TEAM_ID: z.string().default(''),
  APNS_PRIVATE_KEY: z.string().default(''),
  APNS_BUNDLE_ID: z.string().default('ceo.services.rekonect'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().default(''),

  BREVO_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('noreply@rekonect.app'),
  EMAIL_FROM_NAME: z.string().default('Rekonect'),
  WEB_ADMIN_URL: z.string().default('http://localhost:3001'),
  WEB_PARTNERS_URL: z.string().default('http://localhost:3002'),
  MOBILE_APP_URL: z.string().default('rekonect://'),
  /** Libellé d'environnement affiché dans le back-office. */
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  /**
   * Pont de migration : tant que l'app mobile utilise Supabase Auth, l'API accepte aussi ses jetons
   * (HS256, secret JWT du projet Supabase). À retirer à la phase 2 (voir docs/architecture.md).
   */
  SUPABASE_JWT_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
