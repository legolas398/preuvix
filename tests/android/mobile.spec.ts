import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Chromium exercises the actual embedded bundle and real Express API.
// Capacitor origin is simulated; native camera/permission dialogs still require a device.
test('mobile login, dossier, denied location, lost upload response, retry and PDF', async ({
  page,
}) => {
  let loseResponse = false;
  let token = '';
  const uploadIds: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://localhost/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = path.resolve('dist-android', pathname === '/' ? 'index.html' : '.' + pathname);
    if (!file.startsWith(path.resolve('dist-android') + path.sep)) return route.abort();
    const type = file.endsWith('.js')
      ? 'application/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.html')
          ? 'text/html'
          : 'application/octet-stream';
    await route.fulfill({ body: await readFile(file), contentType: type });
  });
  await page.route('http://10.0.2.2:3000/api/**', async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace('http://10.0.2.2:3000', 'http://localhost:3013'),
      headers: { ...route.request().headers(), origin: 'https://localhost' },
    });
    if (route.request().url().endsWith('/mobile/login') && route.request().method() === 'POST')
      token = (await response.json()).token;
    if (
      route.request().url().endsWith('/mobile/proofs') &&
      route.request().method() === 'POST' &&
      response.ok()
    )
      uploadIds.push((await response.json()).id);
    if (
      loseResponse &&
      route.request().url().endsWith('/mobile/proofs') &&
      route.request().method() === 'POST'
    ) {
      loseResponse = false;
      return route.abort('failed'); // Server has stored bytes, client has not received acknowledgement.
    }
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition(_success: unknown, failure: (error: unknown) => void) {
          failure({ code: 1, message: 'User denied Geolocation' });
        },
      },
    });
  });
  await page.goto('https://localhost/');
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  await page.getByRole('button', { name: 'Créer un dossier', exact: true }).click();
  const title = `Android ${Date.now()}`;
  await page.getByLabel('Titre du dossier', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  const caseDraft = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: title }) });
  await caseDraft.getByRole('button', { name: 'Envoyer ce brouillon' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByLabel('Ajouter ma position au moment de l’action').check();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choisir un document' }).click();
  const buffer = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#dd8730' },
  })
    .png()
    .toBuffer();
  await (await chooser).setFiles({ name: 'preuve-mobile.png', mimeType: 'image/png', buffer });
  const draft = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'preuve-mobile.png', exact: true }) });
  await expect(draft).toContainText('Permission de localisation refusée');
  loseResponse = true;
  await draft.getByRole('button', { name: 'Envoyer ce brouillon' }).click();
  await expect(page.getByRole('alert')).toContainText('brouillon est conservé');
  // Real reload demonstrates IndexedDB persistence; bearer is deliberately not persisted.
  await page.reload();
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  await page.getByRole('button', { name: /^Brouillons/ }).click();
  await draft.getByRole('button', { name: 'Envoyer ce brouillon' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'preuve-mobile.png', exact: true })).toHaveCount(
    1,
  );
  await expect(page.getByRole('region', { name: 'Pièces du dossier' })).toContainText(
    'Permission de localisation refusée',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer / partager le PDF', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('dossier-preuvix.pdf');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const proofs = await page.request.get('http://localhost:3013/api/proofs', {
    headers: { Origin: 'https://localhost', Authorization: `Bearer ${token}` },
  });
  expect(proofs.status()).toBe(200);
  const matching = (await proofs.json()).proofs.filter(
    (proof: { manifest: { file: { name: string } } }) =>
      proof.manifest.file.name === 'preuve-mobile.png',
  );
  expect(matching.length).toBeGreaterThan(0);
  expect(uploadIds).toHaveLength(2);
  expect(uploadIds[0]).toBe(uploadIds[1]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.tools/android-browser-check.png', fullPage: true });
});
