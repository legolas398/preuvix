import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

// Chromium exercises the actual embedded bundle and real Express API.
// Capacitor origin is simulated; native camera/permission dialogs still require a device.
test('mobile login, dossier, denied location, lost upload response, retry and PDF', async ({
  page,
}) => {
  let loseResponse = false;
  let token = '';
  const uploadIds: string[] = [];
  const errors: string[] = [];
  const { backend } = JSON.parse(await readFile('dist-android/mobile-build.json', 'utf8'));
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
  await page.route(`${backend}/api/**`, async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace(backend, 'http://localhost:3013'),
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
    // A USB tunnel may work even when the OS reports no Internet connection.
    Object.defineProperty(navigator, 'onLine', { get: () => false });
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition(success: (value: unknown) => void, failure: (error: unknown) => void) {
          const mode = sessionStorage.getItem('location-mode');
          if (mode === 'granted')
            success({
              coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 12 },
              timestamp: Date.now(),
            });
          else
            failure({
              code: mode === 'unavailable' ? 2 : 1,
              message: mode === 'unavailable' ? 'Position unavailable' : 'User denied Geolocation',
            });
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
  await expect(page.getByRole('button', { name: /Choisir (une photo|un document)/ })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Prendre une photo ou une vidéo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Défi en direct' })).toHaveCount(0);
  let commits = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/commit')) commits++;
  });
  for (const mode of ['denied', 'unavailable']) {
    await page.evaluate((mode) => sessionStorage.setItem('location-mode', mode), mode);
    if (mode === 'unavailable')
      await page.getByRole('button', { name: 'Recommencer la session' }).click();
    await expect(page.getByRole('alert')).toContainText('Localisation obligatoire');
    await expect(page.getByRole('button', { name: 'Prendre la photo', exact: true })).toBeDisabled();
    expect(commits).toBe(0);
  }
  await page.evaluate(() => sessionStorage.setItem('location-mode', 'granted'));
  await page.getByRole('button', { name: 'Recommencer la session' }).click();
  await page.getByRole('button', { name: 'Prendre la photo', exact: true }).click();
  const draft = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'capture-photo.jpg', exact: true }) });
  await expect(draft).toContainText('48.856600');
  expect(commits).toBe(1);
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
  await expect(page.getByRole('heading', { name: 'capture-photo.jpg', exact: true })).toHaveCount(
    1,
  );
  await expect(page.getByRole('region', { name: 'Pièces du dossier' })).toContainText('48.856600');
  await page.getByRole('button', { name: 'Prendre une photo ou une vidéo', exact: true }).click();
  await page.getByRole('button', { name: 'Filmer une vidéo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistrement ·' })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('location-mode', 'unavailable'));
  await page.getByRole('button', { name: 'Terminer la vidéo' }).click();
  await expect(page.getByRole('alert')).toContainText('Localisation de fin obligatoire');
  expect(commits).toBe(1);
  await page.evaluate(() => sessionStorage.setItem('location-mode', 'granted'));
  await page.getByRole('button', { name: 'Recommencer la session' }).click();
  await page.getByRole('button', { name: 'Filmer une vidéo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistrement · 2 /' })).toBeVisible();
  await page.getByRole('button', { name: 'Terminer la vidéo' }).click();
  const videoDraft = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /capture-video\.(webm|mp4)/ }) });
  await expect(videoDraft).toContainText('Vidéo en direct');
  await videoDraft.getByRole('button', { name: 'Envoyer ce brouillon' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByText(/Position en fin de vidéo/)).toContainText('48.856600', {
    timeout: 60000,
  });
  expect(commits).toBe(2);
  await expect(page.getByText(/Justificatifs de la version/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Demander un horodatage prestataire' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Demander l’ancrage blockchain' })).toBeDisabled();
  await page.getByRole('button', { name: 'Actualiser les justificatifs' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  // Simulate a configured provider without publishing a real blockchain transaction.
  let requestedVersion = 0;
  await page.route(`${backend}/api/cases/**`, async (route) => {
    if (route.request().url().endsWith('/services/anchor')) {
      const body = route.request().postDataJSON();
      expect(body.consent).toBe(true);
      requestedVersion = body.version;
      return route.fulfill({ json: {} });
    }
    if (
      route.request().method() !== 'GET' ||
      !/^\/api\/cases\/[^/]+$/.test(new URL(route.request().url()).pathname)
    )
      return route.fallback();
    const response = await route.fetch({
      url: route.request().url().replace(backend, 'http://localhost:3013'),
      headers: { ...route.request().headers(), origin: 'https://localhost' },
    });
    const detail = await response.json();
    detail.services.anchor = { configured: true, provider: 'Test provider' };
    if (requestedVersion) {
      expect(requestedVersion).toBe(detail.manifest.version);
      detail.operations = [
        {
          id: 'test-anchor',
          kind: 'anchor',
          state: 'pending',
          attempts: 1,
          updatedAt: new Date().toISOString(),
          result: null,
          error: null,
        },
      ];
    }
    return route.fulfill({ json: detail });
  });
  await page.getByRole('button', { name: 'Actualiser les justificatifs' }).click();
  const anchor = page.getByRole('button', { name: 'Demander l’ancrage blockchain' });
  await expect(anchor).toBeDisabled();
  await page.getByLabel(/J’autorise l’ancrage/).check();
  await expect(anchor).toBeEnabled();
  await anchor.click();
  await expect(page.getByRole('button', { name: 'Actualiser la demande · ancrage' })).toBeVisible();
  await expect(anchor).toBeDisabled();
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
      proof.manifest.file.name === 'capture-photo.jpg',
  );
  expect(matching.length).toBeGreaterThan(0);
  expect(matching.at(-1).manifest.capture.challenge).toBeUndefined();
  expect(matching.at(-1).manifest.certification.status).toBe('capture_documented');
  expect(uploadIds).toHaveLength(3);
  expect(uploadIds[0]).toBe(uploadIds[1]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.tools/android-browser-check.png', fullPage: true });
});
