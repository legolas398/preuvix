import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { Builder, LocalSigner } from '@contentauth/c2pa-node';
import { validateContentCredentials } from '../server/c2pa';
import { assessCertification } from '../shared/certification-policy';
import { Store } from '../server/store';
import { readConfig } from '../server/config';
import { createApp } from '../server/app';
import { hash } from '../server/integrity';
import type { Manifest } from '../shared/types';

const origin = 'http://localhost:3000';
const password = 'c2pa-test-password-very-long';

// Test CA standing in for a camera maker on the C2PA trust list.
function testAuthority(directory: string) {
  const file = (name: string) => path.join(directory, name);
  const openssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'pipe' });
  openssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', file('ca.key'));
  openssl(
    'req',
    '-x509',
    '-new',
    '-key',
    file('ca.key'),
    '-sha256',
    '-days',
    '2',
    '-subj',
    '/CN=Test Root/O=Test',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-out',
    file('ca.pem'),
  );
  openssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', file('leaf.key'));
  openssl('pkcs8', '-topk8', '-nocrypt', '-in', file('leaf.key'), '-out', file('leaf.p8'));
  openssl(
    'req',
    '-new',
    '-key',
    file('leaf.key'),
    '-subj',
    '/CN=Test Camera/O=Test Maker',
    '-out',
    file('leaf.csr'),
  );
  writeFileSync(
    file('ext.cnf'),
    'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=emailProtection\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n',
  );
  openssl(
    'x509',
    '-req',
    '-in',
    file('leaf.csr'),
    '-CA',
    file('ca.pem'),
    '-CAkey',
    file('ca.key'),
    '-CAcreateserial',
    '-days',
    '2',
    '-sha256',
    '-extfile',
    file('ext.cnf'),
    '-out',
    file('leaf.pem'),
  );
  const chain = Buffer.concat([readFileSync(file('leaf.pem')), readFileSync(file('ca.pem'))]);
  const key = readFileSync(file('leaf.p8'));
  return {
    anchorsPath: file('ca.pem'),
    anchors: readFileSync(file('ca.pem'), 'utf8'),
    async sign(input: Buffer, source: string) {
      const builder = await Builder.withJsonAsync({
        claim_generator_info: [{ name: 'Test camera', version: '1.0' }],
        title: 'photo.jpg',
        format: 'image/jpeg',
        assertions: [
          {
            label: 'c2pa.actions',
            data: {
              actions: [
                {
                  action: 'c2pa.created',
                  digitalSourceType: `http://cv.iptc.org/newscodes/digitalsourcetype/${source}`,
                },
              ],
            },
          },
        ],
      });
      const output = { buffer: null as Buffer | null };
      builder.sign(
        LocalSigner.newSigner(chain, key, 'es256'),
        { buffer: input, mimeType: 'image/jpeg' },
        output,
      );
      return output.buffer!;
    },
  };
}

const photo = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: '#88aacc' } })
    .jpeg()
    .toBuffer();

test('C2PA signatures are validated: trusted capture, unknown signer, declared AI, tampering', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-c2pa-'));
  try {
    const authority = testAuthority(directory);
    const input = await photo();
    assert.equal((await validateContentCredentials(input, 'image/jpeg', '')).state, 'absent');
    const camera = await authority.sign(input, 'digitalCapture');
    const trusted = await validateContentCredentials(camera, 'image/jpeg', authority.anchors);
    assert.equal(trusted.state, 'trusted');
    assert.equal(trusted.signer?.commonName, 'Test Camera');
    assert.deepEqual(trusted.digitalSourceTypes, ['digitalCapture']);
    assert.equal(
      (await validateContentCredentials(camera, 'image/jpeg', '')).state,
      'valid_untrusted',
    );
    const ai = await validateContentCredentials(
      await authority.sign(input, 'trainedAlgorithmicMedia'),
      'image/jpeg',
      authority.anchors,
    );
    assert.equal(ai.aiDeclared, true);
    const tampered = Buffer.from(camera);
    tampered[tampered.length - 20] ^= 0xff;
    const broken = await validateContentCredentials(tampered, 'image/jpeg', authority.anchors);
    assert.equal(broken.state, 'invalid');
    const assess = (contentCredentials: typeof trusted) =>
      assessCertification({
        provenance: {
          signals: [],
          credentialsDetected: true,
          result: 'inconclusive',
          explanation: '',
          contentCredentials,
        },
      } as unknown as Manifest);
    assert.equal(assess(trusted).status, 'camera_signed');
    assert.equal(assess(trusted).aiAuthenticity, 'camera_provenance_verified');
    assert.equal(assess(ai).status, 'review_required');
    assert.equal(assess(broken).status, 'review_required');
    assert.equal(assess({ ...trusted, state: 'valid_untrusted' }).status, 'integrity_only');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a deposit signed by a trusted camera is certified as camera_signed in the signed manifest', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-c2pa-app-'));
  const store = new Store(directory);
  try {
    const authority = testAuthority(directory);
    const config = readConfig({
      OWNER_PASSWORD: password,
      APP_ORIGIN: origin,
      DATA_DIR: directory,
      C2PA_TRUST_ANCHORS: authority.anchorsPath,
    });
    const owner = request.agent(createApp(config, store));
    await owner.post('/api/login').set('Origin', origin).send({ password }).expect(200);
    const bytes = await authority.sign(await photo(), 'digitalCapture');
    const proof = (
      await owner
        .post('/api/proofs')
        .set('Origin', origin)
        .field('title', 'Photo signée')
        .field('source', 'upload')
        .field('requestKey', randomUUID())
        .field('clientSha256', hash(bytes))
        .attach('file', bytes, 'photo.jpg')
        .expect(201)
    ).body;
    assert.equal(proof.manifest.certification.status, 'camera_signed');
    assert.equal(proof.manifest.provenance.contentCredentials.state, 'trusted');
    await owner
      .post(`/api/proofs/${proof.id}/review`)
      .set('Origin', origin)
      .send({ outcome: 'confirmed', reviewer: 'Témoin' })
      .expect(409);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
