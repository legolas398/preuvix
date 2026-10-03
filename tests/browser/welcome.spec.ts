import { test, expect } from '@playwright/test';

test('welcome themes persist, rights switch and free/premium actions work', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/api/config', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Vos droits méritent des preuves.' }),
  ).toBeVisible();
  await expect(page.locator('.welcome')).toHaveAttribute('data-theme', 'Orange');
  await page.mouse.move(240, 180);
  await expect(page.locator('.welcome')).toHaveAttribute('style', /--pointer-x/);
  await page.getByRole('button', { name: 'Animation : activée' }).click();
  await expect(page.locator('.welcome')).toHaveAttribute('data-motion', 'off');
  await page.getByRole('button', { name: 'Minuit', exact: true }).click();
  await expect(page.locator('.welcome')).toHaveAttribute('data-theme', 'Minuit');
  await page.reload();
  await expect(page.locator('.welcome')).toHaveAttribute('data-theme', 'Minuit');
  await expect(page.locator('.welcome')).toHaveAttribute('data-motion', 'off');
  await page.getByRole('button', { name: 'ART. 1358 Modes de preuve' }).click();
  await expect(
    page.getByRole('heading', { name: 'Plusieurs moyens de faire la preuve.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'CGU · Conditions d’utilisation' }).click();
  await expect(page.locator('#terms-title')).toBeInViewport();
  await page.locator('#cgu summary').filter({ hasText: 'Cookies, préférences et droits' }).click();
  await expect(page.locator('#cgu details[open]')).toContainText('douze heures');
  await page.getByRole('button', { name: 'ART. 1366 Preuve électronique' }).click();
  await expect(page.getByRole('heading', { name: 'Le numérique a sa place.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Consulter la source officielle' })).toHaveAttribute(
    'href',
    'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461',
  );
  await expect(page.getByRole('button', { name: 'Paiement non activé' })).toBeDisabled();
  await expect(page.locator('#premium-subscription')).toContainText('10,99');
  await page.getByRole('link', { name: 'Faire appel à un commissaire de justice' }).click();
  await expect(page.locator('#constat-title')).toBeInViewport();
  const directory = page.getByRole('link', { name: 'Trouver un commissaire de justice' });
  await expect(directory).toHaveAttribute('href', 'https://annuaire.commissaire-justice.fr/');
  await expect(directory).toHaveAttribute('target', '_blank');
  await page.getByText('Préparer ma demande de constat', { exact: true }).click();
  await expect(
    page.getByText('Vos fichiers originaux et le dossier Preuvix exporté.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Accéder à mon espace gratuit' }).click();
  await expect(page.getByLabel('Mot de passe de l’espace')).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/welcome-midnight-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Aurore', exact: true }).click();
  await expect(page.locator('.welcome')).toHaveAttribute('data-theme', 'Aurore');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/welcome-aurora-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => !el.closest('.leaflet-pane') && el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => el.className),
  );
  expect(overflowing).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Orange', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/welcome-orange-desktop.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Mouvement réduit' })).toBeDisabled();
  await expect(page.locator('.welcome')).toHaveAttribute('data-motion', 'off');
});
