import { test, expect } from '@playwright/test';

test('monthly EUR checkout requires login and a return URL alone never grants Premium', async ({
  page,
}) => {
  test.setTimeout(120000);
  let paid = false;
  let checkoutCalls = 0;
  await page.route('**/api/billing/plan', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        testMode: true,
        unitAmount: 1099,
        currency: 'eur',
        interval: 'month',
        taxBehavior: 'inclusive',
        premiumStorageMb: 5000,
      },
    }),
  );
  await page.route('**/api/billing/status', (route) =>
    route.fulfill({
      json: {
        status: paid ? 'active' : 'none',
        premium: paid,
        canManage: paid,
        cancelAtPeriodEnd: false,
        maxStorageMb: paid ? 5000 : 500,
      },
    }),
  );
  await page.route('**/api/billing/checkout', (route) => {
    checkoutCalls++;
    expect(route.request().postDataJSON()).toEqual({ expectedAmount: 1099 });
    return route.fulfill({ json: { url: 'https://checkout.stripe.com/c/pay/preuvix-test' } });
  });
  await page.route('**/api/billing/portal', (route) =>
    route.fulfill({ json: { url: 'https://billing.stripe.com/p/session/preuvix-test' } }),
  );
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<h1>Checkout Stripe simulé</h1>',
    }),
  );
  await page.route('https://billing.stripe.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<h1>Portail Stripe simulé</h1>',
    }),
  );
  await page.goto('/');
  await expect(page.locator('#premium-subscription')).toContainText('10,99');
  await page.getByRole('link', { name: 'Se connecter pour s’abonner' }).click();
  expect(checkoutCalls).toBe(0);
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  await page.getByRole('button', { name: 'Tester l’abonnement Stripe' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout Stripe simulé' })).toBeVisible();
  expect(checkoutCalls).toBe(1);
  await page.goto('/?billing=success#billing');
  await expect(page.locator('.billing-status')).toContainText('Capacité gratuite active');
  await expect(page.locator('.billing-return')).toContainText('ne confirme pas un paiement');
  paid = true;
  await page.getByRole('button', { name: 'Actualiser le statut' }).click();
  await expect(page.locator('.billing-status')).toContainText('Abonnement actif');
  await expect(page.locator('.storage-card progress')).toHaveAttribute(
    'max',
    String(5000 * 1024 * 1024),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/billing-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Gérer mon abonnement' }).click();
  await expect(page.getByRole('heading', { name: 'Portail Stripe simulé' })).toBeVisible();
});
