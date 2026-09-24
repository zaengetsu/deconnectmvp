import { expect, type Page } from '@playwright/test';

export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3001';
export const PARTNERS_URL = process.env.PARTNERS_URL ?? 'http://localhost:3002';
export const PASSWORD = process.env.DEMO_PASSWORD ?? 'rekonect-demo-2026';

export async function login(page: Page, base: string, email: string) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Échoue sur toute erreur JavaScript de la page (hors ressources externes). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function toast(page: Page, text: string | RegExp) {
  await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();
}
