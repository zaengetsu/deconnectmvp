import { expect, test } from '@playwright/test';
import { login, PARTNERS_URL, toast, watchErrors } from './helpers';

test.describe('Portail partenaires', () => {
  test('navigation et changement de compte', async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, PARTNERS_URL, 'julie.bernard@decathlonfrance.fr');
    await expect(page.getByRole('heading', { name: /Bonjour Julie/ })).toBeVisible();
    for (const [nav, heading] of [
      ['Offres', 'Offres'],
      ['Audience & zones', 'Audience & zones'],
      ['Magasins', 'Magasins'],
      ['Bons & échanges', 'Bons & échanges'],
      ['Compte & facturation', 'Compte & facturation'],
    ]) {
      await page.getByRole('navigation').getByRole('button', { name: nav }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: /Decathlon France/ }).first().click();
    await page.getByRole('option', { name: /Lyon Part-Dieu/ }).click();
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Mon magasin' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('créer une offre, l’enregistrer puis l’envoyer en validation', async ({ page }) => {
    await login(page, PARTNERS_URL, 'julie.bernard@decathlonfrance.fr');
    await page.getByRole('button', { name: '+ Créer une offre' }).click();
    await page.getByRole('radio', { name: /Bon pour les parents/ }).click();
    const title = `Bon e2e ${Date.now()}`;
    await page.getByLabel('Titre visible par la famille').fill(title);
    await page.getByLabel('Nombre').fill('5');
    await page.getByLabel('Quantité').fill('100');
    await expect(page.getByText('AUDIENCE ESTIMÉE')).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await toast(page, 'Brouillon enregistré');
    await expect(page).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: 'Envoyer en validation' }).click();
    await toast(page, /envoyée en validation/);
    await page.getByRole('button', { name: 'En validation' }).click();
    await expect(page.getByRole('button', { name: title })).toBeVisible();
  });

  test('caisse : vérifier puis valider un bon, exporter le CSV', async ({ page }) => {
    await login(page, PARTNERS_URL, 'julie.bernard@decathlonfrance.fr');
    await page.goto(`${PARTNERS_URL}/redeem`);
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    const reserved = page.getByRole('row').filter({ hasText: 'Réservé' }).first();
    test.skip((await reserved.count()) === 0, 'Aucun bon réservé');
    const code = (await reserved.locator('div').nth(1).textContent())!.trim();
    await page.getByLabel('Code du bon').fill(`rekonect:voucher:${code}`);
    await page.getByRole('button', { name: 'Vérifier le bon' }).click();
    await expect(page.getByText('Bon valide')).toBeVisible();
    await page.getByLabel('Montant du panier (facultatif)').fill('42,50');
    await page.getByRole('button', { name: 'Marquer comme utilisé' }).click();
    await toast(page, 'Bon marqué comme utilisé');
    await page.getByRole('button', { name: 'Valider un autre bon' }).click();
    await page.getByLabel('Code du bon').fill(code);
    await page.getByRole('button', { name: 'Vérifier le bon' }).click();
    await expect(page.getByText('Déjà utilisé')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });

  test('équipe et lieux', async ({ page }) => {
    await login(page, PARTNERS_URL, 'julie.bernard@decathlonfrance.fr');
    await page.goto(`${PARTNERS_URL}/billing`);
    await page.getByRole('button', { name: '+ Inviter' }).click();
    await page.getByLabel('Email').fill(`caisse.${Date.now()}@decathlon.fr`);
    await page.getByLabel('Rôle').selectOption('reception');
    await page.getByRole('button', { name: 'Inviter', exact: true }).click();
    await toast(page, /Invitation envoyée/);
    await page.getByRole('button', { name: 'Terminer' }).click();
    await page.goto(`${PARTNERS_URL}/places`);
    await page.getByRole('button', { name: '+ Ajouter un lieu' }).click();
    await page.getByRole('tab', { name: 'Simple lieu' }).click();
    await page.getByLabel('Nom').fill(`Entrepôt e2e ${Date.now()}`);
    await page.getByLabel('Latitude').fill('45.75');
    await page.getByLabel('Longitude').fill('4.85');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await toast(page, 'Lieu ajouté');
  });
});
