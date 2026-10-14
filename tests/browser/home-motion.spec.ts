import { test, expect } from '@playwright/test';

test('homepage section navigation stays usable with reveals and animation paused', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.homepage h1')).toContainText('un dossier clair.');
  const nav = page.getByRole('navigation', { name: 'Navigation d’accueil' });
  await nav.getByRole('link', { name: 'Nos offres' }).click();
  await expect(page.locator('#offres h2')).toBeInViewport();
  await expect(nav.getByRole('link', { name: 'Nos offres' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await expect(page.locator('#offres')).toHaveCSS('opacity', '1');
  await nav.getByRole('link', { name: 'Questions fréquentes' }).click();
  await page.locator('#faq summary').first().click();
  await expect(page.locator('#faq details[open] p')).toBeVisible();
  await page.getByRole('button', { name: 'Animation : activée' }).click();
  await expect(page.locator('.homepage')).toHaveAttribute('data-motion', 'off');
  await expect(page.locator('[data-reveal="pending"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.homepage')).toHaveAttribute('data-motion', 'off');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
});

test('mobile homepage supports reduced motion, keyboard access and bottom comparison', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.homepage')).toHaveAttribute('data-motion', 'off');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Accéder à mon espace' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#connexion')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Mot de passe de l’espace')).toBeFocused();
  await expect(page.getByLabel('Mot de passe de l’espace')).toBeInViewport();
  await page
    .getByRole('navigation', { name: 'Navigation d’accueil' })
    .getByRole('link', { name: 'Web & Android' })
    .click();
  await expect(page.locator('#platforms-title')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('[data-reveal="pending"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
