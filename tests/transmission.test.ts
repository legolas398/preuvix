import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { hash } from '../server/integrity';
import type { Transmission, TransmissionInput } from '../shared/transmission';

const origin = 'http://localhost:3000',
  password = 'transmission-fixture-password';
async function fixture(t: TestContext, premium = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'preuvix-transmission-'));
  // Isolated fixture key: never use the owner's data or keys; ACL setup is outside this test.
  writeFileSync(
    path.join(dir, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const config = readConfig({
    OWNER_PASSWORD: password,
    DATA_DIR: dir,
    APP_ORIGIN: origin,
    PREMIUM_TRANSMISSION_TEST: String(premium),
  });
  const app = createApp(config, store);
  const owner = request.agent(app);
  await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
  const bytes = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#aa8855' },
  })
    .jpeg()
    .toBuffer();
  async function deposit(title: string) {
    return (
      await owner
        .post('/api/proofs')
        .set('Origin', origin)
        .field('title', title)
        .field('description', 'NOTE PRIVÉE À NE PAS DIVULGUER')
        .field('source', 'upload')
        .field('requestKey', randomUUID())
        .field('clientSha256', hash(bytes))
        .attach('file', bytes, 'fixture.jpg')
        .expect(201)
    ).body;
  }
  const proof = await deposit('Pièce sélectionnée');
  const other = await deposit('Pièce confidentielle non sélectionnée');
  const input: TransmissionInput = {
    proofIds: [proof.id],
    summary: 'Résumé de test uniquement',
    recipient: 'Étiquette de test',
    includeOriginals: false,
    includeNotes: false,
    days: 7,
  };
  return { owner, app, store, config, input, proof, other, bytes };
}

test('Premium is server controlled and disabled by default; standard deposit and exports remain available', async (t) => {
  const f = await fixture(t, false);
  assert.equal(readConfig({ OWNER_PASSWORD: password }).premiumTransmissionTest, false);
  assert.equal((await f.owner.get('/api/config')).body.premiumTransmissionTest, false);
  await f.owner.get(`/api/proofs/${f.proof.id}/export`).expect(200);
  await request(f.app).post('/api/transmissions').set('Origin', origin).send(f.input).expect(401);
  await f.owner.post('/api/transmissions').set('Origin', origin).send(f.input).expect(403);
  await f.owner
    .put(`/api/transmissions/${randomUUID()}`)
    .set('Origin', origin)
    .send({})
    .expect(403);
  await f.owner
    .post(`/api/transmissions/${randomUUID()}/link`)
    .set('Origin', origin)
    .send({ confirmed: true })
    .expect(403);
  await f.owner
    .post(`/api/proofs/${f.proof.id}/recipient-links`)
    .set('Origin', origin)
    .send({ label: 'Test', days: 7 })
    .expect(403);
  await f.owner.post('/api/billing/checkout').set('Origin', origin).send({}).expect(403);
});

test('draft persists, ready requires completeness, confirmation uses a revision and sharing is strictly scoped', async (t) => {
  const f = await fixture(t);
  await f.owner.post('/api/transmissions').send(f.input).expect(403);
  let draft: Transmission = (
    await f.owner
      .post('/api/transmissions')
      .set('Origin', origin)
      .send({ ...f.input, recipient: '' })
      .expect(201)
  ).body;
  assert.equal(draft.state, 'draft');
  assert.equal((await f.owner.get('/api/transmissions')).body[0].id, draft.id);
  await f.owner
    .post(`/api/transmissions/${draft.id}/link`)
    .set('Origin', origin)
    .send({ confirmed: true, revision: draft.revision })
    .expect(409);
  await f.owner
    .put(`/api/transmissions/${draft.id}`)
    .set('Origin', origin)
    .send({ input: { ...f.input, recipient: '' }, revision: draft.revision, ready: true })
    .expect(400);
  draft = (
    await f.owner
      .put(`/api/transmissions/${draft.id}`)
      .set('Origin', origin)
      .send({ input: f.input, revision: draft.revision, ready: true })
      .expect(200)
  ).body;
  assert.equal(draft.state, 'ready');
  await f.owner
    .post(`/api/transmissions/${draft.id}/link`)
    .set('Origin', origin)
    .send({ confirmed: true, revision: draft.revision - 1 })
    .expect(409);
  await f.owner
    .post(`/api/transmissions/${draft.id}/link`)
    .set('Origin', origin)
    .send({ revision: draft.revision })
    .expect(400);
  const created = (
    await f.owner
      .post(`/api/transmissions/${draft.id}/link`)
      .set('Origin', origin)
      .send({ confirmed: true, revision: draft.revision })
      .expect(201)
  ).body;
  const token = created.url.split('/').pop(),
    base = `/api/transmission-access/${token}`;
  assert.equal(created.transmission.state, 'created');
  const visible = (await request(f.app).get(base).expect(200)).body;
  assert.deepEqual(visible.preview, draft.preview);
  assert.equal(visible.preview.documents.length, 1);
  assert.equal(JSON.stringify(visible).includes('NOTE PRIVÉE'), false);
  assert.equal(JSON.stringify(visible).includes(f.other.id), false);
  await request(f.app).get(`${base}/original/${f.proof.id}`).expect(404);
  await request(f.app).get(`${base}/original/${f.other.id}`).expect(404);
  const report = await request(f.app).get(`${base}/report`).expect(200);
  assert.equal(JSON.stringify(report.body).includes('NOTE PRIVÉE'), false);
  const row = f.store.db
    .prepare('SELECT token_hash FROM transmissions WHERE id=?')
    .get(draft.id) as { token_hash: string };
  assert.equal(row.token_hash, hash(token));
  await f.owner
    .post(`/api/transmissions/${draft.id}/link`)
    .set('Origin', origin)
    .send({ confirmed: true, revision: draft.revision })
    .expect(409);
  // Rights removed: existing consultation and revocation still work; writes remain forbidden.
  f.config.premiumTransmissionTest = false;
  await f.owner.get('/api/transmissions').expect(200);
  await request(f.app).get(base).expect(200);
  await f.owner.put(`/api/transmissions/${draft.id}`).set('Origin', origin).send({}).expect(403);
  await f.owner.delete(`/api/transmissions/${draft.id}/access`).set('Origin', origin).expect(200);
  assert.equal((await f.owner.get('/api/transmissions')).body[0].state, 'revoked');
  await request(f.app).get(base).expect(404);
  await request(f.app).get(`${base}/report`).expect(404);
});

test('explicit original and note consent; expiration and deletion close every download route', async (t) => {
  const f = await fixture(t);
  const input = { ...f.input, includeOriginals: true, includeNotes: true };
  let d = (await f.owner.post('/api/transmissions').set('Origin', origin).send(input).expect(201))
    .body;
  d = (
    await f.owner
      .put(`/api/transmissions/${d.id}`)
      .set('Origin', origin)
      .send({ input, revision: d.revision, ready: true })
      .expect(200)
  ).body;
  const created = (
    await f.owner
      .post(`/api/transmissions/${d.id}/link`)
      .set('Origin', origin)
      .send({ revision: d.revision, confirmed: true })
      .expect(201)
  ).body;
  const base = '/api/transmission-access/' + created.url.split('/').pop();
  assert.match(JSON.stringify((await request(f.app).get(base)).body), /NOTE PRIVÉE/);
  await request(f.app).get(`${base}/original/${f.proof.id}`).expect(200);
  await request(f.app).get(`${base}/original/${f.other.id}`).expect(404);
  f.store.db
    .prepare('UPDATE transmissions SET expires_at=? WHERE id=?')
    .run('2000-01-01T00:00:00.000Z', d.id);
  assert.equal((await f.owner.get('/api/transmissions')).body[0].state, 'expired');
  for (const suffix of ['', '/report', `/original/${f.proof.id}`])
    await request(f.app)
      .get(base + suffix)
      .expect(404);
  f.store.db
    .prepare('UPDATE transmissions SET expires_at=? WHERE id=?')
    .run('2099-01-01T00:00:00.000Z', d.id);
  f.store.db.prepare('DELETE FROM proofs WHERE id=?').run(f.proof.id);
  assert.deepEqual((await f.owner.get('/api/transmissions')).body, []);
  await request(f.app).get(base).expect(404);
  await request(f.app).get(`${base}/report`).expect(404);
});
