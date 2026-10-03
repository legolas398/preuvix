import { test, expect } from '@playwright/test';

test('themes follow system changes, synchronize tabs and survive unavailable storage', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Système', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'Minuit');
  await expect(page.locator('.welcome')).toHaveAttribute('data-theme', 'Minuit');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'Orange');
  await expect(page.getByRole('button', { name: 'Système', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Aurore', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'Aurore');
  await other.close();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'Aurore');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage disabled');
    };
  });
  await page.getByRole('button', { name: 'Minuit', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'Minuit');
  await expect(page.getByRole('button', { name: 'Mouvement réduit' })).toBeDisabled();
});

test('every workspace section and shared page inherits the selected palette', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Minuit', exact: true }).click();
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'Minuit');
  await expect(page.locator('.records')).toHaveCSS('background-color', 'rgb(26, 44, 53)');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/themes-workspace-minuit.png', fullPage: true });
  for (const section of ['Vérifier un fichier', 'Comprendre PREUVIX', 'Mon abonnement']) {
    await page.locator('.sidebar nav').getByRole('button', { name: section }).click();
    await expect(page.locator('.main-content')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'Minuit');
    const whiteSurfaces = await page
      .locator('.verify-entry, .about-grid article, .billing-workspace')
      .evaluateAll(
        (elements) =>
          elements.filter((el) => getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)')
            .length,
      );
    expect(whiteSurfaces).toBe(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Aurore', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'Aurore');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/themes-workspace-mobile.png', fullPage: true });
  await page.goto(`/verification/${'a'.repeat(48)}`);
  await expect(page.locator('.verification-card')).toBeVisible();
  await page.getByRole('button', { name: 'Minuit', exact: true }).click();
  await expect(page.locator('.verification-card')).toHaveCSS('background-color', 'rgb(26, 44, 53)');
  await page.goto(`/dossier/${'b'.repeat(64)}`);
  await expect(page.locator('.recipient-card')).toHaveCSS('background-color', 'rgb(26, 44, 53)');
  expect(errors).toEqual([]);
});
