import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac, generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { readConfig } from '../server/config';
import { hash } from '../server/integrity';
import { canonicalJson } from '../shared/canonical';
import { migrateCases } from '../server/case-store';
import type { TimestampService } from '../server/timestamp';

const origin = 'http://localhost:3000',
  password = 'dossier-test-password-long',
  secret = 'only-a-fixture-webhook-secret-123456789';
async function fixture(
  t: TestContext,
  env: NodeJS.ProcessEnv = {},
  transport?: typeof fetch,
  tsa?: TimestampService,
) {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-cases-'));
  writeFileSync(
    path.join(directory, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
  );
  const store = new Store(directory),
    config = readConfig({
      OWNER_PASSWORD: password,
      DATA_DIR: directory,
      APP_ORIGIN: origin,
      ...env,
    });
  const app = createApp(config, store, tsa, undefined, transport);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const owner = request.agent(app);
  await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
  const bytes = await sharp({
    create: { width: 32, height: 24, channels: 3, background: '#557788' },
  })
    .jpeg()
    .toBuffer();
  async function deposit(title = 'Photo confidentielle') {
    return (
      await owner
        .post('/api/proofs')
        .set('Origin', origin)
        .field('title', title)
        .field('description', 'Donnée privée')
        .field('source', 'upload')
        .field('requestKey', randomUUID())
        .field('clientSha256', hash(bytes))
        .attach('file', bytes, 'original.jpg')
        .expect(201)
    ).body;
  }
  async function create() {
    const proof = await deposit();
    const dossier = (
      await owner
        .post('/api/cases')
        .set('Origin', origin)
        .send({
          requestKey: randomUUID(),
          dossier: {
            title: 'Travaux privés',
            description: 'Mon dossier',
            declaredAddress: 'Adresse déclarée uniquement',
          },
        })
        .expect(201)
    ).body;
    return (
      await owner
        .post(`/api/cases/${dossier.manifest.id}/files`)
        .set('Origin', origin)
        .send({ expectedVersion: 1, proofId: proof.id })
        .expect(201)
    ).body;
  }
  return { directory, app, owner, config, store, bytes, deposit, create };
}
const binary = (response: any, done: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => done(null, Buffer.concat(chunks)));
};

test('canonical manifest serialization is deterministic and rejects non-JSON values', () => {
  assert.equal(
    canonicalJson({ z: [3, { b: 'é', a: -0 }], a: true }),
    canonicalJson({ a: true, z: [3, { a: 0, b: 'é' }] }),
  );
  assert.notEqual(canonicalJson(['a', 'b']), canonicalJson(['b', 'a']));
  for (const value of [undefined, NaN, Infinity, new Date(), { a: undefined }])
    assert.throws(() => canonicalJson(value));
});

test('case versions preserve originals, enforce permissions and produce independently verifiable exports', async (t) => {
  const f = await fixture(t),
    dossier = await f.create(),
    id = dossier.manifest.id;
  migrateCases(f.store); // Idempotent migration on an existing installation.
  assert.equal(
    f.store.db.prepare("SELECT count(*) AS n FROM schema_migrations WHERE name='cases-v1'").get()!
      .n,
    1,
  );
  for (const url of [
    '/api/cases',
    `/api/cases/${id}`,
    `/api/cases/${id}/export?version=2`,
    `/api/cases/${id}/report?version=2`,
    `/api/cases/${id}/manifest?version=2`,
    `/api/cases/${id}/links`,
  ])
    await request(f.app).get(url).expect(401);
  await request(f.app)
    .post(`/api/cases/${id}/verify`)
    .set('Origin', origin)
    .send({ version: 2 })
    .expect(401);
  await f.owner.put(`/api/cases/${id}`).send({}).expect(403);
  await f.owner
    .post(`/api/cases/${id}/files`)
    .set('Origin', origin)
    .send({ expectedVersion: 2, proofId: randomUUID() })
    .expect(404);
  for (const kind of ['anchor', 'signature', 'timestamp'])
    await f.owner
      .post(`/api/cases/${id}/services/${kind}`)
      .set('Origin', origin)
      .send({ version: 2, consent: true, signerEmail: 'person@example.test' })
      .expect(409);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM case_operations').get()!.n, 0);
  const nextProof = await f.deposit('Nouvelle photo');
  const replaced = (
    await f.owner
      .post(`/api/cases/${id}/files`)
      .set('Origin', origin)
      .send({
        expectedVersion: 2,
        proofId: nextProof.id,
        replaceFileId: dossier.manifest.files[0].fileId,
      })
      .expect(201)
  ).body;
  assert.equal(replaced.manifest.version, 3);
  assert.equal(replaced.manifest.files[0].fileVersion, 2);
  assert.equal(replaced.manifest.files[0].supersedes, dossier.manifest.files[0].proofId);
  assert.equal(
    (await f.owner.get(`/api/cases/${id}?version=2`)).body.manifestHash,
    dossier.manifestHash,
  );
  assert.deepEqual(Buffer.from(f.store.get(dossier.manifest.files[0].proofId)!.original), f.bytes);
  await f.owner
    .delete(`/api/proofs/${dossier.manifest.files[0].proofId}`)
    .set('Origin', origin)
    .expect(409);
  await f.owner
    .put(`/api/cases/${id}`)
    .set('Origin', origin)
    .send({ expectedVersion: 2, dossier: { title: 'Stale' } })
    .expect(409);
  assert.throws(() =>
    f.store.db.prepare("UPDATE case_versions SET manifest='{}' WHERE case_id=?").run(id),
  );
  const checks = (
    await f.owner
      .post(`/api/cases/${id}/verify`)
      .set('Origin', origin)
      .send({ version: 3 })
      .expect(200)
  ).body;
  assert.ok(
    checks.manifestMatches &&
      checks.files.every((file: any) => file.originalMatches && file.manifestMatches),
  );
  const exported = await f.owner
    .get(`/api/cases/${id}/export?version=3&originals=true`)
    .buffer(true)
    .parse(binary)
    .expect(200);
  const files = unzipSync(exported.body),
    manifestBytes = Buffer.from(files['manifest.json']),
    envelope = JSON.parse(manifestBytes.toString());
  assert.ok(files['rapport.pdf']);
  assert.ok((await PDFDocument.load(files['rapport.pdf'])).getPageCount());
  assert.equal(envelope.dossierSha256, replaced.manifestHash);
  assert.equal(hash(canonicalJson(envelope.dossier)), replaced.manifestHash);
  assert.equal(canonicalJson(envelope), manifestBytes.toString());
  const signature = JSON.parse(Buffer.from(files['attestation.json']).toString());
  assert.ok(
    verify(null, manifestBytes, signature.publicKey, Buffer.from(signature.signature, 'base64')),
  );
  for (const artifact of envelope.artifacts)
    assert.equal(hash(files[artifact.path]), artifact.sha256);
  assert.equal(envelope.services.length, 0);
  for (const [name, data] of Object.entries(files)) {
    const full = path.join(f.directory, name);
    requireMkdir(full);
    writeFileSync(full, data);
  }
  function requireMkdir(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  const output = execFileSync(process.execPath, ['scripts/verify-case-export.mjs', f.directory], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.match(output, /Export integrity verified/);
  // Corruption is detected even if an administrator bypasses the immutable-original trigger.
  f.store.db.exec('DROP TRIGGER immutable_original');
  f.store.db
    .prepare('UPDATE proofs SET original=? WHERE id=?')
    .run(Buffer.from('changed'), nextProof.id);
  const failed = (
    await f.owner
      .post(`/api/cases/${id}/verify`)
      .set('Origin', origin)
      .send({ version: 3 })
      .expect(200)
  ).body;
  assert.equal(failed.files[0].originalMatches, false);
  await f.owner.get(`/api/cases/${id}/export?version=3`).expect(409);
});

test('case links require consent, restrict versions and originals, expire and revoke', async (t) => {
  const f = await fixture(t),
    dossier = await f.create(),
    id = dossier.manifest.id;
  await f.owner
    .post(`/api/cases/${id}/links`)
    .set('Origin', origin)
    .send({ version: 2, includeOriginals: false, days: 7 })
    .expect(400);
  const link = (
    await f.owner
      .post(`/api/cases/${id}/links`)
      .set('Origin', origin)
      .send({ version: 2, confirmed: true, includeOriginals: false, days: 7 })
      .expect(201)
  ).body;
  const token = link.url.split('/').at(-1),
    url = `/api/case-consultation/${token}`;
  await f.owner
    .put(`/api/cases/${id}`)
    .set('Origin', origin)
    .send({ expectedVersion: 2, dossier: { title: 'SECRET NEW VERSION' } })
    .expect(200);
  const publicView = (await request(f.app).get(url).expect(200)).body;
  assert.equal(publicView.dossier.manifest.version, 2);
  assert.equal(publicView.dossier.versions.length, 1);
  assert.ok(!JSON.stringify(publicView).includes('SECRET NEW VERSION'));
  const archive = unzipSync(
    (await request(f.app).get(`${url}/export`).buffer(true).parse(binary).expect(200)).body,
  );
  assert.ok(!Object.keys(archive).some((name) => name.includes('/original.')));
  await f.owner.delete(`/api/cases/${id}/links/${link.id}`).set('Origin', origin).expect(204);
  await request(f.app).get(url).expect(404);
  await request(f.app).get(`${url}/export`).expect(404);
  const second = (
    await f.owner
      .post(`/api/cases/${id}/links`)
      .set('Origin', origin)
      .send({ version: 3, confirmed: true, includeOriginals: true, days: 7 })
      .expect(201)
  ).body;
  f.store.db
    .prepare("UPDATE case_links SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?")
    .run(second.id);
  await request(f.app)
    .get(`/api/case-consultation/${second.url.split('/').at(-1)}`)
    .expect(404);
});

import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('configured gateways bind results, recover failures, verify callbacks and never publish private data to anchoring', async (t) => {
  const signed = await PDFDocument.create();
  signed.addPage();
  const signedBytes = Buffer.from(await signed.save());
  let anchorFail = true,
    signatureComplete = false,
    fetchDocumentMismatch = false;
  const calls: { url: string; method: string; body: any; idempotency: string | null }[] = [];
  let anchorDigest = '',
    signatureDigest = '',
    sourceHash = '';
  const transport: typeof fetch = async (input, init) => {
    const url = String(input),
      method = init?.method || 'GET',
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer fixture-token');
    calls.push({ url, method, body, idempotency: headers.get('idempotency-key') });
    if (url.endsWith('/document'))
      return new Response(
        new Uint8Array(fetchDocumentMismatch ? Buffer.from('%PDF-invalid') : signedBytes),
        { headers: { 'Content-Type': 'application/pdf' } },
      );
    const anchor = url.includes('anchor.example');
    if (method === 'POST' && anchor) {
      anchorDigest = body.digest;
      if (anchorFail) throw new Error('Simulated network outage');
    }
    if (method === 'POST' && !anchor) {
      signatureDigest = body.digest;
      sourceHash = body.sourceDocumentSha256;
      assert.equal(hash(Buffer.from(body.documentBase64, 'base64')), sourceHash);
    }
    const result = anchor
      ? {
          requestId: 'anchor-request',
          digest: anchorDigest,
          state: 'confirmed',
          network: 'fixture-chain',
          transactionId: 'fixture-transaction',
          confirmations: 3,
          confirmedAt: new Date().toISOString(),
        }
      : {
          requestId: 'signature-request',
          digest: signatureDigest,
          state: signatureComplete ? 'confirmed' : 'pending',
          sourceDocumentSha256: sourceHash,
          signedDocumentSha256: hash(signedBytes),
          reportedLevel: 'advanced',
          evidenceReference: 'fixture-provider-report',
          confirmedAt: new Date().toISOString(),
        };
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const f = await fixture(
    t,
    {
      ANCHOR_SERVICE_URL: 'https://anchor.example',
      ANCHOR_SERVICE_NAME: 'Fixture Anchor',
      ANCHOR_SERVICE_TOKEN: 'fixture-token',
      ANCHOR_WEBHOOK_SECRET: secret,
      ANCHOR_NETWORK: 'fixture-chain',
      ANCHOR_MIN_CONFIRMATIONS: '2',
      SIGNATURE_SERVICE_URL: 'https://signature.example',
      SIGNATURE_SERVICE_NAME: 'Fixture Signature',
      SIGNATURE_SERVICE_TOKEN: 'fixture-token',
      SIGNATURE_WEBHOOK_SECRET: secret,
    },
    transport,
  );
  const dossier = await f.create(),
    id = dossier.manifest.id;
  const createUrl = `/api/cases/${id}/services`;
  await f.owner
    .post(`${createUrl}/anchor`)
    .set('Origin', origin)
    .send({ version: 2, consent: true })
    .expect(502);
  let current = (await f.owner.get(`/api/cases/${id}`)).body;
  assert.equal(current.operations[0].state, 'failed');
  anchorFail = false;
  await f.owner
    .post(`/api/cases/${id}/operations/${current.operations[0].id}/retry`)
    .set('Origin', origin)
    .expect(200);
  const anchorCalls = calls.filter(
    (call) => call.method === 'POST' && call.url.includes('anchor.example'),
  );
  assert.equal(anchorCalls[0].idempotency, anchorCalls[1].idempotency);
  assert.deepEqual(Object.keys(anchorCalls[0].body).sort(), ['algorithm', 'digest', 'network']);
  assert.ok(!JSON.stringify(anchorCalls).includes('Travaux privés'));
  await f.owner
    .post(`${createUrl}/signature`)
    .set('Origin', origin)
    .send({ version: 2, consent: true, signerEmail: 'person@example.test' })
    .expect(200);
  current = (await f.owner.get(`/api/cases/${id}`)).body;
  const signatureOp = current.operations.find((op: any) => op.kind === 'signature');
  assert.equal(signatureOp.state, 'pending');
  const callbackUrl = '/api/evidence/callback/signature';
  const payload = JSON.stringify({ eventId: 'event-1', requestId: 'signature-request' });
  await request(f.app)
    .post(callbackUrl)
    .set('Content-Type', 'application/json')
    .send(payload)
    .expect(401);
  const seconds = String(Math.floor(Date.now() / 1000));
  const hmac = (body: string, date = seconds) =>
    'sha256=' + createHmac('sha256', secret).update(`${date}.${body}`).digest('hex');
  await request(f.app)
    .post(callbackUrl)
    .set('Content-Type', 'application/json')
    .set('X-Preuvix-Timestamp', '1000000000')
    .set('X-Preuvix-Signature', hmac(payload, '1000000000'))
    .send(payload)
    .expect(401);
  signatureComplete = true;
  fetchDocumentMismatch = true;
  const notify = () =>
    request(f.app)
      .post(callbackUrl)
      .set('Content-Type', 'application/json')
      .set('X-Preuvix-Timestamp', seconds)
      .set('X-Preuvix-Signature', hmac(payload))
      .send(payload);
  await notify().expect(502);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM case_callback_events').get()!.n, 0);
  fetchDocumentMismatch = false;
  await notify().expect(200);
  const callsBefore = calls.length;
  assert.equal((await notify().expect(200)).body.duplicate, true);
  assert.equal(calls.length, callsBefore);
  const otherPayload = JSON.stringify({ eventId: 'event-1', requestId: 'other-request' });
  await request(f.app)
    .post(callbackUrl)
    .set('Content-Type', 'application/json')
    .set('X-Preuvix-Timestamp', seconds)
    .set('X-Preuvix-Signature', hmac(otherPayload))
    .send(otherPayload)
    .expect(409);
  current = (await f.owner.get(`/api/cases/${id}`)).body;
  assert.equal(
    current.operations.find((op: any) => op.kind === 'signature').result.qualificationVerified,
    false,
  );
  await request(f.app).get(`/api/cases/${id}/operations/${signatureOp.id}/document`).expect(401);
  const document = await f.owner
    .get(`/api/cases/${id}/operations/${signatureOp.id}/document`)
    .buffer(true)
    .parse(binary)
    .expect(200);
  assert.equal(hash(document.body), hash(signedBytes));
  const archive = unzipSync(
    (await f.owner.get(`/api/cases/${id}/export?version=2`).buffer(true).parse(binary).expect(200))
      .body,
  );
  assert.ok(archive['justificatifs/signature/document-retourne-signe.pdf']);
  assert.ok(!JSON.stringify(current).includes('fixture-token'));
  assert.ok(!JSON.stringify(current).includes(secret));
});

test('case RFC3161 failures remain retryable and successful tokens are retained', async (t) => {
  let fail = true;
  const tsa: TimestampService = async () => {
    if (fail) throw new Error('Offline test TSA');
    const response = Buffer.from('FICTITIOUS TEST TOKEN');
    return {
      query: Buffer.from('FICTITIOUS QUERY'),
      response,
      receipt: {
        provider: 'Test double, not a real TSA',
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
  };
  const f = await fixture(t, {}, undefined, tsa),
    dossier = await f.create();
  f.config.timestampConfigured = true;
  f.config.timestamp.name = 'Fixture TSA';
  const id = dossier.manifest.id;
  await f.owner
    .post(`/api/cases/${id}/services/timestamp`)
    .set('Origin', origin)
    .send({ version: 2, consent: true })
    .expect(502);
  const op = (await f.owner.get(`/api/cases/${id}`)).body.operations[0];
  fail = false;
  const result = (
    await f.owner
      .post(`/api/cases/${id}/operations/${op.id}/retry`)
      .set('Origin', origin)
      .expect(200)
  ).body;
  assert.equal(result.operations[0].state, 'confirmed');
  const archive = unzipSync(
    (await f.owner.get(`/api/cases/${id}/export?version=2`).buffer(true).parse(binary).expect(200))
      .body,
  );
  assert.ok(archive['justificatifs/timestamp/timestamp.tsr']);
});
