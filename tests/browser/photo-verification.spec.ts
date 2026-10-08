import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { unzipSync, strFromU8 } from 'fflate';
import { readFileSync } from 'node:fs';

test('private photo verification shows four blocks and exports a signed private report', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.request.post('/api/login', {
    headers: { Origin: 'http://localhost:3011' },
    data: { password: 'browser-test-password-only' },
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Vérifier un fichier' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifier une photo' })).toBeVisible();
  const bytes = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#88aacc' },
  })
    .jpeg()
    .withExif({ IFD0: { Software: 'ComfyUI' } })
    .toBuffer();
  let uploads = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/photo-verification')) uploads++;
  });
  await page
    .getByLabel('Photo originale')
    .setInputFiles({ name: 'test.jpg', mimeType: 'image/jpeg', buffer: bytes });
  expect(uploads).toBe(0);
  await page.getByRole('button', { name: 'Vérifier', exact: true }).click();
  for (const name of [
    'Intégrité',
    'Provenance',
    'Informations relatives à l’IA',
    'Dates et contexte',
  ])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(
    page.getByText('création d’une référence — aucune comparaison', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Indices IA à examiner', { exact: true })).toBeVisible();
  await expect(page.getByText('Métadonnée mentionnant ComfyUI', { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le rapport de vérification' }).click();
  const download = await downloaded;
  const zip = unzipSync(readFileSync((await download.path())!));
  expect(zip['manifest.sig']).toBeTruthy();
  expect(Object.keys(zip).some((k) => k.startsWith('original'))).toBe(false);
  expect(JSON.parse(strFromU8(zip['manifest.json'])).schema).toBe('preuvix-photo-verification/1');
  expect(JSON.parse(strFromU8(zip['manifest.json'])).ai.status).toBe('signals_found');
  await page.screenshot({ path: 'test-results/photo-verification-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/photo-verification-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
