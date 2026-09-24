import { expect, test } from '@playwright/test';
import { ADMIN_URL, login, PARTNERS_URL, watchErrors } from './helpers';

test.describe('Landing partenaires', () => {
  test('page publique, tarifs de l’API, demande « Être rappelé » visible dans l’admin', async ({ page, browser }) => {
    const errors = watchErrors(page);
    await page.goto(`${PARTNERS_URL}/`);
    await expect(page.getByRole('heading', { level: 1, name: /Récompensez les enfants qui bougent/ })).toBeVisible();
    await expect(page.locator('[data-plan="partner_local"]')).toContainText('29 €');

    await page.locator('[data-plan="partner_public"]').getByRole('link', { name: 'Demander un devis' }).click();
    await expect(page.getByRole('radio', { name: 'Collectivité' })).toHaveAttribute('aria-checked', 'true');
    const org = `Ville test ${Date.now()}`;
    await page.getByLabel('Nom', { exact: true }).fill('Claire Martin');
    await page.getByLabel('Organisation', { exact: true }).fill(org);
    await page.getByLabel('Email professionnel').fill(`claire+${Date.now()}@ville.test`);
    await page.getByRole('button', { name: 'Être rappelé' }).click();
    await expect(page.getByText("Merci, c'est noté")).toBeVisible();
    expect(errors).toEqual([]);

    const admin = await browser.newPage();
    await login(admin, ADMIN_URL, 'admin@rekonect.app');
    await admin.goto(`${ADMIN_URL}/partners?tab=leads`);
    await expect(admin.getByRole('row', { name: org })).toBeVisible();
    await admin.getByRole('combobox', { name: `Statut de ${org}` }).selectOption('contacted');
    await expect(admin.getByRole('status').filter({ hasText: 'rappelée' })).toBeVisible();
  });

  test('« Se connecter » mène au portail, puis au tableau de bord', async ({ page }) => {
    await page.goto(`${PARTNERS_URL}/`);
    await page.getByRole('link', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, PARTNERS_URL, 'julie.bernard@decathlonfrance.fr');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
