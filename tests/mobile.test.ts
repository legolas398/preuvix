import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
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

test('mobile live capture requires location and commitment, rejects imports, preserves exports and retry', async (t) => {
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
  const session = (await request(app).post('/api/captures').set(headers).send({}).expect(201)).body;
  assert.equal(session.challenge, undefined);
  const at = new Date().toISOString();
  const location = {
    status: 'recorded',
    source: 'android_geolocation',
    latitude: 48.8566,
    longitude: 2.3522,
    accuracy: 12,
    measuredAt: at,
  };
  const evidence = {
    origin: 'in_app_camera',
    selectedAt: at,
    transformation: 'camera_jpeg_processing',
    location,
  };
  const commit = {
    nonce: session.nonce,
    sha256: hash(image),
    kind: 'photo',
    startedAt: at,
    endedAt: at,
    location: { start: location },
  };
  for (const status of ['denied', 'unavailable', 'not_requested']) {
    await request(app)
      .post('/api/captures/' + session.id + '/commit')
      .set(headers)
      .send({ ...commit, location: { start: { status } } })
      .expect(409);
  }
  await request(app)
    .post('/api/captures/' + session.id + '/commit')
    .set(headers)
    .send({
      ...commit,
      location: { start: { ...location, measuredAt: '2000-01-01T00:00:00.000Z' } },
    })
    .expect(409);
  const key = randomUUID();
  const upload = (
    bytes: Buffer,
    name: string,
    requestKey = key,
    metadata: object = evidence,
    source = 'camera',
    captureId: string | undefined = session.id,
  ) => {
    const pending = request(app)
      .post('/api/mobile/proofs')
      .set(headers)
      .field('title', name)
      .field('source', source)
      .field('requestKey', requestKey)
      .field('clientSha256', hash(bytes))
      .field('mobileEvidence', JSON.stringify(metadata));
    if (captureId) pending.field('captureId', captureId);
    return pending.attach('file', bytes, name);
  };
  await upload(image, 'photo.png').expect(409); // Session exists but no hash was committed.
  await request(app)
    .post('/api/captures/' + session.id + '/commit')
    .set(headers)
    .send(commit)
    .expect(200);
  await upload(image, 'photo.png', randomUUID(), evidence, 'camera', '').expect(409);
  await upload(
    image,
    'photo.png',
    randomUUID(),
    { ...evidence, origin: 'system_file_picker', transformation: 'none_by_preuvix' },
    'upload',
  ).expect(400);
  for (const status of ['denied', 'unavailable', 'not_requested'])
    await upload(image, 'photo.png', randomUUID(), { ...evidence, location: { status } }).expect(
      400,
    );
  await upload(image, 'photo.png', randomUUID(), {
    ...evidence,
    location: { ...location, latitude: 49 },
  }).expect(409);
  await upload(image, 'photo.png', randomUUID(), { ...evidence, origin: 'native_camera' }).expect(
    400,
  );
  const proof = (await upload(image, 'photo.png').expect(201)).body;
  assert.equal(proof.manifest.mobileEvidence.location.status, 'recorded');
  assert.equal(proof.manifest.capture.id, session.id);
  assert.equal(proof.manifest.capture.challenge, undefined);
  assert.equal(proof.manifest.certification.status, 'capture_documented');
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
    .get('/api/proofs/' + proof.id + '/original')
    .set(headers)
    .expect(200);
  assert.deepEqual(original.body, image);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  await upload(
    bytes,
    'piece.pdf',
    randomUUID(),
    { ...evidence, origin: 'system_file_picker', transformation: 'none_by_preuvix' },
    'upload',
  ).expect(400);
  const pdfSession = (await request(app).post('/api/captures').set(headers).send({}).expect(201))
    .body;
  await request(app)
    .post('/api/captures/' + pdfSession.id + '/commit')
    .set(headers)
    .send({ ...commit, nonce: pdfSession.nonce, sha256: hash(bytes) })
    .expect(200);
  await upload(bytes, 'piece.pdf', randomUUID(), evidence, 'camera', pdfSession.id).expect(400);
  await request(app)
    .get('/api/cases/' + dossier.manifest.id + '/report?version=2')
    .set(headers)
    .expect('Content-Type', /pdf/)
    .expect(200);
  await request(app)
    .get('/api/cases/' + dossier.manifest.id + '/export?version=2&originals=true')
    .set(headers)
    .expect(200);
  const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string;
  for (const format of ['mp4', 'webm']) {
    const file = path.join(directory, `live.${format}`);
    execFileSync(
      ffmpeg,
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=160x120:d=1',
        '-c:v',
        format === 'mp4' ? 'libx264' : 'libvpx',
        file,
      ],
      { windowsHide: true, timeout: 20000, stdio: 'ignore' },
    );
    const video = readFileSync(file);
    const live = (await request(app).post('/api/captures').set(headers).send({}).expect(201)).body;
    const now = new Date().toISOString();
    const start = { ...location, measuredAt: now };
    const payload = {
      nonce: live.nonce,
      kind: 'video',
      sha256: hash(video),
      startedAt: now,
      endedAt: now,
      location: { start, end: start },
    };
    await request(app)
      .post(`/api/captures/${live.id}/commit`)
      .set(headers)
      .send({ ...payload, location: { start } })
      .expect(409);
    await request(app)
      .post(`/api/captures/${live.id}/commit`)
      .set(headers)
      .send({ ...payload, location: { start, end: { status: 'denied' } } })
      .expect(409);
    await request(app)
      .post(`/api/captures/${live.id}/commit`)
      .set(headers)
      .send(payload)
      .expect(200);
    const metadata = {
      ...evidence,
      selectedAt: now,
      location: start,
      transformation: 'camera_video_encoding',
    };
    await upload(
      video,
      `live.${format}`,
      randomUUID(),
      { ...metadata, transformation: 'camera_jpeg_processing' },
      'camera',
      live.id,
    ).expect(409);
    await upload(video, `live.${format}`, randomUUID(), metadata, 'upload', live.id).expect(400);
    const accepted = (
      await upload(video, `live.${format}`, randomUUID(), metadata, 'camera', live.id).expect(201)
    ).body;
    assert.equal(accepted.manifest.file.mime, `video/${format}`);
    assert.equal(accepted.manifest.capture.location.end.status, 'recorded');
    assert.equal(accepted.manifest.mobileEvidence.transformation, 'camera_video_encoding');
    assert.equal(accepted.manifest.certification.status, 'capture_documented');
    assert.equal(hash(store.get(accepted.id)!.original), hash(video));
  }
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
