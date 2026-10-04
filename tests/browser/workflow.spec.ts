import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

test('owner creates a private record, shares verification, compares locally, exports and deletes', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Votre espace de preuves' })).toBeVisible();
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  await expect(page.getByRole('heading', { name: 'Mes preuves.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Créer une preuve', exact: true }).click();
  const image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#bac5ae' },
  })
    .jpeg()
    .toBuffer();
  const expectedHash = createHash('sha256').update(image).digest('hex');
  let deposits = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/proofs')) deposits++;
  });
  await page.getByLabel('Choisir une photo', { exact: true }).setInputFiles({
    name: 'iphone.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('000000186674797068656963000000006d69663168656963', 'hex'),
  });
  await expect(page.getByRole('alert')).toContainText('HEIC/HEIF');
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  await page
    .getByLabel('Choisir une photo', { exact: true })
    .setInputFiles({ name: 'etat-mur.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(page.getByLabel('Empreinte avant dépôt')).toContainText(expectedHash);
  expect(deposits).toBe(0);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Titre du dossier').fill('État du mur — test navigateur');
  await page.getByLabel('Contexte').fill('Photo privée de test.');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Ajouter des pièces annexes').setInputFiles({
    name: 'devis-plombier.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Devis du 3 octobre : remplacement de la canalisation.'),
  });
  await expect(page.getByText('devis-plombier.txt')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
  await expect(page.getByRole('heading', { name: 'État du mur — test navigateur' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pièces annexes' })).toContainText(
    'devis-plombier.txt',
  );
  await expect(page.getByRole('region', { name: 'Chaîne de preuve' })).toContainText(
    'Journal de conservation',
  );
  await expect(page.getByText('Résultat inconclusif', { exact: true })).toBeVisible();
  expect(deposits).toBe(1);
  let privatePosts = 0;
  const countPrivatePosts = (req: import('@playwright/test').Request) => {
    if (req.method() === 'POST') privatePosts++;
  };
  page.on('request', countPrivatePosts);
  await page.getByText('Comparer une copie avec ce dossier', { exact: true }).click();
  await page
    .getByLabel('Copie à vérifier en privé')
    .setInputFiles({ name: 'original.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(page.getByText('Correspondance exacte des octets', { exact: true })).toBeVisible();
  await page.getByLabel('Copie à vérifier en privé').setInputFiles({
    name: 'modified.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('modified'),
  });
  await expect(page.getByText('Le fichier est différent', { exact: true })).toBeVisible();
  expect(privatePosts).toBe(0);
  page.off('request', countPrivatePosts);
  await page.getByRole('button', { name: 'Activer un lien de vérification' }).click();
  const href = await page
    .getByRole('link', { name: 'Ouvrir la vérification' })
    .getAttribute('href');
  expect(href).toMatch(/^\/verification\/[a-f0-9]{48}$/);
  const publicPage = await browser.newPage();
  let uploaded = false;
  publicPage.on('request', (req) => {
    if (req.method() === 'POST') uploaded = true;
  });
  await publicPage.goto(`http://localhost:3011${href}`);
  await expect(publicPage.getByText('Dossier trouvé', { exact: true })).toBeVisible();
  await expect(publicPage.getByText('Photo privée de test.')).toHaveCount(0);
  await publicPage
    .getByLabel('Fichier à comparer localement')
    .setInputFiles({ name: 'copy.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(
    publicPage.getByText('Correspondance exacte des octets', { exact: true }),
  ).toBeVisible();
  await publicPage.getByLabel('Fichier à comparer localement').setInputFiles({
    name: 'modified.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('different'),
  });
  await expect(publicPage.getByText('Le fichier est différent', { exact: true })).toBeVisible();
  expect(uploaded).toBe(false);
  await publicPage.screenshot({ path: 'test-results/verification-desktop.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Dossier complet (.zip)' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Mes preuves.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /État du mur — test navigateur/ }).click();
  await page.getByRole('button', { name: 'Supprimer ce dossier', exact: true }).click();
  await page.getByLabel('Tapez SUPPRIMER pour confirmer').fill('SUPPRIMER');
  await page.getByRole('button', { name: 'Supprimer le dossier', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vérifier un fichier', exact: true }).click();
  await page.getByLabel('Empreinte SHA-256 attendue').fill(expectedHash.toUpperCase());
  await page
    .getByLabel('Copie à vérifier en privé')
    .setInputFiles({ name: 'after-deletion.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(page.getByText('Correspondance exacte des octets', { exact: true })).toBeVisible();
  await page.getByLabel('Empreinte SHA-256 attendue').fill('invalid');
  await expect(page.getByText('Correspondance exacte des octets', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('64 caractères');
  await publicPage.reload();
  await expect(publicPage.getByText('Lien introuvable ou révoqué.')).toBeVisible();
  await publicPage.close();
  await page
    .getByRole('button', { name: 'Se déconnecter', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Votre espace de preuves' })).toBeVisible();
  expect(errors).toEqual([]);
});
