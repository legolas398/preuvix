import { test, expect } from '@playwright/test';
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test('capture geolocation is opt-in and denial or unavailability does not block the photo', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_success: unknown, failure: (error: { code: number }) => void) => {
        calls++;
        failure({ code: calls === 1 ? 1 : 2 });
      },
    });
    Object.defineProperty(window, 'locationTestCalls', { get: () => calls });
  });
  await page.request.post('/api/login', {
    headers: { Origin: 'http://localhost:3011' },
    data: { password: 'browser-test-password-only' },
  });
  await page.goto('/');
  for (const [index, status] of ['not_requested', 'denied', 'unavailable'].entries()) {
    await page.getByRole('button', { name: 'Créer une preuve', exact: true }).click();
    await page.getByRole('button', { name: 'Caméra', exact: true }).click();
    const checkbox = page.getByLabel('Inclure la localisation de la prise de vue');
    await expect(checkbox).not.toBeChecked();
    if (index) await checkbox.check();
    const committed = page.waitForResponse((response) =>
      /\/api\/captures\/[^/]+\/commit$/.test(response.url()),
    );
    await page.getByRole('button', { name: 'Prendre la photo', exact: true }).click();
    const response = await committed;
    expect(response.status()).toBe(200);
    expect((await response.json()).location.start.status).toBe(status);
    expect(
      await page.evaluate(
        () => (window as unknown as { locationTestCalls: number }).locationTestCalls,
      ),
    ).toBe(index);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  }
});

test('guided photo and video capture commit hashes, preserve declared context and produce signed dossiers', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await context.grantPermissions(['camera', 'microphone', 'geolocation']);
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522, accuracy: 15 });
  await page.goto('/');
  await page.getByLabel('Mot de passe de l’espace').fill('browser-test-password-only');
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
  for (const kind of ['photo', 'video']) {
    await page.getByRole('button', { name: 'Créer une preuve', exact: true }).click();
    await page.getByRole('button', { name: 'Caméra', exact: true }).click();
    await page.getByLabel('Inclure la localisation de la prise de vue').check();
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
    await page.getByText('Déclarations complémentaires (facultatives)', { exact: true }).click();
    await expect(
      page.getByText('Empreinte engagée auprès du serveur.', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Titre du dossier').fill(`Capture ${kind} guidée`);
    await page.getByLabel('Auteur déclaré').fill('Auteur de test');
    await page
      .getByLabel('Lieu, circonstances et modifications connues')
      .fill('Flux artificiel du navigateur de test, aucune scène réelle.');
    await page.getByLabel('Je décris les faits de bonne foi', { exact: false }).check();
    const deposited = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/proofs') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Conserver ma preuve' }).click();
    const response = await deposited;
    expect(response.status()).toBe(201);
    const proof = await response.json();
    expect(proof.manifest.capture.kind).toBe(kind);
    expect(proof.manifest.capture.location.start.status).toBe('recorded');
    expect(proof.manifest.capture.location.start.latitude).toBe(48.8566);
    if (kind === 'video') expect(proof.manifest.capture.location.end.status).toBe('recorded');
    expect(proof.manifest.capture.challenge.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(proof.manifest.capture.sha256).toBe(proof.manifest.file.sha256);
    expect(proof.manifest.declaration.author).toBe('Auteur de test');
    expect(proof.attestation.algorithm).toBe('Ed25519');
    expect(proof.manifest.certification.status).toBe('capture_challenged');
    await expect(page.getByRole('region', { name: 'Localisation de la capture' })).toContainText(
      '48.856600',
    );
    const keyInput = page.getByLabel('Empreinte de clé obtenue par un canal de confiance');
    await keyInput.fill('0'.repeat(64));
    await expect(
      page.getByRole('region', { name: 'Contrôle de la clé de signature' }),
    ).toContainText('ne correspond pas');
    await keyInput.fill(proof.attestation.keyId);
    await expect(
      page.getByRole('region', { name: 'Contrôle de la clé de signature' }),
    ).toContainText('Correspondance');
    await page.getByText('Contrôles techniques, provenance et horodatage', { exact: true }).click();
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
