import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { Store } from '../server/store';
import { readConfig } from '../server/config';
import { createApp } from '../server/app';
import { hash } from '../server/integrity';

test('reconnection resumes only an authenticated, committed, matching capture without extending its lifetime', async () => {
  mkdirSync('.tools/resume-tests', { recursive: true });
  const directory = mkdtempSync('.tools/resume-tests/run-');
  const origin = 'http://localhost:3000',
    password = 'resume-test-only-password';
  const store = new Store(directory);
  try {
    const app = createApp(
      readConfig({ OWNER_PASSWORD: password, APP_ORIGIN: origin, DATA_DIR: directory }),
      store,
    );
    const owner = request.agent(app),
      other = request.agent(app);
    await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    const session = (await owner.post('/api/captures').set('Origin', origin).send({}).expect(201))
      .body;
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#765432' },
    })
      .jpeg()
      .toBuffer();
    const sha256 = hash(bytes),
      at = new Date().toISOString();
    const base = `/api/captures/${session.id}`;
    await owner
      .post(base + '/resume')
      .set('Origin', origin)
      .send({ nonce: session.nonce, sha256 })
      .expect(409);
    const record = (
      await owner
        .post(base + '/commit')
        .set('Origin', origin)
        .send({
          nonce: session.nonce,
          sha256,
          kind: 'photo',
          startedAt: at,
          endedAt: at,
          location: {
            start: { status: 'recorded', latitude: 48, longitude: 2, accuracy: 10, measuredAt: at },
          },
        })
        .expect(200)
    ).body;
    await owner.post('/api/logout').set('Origin', origin).send({}).expect(200);
    await owner
      .post(base + '/resume')
      .set('Origin', origin)
      .send({ nonce: session.nonce, sha256 })
      .expect(401);
    await other.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    await other
      .post(base + '/resume')
      .set('Origin', origin)
      .send({ sha256 })
      .expect(409);
    await other
      .post(base + '/resume')
      .set('Origin', origin)
      .send({ sha256, nonce: '0'.repeat(32) })
      .expect(409);
    await other
      .post(base + '/resume')
      .set('Origin', origin)
      .send({ sha256: '0'.repeat(64), nonce: session.nonce })
      .expect(409);
    await other
      .post(base + '/resume')
      .set('Origin', origin)
      .send({ sha256, nonce: session.nonce })
      .expect(200);
    const proof = (
      await other
        .post('/api/proofs')
        .set('Origin', origin)
        .field('title', 'Resumed capture')
        .field('description', '')
        .field('source', 'camera')
        .field('captureId', session.id)
        .field('requestKey', randomUUID())
        .field('clientSha256', sha256)
        .attach('file', bytes, 'photo.jpg')
        .expect(201)
    ).body;
    assert.equal(proof.manifest.capture.committedAt, record.committedAt);
    const retry = (
      await other
        .post(base + '/resume')
        .set('Origin', origin)
        .send({ sha256, nonce: session.nonce })
        .expect(200)
    ).body;
    assert.equal(retry.proofId, proof.id);
    const stored = store.db
      .prepare('SELECT record FROM capture_sessions WHERE id=?')
      .get(session.id)!;
    assert.deepEqual(JSON.parse(stored.record as string), record);
    store.db
      .prepare('UPDATE capture_sessions SET record=? WHERE id=?')
      .run(
        JSON.stringify({
          ...record,
          committedAt: new Date(Date.now() - 25 * 3600000).toISOString(),
        }),
        session.id,
      );
    await other
      .post(base + '/resume')
      .set('Origin', origin)
      .send({ sha256, nonce: session.nonce })
      .expect(409);
    assert.deepEqual((await request(app).get('/api/health').expect(200)).body, {
      service: 'preuvix',
      status: 'ready',
    });
  } finally {
    store.close();
  }
});
