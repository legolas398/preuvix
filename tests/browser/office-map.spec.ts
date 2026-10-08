import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Keep map interaction checks independent of the external tile server.
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
});

test('real directory locations are searchable and selectable without any Preuvix partners', async ({
  page,
}) => {
  await page.route('**/api/config', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route('**/api/partners', (route) => route.fulfill({ json: { partners: [] } }));
  await page.goto('/');
  const search = page.getByLabel('Rechercher sur la carte : ville, code postal ou étude');
  await search.fill('69002');
  await page.getByRole('button', { name: 'Afficher les résultats', exact: true }).click();
  const offices = page.locator('.office-map-results button');
  await expect(offices.first()).toBeVisible();
  await expect(offices.first()).toContainText('69002');
  await offices.first().click();
  await expect(page.locator('.leaflet-popup')).toContainText('LYON');
  await expect(page.locator('.leaflet-popup')).toContainText('partenariat Preuvix non confirmé');
  await expect(
    page.locator('.leaflet-popup a').filter({ hasText: 'fiche officielle' }),
  ).toHaveAttribute('href', /^https:\/\/annuaire\.commissaire-justice\.fr\/fiche\.aspx\?id=\d+$/);
  await expect(page.locator('.leaflet-popup a').filter({ hasText: 'Itinéraire' })).toHaveAttribute(
    'href',
    /destination=45\./,
  );
  await search.fill('aucune-etude-xyz');
  await expect(
    page.getByText('Aucune étude trouvée. Essayez une ville ou un code postal différent.'),
  ).toBeVisible();
  await page.getByLabel('Explorer une ville').selectOption('Bordeaux');
  await expect(offices.first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('.partner-map-shell')
    .screenshot({ path: 'test-results/real-offices-mobile.png' });
});

test('office catalog failure gives a retry and recovers', async ({ page }) => {
  let available = false;
  await page.route('**/offices.json', (route) =>
    available ? route.continue() : route.fulfill({ status: 503, body: '' }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: 'localisations sont indisponibles' }),
  ).toBeVisible({ timeout: 30000 });
  available = true;
  await page.getByRole('button', { name: 'Réessayer les localisations' }).click();
  await expect(page.locator('.office-map-results button').first()).toBeVisible();
});
