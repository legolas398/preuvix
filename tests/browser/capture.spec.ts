import { test, expect } from '@playwright/test';
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test('guided photo and video capture commit hashes, preserve declared context and produce signed dossiers', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await context.grantPermissions(['camera', 'microphone']);
  await page.goto('/');
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  for (const kind of ['photo', 'video']) {
    await page.getByRole('button', { name: 'Créer une preuve', exact: true }).click();
    await page.getByRole('button', { name: 'Caméra', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Prendre la photo', exact: true })).toBeEnabled({
      timeout: 30000,
    });
    if (kind === 'photo')
      await page.getByRole('button', { name: 'Prendre la photo', exact: true }).click();
    else {
      await page.getByRole('button', { name: 'Filmer une vidéo', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Enregistrement · 2', {
        timeout: 10000,
      });
      await page.getByRole('button', { name: 'Terminer la vidéo', exact: true }).click();
    }
    await expect(
      page.getByText('Empreinte engagée auprès du serveur.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Titre du dossier').fill(`Capture ${kind} guidée`);
    await page.getByLabel('Auteur déclaré').fill('Auteur de test');
    await page
      .getByLabel('Lieu, circonstances et modifications connues')
      .fill('Flux artificiel du navigateur de test, aucune scène réelle.');
    await page.getByLabel('Je décris les faits de bonne foi', { exact: false }).check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    const deposited = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/proofs') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
    const response = await deposited;
    expect(response.status()).toBe(201);
    const proof = await response.json();
    expect(proof.manifest.capture.kind).toBe(kind);
    expect(proof.manifest.capture.sha256).toBe(proof.manifest.file.sha256);
    expect(proof.manifest.declaration.author).toBe('Auteur de test');
    expect(proof.attestation.algorithm).toBe('Ed25519');
    // Chromium's fake camera ("fake_device_0") is exactly what the device check must catch.
    expect(proof.manifest.capture.device.label).toMatch(/fake/i);
    expect(proof.manifest.certification.status).toBe('review_required');
    expect(
      proof.manifest.certification.checks.find((check: { id: string }) => check.id === 'device')
        .result,
    ).toBe('review');
    if (kind === 'video') {
      expect(proof.manifest.capture.progressive.checkpoints).toBeGreaterThanOrEqual(1);
      expect(proof.manifest.capture.progressive.verified).toBe(true);
    }
    const chain = page.getByRole('region', { name: 'Chaîne de preuve' });
    await expect(chain).toContainText('caméra déclarée « fake_device_0 »');
    if (kind === 'video') await expect(chain).toContainText('Enregistrement progressif');
    await expect(page.getByRole('region', { name: 'Processus de certification' })).toContainText(
      'Aucun certificat « sans IA »',
    );
    await expect(page.getByLabel('Attestation technique')).toContainText('Manifeste signé');
    if (kind === 'video') await expect(page.locator('.detail-image video')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Rapport PDF' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await page.request.delete(`/api/proofs/${proof.id}`, {
      headers: { Origin: 'http://localhost:3011' },
    });
    await page.reload();
  }
});
