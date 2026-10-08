import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, verify, generateKeyPairSync, sign } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { Store } from '../server/store';
import { readConfig } from '../server/config';
import { createApp } from '../server/app';
import { hash } from '../server/integrity';
import { inspectMedia } from '../server/media';
const require = createRequire(import.meta.url);
const origin = 'http://localhost:3000';
const password = 'capture-test-password-very-long';
function provisionKey(directory: string) {
  writeFileSync(
    path.join(directory, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
}

test('capture commitment is authenticated, immutable, session-bound and included in verifiable signed export', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-cert-'));
  provisionKey(directory);
  const store = new Store(directory);
  try {
    const config = readConfig({
      OWNER_PASSWORD: password,
      APP_ORIGIN: origin,
      DATA_DIR: directory,
    });
    const app = createApp(config, store);
    await request(app).post('/api/captures').set('Origin', origin).send({}).expect(401);
    const owner = request.agent(app);
    await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    await owner.post('/api/captures').send({}).expect(403);
    const session = (await owner.post('/api/captures').set('Origin', origin).send({}).expect(201))
      .body;
    const bytes = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#cabbaa' },
    })
      .jpeg()
      .toBuffer();
    const input = {
      nonce: session.nonce,
      sha256: hash(bytes),
      kind: 'photo',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      location: {
        start: {
          status: 'recorded',
          latitude: 48.8566,
          longitude: 2.3522,
          accuracy: 12,
          measuredAt: new Date().toISOString(),
        },
      },
    };
    const other = request.agent(app);
    await other.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    await other
      .post(`/api/captures/${session.id}/commit`)
      .set('Origin', origin)
      .send(input)
      .expect(409);
    const committed = (
      await owner
        .post(`/api/captures/${session.id}/commit`)
        .set('Origin', origin)
        .send(input)
        .expect(200)
    ).body;
    await owner
      .post(`/api/captures/${session.id}/commit`)
      .set('Origin', origin)
      .send(input)
      .expect(200);
    await owner
      .post(`/api/captures/${session.id}/commit`)
      .set('Origin', origin)
      .send({ ...input, sha256: '0'.repeat(64) })
      .expect(409);
    const key = randomUUID();
    const deposit = (content = bytes, requestKey = key, source = 'camera') =>
      owner
        .post('/api/proofs')
        .set('Origin', origin)
        .field('title', 'Capture test')
        .field('source', source)
        .field('requestKey', requestKey)
        .field('clientSha256', hash(content))
        .field('captureId', session.id)
        .attach('file', content, 'capture.jpg');
    await deposit(Buffer.concat([bytes, Buffer.from('changed')])).expect(409);
    await deposit(bytes, key, 'upload').expect(409);
    const proof = (await deposit().expect(201)).body;
    assert.equal(proof.manifest.capture.committedAt, committed.committedAt);
    assert.equal(proof.status, 'pending');
    assert.equal(proof.receipt, null);
    assert.equal(proof.manifest.certification.policy, 'preuvix-media-v2');
    assert.equal(proof.manifest.certification.status, 'capture_challenged');
    assert.match(proof.manifest.capture.challenge.code, /^[A-Z0-9]{6}$/);
    assert.deepEqual(proof.manifest.capture.location, input.location);
    assert.ok(proof.manifest.capture.elapsedSeconds <= proof.manifest.capture.challenge.maxSeconds);
    assert.equal(proof.manifest.provenance.contentCredentials.state, 'absent');
    assert.equal(proof.manifest.certification.aiAuthenticity, 'not_established');
    const original = store.get(proof.id)!;
    const rogue = generateKeyPairSync('ed25519');
    const roguePublic = rogue.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    store.db.prepare('UPDATE attestations SET payload=? WHERE proof_id=?').run(
      JSON.stringify({
        ...proof.attestation,
        publicKey: roguePublic,
        keyId: hash(roguePublic),
        signature: sign(null, Buffer.from(original.manifest), rogue.privateKey).toString('base64'),
      }),
      proof.id,
    );
    assert.throws(() => store.summary(original), /integrity mismatch/);
    store.db
      .prepare('UPDATE attestations SET payload=? WHERE proof_id=?')
      .run(JSON.stringify(proof.attestation), proof.id);
    const shared = (
      await owner
        .post(`/api/proofs/${proof.id}/share`)
        .set('Origin', origin)
        .send({ enabled: true })
        .expect(200)
    ).body;
    const publicPage = (
      await request(app).get(`/api/verification/${shared.shareToken}`).expect(200)
    ).body;
    assert.equal('capture' in publicPage, false);
    assert.equal('location' in publicPage, false);
    assert.ok(!JSON.stringify(publicPage).includes('48.8566'));
    assert.ok(
      verify(
        null,
        Buffer.from(original.manifest),
        proof.attestation.publicKey,
        Buffer.from(proof.attestation.signature, 'base64'),
      ),
    );
    assert.equal(
      verify(
        null,
        Buffer.from(original.manifest + ' '),
        proof.attestation.publicKey,
        Buffer.from(proof.attestation.signature, 'base64'),
      ),
      false,
    );
    await deposit().expect(200);
    await deposit(bytes, randomUUID()).expect(409);
    await owner
      .post(`/api/proofs/${proof.id}/review`)
      .set('Origin', origin)
      .send({ outcome: 'maybe', reviewer: 'Témoin' })
      .expect(400);
    const reviewed = (
      await owner
        .post(`/api/proofs/${proof.id}/review`)
        .set('Origin', origin)
        .send({ outcome: 'confirmed', reviewer: 'Témoin indépendant', note: 'Code lisible' })
        .expect(201)
    ).body;
    assert.equal(reviewed.reviews.length, 1);
    assert.equal(reviewed.reviews[0].review.manifestHash, proof.manifestHash);
    assert.throws(() => store.db.prepare("UPDATE reviews SET payload='{}'").run());
    const exported = await owner
      .get(`/api/proofs/${proof.id}/export`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const files = unzipSync(exported.body);
    assert.deepEqual(
      JSON.parse(Buffer.from(files['manifest.json']).toString()).capture.location,
      input.location,
    );
    assert.ok(files['manifest.sig']);
    assert.ok(files['signer-public.pem']);
    assert.ok(files['rapport.pdf']);
    for (const [name, data] of Object.entries(files))
      writeFileSync(path.join(directory, name), data);
    const result = execFileSync(process.execPath, ['scripts/verify-export.mjs', directory], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.match(result, /signature verified/);
    assert.match(result, /Challenge review verified: confirmed/);
    writeFileSync(path.join(directory, 'original.jpeg'), 'tampered');
    assert.throws(() =>
      execFileSync(process.execPath, ['scripts/verify-export.mjs', directory], {
        stdio: 'pipe',
        windowsHide: true,
      }),
    );
    const keyBefore = (await request(app).get('/api/certification/key')).body.keyId;
    assert.equal(
      (await request(createApp(config, store)).get('/api/certification/key')).body.keyId,
      keyBefore,
    );
    const expired = (await owner.post('/api/captures').set('Origin', origin).send({})).body;
    store.db
      .prepare('UPDATE capture_sessions SET session=? WHERE id=?')
      .run(JSON.stringify({ ...expired, expiresAt: '2000-01-01T00:00:00.000Z' }), expired.id);
    await owner
      .post(`/api/captures/${expired.id}/commit`)
      .set('Origin', origin)
      .send(input)
      .expect(409);
    await owner.delete(`/api/proofs/${proof.id}`).set('Origin', origin).expect(204);
    assert.equal(
      store.db.prepare('SELECT id FROM capture_sessions WHERE id=?').get(session.id),
      undefined,
    );
    assert.equal(
      (store.db.prepare('SELECT count(*) AS n FROM attestations').get() as { n: number }).n,
      0,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('LAN development also accepts exact localhost origin but not other hosts or ports', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-origin-test-'));
  provisionKey(directory);
  const store = new Store(directory);
  try {
    const config = readConfig({
      OWNER_PASSWORD: password,
      APP_ORIGIN: 'http://192.168.1.20:3000',
      DATA_DIR: directory,
    });
    const app = createApp(config, store);
    await request(app)
      .post('/api/login')
      .set('Origin', 'http://localhost:3000')
      .send({ password })
      .expect(200);
    await request(app)
      .post('/api/login')
      .set('Origin', 'http://localhost:3001')
      .send({ password })
      .expect(403);
    await request(app)
      .post('/api/login')
      .set('Origin', 'https://evil.example')
      .send({ password })
      .expect(403);
    config.production = true;
    await request(createApp(config, store))
      .post('/api/login')
      .set('Origin', 'http://localhost:3000')
      .send({ password })
      .expect(403);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('video validation decodes real MP4 and WebM, preserves bytes and rejects invalid video', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-video-test-'));
  provisionKey(directory);
  const store = new Store(directory);
  try {
    const config = readConfig({
      OWNER_PASSWORD: password,
      APP_ORIGIN: origin,
      DATA_DIR: directory,
    });
    const agent = request.agent(createApp(config, store));
    await agent.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    for (const format of ['mp4', 'webm']) {
      const file = path.join(directory, `sample.${format}`);
      execFileSync(
        require('ffmpeg-static'),
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=c=blue:s=160x120:d=1',
          '-c:v',
          format === 'mp4' ? 'libx264' : 'libvpx',
          file,
        ],
        { timeout: 20000, windowsHide: true },
      );
      const bytes = readFileSync(file);
      const media = await inspectMedia(bytes);
      assert.equal(media.mime, `video/${format}`);
      assert.equal(media.provenance.result, 'inconclusive');
      const proof = (
        await agent
          .post('/api/proofs')
          .set('Origin', origin)
          .field('title', 'Vidéo test')
          .field('source', 'upload')
          .field('requestKey', randomUUID())
          .field('clientSha256', hash(bytes))
          .attach('file', bytes, `sample.${format}`)
          .expect(201)
      ).body;
      assert.equal(proof.manifest.file.sha256, hash(bytes));
      assert.equal(proof.manifest.certification.status, 'integrity_only');
      assert.ok(proof.manifest.file.durationSeconds > 0);
      assert.equal(hash(store.get(proof.id)!.original), hash(bytes));
      await agent.get(`/api/proofs/${proof.id}/report`).expect(200).expect('Content-Type', /pdf/);
      await assert.rejects(inspectMedia(bytes.subarray(0, 32)));
    }
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
