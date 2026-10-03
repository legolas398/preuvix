import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { hash, inspectImage } from '../server/integrity';
import type { TimestampService } from '../server/timestamp';

const directories: string[] = [];
const stores: Store[] = [];
const origin = 'http://localhost:3000';
const password = 'test-only-password-very-long';
const photo = () =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: '#64784e' } })
    .jpeg()
    .toBuffer();

test('public partner directory publishes only confirmed studies and fails closed on invalid data', async () => {
  const f = fixture();
  await request(f.app).get('/api/partners').expect(200, { partners: [] });
  const partner = {
    id: 'test-study',
    name: 'Étude fictive de test',
    city: 'Paris',
    departments: ['75'],
    services: ['Constat internet'],
    description: 'Fiche de test, aucun partenariat réel.',
    website: 'https://example.invalid/',
    directoryUrl: 'https://annuaire.commissaire-justice.fr/test',
    published: true,
    partnershipConfirmed: true,
  };
  const file = path.join(f.config.dataDir, 'partners.json');
  writeFileSync(
    file,
    JSON.stringify([
      partner,
      { ...partner, id: 'draft', published: false },
      { ...partner, id: 'unconfirmed', partnershipConfirmed: false },
    ]),
  );
  const response = await request(f.app).get('/api/partners').expect(200);
  assert.equal(response.body.partners.length, 1);
  assert.equal(response.body.partners[0].id, 'test-study');
  assert.equal('partnershipConfirmed' in response.body.partners[0], false);
  writeFileSync(file, JSON.stringify([{ ...partner, website: 'javascript:alert(1)' }]));
  await request(f.app).get('/api/partners').expect(503);
  writeFileSync(file, JSON.stringify([partner, partner]));
  await request(f.app).get('/api/partners').expect(503);
  writeFileSync(file, JSON.stringify([{ ...partner, published: false }]));
  await request(f.app).get('/api/partners').expect(200, { partners: [] });
});
test('community spaces publish only confirmed members, expose the contact and fail closed', async () => {
  const f = fixture();
  await request(f.app).get('/api/community').expect(200, { members: [], contact: null });
  const member = {
    id: 'test-association',
    space: 'associations',
    name: 'Association fictive de test',
    area: 'Lyon',
    description: 'Fiche de test, aucun partenariat réel.',
    topics: ['Logement'],
    website: 'https://example.invalid/',
    published: true,
    partnershipConfirmed: true,
  };
  const file = path.join(f.config.dataDir, 'community.json');
  writeFileSync(
    file,
    JSON.stringify([
      member,
      { ...member, id: 'draft', published: false },
      { ...member, id: 'unconfirmed', partnershipConfirmed: false },
    ]),
  );
  const response = await request(f.app).get('/api/community').expect(200);
  assert.deepEqual(
    response.body.members.map((m: { id: string }) => m.id),
    ['test-association'],
  );
  assert.equal('partnershipConfirmed' in response.body.members[0], false);
  for (const invalid of [
    [{ ...member, website: 'javascript:alert(1)' }],
    [{ ...member, space: 'unknown' }],
    [member, member],
  ]) {
    writeFileSync(file, JSON.stringify(invalid));
    await request(f.app).get('/api/community').expect(503);
  }
  const withContact = createApp(
    readConfig({
      OWNER_PASSWORD: password,
      APP_ORIGIN: origin,
      DATA_DIR: f.config.dataDir,
      COMMUNITY_CONTACT_EMAIL: 'partenaires@example.org',
    }),
    f.store,
  );
  writeFileSync(file, JSON.stringify([member]));
  assert.equal(
    (await request(withContact).get('/api/community').expect(200)).body.contact,
    'partenaires@example.org',
  );
  assert.throws(() =>
    readConfig({ OWNER_PASSWORD: password, COMMUNITY_CONTACT_EMAIL: 'not an email' }),
  );
});
function fixture(timestamp?: TimestampService) {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-test-'));
  directories.push(directory);
  const config = readConfig({ OWNER_PASSWORD: password, APP_ORIGIN: origin, DATA_DIR: directory });
  if (timestamp) config.timestampConfigured = true;
  const store = new Store(directory);
  stores.push(store);
  const app = createApp(config, store, timestamp);
  const agent = request.agent(app);
  const login = () => agent.post('/api/login').set('Origin', origin).send({ password }).expect(200);
  const upload = (bytes: Buffer, key = randomUUID(), clientHash = hash(bytes)) =>
    agent
      .post('/api/proofs')
      .set('Origin', origin)
      .field('title', 'Mur avant travaux')
      .field('description', 'État déclaré')
      .field('source', 'upload')
      .field('requestKey', key)
      .field('clientSha256', clientHash)
      .attach('file', bytes, 'photo.jpg');
  return { config, store, app, agent, login, upload };
}
after(() => {
  stores.forEach((s) => s.close());
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

test('private routes require login; writes reject missing/foreign origins; logout invalidates session', async () => {
  const f = fixture();
  await request(f.app).get('/api/proofs').expect(401);
  await f.agent.post('/api/login').send({ password }).expect(403);
  await f.agent
    .post('/api/login')
    .set('Origin', 'https://attacker.example')
    .send({ password })
    .expect(403);
  await f.agent.post('/api/login').set('Origin', origin).send({ password: 'wrong' }).expect(401);
  const login = await f.login();
  assert.match(login.headers['set-cookie'][0], /HttpOnly/);
  assert.match(login.headers['set-cookie'][0], /SameSite=Strict/);
  await f.agent.get('/api/proofs').expect(200);
  await f.agent.post('/api/logout').set('Origin', origin).expect(200);
  await f.agent.get('/api/proofs').expect(401);
});

test('original bytes and manifest are frozen, pending timestamp is honest, PDF/ZIP preserve evidence', async () => {
  const f = fixture();
  await f.login();
  const bytes = await photo();
  const { body: proof } = await f.upload(bytes).expect(201);
  assert.equal(proof.status, 'pending');
  assert.equal(proof.receipt, null);
  assert.equal(proof.manifest.file.sha256, hash(bytes));
  assert.equal(proof.manifest.sourceAssurance, 'client_declared');
  assert.equal(proof.manifest.provenance.result, 'inconclusive');
  assert.equal(proof.shareToken, null);
  const row = f.store.get(proof.id)!;
  assert.deepEqual(Buffer.from(row.original), bytes);
  assert.equal(hash(row.manifest), proof.manifestHash);
  assert.throws(
    () =>
      f.store.db
        .prepare('UPDATE proofs SET original=? WHERE id=?')
        .run(Buffer.from('changed'), proof.id),
    /immutable/,
  );
  assert.throws(
    () => f.store.db.prepare('UPDATE proofs SET manifest=? WHERE id=?').run('{}', proof.id),
    /immutable/,
  );
  const report = await f.agent.get(`/api/proofs/${proof.id}/report`).expect(200);
  assert.ok((await PDFDocument.load(report.body)).getPageCount() >= 1);
  const bundle = await f.agent
    .get(`/api/proofs/${proof.id}/export`)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  const files = unzipSync(bundle.body);
  assert.deepEqual(Buffer.from(files['original.jpeg']), bytes);
  assert.equal(hash(files['manifest.json']), proof.manifestHash);
  assert.equal(JSON.parse(strFromU8(files['receipt.json'])), null);
  assert.equal(files['timestamp.tsr'], undefined);
  await f.agent.post(`/api/proofs/${proof.id}/timestamp`).set('Origin', origin).expect(503);
});

test('duplicate and concurrent upload retries create one proof; changed payload conflicts', async () => {
  const f = fixture();
  await f.login();
  const bytes = await photo();
  const key = randomUUID();
  const responses = await Promise.all([f.upload(bytes, key), f.upload(bytes, key)]);
  assert.ok(responses.every((r) => [200, 201].includes(r.status)));
  assert.equal(responses[0].body.id, responses[1].body.id);
  assert.equal(f.store.list().length, 1);
  const different = await sharp(bytes).resize(10, 10).jpeg().toBuffer();
  await f.upload(different, key).expect(409);
});

test('public verification is opt-in, omits private data, can be revoked, and disappears on deletion', async () => {
  const f = fixture();
  await f.login();
  const { body: proof } = await f.upload(await photo()).expect(201);
  await request(f.app).get(`/api/proofs/${proof.id}/original`).expect(401);
  const share = await f.agent
    .post(`/api/proofs/${proof.id}/share`)
    .set('Origin', origin)
    .send({ enabled: true })
    .expect(200);
  const publicResult = await request(f.app)
    .get(`/api/verification/${share.body.shareToken}`)
    .expect(200);
  assert.equal(publicResult.body.storedFileMatches, true);
  assert.equal(publicResult.body.manifestMatches, true);
  for (const secret of [
    'Mur avant travaux',
    'État déclaré',
    'photo.jpg',
    'description',
    'source',
    'shareToken',
  ])
    assert.ok(!JSON.stringify(publicResult.body).includes(secret));
  await f.agent
    .post(`/api/proofs/${proof.id}/share`)
    .set('Origin', origin)
    .send({ enabled: false })
    .expect(200);
  await request(f.app).get(`/api/verification/${share.body.shareToken}`).expect(404);
  const nextShare = await f.agent
    .post(`/api/proofs/${proof.id}/share`)
    .set('Origin', origin)
    .send({ enabled: true })
    .expect(200);
  assert.notEqual(nextShare.body.shareToken, share.body.shareToken);
  await f.agent.delete(`/api/proofs/${proof.id}`).set('Origin', origin).expect(204);
  assert.equal(f.store.get(proof.id), undefined);
  assert.equal(f.store.usedBytes(), 0);
  await request(f.app).get(`/api/verification/${nextShare.body.shareToken}`).expect(404);
  await f.agent.get(`/api/proofs/${proof.id}/export`).expect(404);
});

test('corruption blocks downloads and appears on public verification', async () => {
  const f = fixture();
  await f.login();
  const { body: proof } = await f.upload(await photo()).expect(201);
  const shared = await f.agent
    .post(`/api/proofs/${proof.id}/share`)
    .set('Origin', origin)
    .send({ enabled: true })
    .expect(200);
  // Simulate an administrator bypassing the application-level immutability guard.
  f.store.db.exec('DROP TRIGGER immutable_original');
  f.store.db
    .prepare('UPDATE proofs SET original=? WHERE id=?')
    .run(Buffer.from('tampered'), proof.id);
  await f.agent.get(`/api/proofs/${proof.id}/original`).expect(409);
  await f.agent.get(`/api/proofs/${proof.id}/report`).expect(409);
  await f.agent.get(`/api/proofs/${proof.id}/export`).expect(409);
  const result = await request(f.app)
    .get(`/api/verification/${shared.body.shareToken}`)
    .expect(200);
  assert.equal(result.body.storedFileMatches, false);
});

test('TSA outage retains original as pending, retry succeeds, concurrent deletion is rejected', async () => {
  let attempts = 0;
  let release: (() => void) | undefined;
  const f = fixture(async (digest) => {
    assert.match(digest, /^[a-f0-9]{64}$/);
    if (++attempts === 1) throw new Error('Provider unavailable');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    // Application test double only. Real cryptographic verification lives in timestamp.ts.
    const response = Buffer.from('TEST ONLY - NOT A TIMESTAMP');
    return {
      query: Buffer.from('TEST QUERY'),
      response,
      receipt: {
        provider: 'TEST ONLY',
        time: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        policyOid: '1.2.3',
        signerSha256: 'a'.repeat(64),
        responseSha256: hash(response),
        qualification: 'not_assessed',
        trustListUrl: null,
        reviewValidUntil: null,
      },
    };
  });
  await f.login();
  const { body: proof } = await f.upload(await photo()).expect(201);
  assert.equal(proof.status, 'pending');
  const retry = f.agent
    .post(`/api/proofs/${proof.id}/timestamp`)
    .set('Origin', origin)
    .then((r) => r);
  for (let i = 0; !release && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(release);
  await f.agent.delete(`/api/proofs/${proof.id}`).set('Origin', origin).expect(409);
  release!();
  assert.equal((await retry).status, 200);
  assert.equal(f.store.list()[0].status, 'timestamped');
  assert.equal(f.store.list()[0].receipt?.qualification, 'not_assessed');
});

test('invalid, truncated and oversized uploads are rejected', async () => {
  const f = fixture();
  await f.login();
  await f.upload(Buffer.from('<svg onload="alert(1)"></svg>')).expect(400);
  const bytes = await photo();
  await f.upload(bytes.subarray(0, 60)).expect(400);
  await f.upload(Buffer.alloc(10 * 1024 * 1024 + 1)).expect(400);
  assert.equal(f.store.list().length, 0);
});

test('client/server SHA-256 mismatch or invalid fingerprint never creates a record', async () => {
  const f = fixture();
  await f.login();
  const bytes = await photo();
  await f.upload(bytes, randomUUID(), 'f'.repeat(64)).expect(422);
  await f.upload(bytes, randomUUID(), 'not-a-hash').expect(400);
  assert.equal(f.store.list().length, 0);
  const key = randomUUID();
  await f.upload(bytes, key).expect(201);
  await f.upload(bytes, key, 'f'.repeat(64)).expect(422);
  assert.equal(f.store.list().length, 1);
});

test('HEIC is rejected with conversion guidance, including misleading extensions', async () => {
  const f = fixture();
  await f.login();
  const heic = Buffer.from('000000186674797068656963000000006d69663168656963', 'hex');
  const result = await f.upload(heic).expect(400);
  assert.match(result.body.error, /HEIC\/HEIF/);
  assert.match(result.body.error, /copie JPEG/);
  assert.equal(f.store.list().length, 0);
});

test('AI metadata is an unverified signal, never a real/fake verdict', async () => {
  const plain = await inspectImage(await photo());
  assert.equal(plain.provenance.result, 'inconclusive');
  const marked = await sharp(await photo())
    .withExif({ IFD0: { Software: 'ComfyUI' } })
    .jpeg()
    .toBuffer();
  const analysis = await inspectImage(marked);
  assert.equal(analysis.provenance.result, 'signals_found');
  assert.ok(analysis.provenance.signals.some((s) => s.includes('ComfyUI')));
  assert.match(analysis.provenance.explanation, /falsifiés/);
});

test('storage quota is enforced before writing a proof', async () => {
  const f = fixture();
  f.config.maxStorageMb = 0;
  await f.login();
  await f.upload(await photo()).expect(413);
  assert.equal(f.store.list().length, 0);
});

test('production fails closed without HTTPS, strong password and qualified-service configuration', () => {
  assert.throws(() => readConfig({ OWNER_PASSWORD: 'short' }), /OWNER_PASSWORD/);
  assert.throws(() => readConfig({ OWNER_PASSWORD: password, NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(
    () =>
      readConfig({
        OWNER_PASSWORD: password,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://proof.example',
        COOKIE_SECURE: 'true',
      }),
    /Qualified launch gate/,
  );
  assert.throws(
    () => readConfig({ OWNER_PASSWORD: password, TSA_URL: 'http://insecure.example' }),
    /HTTPS/,
  );
});
