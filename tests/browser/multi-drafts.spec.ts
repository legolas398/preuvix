import { test, expect, type Page } from '@playwright/test';
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'geolocation'],
  geolocation: { latitude: 48.8566, longitude: 2.3522, accuracy: 12 },
});
const origin = 'http://localhost:3011';
async function login(page: Page) {
  await page.request.post('/api/login', {
    headers: { Origin: origin },
    data: { password: 'browser-test-password-only' },
  });
  await page.goto('/');
}
async function capture(page: Page, title: string) {
  await page.getByRole('button', { name: 'Caméra', exact: true }).click();
  await page.getByRole('button', { name: 'Prendre la photo', exact: true }).click();
  await page.locator('#proof-title').fill(title);
  await expect(page.getByLabel('État de sauvegarde')).toContainText(
    'Brouillon enregistré sur cet appareil uniquement',
  );
}

test('two case drafts survive reconnect; resumed capture attaches to its original case and handles rotation', async ({
  page,
}) => {
  test.setTimeout(150000);
  await login(page);
  for (const name of ['Alpha', 'Beta']) {
    await page.getByRole('button', { name: 'Créer un dossier', exact: true }).click();
    await page.getByLabel('Titre du dossier multi-fichiers').fill(name);
    await page.getByLabel('Description du dossier').fill('Test de reprise par dossier');
    await page.getByRole('button', { name: 'Enregistrer le dossier', exact: true }).click();
    await page.getByRole('button', { name: 'Capturer une photo ou vidéo', exact: true }).click();
    await capture(page, 'Photo ' + name);
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.getByRole('button', { name: 'Tous les dossiers', exact: true }).click();
  }
  await expect(page.getByLabel('Brouillons locaux en attente').getByRole('listitem')).toHaveCount(
    2,
  );
  await page.request.post('/api/logout', { headers: { Origin: origin } });
  await page
    .getByRole('button', { name: 'Reprendre le brouillon : Photo Alpha', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Dossier associé : Alpha');
  await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
  await expect(page.getByLabel('Mot de passe pour reprendre')).toBeVisible();
  await page.getByLabel('Mot de passe pour reprendre').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Reconnecter et garder le brouillon' }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#proof-title')).toHaveValue('Photo Alpha');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/proofs', async (route) => {
    if (route.request().method() === 'POST')
      await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
  await expect(page.getByRole('button', { name: 'Dépôt et vérification…' })).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Preuve enregistrée sur le serveur' }),
  ).toBeVisible();
  // A tab may close after the server saved the file but before the case association.
  await page.reload();
  await page
    .getByRole('button', { name: 'Reprendre le brouillon : Photo Alpha', exact: true })
    .click();
  await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preuve enregistrée sur le serveur' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir la preuve enregistrée' }).click();
  await expect(page.getByLabel('Brouillons locaux en attente').getByRole('listitem')).toHaveCount(
    1,
  );
  const proofs = (await (await page.request.get('/api/proofs')).json()).proofs;
  const proof = proofs.find(
    (p: { manifest: { title: string } }) => p.manifest.title === 'Photo Alpha',
  );
  const cases = (await (await page.request.get('/api/cases')).json()).cases;
  const alpha = cases.find((c: { title: string }) => c.title === 'Alpha');
  const dossier = await (await page.request.get('/api/cases/' + alpha.id)).json();
  expect(
    dossier.manifest.files.some((file: { proofId: string }) => file.proofId === proof.id),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/multi-drafts-mobile.png', fullPage: true });
});

test('another tab cannot overwrite or resurrect a revised or deleted draft; legacy draft migrates', async ({
  page,
  context,
}) => {
  await page.goto('/comprendre');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('preuvix-web-drafts', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('drafts');
      open.onsuccess = () => {
        const transaction = open.result.transaction('drafts', 'readwrite');
        transaction
          .objectStore('drafts')
          .put(
            {
              file: new File(['legacy'], 'legacy.jpg'),
              captureId: 'legacy',
              title: 'Ancien brouillon',
              description: '',
              author: '',
              context: '',
              declared: false,
              requestKey: 'legacy-id',
              savedAt: new Date().toISOString(),
            },
            'pending',
          );
        transaction.oncomplete = () => {
          open.result.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
  const legacy = await page.evaluate(async () => {
    // @ts-expect-error Browser-side Vite module, not a Node import.
    const drafts = await import('/src/web-draft.ts');
    const items = await drafts.listDrafts();
    return { length: items.length, id: items[0].id, revision: items[0].revision };
  });
  expect(legacy).toEqual({ length: 1, id: 'legacy-id', revision: 1 });
  const second = await context.newPage();
  await second.goto('/comprendre');
  await second.evaluate(async () => {
    // @ts-expect-error Browser-side Vite module.
    const drafts = await import('/src/web-draft.ts');
    const current = await drafts.readDraft('legacy-id');
    await drafts.saveDraft({ ...current, title: 'Autre onglet' }, 1);
  });
  const conflict = await page.evaluate(async () => {
    // @ts-expect-error Browser-side Vite module.
    const drafts = await import('/src/web-draft.ts');
    const current = await drafts.readDraft('legacy-id');
    try {
      await drafts.saveDraft({ ...current, title: 'Écrasement' }, 1);
      return false;
    } catch {
      return true;
    }
  });
  expect(conflict).toBe(true);
  const deleted = await second.evaluate(async () => {
    // @ts-expect-error Browser-side Vite module.
    const drafts = await import('/src/web-draft.ts');
    const current = await drafts.readDraft('legacy-id');
    await drafts.deleteDraft(current.id, current.revision);
    try {
      await drafts.saveDraft(current, current.revision);
      return false;
    } catch {
      return (await drafts.listDrafts()).length === 0;
    }
  });
  expect(deleted).toBe(true);
  await second.close();
});
