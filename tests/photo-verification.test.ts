import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { certification } from '../server/certification';
import { hash } from '../server/integrity';
import { verifyPhoto } from '../server/photo-verification';

test('private photo API preserves bytes, excludes private metadata, signs independently verifiable reports', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-photo-check-'));
  // This test exercises report signing with a provisioned key, not OS-specific
  // first-run key provisioning (which depends on the host's PowerShell policy).
  writeFileSync(
    path.join(directory, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600, flag: 'wx' },
  );
  const store = new Store(directory);
  try {
    const origin = 'http://localhost:3000';
    const password = 'private-photo-test-password';
    const app = createApp(
      readConfig({ DATA_DIR: directory, APP_ORIGIN: origin, OWNER_PASSWORD: password }),
      store,
    );
    // Procedural test image: NOT a real photo and NOT an AI sample.
    const bytes = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#88aacc' },
    })
      .jpeg()
      .withExif({ IFD0: { Software: 'private-software-marker' } })
      .toBuffer();
    await request(app).post('/api/photo-verification').set('Origin', origin).expect(401);
    const owner = request.agent(app);
    await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    const run = (input: Buffer, reference = '') =>
      owner
        .post('/api/photo-verification')
        .set('Origin', origin)
        .field('reference', reference)
        .field('clientSha256', hash(input))
        .attach('file', input, 'test.jpg');
    const { body } = await run(bytes).expect(200);
    assert.equal(body.result.file.sha256, hash(bytes));
    assert.equal(body.result.provenance.presence, 'absent');
    assert.match(body.result.integrity.result, /création/);
    assert.equal(body.result.context.software, 'private-software-marker');
    assert.ok(!JSON.stringify(body.manifest).includes('private-software-marker'));
    assert.equal(
      (await run(bytes, hash(bytes))).body.result.integrity.result,
      'correspondance exacte',
    );
    const recompressed = await sharp(bytes).jpeg({ quality: 45 }).toBuffer();
    assert.equal(
      (await run(recompressed, hash(bytes))).body.result.integrity.result,
      'contenu différent',
    );
    await run(Buffer.from('invalid')).expect(400);
    await run(bytes, 'invalid-reference').expect(400);
    await owner
      .post('/api/photo-verification')
      .set('Origin', origin)
      .field('clientSha256', '0'.repeat(64))
      .attach('file', bytes, 'test.jpg')
      .expect(400);
    assert.equal(
      (store.db.prepare('SELECT count(*) AS n FROM proofs').get() as { n: number }).n,
      0,
    );
    writeFileSync(path.join(directory, 'original.jpg'), bytes);
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(body.manifest));
    writeFileSync(path.join(directory, 'attestation.json'), JSON.stringify(body.attestation));
    writeFileSync(
      path.join(directory, 'manifest.sig'),
      Buffer.from(body.attestation.signature, 'base64'),
    );
    writeFileSync(path.join(directory, 'signer-public.pem'), body.attestation.publicKey);
    const verify = () =>
      execFileSync(
        process.execPath,
        ['scripts/verify-photo-report.mjs', directory, path.join(directory, 'original.jpg')],
        { encoding: 'utf8', windowsHide: true },
      );
    assert.match(verify(), /valides/);
    writeFileSync(
      path.join(directory, 'manifest.json'),
      JSON.stringify({ ...body.manifest, schema: 'tampered' }),
    );
    assert.throws(verify);
    const keyPath = path.join(directory, 'attestation-ed25519.pem');
    const key = readFileSync(keyPath);
    certification(store, directory);
    assert.deepEqual(readFileSync(keyPath), key);
    renameSync(keyPath, `${keyPath}.test-backup`);
    assert.throws(() => certification(store, directory), /manquante/);
    renameSync(`${keyPath}.test-backup`, keyPath);
    console.log(`Test artifacts retained: ${directory}`);
  } finally {
    store.close();
  }
});

test('photo size and unsupported formats fail explicitly', async () => {
  await assert.rejects(verifyPhoto(Buffer.alloc(0), '', ''), /vide/);
  await assert.rejects(verifyPhoto(Buffer.alloc(10 * 1024 * 1024 + 1), '', ''), /supérieur/);
  await assert.rejects(verifyPhoto(Buffer.from('<svg/>'), '', ''), /invalide/);
});

test('official CA.jpg validates cryptographically; changed and recompressed bytes differ', async () => {
  const bytes = readFileSync('tests/fixtures/photo-verification/CA.jpg');
  assert.equal(hash(bytes), 'e71bff58fc57640803e6e65f7534e2fb0c2f99018c85276cc14b30f04427cc76');
  const original = await verifyPhoto(bytes, hash(bytes), '');
  assert.equal(original.provenance.binding, 'validée');
  assert.equal(original.provenance.signature, 'validée');
  assert.equal(original.provenance.trust, 'signataire non reconnu');
  const modified = Buffer.from(bytes);
  const jfif = modified.indexOf(Buffer.from('JFIF\0'));
  assert.ok(jfif > 0);
  modified[jfif + 8] ^= 1;
  const changed = await verifyPhoto(modified, hash(bytes), '');
  assert.equal(changed.integrity.result, 'contenu différent');
  assert.equal(changed.provenance.binding, 'invalide');
  const recompressed = await verifyPhoto(
    await sharp(bytes).jpeg({ quality: 65 }).toBuffer(),
    hash(bytes),
    '',
  );
  assert.equal(recompressed.integrity.result, 'contenu différent');
  assert.equal(recompressed.provenance.presence, 'absent');
});
