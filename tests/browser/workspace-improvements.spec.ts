import { test, expect } from '@playwright/test';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'geolocation'],
  geolocation: { latitude: 48.8566, longitude: 2.3522, accuracy: 15 },
});

test('local draft survives upload failure and reload, then confirms storage and shares a verifiable report', async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.request.post('/api/login', {
    headers: { Origin: 'http://localhost:3011' },
    data: { password: 'browser-test-password-only' },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer une preuve', exact: true }).click();
  await page.getByRole('button', { name: 'Caméra', exact: true }).click();
  await page.getByRole('button', { name: 'Prendre la photo', exact: true }).click();
  const title = `Intervention test ${Date.now()}`;
  await page.locator('#proof-title').fill(title);
  await page.locator('#proof-description').fill('Contexte conservé après la coupure réseau');
  await expect(page.getByLabel('État de sauvegarde')).toContainText(
    'Brouillon enregistré sur cet appareil uniquement',
  );
  await page.route('**/api/proofs', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
  );
  await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
  await expect(page.getByRole('button', { name: 'Réessayer le dépôt' })).toBeEnabled();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.unroute('**/api/proofs');
  await page.getByRole('button', { name: 'Reprendre le brouillon' }).click();
  await expect(page.locator('#proof-title')).toHaveValue(title);
  await expect(page.locator('#proof-description')).toHaveValue(
    'Contexte conservé après la coupure réseau',
  );
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/proofs') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
  const proof = await (await response).json();
  await expect(
    page.getByRole('heading', { name: 'Preuve enregistrée sur le serveur' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir la preuve enregistrée' }).click();
  await expect(page.getByLabel('Les cinq contrôles de la preuve')).toContainText(
    'Original et manifeste conformes',
  );
  await expect(page.getByLabel('Brouillon local en attente')).toHaveCount(0);
  await page.getByText('Lien de vérification des empreintes', { exact: true }).click();
  await page.getByLabel('Expiration du lien').selectOption('7');
  await page.getByRole('button', { name: 'Activer un lien de vérification' }).click();
  const updated = await (await page.request.get(`/api/proofs/${proof.id}`)).json();
  const visitor = await browser.newPage();
  await visitor.goto(`http://localhost:3011/verification/${updated.shareToken}`);
  await expect(visitor.getByText('Signature technique : vérifiée par le serveur')).toBeVisible();
  await expect(
    visitor.getByRole('heading', { name: 'Localisation partagée par le propriétaire' }),
  ).toHaveCount(0);
  const bytes = await (await page.request.get(`/api/proofs/${proof.id}/original`)).body();
  await visitor
    .getByLabel('Fichier à comparer localement')
    .setInputFiles({ name: 'original.jpg', mimeType: 'image/jpeg', buffer: bytes });
  await expect(
    visitor.getByText('Correspondance exacte des octets', { exact: true }),
  ).toBeVisible();
  await visitor
    .getByLabel('Fichier à comparer localement')
    .setInputFiles({ name: 'changed.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('changed') });
  await expect(visitor.getByText('Le fichier est différent', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Rapport PDF', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/proof-summary-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Révoquer le lien', exact: true }).click();
  await visitor.reload();
  await expect(visitor.getByRole('alert')).toContainText('Lien introuvable ou révoqué');
  await visitor.close();
  expect(errors).toEqual([]);
});
