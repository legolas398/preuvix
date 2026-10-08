import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test.use({ actionTimeout: 30000 });
const waitFor = expect.configure({ timeout: 30000 });

test('multi-file dossier preserves versions, verifies originals, exports and revokes sharing', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  await page.getByRole('button', { name: 'Dossiers multi-fichiers', exact: true }).click();
  await page.getByRole('button', { name: 'Créer un dossier', exact: true }).click();
  const title = `Dossier navigateur ${Date.now()}`;
  await page.getByLabel('Titre du dossier multi-fichiers').fill(title);
  await page.getByLabel('Description du dossier').fill('Deux originaux et leur historique.');
  await page.getByLabel('Adresse saisie (facultative)').fill('Adresse déclarative de test');
  await page.getByRole('button', { name: 'Enregistrer le dossier', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const buffer = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#aabbcc' },
  })
    .jpeg()
    .toBuffer();
  await page.getByLabel('Fichiers à ajouter', { exact: true }).setInputFiles([
    { name: 'premier.jpg', mimeType: 'image/jpeg', buffer },
    { name: 'second.jpg', mimeType: 'image/jpeg', buffer },
  ]);
  await page.getByRole('button', { name: 'Ajouter les fichiers sélectionnés' }).click();
  await waitFor(page.getByText('Fichier enregistré', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Version du dossier', exact: true })).toHaveValue(
    '3',
  );
  await expect(page.getByRole('button', { name: 'Demander l’ancrage blockchain' })).toBeDisabled();
  await expect(
    page.locator('.case-service').getByText('Non configuré', { exact: true }),
  ).toHaveCount(3);
  await page.getByRole('button', { name: 'Contrôler l’intégrité du dossier' }).click();
  await expect(page.getByRole('status')).toContainText('Intégrité vérifiée');
  const first = page
    .getByRole('region', { name: 'Fichiers et traçabilité' })
    .getByRole('article')
    .first();
  await first.getByText('Vérifier une copie de ce fichier', { exact: true }).click();
  await first
    .getByLabel('Copie à vérifier en privé')
    .setInputFiles({ name: 'copy.jpg', mimeType: 'image/jpeg', buffer });
  await expect(first.getByText('Correspondance exacte des octets', { exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Action', exact: true })
    .selectOption({ label: 'Nouvelle version de : premier.jpg' });
  await page
    .getByLabel('Fichiers à ajouter', { exact: true })
    .setInputFiles({ name: 'remplacement.jpg', mimeType: 'image/jpeg', buffer });
  await page.getByRole('button', { name: 'Ajouter les fichiers sélectionnés' }).click();
  await expect(page.getByRole('combobox', { name: 'Version du dossier', exact: true })).toHaveValue(
    '4',
  );
  await expect(page.getByRole('heading', { name: 'remplacement.jpg · fichier v2' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Version du dossier', exact: true }).selectOption('3');
  await expect(page.getByRole('heading', { name: 'premier.jpg · fichier v1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter ou remplacer un fichier' })).toHaveCount(
    0,
  );
  for (const [name, extension] of [
    ['Télécharger le PDF', '.pdf'],
    ['Télécharger le manifeste JSON', '.json'],
    ['Télécharger le dossier ZIP', '.zip'],
  ]) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    expect((await pending).suggestedFilename()).toContain(extension);
  }
  await page.getByText('Partager explicitement cette version', { exact: true }).click();
  await page
    .getByLabel('Je confirme le partage de cette version et des informations indiquées.')
    .check();
  await page.getByRole('button', { name: 'Créer un lien révocable' }).click();
  const href = await page.locator('a[href*="/consultation-dossier/"]').getAttribute('href');
  const visitor = await browser.newPage();
  await visitor.goto(href!);
  await expect(
    visitor.getByRole('heading', { name: `${title} · version 3`, exact: true }),
  ).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Télécharger cet original' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Révoquer ce lien' }).click();
  await expect(page.getByText(/Version 3 · sans originaux · Révoqué/)).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole('alert')).toContainText('Lien expiré, révoqué ou introuvable');
  await visitor.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/dossiers-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
