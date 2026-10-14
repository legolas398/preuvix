import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { readConfig } from '../server/config';
import { hash } from '../server/integrity';
import { commitFixture } from './live-fixture';

test('verification links hide GPS by default, expire, rotate and revoke; integrity is authenticated', async () => {
  mkdirSync('.tools/sharing-tests', { recursive: true });
  const directory = mkdtempSync('.tools/sharing-tests/run-');
  const origin = 'http://localhost:3000';
  const password = 'sharing-tests-only-password';
  const store = new Store(directory);
  try {
    const app = createApp(
      readConfig({ OWNER_PASSWORD: password, APP_ORIGIN: origin, DATA_DIR: directory }),
      store,
    );
    const owner = request.agent(app);
    await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    const bytes = await sharp({
      create: { width: 24, height: 24, channels: 3, background: '#719058' },
    })
      .jpeg()
      .toBuffer();
    const captureId = await commitFixture(owner, origin, bytes);
    const proof = (
      await owner
        .post('/api/proofs')
        .set('Origin', origin)
        .field('title', 'Private client title')
        .field('description', 'Private context')
        .field('source', 'camera')
        .field('captureId', captureId)
        .field('requestKey', randomUUID())
        .field('clientSha256', hash(bytes))
        .attach('file', bytes, 'photo.jpg')
        .expect(201)
    ).body;
    const base = `/api/proofs/${proof.id}`;
    await request(app).get(`${base}/integrity`).expect(401);
    const integrity = (await owner.get(`${base}/integrity`).expect(200)).body;
    assert.equal(integrity.originalMatches, true);
    assert.equal(integrity.manifestMatches, true);
    assert.equal(integrity.signatureVerified, true);
    await owner
      .post(`${base}/share`)
      .set('Origin', origin)
      .send({ enabled: true, days: 0 })
      .expect(400);
    const first = (
      await owner.post(`${base}/share`).set('Origin', origin).send({ enabled: true }).expect(200)
    ).body;
    const publicView = (await request(app).get(`/api/verification/${first.shareToken}`).expect(200))
      .body;
    assert.equal(publicView.location, undefined);
    assert.equal(publicView.manifest, undefined);
    assert.equal(publicView.title, undefined);
    assert.equal(publicView.signatureVerified, true);
    assert.ok(Date.parse(publicView.expiresAt) > Date.now());
    const visible = (
      await owner
        .post(`${base}/share`)
        .set('Origin', origin)
        .send({ enabled: true, days: 30, includeLocation: true })
        .expect(200)
    ).body;
    await request(app).get(`/api/verification/${first.shareToken}`).expect(404);
    assert.equal(
      (await request(app).get(`/api/verification/${visible.shareToken}`).expect(200)).body.location
        .latitude,
      48.8566,
    );
    const pdf = await owner.get(`${base}/report`).expect(200);
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    store.db
      .prepare('UPDATE verification_links SET expires_at=? WHERE proof_id=?')
      .run('2000-01-01T00:00:00.000Z', proof.id);
    await request(app).get(`/api/verification/${visible.shareToken}`).expect(404);
    const renewed = (
      await owner
        .post(`${base}/share`)
        .set('Origin', origin)
        .send({ enabled: true, days: 7 })
        .expect(200)
    ).body;
    await owner.post(`${base}/share`).set('Origin', origin).send({ enabled: false }).expect(200);
    await request(app).get(`/api/verification/${renewed.shareToken}`).expect(404);
    assert.ok(
      store
        .summary(store.get(proof.id)!)
        .events.some((e) => e.kind === 'verification_link_revoked'),
    );
    // A corrupted stored original must never produce a successful integrity result.
    store.db.exec('DROP TRIGGER immutable_original');
    store.db
      .prepare('UPDATE proofs SET original=? WHERE id=?')
      .run(Buffer.from('damaged'), proof.id);
    assert.equal((await owner.get(`${base}/integrity`).expect(200)).body.originalMatches, false);
  } finally {
    store.close();
  }
});
