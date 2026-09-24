import { expect, test } from '@playwright/test';
import { ADMIN_URL, login, toast, watchErrors } from './helpers';

test.describe('Back-office', () => {
  test('navigation : chaque écran se charge avec des données réelles', async ({ page }) => {
    const errors = watchErrors(page);
    await login(page, ADMIN_URL, 'admin@rekonect.app');
    await expect(page.getByRole('heading', { name: "Vue d'ensemble" })).toBeVisible();
    await expect(page.getByText('Familles actives').first()).toBeVisible();
    await page.getByRole('tab', { name: '7 jours' }).click();
    for (const [nav, heading] of [
      ['Activités', "Catalogue d'activités"],
      ['Récompenses', 'Récompenses'],
      ['Familles', 'Familles'],
      ['Partenaires', 'Partenaires'],
      ['Plans & abonnements', 'Plans & abonnements'],
    ]) {
      await page.getByRole('navigation').getByRole('button', { name: nav }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('catalogue : filtre, fiche, modification, création', async ({ page }) => {
    await login(page, ADMIN_URL, 'admin@rekonect.app');
    await page.goto(`${ADMIN_URL}/activities`);
    await page.getByRole('button', { name: /^Sport/ }).click();
    await page.getByRole('row').nth(1).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('ACTIVITÉ NATIVE')).toBeVisible();
    await dialog.getByLabel('Points').fill('25');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await toast(page, 'Activité enregistrée');
    await page.getByRole('button', { name: '+ Nouvelle activité' }).click();
    await page.getByLabel('Titre').fill(`Herbier e2e ${Date.now()}`);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await toast(page, 'Activité créée');
  });

  test('modération : demander une modification puis approuver', async ({ page }) => {
    await login(page, ADMIN_URL, 'admin@rekonect.app');
    await page.goto(`${ADMIN_URL}/rewards?tab=partner`);
    await expect(page.getByRole('article').first()).toBeVisible();
    const pending = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Approuver' }) });
    const count = await pending.count();
    test.skip(count === 0, 'Aucune offre en attente');
    await pending.first().getByRole('button', { name: 'Demander une modif.' }).click();
    await page.getByRole('dialog').getByRole('textbox').fill('Merci de préciser l’âge minimum');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await toast(page, 'Modification demandée');
    if (count > 1) {
      await pending.first().getByRole('button', { name: 'Approuver' }).click();
      await toast(page, 'Offre approuvée');
    }
  });

  test('familles : fiche, geste commercial, historique, export', async ({ page }) => {
    await login(page, ADMIN_URL, 'admin@rekonect.app');
    await page.goto(`${ADMIN_URL}/families`);
    await page.getByRole('button', { name: 'Famille', exact: true }).click();
    await page.getByRole('row').nth(1).click();
    await expect(page.getByText('FICHE FAMILLE')).toBeVisible();
    await page.getByRole('button', { name: "Offrir un mois d'abonnement" }).click();
    await page.getByRole('button', { name: 'Offrir', exact: true }).click();
    await toast(page, /Abonnement offert/);
    await page.getByRole('button', { name: "Voir l'historique de paiement" }).click();
    await expect(page.getByRole('dialog', { name: 'Historique de paiement' })).toBeVisible();
    await page.getByRole('button', { name: 'Fermer la fenêtre' }).click();
    await page.getByRole('button', { name: "Renvoyer l'email de connexion" }).click();
    await toast(page, /Email de connexion renvoyé/);
    await page.getByRole('button', { name: 'Fermer le panneau' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter' }).click();
    expect((await download).suggestedFilename()).toBe('familles-rekonect.csv');
  });

  test('plans : modifier un plan, créer un code promo ; partenaires : inviter', async ({ page }) => {
    await login(page, ADMIN_URL, 'admin@rekonect.app');
    await page.goto(`${ADMIN_URL}/plans`);
    await page.getByRole('article', { name: 'Famille+' }).getByRole('button', { name: 'Modifier le plan' }).click();
    await page.getByLabel('Enfants max').fill('6');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await toast(page, 'Plan enregistré');
    await page.getByRole('button', { name: '+ Créer' }).click();
    const code = `E2E${Date.now().toString().slice(-6)}`;
    await page.getByLabel('Code', { exact: true }).fill(code);
    await page.getByLabel('Description interne').fill('Code de test');
    await page.getByRole('button', { name: 'Créer le code' }).click();
    await toast(page, `Code ${code} créé`);
    await page.goto(`${ADMIN_URL}/partners`);
    await page.getByRole('button', { name: '+ Inviter un partenaire' }).click();
    await page.getByLabel('Nom').fill(`Club e2e ${Date.now()}`);
    await page.getByLabel('Email du responsable').fill(`club.${Date.now()}@exemple.fr`);
    await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
    await expect(page.getByLabel('Lien d’invitation')).toHaveValue(/\/invitation\?token=/);
  });
});
