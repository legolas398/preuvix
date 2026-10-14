import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, verify } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createBackup, restoreBackup, verifyBackup } from '../scripts/backup.mjs';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { hash } from '../server/integrity';
import { commitFixture } from './live-fixture';

test('backup restores a signed original, authenticated API and PDF; rejects corruption and overwrites', async () => {
  await mkdir('.tools/backup-tests', { recursive: true });
  const root = await mkdtemp(path.resolve('.tools/backup-tests/run-'));
  const source = path.join(root, 'source');
  const snapshot = path.join(root, 'snapshot');
  const restored = path.join(root, 'restored');
  const password = 'backup-test-only-password';
  const origin = 'http://localhost:3000';
  const config = readConfig({ OWNER_PASSWORD: password, APP_ORIGIN: origin, DATA_DIR: source });
  const store = new Store(source);
  let recovered: Store | undefined;
  try {
    const owner = request.agent(createApp(config, store));
    await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    const bytes = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#64784e' },
    })
      .jpeg()
      .toBuffer();
    const captureId = await commitFixture(owner, origin, bytes);
    const deposited = await owner
      .post('/api/proofs')
      .set('Origin', origin)
      .field('title', 'Exercice de restauration')
      .field('description', 'Données synthétiques')
      .field('source', 'camera')
      .field('captureId', captureId)
      .field('requestKey', randomUUID())
      .field('clientSha256', hash(bytes))
      .attach('file', bytes, 'photo.jpg')
      .expect(201);
    const id = deposited.body.id;
    await writeFile(path.join(source, 'partners.json'), '[]');
    await createBackup(source, snapshot);
    await verifyBackup(snapshot);
    // A later source write must not change the saved point in time.
    await writeFile(path.join(source, 'partners.json'), '[{"changed":true}]');
    const result = await restoreBackup(snapshot, restored);
    assert.equal(result.sessionsRevoked, true);
    assert.equal(await readFile(path.join(restored, 'partners.json'), 'utf8'), '[]');
    assert.deepEqual(
      await readFile(path.join(restored, 'attestation-ed25519.pem')),
      await readFile(path.join(snapshot, 'attestation-ed25519.pem')),
    );
    recovered = new Store(restored);
    const row = recovered.db.prepare('SELECT original,manifest FROM proofs WHERE id=?').get(id) as {
      original: Uint8Array;
      manifest: string;
    };
    assert.deepEqual(Buffer.from(row.original), bytes);
    assert.equal(
      verify(
        null,
        Buffer.from(row.manifest),
        deposited.body.attestation.publicKey,
        Buffer.from(deposited.body.attestation.signature, 'base64'),
      ),
      true,
    );
    assert.equal(recovered.db.prepare('SELECT count(*) AS n FROM sessions').get()?.n, 0);
    const app = createApp({ ...config, dataDir: restored }, recovered);
    await request(app).get('/api/proofs').expect(401);
    const restoredOwner = request.agent(app);
    await restoredOwner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    await restoredOwner.get(`/api/proofs/${id}`).expect(200);
    await restoredOwner.get(`/api/proofs/${id}/report`).expect('Content-Type', /pdf/).expect(200);
    await restoredOwner.get(`/api/proofs/${id}/export`).expect(200);
    await assert.rejects(restoreBackup(snapshot, restored), /EEXIST/);
    await assert.rejects(createBackup(source, path.join(source, 'nested')), /outside/);
    await writeFile(path.join(snapshot, 'partners.json'), '["corruption"]');
    await assert.rejects(restoreBackup(snapshot, path.join(root, 'bad-restore')), /checksum/);
    console.log(
      'Restore drill: original bytes, Ed25519 signature, API login, PDF and ZIP verified; corruption and overwrite rejected.',
    );
  } finally {
    recovered?.close();
    store.close();
  }
});
