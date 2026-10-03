import { test, expect } from '@playwright/test';

test('partner search, filtering and local request preparation', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/api/config', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route('**/api/partners', (route) =>
    route.fulfill({
      json: {
        partners: [
          {
            id: 'test-paris',
            name: 'Étude fictive Paris — test',
            city: 'Paris',
            departments: ['75'],
            services: ['Constat internet'],
            description: 'Fiche fictive réservée aux tests navigateur.',
            website: 'https://example.invalid/paris',
            directoryUrl: 'https://annuaire.commissaire-justice.fr/test-paris',
          },
          {
            id: 'test-lyon',
            name: 'Étude fictive Lyon — test',
            city: 'Lyon',
            departments: ['69'],
            services: ['Constat immobilier'],
            description: 'Fiche fictive réservée aux tests navigateur.',
            website: 'https://example.invalid/lyon',
            directoryUrl: 'https://annuaire.commissaire-justice.fr/test-lyon',
          },
        ],
      },
    }),
  );
  let posts = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST') posts++;
  });
  await page.goto('/');
  await page.getByLabel('Ville, département ou étude').fill('75');
  await expect(page.locator('.partner-card')).toHaveCount(1);
  await expect(page.locator('.partner-card')).toContainText('Paris');
  await page.getByLabel('Type de constat').selectOption('Constat immobilier');
  await expect(page.getByText('Aucune étude ne correspond à ces critères.')).toBeVisible();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(page.locator('.partner-card')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Préparer une demande pour Étude fictive Lyon — test' })
    .click();
  await page.getByLabel('Objet de la demande').fill('Constat avant travaux');
  await page
    .getByLabel('Faits à constater, lieu et dates utiles')
    .fill('État du mur avant intervention à Lyon.');
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger ma demande' }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('demande-constat-test-lyon.txt');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const draft = Buffer.concat(chunks).toString('utf8');
  expect(draft).toContain('État du mur avant intervention à Lyon.');
  expect(draft).toContain('Étude fictive Lyon — test');
  expect(posts).toBe(0);
  await expect(page.getByRole('link', { name: 'Contacter l’étude sur son site' })).toHaveAttribute(
    'href',
    'https://example.invalid/lyon',
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.partner-directory').screenshot({ path: 'test-results/partners-mobile.png' });
});

test('directory handles service failure and an empty confirmed network', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/api/config', (route) => route.fulfill({ json: { authenticated: false } }));
  let available = false;
  await page.route('**/api/partners', (route) => {
    return !available
      ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
      : route.fulfill({ json: { partners: [] } });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('momentanément indisponible');
  available = true;
  await page.getByRole('button', { name: 'Réessayer le répertoire' }).click();
  await expect(page.getByText('Notre réseau de partenaires se prépare.')).toBeVisible();
  await expect(page.locator('.partner-card')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ouvrir l’annuaire officiel' })).toHaveAttribute(
    'href',
    'https://annuaire.commissaire-justice.fr/',
  );
});
