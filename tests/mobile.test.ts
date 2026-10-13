import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { hash } from '../server/integrity';
import { backendOrigin } from '../src/mobile/config';

test('production mobile configuration rejects development destinations', () => {
  for (const url of [
    'http://api.preuvix.fr',
    'https://localhost',
    'https://10.0.2.2',
    'https://192.168.1.2',
    'https://server.local',
    'https://user:secret@api.preuvix.fr',
    'https://api.preuvix.fr/path',
  ])
    assert.throws(() => backendOrigin(url, false));
  assert.equal(backendOrigin('https://api.preuvix.fr', false), 'https://api.preuvix.fr');
  assert.equal(backendOrigin('http://10.0.2.2:3000', true), 'http://10.0.2.2:3000');
});

test('mobile owner session, CORS, exact imports, PDF export, retry and expiry; web policy remains intact', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-mobile-'));
  writeFileSync(
    path.join(directory, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
  );
  const store = new Store(directory);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const password = 'mobile-fixture-password-long';
  const config = readConfig({
    OWNER_PASSWORD: password,
    DATA_DIR: directory,
    MOBILE_ENABLED: 'true',
  });
  const app = createApp(config, store);
  const origin = 'https://localhost';
  await request(app).get('/api/cases').expect(401);
  const preflight = await request(app)
    .options('/api/mobile/login')
    .set('Origin', origin)
    .set('Access-Control-Request-Headers', 'content-type')
    .expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  assert.equal(preflight.headers['access-control-allow-credentials'], undefined);
  await request(app)
    .post('/api/mobile/login')
    .set('Origin', 'https://evil.example')
    .send({ password })
    .expect(403);
  const login = await request(app)
    .post('/api/mobile/login')
    .set('Origin', origin)
    .send({ password })
    .expect(200);
  assert.equal(login.headers['set-cookie'], undefined);
  const token = login.body.token;
  assert.match(token, /^[a-f0-9]{64}$/);
  const headers = { Origin: origin, Authorization: `Bearer ${token}` };
  const createInput = {
    requestKey: randomUUID(),
    dossier: { title: 'Android', description: 'Pièces originales' },
  };
  const dossier = (await request(app).post('/api/cases').set(headers).send(createInput).expect(201))
    .body;
  const retryCase = (
    await request(app).post('/api/cases').set(headers).send(createInput).expect(201)
  ).body;
  assert.equal(retryCase.manifest.id, dossier.manifest.id);
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#e09040' },
  })
    .png()
    .toBuffer();
  const evidence = {
    origin: 'system_file_picker',
    selectedAt: new Date().toISOString(),
    transformation: 'none_by_preuvix',
    location: { status: 'denied' },
  };
  const key = randomUUID();
  const upload = (bytes: Buffer, name: string, requestKey = key, metadata = evidence) =>
    request(app)
      .post('/api/mobile/proofs')
      .set(headers)
      .field('title', name)
      .field('source', 'upload')
      .field('requestKey', requestKey)
      .field('clientSha256', hash(bytes))
      .field('mobileEvidence', JSON.stringify(metadata))
      .attach('file', bytes, name);
  const proof = (await upload(image, 'photo.png').expect(201)).body;
  assert.equal(proof.manifest.mobileEvidence.location.status, 'denied');
  assert.equal(proof.manifest.capture, undefined);
  assert.equal(proof.status, 'pending');
  assert.equal(proof.receipt, null);
  assert.equal((await upload(image, 'photo.png').expect(200)).body.id, proof.id);
  await upload(image, 'changed.png').expect(409);
  await request(app)
    .post('/api/cases/' + dossier.manifest.id + '/files')
    .set(headers)
    .send({ proofId: proof.id, expectedVersion: 1 })
    .expect(201);
  const original = await request(app)
    .get(`/api/proofs/${proof.id}/original`)
    .set(headers)
    .expect(200);
  assert.deepEqual(original.body, image);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const document = (await upload(bytes, 'piece.pdf', randomUUID()).expect(201)).body;
  assert.equal(document.manifest.file.mime, 'application/pdf');
  assert.equal(document.manifest.file.sha256, hash(bytes));
  await request(app)
    .get(`/api/proofs/${document.id}/report`)
    .set(headers)
    .expect('Content-Type', /pdf/)
    .expect(200);
  await request(app)
    .post('/api/cases/' + dossier.manifest.id + '/files')
    .set(headers)
    .send({ proofId: document.id, expectedVersion: 2 })
    .expect(201);
  await request(app)
    .get('/api/cases/' + dossier.manifest.id + '/report?version=3')
    .set(headers)
    .expect('Content-Type', /pdf/)
    .expect(200);
  await request(app)
    .get('/api/cases/' + dossier.manifest.id + '/export?version=3&originals=true')
    .set(headers)
    .expect(200);
  // Camera bytes are declared native, never assigned the web live-challenge status.
  const native = await request(app)
    .post('/api/mobile/proofs')
    .set(headers)
    .field('title', 'capture')
    .field('source', 'camera')
    .field('requestKey', randomUUID())
    .field('clientSha256', hash(image))
    .field(
      'mobileEvidence',
      JSON.stringify({
        ...evidence,
        origin: 'native_camera',
        transformation: 'camera_jpeg_processing',
      }),
    )
    .attach('file', image, 'capture.png')
    .expect(201);
  assert.equal(native.body.manifest.capture, undefined);
  await request(app)
    .get('/api/cases')
    .set({ ...headers, Origin: 'https://evil.example' })
    .expect(401);
  const web = request.agent(app);
  await web.post('/api/login').set('Origin', config.origin).send({ password }).expect(200);
  await web
    .post('/api/proofs')
    .set('Origin', config.origin)
    .field('title', 'import')
    .field('source', 'upload')
    .field('requestKey', randomUUID())
    .field('clientSha256', hash(image))
    .attach('file', image, 'photo.png')
    .expect(409);
  await web.post('/api/cases').set('Origin', origin).send(createInput).expect(403);
  await request(app).post('/api/logout').set(headers).expect(200);
  await request(app).get('/api/cases').set(headers).expect(401);
  const second = (
    await request(app)
      .post('/api/mobile/login')
      .set('Origin', origin)
      .send({ password })
      .expect(200)
  ).body.token;
  store.db.prepare('UPDATE sessions SET expires=0 WHERE hash=?').run(hash(second));
  await request(app)
    .get('/api/cases')
    .set('Authorization', `Bearer ${second}`)
    .set('Origin', origin)
    .expect(401);
  await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${second}`)
    .set('Origin', origin)
    .send(createInput)
    .expect(401);
  const disabled = createApp({ ...config, mobileEnabled: false }, store);
  await request(disabled)
    .post('/api/mobile/login')
    .set('Origin', origin)
    .send({ password })
    .expect(403);
});
