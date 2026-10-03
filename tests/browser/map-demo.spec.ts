import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

test('map markers, local search and real demo integrity work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/config', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('**/api/partners', (route) =>
    route.fulfill({
      json: {
        partners: [
          {
            id: 'test-paris',
            name: 'Étude fictive Paris',
            city: 'Paris',
            coordinates: { lat: 48.8566, lng: 2.3522 },
            departments: ['75'],
            services: ['Constat internet'],
            description: 'Exemple réservé aux tests navigateur.',
            website: 'https://example.invalid',
            directoryUrl: 'https://annuaire.commissaire-justice.fr/test',
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await expect(page.locator('.demo-digests code').first()).toHaveText(/^[a-f0-9]{64}$/);
  const original = await page.locator('.demo-real-document').innerText();
  await expect(page.locator('.demo-digests code').first()).toHaveText(
    createHash('sha256').update(original).digest('hex'),
  );
  await page.getByLabel('Modifier la copie après dépôt').check();
  await expect(page.locator('.demo-integrity')).toContainText('Modification détectée');
  const changed = await page.locator('.demo-real-document').innerText();
  await expect(page.locator('.demo-digests code').nth(1)).toHaveText(
    createHash('sha256').update(changed).digest('hex'),
  );
  await page.getByRole('button', { name: 'Lecture du rapport', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le rapport d’exemple' }).click();
  expect((await pending).suggestedFilename()).toBe('preuvix-demo-integrite.txt');
  await page.getByRole('button', { name: 'Travaux', exact: true }).click();
  await expect(page.locator('.demo-real-document')).toContainText('joint manquant');
  await expect(page.locator('.demo-integrity')).toContainText('Contenu identique');
  await page.getByLabel('Explorer une ville').selectOption('Paris');
  await page.locator('.partner-map-pin').click();
  await expect(page.locator('.leaflet-popup')).toContainText('Étude fictive Paris');
  await page
    .locator('.leaflet-popup')
    .getByRole('button', { name: 'Préparer une demande', exact: true })
    .click();
  await expect(page.locator('.partner-request')).toBeVisible();
  await page.getByLabel('Trouver un commissaire de justice dans votre commune').fill('Lyon 69002');
  await expect(page.getByRole('link', { name: 'Rechercher sur Google Maps' })).toHaveAttribute(
    'href',
    /Lyon%2069002/,
  );
  await page.getByLabel('Ville, département ou étude').fill('inexistant');
  await expect(page.locator('.partner-map-pin')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.proof-demo').screenshot({ path: 'test-results/demo-real-mobile.png' });
  await page.locator('.partner-map-shell').screenshot({ path: 'test-results/map-mobile.png' });
});
