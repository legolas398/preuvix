import { test, expect } from '@playwright/test';

test('loading screen transitions to a usable proof demo on mobile', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/config', async (route) => {
    await ready;
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Chaque preuve compte.' })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'ART. 1358 Modes de preuve' }).click();
  await expect(
    page.getByRole('heading', { name: 'Plusieurs moyens de faire la preuve.' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/loading-orange-mobile.png', fullPage: true });
  release();
  await expect(page.getByRole('heading', { name: 'Votre espace de preuves' })).toBeVisible();
  await page.getByRole('button', { name: 'Revoir l’écran de chargement' }).click();
  await expect(page.getByRole('status')).toContainText('Aperçu');
  await page.getByRole('button', { name: 'Aurore', exact: true }).click();
  await page.getByRole('button', { name: 'Continuer vers Preuvix' }).click();
  await expect(page.locator('.welcome')).toHaveAttribute('data-theme', 'Aurore');
  await expect(page.getByRole('heading', { name: 'Votre espace de preuves' })).toBeVisible();
  await page.getByRole('button', { name: 'Lancer la démo' }).click();
  await expect(page.getByRole('heading', { name: 'Scan de l’empreinte' })).toBeVisible();
  await expect(page.getByText('Rapport de démonstration', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rejouer la démo' }).click();
  await expect(page.getByRole('heading', { name: 'Lecture de la preuve' })).toBeVisible();
  await page.getByRole('button', { name: 'Arrêter la démo' }).click();
  await page.getByRole('button', { name: 'Lecture du rapport', exact: true }).click();
  await expect(page.getByText('Rapport de démonstration', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/demo-mobile.png', fullPage: true });
});
