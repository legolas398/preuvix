import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { Store } from '../server/store';
import { readConfig } from '../server/config';
import { createApp } from '../server/app';
import { hash } from '../server/integrity';

const origin = 'http://localhost:3000';
const password = 'sharing-test-password-long';
const cleanup: (() => void)[] = [];
after(() => cleanup.forEach((fn) => fn()));

const binary = (req: request.Test) =>
  req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

async function setup(env: Record<string, string> = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-share-'));
  writeFileSync(
    path.join(directory, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  const store = new Store(directory);
  cleanup.push(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const app = createApp(
    readConfig({ OWNER_PASSWORD: password, APP_ORIGIN: origin, DATA_DIR: directory, ...env }),
    store,
  );
  const owner = request.agent(app);
  await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
  return { app, owner, store };
}

async function photo() {
  const noise = Buffer.alloc(200 * 150 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
  return sharp(noise, { raw: { width: 200, height: 150, channels: 3 } })
    .blur(2)
    .resize(800, 600)
    .jpeg()
    .toBuffer();
}

async function deposit(owner: request.Agent, bytes: Buffer) {
  return (
    await owner
      .post('/api/proofs')
      .set('Origin', origin)
      .field('title', 'Dossier transmis')
      .field('source', 'upload')
      .field('requestKey', randomUUID())
      .field('clientSha256', hash(bytes))
      .attach('file', bytes, 'photo.jpg')
      .expect(201)
  ).body;
}

test('recipient links give read-only access, count views, expire and can be revoked', async () => {
  const { app, owner, store } = await setup();
  const bytes = await photo();
  const proof = await deposit(owner, bytes);
  await request(app)
    .post(`/api/proofs/${proof.id}/recipient-links`)
    .set('Origin', origin)
    .send({ label: 'Étude', days: 30 })
    .expect(401);
  await owner
    .post(`/api/proofs/${proof.id}/recipient-links`)
    .set('Origin', origin)
    .send({ label: 'Étude', days: 12 })
    .expect(403);
  // Existing legacy links are seeded directly; creation now requires the scoped wizard.
  const token = randomBytes(32).toString('hex');
  store.addRecipientLink(proof.id, {
    id: randomUUID(),
    tokenHash: hash(token),
    label: 'Étude Dupont',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  // Only the hash is stored.
  assert.equal(
    (
      store.db
        .prepare('SELECT count(*) AS n FROM recipient_links WHERE token_hash=?')
        .get(token) as { n: number }
    ).n,
    0,
  );
  const visitor = request(app);
  const page = (await visitor.get(`/api/dossier/${token}`).expect(200)).body;
  assert.equal(page.label, 'Étude Dupont');
  assert.equal(page.proof.id, proof.id);
  assert.equal(page.integrity.originalMatches, true);
  assert.equal('shareToken' in page.proof, false);
  assert.equal('recipientLinks' in page.proof, false);
  const original = await binary(visitor.get(`/api/dossier/${token}/original`)).expect(200);
  assert.equal(hash(original.body), proof.manifest.file.sha256);
  const report = await binary(visitor.get(`/api/dossier/${token}/report`)).expect(200);
  assert.equal(report.body.subarray(0, 4).toString(), '%PDF');
  await visitor.get(`/api/dossier/${token}/export`).expect(200).expect('Content-Type', /zip/);
  await visitor.get(`/api/dossier/${'0'.repeat(64)}`).expect(404);
  await visitor.get('/api/dossier/short').expect(404);
  const summary = (await owner.get(`/api/proofs/${proof.id}`).expect(200)).body;
  assert.equal(summary.recipientLinks[0].views, 1);
  assert.ok(summary.events.some((e: { kind: string }) => e.kind === 'recipient_viewed'));
  await owner
    .delete(`/api/proofs/${proof.id}/recipient-links/${summary.recipientLinks[0].id}`)
    .set('Origin', origin)
    .expect(200);
  await visitor.get(`/api/dossier/${token}`).expect(404);
  await visitor.get(`/api/dossier/${token}/original`).expect(404);
  // Expired links stop working.
  const secondToken = randomBytes(32).toString('hex');
  store.addRecipientLink(proof.id, {
    id: randomUUID(),
    tokenHash: hash(secondToken),
    label: 'Étude Martin',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  store.db
    .prepare('UPDATE recipient_links SET expires_at=? WHERE token_hash=?')
    .run(new Date(Date.now() - 1000).toISOString(), hash(secondToken));
  await visitor.get(`/api/dossier/${secondToken}`).expect(404);
  // Deleting the dossier removes its links.
  await owner.delete(`/api/proofs/${proof.id}`).set('Origin', origin).expect(204);
  assert.equal(
    (store.db.prepare('SELECT count(*) AS n FROM recipient_links').get() as { n: number }).n,
    0,
  );
});

test('the certification report is a branded Unicode PDF identified by Preuvix', async () => {
  const { owner } = await setup();
  const proof = await deposit(owner, await photo());
  const pdf = (await binary(owner.get(`/api/proofs/${proof.id}/report`)).expect(200)).body;
  const { PDFDocument } = await import('pdf-lib');
  const document = await PDFDocument.load(pdf);
  assert.match(document.getTitle() ?? '', /^PREUVIX — Rapport de certification PRX-/);
  assert.equal(document.getAuthor(), 'PREUVIX');
  assert.match(document.getSubject() ?? '', /PVX-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/);
});

const models = process.env.TRUSTMARK_MODEL_DIR;
test(
  'protected copies carry a TrustMark watermark that leads back to the dossier and reveals edits',
  {
    skip:
      !models || !existsSync(path.join(models, 'decoder_Q.onnx'))
        ? 'TRUSTMARK_MODEL_DIR not set'
        : false,
    timeout: 300_000,
  },
  async () => {
    const { owner } = await setup({ TRUSTMARK_MODEL_DIR: models! });
    const proof = await deposit(owner, await photo());
    const copy = (await binary(owner.get(`/api/proofs/${proof.id}/protected-copy`)).expect(200))
      .body as Buffer;
    const check = async (bytes: Buffer) =>
      (
        await owner
          .post('/api/watermark/check')
          .set('Origin', origin)
          .attach('file', bytes, 'copy.jpg')
          .expect(200)
      ).body;
    const recompressed = await sharp(copy).resize(500).jpeg({ quality: 60 }).toBuffer();
    const found = await check(recompressed);
    assert.equal(found.found, true);
    assert.equal(found.proof.id, proof.id);
    assert.equal(found.verdict, 'no_visible_change');
    const edited = await sharp(copy)
      .composite([
        {
          input: Buffer.from(
            '<svg width="800" height="600"><rect x="500" y="350" width="160" height="120" fill="#777"/></svg>',
          ),
        },
      ])
      .jpeg()
      .toBuffer();
    assert.equal((await check(edited)).verdict, 'modified');
    assert.equal((await check(await photo())).found, false);
    const summary = (await owner.get(`/api/proofs/${proof.id}`).expect(200)).body;
    assert.equal(summary.watermarked, true);
  },
);
