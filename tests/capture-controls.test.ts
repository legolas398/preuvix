import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, verify } from 'node:crypto';
import { Store } from '../server/store';
import { certification } from '../server/certification';
import { execFileSync } from 'node:child_process';

test('capture rejects replay changes, wrong nonce, stale locations, false dates and expired challenges', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-controls-'));
  writeFileSync(
    path.join(directory, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
  );
  const store = new Store(directory);
  try {
    const service = certification(store, directory);
    const session = service.issue('owner');
    const date = new Date().toISOString();
    const start = {
      status: 'recorded' as const,
      latitude: 48.8566,
      longitude: 2.3522,
      accuracy: 8,
      measuredAt: date,
    };
    const input = {
      nonce: session.nonce,
      sha256: 'a'.repeat(64),
      kind: 'photo',
      startedAt: date,
      endedAt: date,
      location: { start },
    };
    assert.throws(() => service.commit(session.id, 'other-owner', input));
    assert.throws(() => service.commit(session.id, 'owner', { ...input, nonce: '0'.repeat(32) }));
    assert.throws(() =>
      service.commit(session.id, 'owner', { ...input, startedAt: '2000-01-01T00:00:00.000Z' }),
    );
    for (const bad of [
      { latitude: 91 },
      { accuracy: -1 },
      { measuredAt: '2000-01-01T00:00:00.000Z' },
    ])
      assert.throws(() =>
        service.commit(session.id, 'owner', {
          ...input,
          location: { start: { ...start, ...bad } },
        }),
      );
    assert.throws(() => service.commit(session.id, 'owner', { ...input, kind: 'video' }));
    const record = service.commit(session.id, 'owner', input);
    assert.deepEqual(service.commit(session.id, 'owner', input), record);
    assert.throws(() =>
      service.commit(session.id, 'owner', {
        ...input,
        location: { start: { ...start, latitude: 49 } },
      }),
    );
    assert.throws(() => service.commit(session.id, 'owner', { ...input, location: undefined }));
    const attestation = service.attest(record);
    assert.ok(
      verify(
        null,
        Buffer.from(JSON.stringify(record)),
        attestation.publicKey,
        Buffer.from(attestation.signature, 'base64'),
      ),
    );
    assert.equal(
      verify(
        null,
        Buffer.from(JSON.stringify({ ...record, location: { start: { ...start, longitude: 0 } } })),
        attestation.publicKey,
        Buffer.from(attestation.signature, 'base64'),
      ),
      false,
    );
    const expired = service.issue('owner');
    store.db
      .prepare('UPDATE capture_sessions SET session=? WHERE id=?')
      .run(
        JSON.stringify({ ...expired, issuedAt: new Date(Date.now() - 181000).toISOString() }),
        expired.id,
      );
    assert.throws(
      () => service.commit(expired.id, 'owner', { ...input, nonce: expired.nonce }),
      /expirée/,
    );
    for (const status of ['not_requested', 'denied', 'unavailable']) {
      const next = service.issue('owner');
      const saved = service.commit(next.id, 'owner', {
        ...input,
        nonce: next.nonce,
        kind: 'video',
        location: { start: { status }, end: { status } },
      });
      assert.equal(saved.location?.start.status, status);
    }
    const keyFile = path.join(directory, 'attestation-ed25519.pem');
    const original = readFileSync(keyFile);
    writeFileSync(
      keyFile,
      generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    );
    assert.throws(() => certification(store, directory), /remplacée/);
    writeFileSync(keyFile, original);
    assert.equal(certification(store, directory).keyId, service.keyId);
    execFileSync(process.execPath, ['scripts/rotate-key.mjs'], {
      env: { ...process.env, DATA_DIR: directory },
      windowsHide: true,
      stdio: 'pipe',
    });
    const rotated = certification(store, directory);
    assert.notEqual(rotated.keyId, service.keyId);
    assert.ok(rotated.retiredKeys.some((key) => key.keyId === service.keyId));
    assert.ok(
      store.db.prepare('SELECT key_id FROM signing_key_history WHERE key_id=?').get(service.keyId),
    );
    assert.ok(
      verify(
        null,
        Buffer.from(JSON.stringify(record)),
        attestation.publicKey,
        Buffer.from(attestation.signature, 'base64'),
      ),
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
