import { test, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});
test('Android shares the website workspace, capture, exports, tools and navigation', async ({
  page,
}) => {
  test.setTimeout(180000);
  const { backend } = JSON.parse(await readFile('dist-android/mobile-build.json', 'utf8'));
  const errors: string[] = [];
  let token = '';
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://localhost/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith('/api/'))
      throw new Error('API request leaked to the Android asset origin');
    const asset = /\.[a-z0-9]+$/i.test(pathname) ? pathname : '/index.html';
    const file = path.resolve('dist-android', '.' + asset);
    if (!file.startsWith(path.resolve('dist-android') + path.sep)) return route.abort();
    const type = file.endsWith('.js')
      ? 'application/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.html')
          ? 'text/html'
          : file.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream';
    await route.fulfill({ body: await readFile(file), contentType: type });
  });
  await page.route(`${backend}/api/**`, async (route) => {
    const response = await route.fetch({
      maxRetries: 2,
      timeout: 90000,
      url: route.request().url().replace(backend, 'http://localhost:3013'),
      headers: { ...route.request().headers(), origin: 'https://localhost' },
    });
    if (route.request().url().endsWith('/mobile/login') && response.ok())
      token = (await response.json()).token;
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (success: PositionCallback) =>
        success({
          coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 10 },
          timestamp: Date.now(),
        } as GeolocationPosition),
    });
  });
  await page.goto('https://localhost/');
  await expect(page.locator('.welcome-header')).toBeVisible();
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('button', { name: 'Dossiers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Créer un dossier', exact: true }).click();
  const title = `Parité Android ${Date.now()}`;
  await page.getByLabel('Titre du dossier multi-fichiers').fill(title);
  await page.getByLabel('Description du dossier').fill('Même parcours que le site.');
  await page.getByRole('button', { name: 'Enregistrer le dossier', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Capturer une photo ou vidéo', exact: true }).click();
  await page.getByRole('button', { name: 'Caméra', exact: true }).click();
  await page.getByRole('button', { name: 'Prendre la photo', exact: true }).click();
  await page.locator('#proof-title').fill('Photo Android commune');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/proofs') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const proof = await response.json();
  await page.getByRole('button', { name: 'Ouvrir la preuve enregistrée' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Contrôler l’intégrité du dossier' }).click();
  await expect(page.getByRole('status')).toContainText('Intégrité vérifiée');
  for (const [name, filename] of [
    ['Télécharger le PDF', 'recapitulatif.pdf'],
    ['Télécharger le dossier ZIP', 'dossier-v2.zip'],
  ]) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    expect((await pending).suggestedFilename()).toBe(filename);
  }
  await page.getByText('Partager explicitement cette version', { exact: true }).click();
  await page
    .getByLabel('Je confirme le partage de cette version et des informations indiquées.')
    .check();
  await page.getByRole('button', { name: 'Créer un lien révocable', exact: true }).click();
  const share = page
    .getByRole('status')
    .filter({ hasText: 'Copiez ce lien maintenant' })
    .getByRole('link');
  await expect(share).toHaveAttribute(
    'href',
    new RegExp('^' + backend.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/consultation-dossier/'),
  );
  await page.getByText('Preuves et outils', { exact: true }).click();
  await page.getByRole('button', { name: /Toutes les preuves/ }).click();
  const image = page.locator(`img[src^="blob:"]`).first();
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await nav.getByRole('button', { name: 'Vérifier', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Vérifier une photo', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Préparation Premium', exact: true }).click();
  await expect(page.getByText('Préparation Premium').first()).toBeVisible();
  await page.getByRole('button', { name: 'Comprendre PREUVIX', exact: true }).click();
  await page.getByRole('link', { name: 'Consulter l’annuaire séparément', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Annuaire des commissaires de justice', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Retour à PREUVIX/ }).click();
  await expect(nav).toBeVisible(); // Internal navigation retains the in-memory login.
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const persisted = await page.request.get(`http://localhost:3013/api/proofs/${proof.id}`, {
    headers: { Origin: 'https://localhost', Authorization: `Bearer ${token}` },
  });
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).manifest.title).toBe('Photo Android commune');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.tools/android-parity.png', fullPage: true });
});
