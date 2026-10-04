import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { Store } from '../server/store';
import { readConfig } from '../server/config';
import { createApp } from '../server/app';
import { hash } from '../server/integrity';
import { chainNext, chainStart, verifyProgressive } from '../server/certification';
import { assessCertification } from '../shared/certification-policy';
import type { CaptureRecord } from '../shared/capture';
import type { Manifest } from '../shared/types';

const origin = 'http://localhost:3000';
const password = 'chain-test-password-very-long';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const binary = (res: any, done: (error: null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

function recording(chunks: Buffer[], every: number, start: number, stepMs: number) {
  const nonce = 'ab'.repeat(16);
  let chain = chainStart(nonce);
  let offset = 0;
  const checkpoints: NonNullable<CaptureRecord['checkpoints']> = [];
  chunks.forEach((chunk, index) => {
    chain = chainNext(chain, chunk);
    offset += chunk.length;
    if ((index + 1) % every === 0)
      checkpoints.push({
        chunks: index + 1,
        offset,
        chain,
        at: new Date(start + (index + 1) * stepMs).toISOString(),
      });
  });
  return {
    record: {
      id: randomUUID(),
      nonce,
      issuedAt: new Date(start).toISOString(),
      expiresAt: new Date(start + 600_000).toISOString(),
      sha256: hash(Buffer.concat(chunks)),
      kind: 'video',
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(start + chunks.length * stepMs).toISOString(),
      segments: chunks.map((chunk) => chunk.length),
      committedAt: new Date(start + chunks.length * stepMs + 500).toISOString(),
      assurance: 'browser_declared_server_committed',
      checkpoints,
    } as CaptureRecord,
    bytes: Buffer.concat(chunks),
  };
}

test('progressive video commitment proves pacing and detects swapped or pre-made recordings', () => {
  const chunks = Array.from({ length: 40 }, (_, i) => Buffer.alloc(1000 + i, i));
  const start = Date.parse('2026-10-04T10:00:00Z');
  // 40 chunks of 250 ms = 10 s, checkpoint every 8 chunks (2 s).
  const ok = recording(chunks, 8, start, 250);
  const verdict = verifyProgressive(ok.record, ok.bytes, 10);
  assert.equal(verdict.verified, true);
  assert.equal(verdict.checkpoints, 5);
  assert.ok(verdict.spanSeconds >= 6);

  const swapped = Buffer.from(ok.bytes);
  swapped[3000] ^= 1;
  const tampered = verifyProgressive(ok.record, swapped, 10);
  assert.equal(tampered.verified, false);
  assert.match(tampered.detail, /ne correspond pas/);

  // A prepared file pushed in one burst: every checkpoint arrives within the same second.
  const burst = recording(chunks, 8, start, 5);
  const fast = verifyProgressive(burst.record, burst.bytes, 10);
  assert.equal(fast.verified, false);
  assert.match(fast.detail, /rythme/);

  const resized = verifyProgressive(ok.record, ok.bytes.subarray(1), 10);
  assert.equal(resized.verified, false);
});

test('virtual cameras and failed progressive commitments require review in policy v3', () => {
  const manifest = (capture: Partial<CaptureRecord>): Manifest =>
    ({
      provenance: {
        result: 'inconclusive',
        signals: [],
        credentialsDetected: false,
        explanation: '',
      },
      capture: {
        id: randomUUID(),
        nonce: 'n',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        sha256: '0'.repeat(64),
        kind: 'photo',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        committedAt: new Date().toISOString(),
        assurance: 'browser_declared_server_committed',
        elapsedSeconds: 10,
        ...capture,
      },
    }) as unknown as Manifest;
  const obs = assessCertification(manifest({ device: { label: 'OBS Virtual Camera' } }));
  assert.equal(obs.policy, 'preuvix-media-v3');
  assert.equal(obs.status, 'review_required');
  assert.equal(obs.checks.find((check) => check.id === 'device')?.result, 'review');
  const real = assessCertification(manifest({ device: { label: 'FaceTime HD Camera' } }));
  assert.equal(real.status, 'capture_documented');
  assert.equal(
    assessCertification(manifest({ device: { label: 'fake_device_0' } })).status,
    'review_required',
  );
  assert.equal(
    assessCertification(manifest({ device: { label: 'OBSBOT Tiny 2 StreamCamera' } })).status,
    'capture_documented',
  );
  const video = assessCertification(
    manifest({
      kind: 'video',
      progressive: { checkpoints: 3, verified: false, spanSeconds: 0, detail: 'x' },
    }),
  );
  assert.equal(video.status, 'review_required');
  assert.equal(video.checks.find((check) => check.id === 'progressive')?.result, 'review');
});

test('annexes, issued documents and the custody journal form a verifiable chain', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-chain-'));
  const store = new Store(directory);
  try {
    const app = createApp(
      readConfig({ OWNER_PASSWORD: password, APP_ORIGIN: origin, DATA_DIR: directory }),
      store,
    );
    const owner = request.agent(app);
    await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    const photo = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#887766' },
    })
      .jpeg()
      .toBuffer();
    const proof = (
      await owner
        .post('/api/proofs')
        .set('Origin', origin)
        .field('title', 'Dégât des eaux')
        .field('source', 'upload')
        .field('requestKey', randomUUID())
        .field('clientSha256', hash(photo))
        .attach('file', photo, 'photo.jpg')
        .expect(201)
    ).body;
    assert.equal(proof.custody.intact, true);
    assert.deepEqual(
      proof.custody.entries.map((entry: { kind: string }) => entry.kind),
      ['original_received', 'manifest_signed'],
    );
    assert.equal(
      proof.chain.find((link: { id: string }) => link.id === 'custody').state,
      'verified',
    );

    const pdf = Buffer.from('%PDF-1.4\n% bail de location\n%%EOF\n');
    const annex = (bytes: Buffer, name: string, key = randomUUID(), sha = hash(bytes)) =>
      owner
        .post(`/api/proofs/${proof.id}/annexes`)
        .set('Origin', origin)
        .field('clientSha256', sha)
        .field('note', 'Contrat signé')
        .field('requestKey', key)
        .attach('file', bytes, name);
    await annex(pdf, 'bail.pdf', randomUUID(), '0'.repeat(64)).expect(422);
    await annex(Buffer.from([0, 1, 2, 3]), 'binaire.bin').expect(415);
    const key = randomUUID();
    const withAnnex = (await annex(pdf, 'bail.pdf', key).expect(201)).body;
    await annex(pdf, 'bail.pdf', key).expect(200);
    await annex(Buffer.from('autre'), 'autre.txt', key).expect(409);
    const text = (await annex(Buffer.from('Courriel du 3 octobre'), 'mail.eml').expect(201)).body;
    assert.equal(withAnnex.annexes[0].mime, 'application/pdf');
    assert.equal(text.annexes.length, 2);
    assert.equal(text.annexes[1].mime, 'text/plain');
    assert.ok(text.annexes.every((a: { signatureValid: boolean }) => a.signatureValid));
    assert.equal(
      text.chain.find((link: { id: string }) => link.id === 'annexes').state,
      'verified',
    );
    assert.throws(() => store.db.prepare("UPDATE annexes SET payload='{}'").run());
    const downloaded = await owner
      .get(`/api/proofs/${proof.id}/annexes/${text.annexes[0].annexId}`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    assert.ok(downloaded.body.equals(pdf));

    // The report is registered: the exact bytes are found, a one-byte change is not.
    const report = await owner
      .get(`/api/proofs/${proof.id}/report`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    const found = (
      await request(app)
        .get(`/api/documents/${hash(report.body)}`)
        .expect(200)
    ).body;
    assert.equal(found.found, true);
    assert.equal(found.kind, 'report');
    assert.equal(found.signatureValid, true);
    assert.equal(found.dossierIntact, true);
    assert.match(found.documentId, /^DOC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const loaded = await PDFDocument.load(report.body);
    assert.ok(loaded.getSubject()?.includes(found.documentId));
    const altered = Buffer.concat([report.body, Buffer.from(' ')]);
    assert.equal(
      (
        await request(app)
          .get(`/api/documents/${hash(altered)}`)
          .expect(200)
      ).body.found,
      false,
    );
    const lookup = (await owner.get(`/api/lookup/${hash(pdf)}`).expect(200)).body;
    assert.equal(lookup.matches[0].kind, 'annex');
    await request(app)
      .get(`/api/lookup/${hash(pdf)}`)
      .expect(401);

    // The export carries a signed inventory, journal and annexes, checked by the script.
    const exported = await owner
      .get(`/api/proofs/${proof.id}/export`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    const exportFound = (await request(app).get(`/api/documents/${hash(exported.body)}`)).body;
    assert.equal(exportFound.kind, 'export');
    const files = unzipSync(exported.body);
    assert.ok(files['SHA256SUMS'] && files['SHA256SUMS.sig'] && files['custody.json']);
    const out = path.join(directory, 'export');
    for (const [name, bytes] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(out, name)), { recursive: true });
      writeFileSync(path.join(out, name), bytes);
    }
    const script = path.resolve('scripts/verify-export.mjs');
    const output = execFileSync(process.execPath, [script, out]).toString();
    assert.match(output, /Signed inventory verified/);
    assert.match(output, /Custody journal verified/);
    assert.match(output, /Annex A1 verified/);
    const annexFile = Object.keys(files).find((name) => name.startsWith('annexes/A1-'))!;
    writeFileSync(path.join(out, annexFile), Buffer.from('%PDF-1.4 falsifié'));
    assert.throws(() => execFileSync(process.execPath, [script, out], { stdio: 'pipe' }));
    writeFileSync(path.join(out, annexFile), files[annexFile]);
    writeFileSync(path.join(out, 'ajout.txt'), 'fichier glissé');
    assert.throws(() => execFileSync(process.execPath, [script, out], { stdio: 'pipe' }));

    const current = (await owner.get(`/api/proofs/${proof.id}`).expect(200)).body;
    const kinds = current.custody.entries.map((entry: { kind: string }) => entry.kind);
    assert.deepEqual(kinds.slice(0, 4), [
      'original_received',
      'manifest_signed',
      'annex_added',
      'annex_added',
    ]);
    assert.ok(kinds.filter((kind: string) => kind === 'document_issued').length >= 3);
    assert.equal(
      current.chain.find((link: { id: string }) => link.id === 'documents').state,
      'verified',
    );

    // Tampering with the journal, even by someone with database access, breaks the chain.
    assert.throws(() => store.db.prepare("UPDATE custody SET payload='{}'").run());
    store.db.exec('DROP TRIGGER append_only_custody');
    store.db
      .prepare('UPDATE custody SET payload=replace(payload, ?, ?) WHERE proof_id=? AND seq=2')
      .run('bail.pdf', 'faux.pdf', proof.id);
    const broken = (await owner.get(`/api/proofs/${proof.id}`).expect(200)).body;
    assert.equal(broken.custody.intact, false);
    assert.equal(
      broken.chain.find((link: { id: string }) => link.id === 'custody').state,
      'failed',
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
