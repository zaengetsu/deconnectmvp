import { defineConfig } from '@playwright/test';

/**
 * Prérequis : API + worker démarrés sur une base remplie par `pnpm --filter @rekonect/api demo:data`,
 * back-office sur ADMIN_URL (3001) et portail partenaires sur PARTNERS_URL (3002).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  workers: 1,
  reporter: [['list']],
  use: {
    viewport: { width: 1440, height: 960 },
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
  },
});
