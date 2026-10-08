import { test, expect, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

const origin = 'http://localhost:3011';
const premium = process.env.PREUVIX_TEST_PREMIUM === 'true';
async function login(page: Page) {
  expect(
    (
      await page.request.post('/api/login', {
        headers: { Origin: origin },
        data: { password: 'browser-test-password-only' },
      })
    ).ok(),
  ).toBe(true);
}
async function deposit(page: Page) {
  const bytes = await sharp({
    create: { width: 48, height: 32, channels: 3, background: '#dd9966' },
  })
    .jpeg()
    .toBuffer();
  const title = 'Pièce fictive ' + randomUUID().slice(0, 8);
  const result = await page.request.post('/api/proofs', {
    headers: { Origin: origin },
    multipart: {
      title,
      description: 'NOTE CONFIDENTIELLE DE TEST',
      source: 'upload',
      requestKey: randomUUID(),
      clientSha256: createHash('sha256').update(bytes).digest('hex'),
      file: { name: 'fictive.jpg', mimeType: 'image/jpeg', buffer: bytes },
    },
  });
  expect(result.status()).toBe(201);
  return result.json();
}

test('simplified welcome has three steps, concise FAQ and separate help and directory', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Vos photos, vos références/ })).toBeVisible();
  await expect(page.locator('.welcome-steps > li')).toHaveCount(3);
  await expect(page.locator('#faq details')).toHaveCount(3);
  await expect(page.locator('#offres .plan-card')).toHaveCount(2);
  await expect(
    page.locator('#offres').getByRole('heading', { name: 'Free', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('#offres').getByRole('heading', { name: 'Premium', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#offres')).toContainText('Gratuit');
  await expect(page.locator('#offres')).toContainText('tarif à venir');
  await expect(page.locator('.partner-map.leaflet-container')).toBeVisible();
  await expect(page.locator('.constat-section')).toHaveCount(0);
  await expect(page.getByText('10,99', { exact: false })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ouvrir mon espace', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#password')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/welcome-simplified-mobile.png', fullPage: true });
  await page.goto('/comprendre');
  await expect(
    page.getByRole('heading', { name: 'Préparation Premium · Offre en préparation' }),
  ).toBeVisible();
  await page.goto('/annuaire');
  await expect(
    page.getByRole('heading', { name: 'Annuaire des commissaires de justice' }),
  ).toBeVisible();
});

test('standard dossier remains usable without Premium; direct premium call denied', async ({
  page,
}) => {
  test.skip(premium, 'Run with the default server configuration.');
  await login(page);
  const proof = await deposit(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Mes dossiers.' })).toBeVisible();
  await expect(page.locator('.intro-card')).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(proof.manifest.title) }).click();
  await expect(page.getByRole('navigation', { name: 'Sections du dossier' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Découvrir l’option Premium' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Dossier complet (.zip)' }).click();
  expect((await download).suggestedFilename()).toMatch(/zip$/);
  await page.getByRole('button', { name: 'Découvrir l’option Premium' }).click();
  await expect(
    page.getByRole('heading', { name: 'Offre en préparation', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nouvelle préparation' })).toHaveCount(0);
  const denied = await page.request.post('/api/transmissions', {
    headers: { Origin: origin },
    data: {
      proofIds: [proof.id],
      summary: 'Test',
      recipient: 'Test',
      includeOriginals: false,
      includeNotes: false,
      days: 7,
    },
  });
  expect(denied.status()).toBe(403);
});

test('premium test preparation persists, scopes access and revokes it on mobile and keyboard', async ({
  page,
  context,
}) => {
  test.skip(!premium, 'Run with PREUVIX_TEST_PREMIUM=true.');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const proof = await deposit(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Préparation Premium', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle préparation' }).click();
  const selected = page.getByLabel(proof.manifest.title, { exact: true });
  await selected.focus();
  await page.keyboard.press('Space');
  await expect(selected).toBeChecked();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Vérifier le résumé', exact: true }),
  ).toBeFocused();
  await page
    .getByLabel('Résumé accessible au destinataire')
    .fill('Préparation fictive sans envoi réel.');
  await page.getByRole('button', { name: 'Enregistrer et quitter' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Préparation Premium', exact: true }).click();
  await page.getByRole('button', { name: 'Reprendre' }).first().click();
  await expect(page.getByLabel(proof.manifest.title, { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByLabel('Résumé accessible au destinataire')).toHaveValue(
    'Préparation fictive sans envoi réel.',
  );
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByLabel('Autoriser le téléchargement des originaux')).not.toBeChecked();
  await expect(page.getByLabel('Inclure les notes de contexte des pièces')).not.toBeChecked();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.getByLabel('Étiquette destinataire', { exact: true }).fill('Étude fictive — test');
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ce qui sera accessible' })).toBeVisible();
  await expect(page.getByText('NOTE CONFIDENTIELLE DE TEST', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Créer le lien de consultation' })).toBeDisabled();
  await page.getByLabel('Je confirme cette sélection et la création du lien, sans envoi.').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab'); // Previous, then create: normal keyboard order.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Créer le lien de consultation' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/transmission-confirm-mobile.png', fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Lien créé', exact: true })).toBeVisible();
  const url = await page
    .getByRole('link', { name: 'Vérifier la consultation' })
    .getAttribute('href');
  const visitor = await context.browser()!.newContext();
  const consultation = await visitor.newPage();
  await consultation.goto(url!, { waitUntil: 'domcontentloaded' });
  await expect(consultation.getByRole('heading', { name: 'Sélection préparée' })).toBeVisible();
  await expect(consultation.getByRole('link', { name: /Télécharger l’original/ })).toHaveCount(0);
  await expect(consultation.getByText('NOTE CONFIDENTIELLE DE TEST', { exact: false })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Révoquer l’accès' }).first().click();
  await consultation.reload({ waitUntil: 'domcontentloaded' });
  await expect(consultation.getByRole('alert')).toContainText('expiré, révoqué');
  await visitor.close();
  expect(errors).toEqual([]);
});
