import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { readConfig } from '../server/config';
import { timestampService } from '../server/timestamp';
import { hash } from '../server/integrity';

const openssl = process.env.OPENSSL_BIN || 'openssl';
const available = spawnSync(openssl, ['version'], { windowsHide: true }).status === 0;
const exec = promisify(execFile);

test(
  'real RFC 3161 cryptography accepts a trusted token and rejects wrong signer, digest, chain and policy',
  { skip: !available, timeout: 60000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'preuvix-crypto-test-'));
    const previousConf = process.env.OPENSSL_CONF;
    const p = (name: string) => path.join(directory, name);
    const run = (args: string[]) => exec(openssl, args, { windowsHide: true, timeout: 15000 });
    try {
      await writeFile(p('openssl.cnf'), '[req]\ndistinguished_name=dn\n[dn]\n');
      process.env.OPENSSL_CONF = p('openssl.cnf');
      await run([
        'req',
        '-new',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        p('root.key'),
        '-out',
        p('root.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=PREUVIX Test Root',
        '-addext',
        'basicConstraints=critical,CA:TRUE',
        '-addext',
        'keyUsage=critical,keyCertSign,cRLSign',
      ]);
      await run([
        'req',
        '-new',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        p('tsa.key'),
        '-out',
        p('tsa.csr'),
        '-subj',
        '/CN=PREUVIX TEST ONLY TSA',
      ]);
      await writeFile(
        p('extensions.cnf'),
        'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,timeStamping\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n',
      );
      await run([
        'x509',
        '-req',
        '-in',
        p('tsa.csr'),
        '-CA',
        p('root.pem'),
        '-CAkey',
        p('root.key'),
        '-CAcreateserial',
        '-out',
        p('tsa.pem'),
        '-days',
        '1',
        '-extfile',
        p('extensions.cnf'),
      ]);
      await writeFile(p('serial'), '01');
      const configText = `[tsa_config]\nserial=${p('serial').replaceAll('\\', '/')}\ncrypto_device=builtin\nsigner_cert=${p('tsa.pem').replaceAll('\\', '/')}\ncerts=${p('root.pem').replaceAll('\\', '/')}\nsigner_key=${p('tsa.key').replaceAll('\\', '/')}\nsigner_digest=sha256\ndefault_policy=1.2.3.4.1\nother_policies=1.2.3.4.2\ndigests=sha256\naccuracy=secs:1\nordering=no\ntsa_name=yes\ness_cert_id_chain=no\ness_cert_id_alg=sha256\n`;
      await writeFile(p('tsa.cnf'), configText);
      const cert = new X509Certificate(await readFile(p('tsa.pem')));
      const config = readConfig({
        OWNER_PASSWORD: 'test-only-password-very-long',
        TSA_URL: 'https://tsa.test.invalid',
        TSA_NAME: 'TEST ONLY',
        TSA_CA_FILE: p('root.pem'),
        TSA_POLICY_OID: '1.2.3.4.1',
        TSA_SIGNER_SHA256: hash(cert.raw),
        OPENSSL_BIN: openssl,
      });
      let requestIndex = 0;
      const transport: typeof fetch = async (_url, init) => {
        const index = ++requestIndex;
        await writeFile(p(`request-${index}.tsq`), Buffer.from(init!.body as Uint8Array));
        await run([
          'ts',
          '-reply',
          '-config',
          p('tsa.cnf'),
          '-section',
          'tsa_config',
          '-queryfile',
          p(`request-${index}.tsq`),
          '-out',
          p(`response-${index}.tsr`),
        ]);
        return new Response(new Uint8Array(await readFile(p(`response-${index}.tsr`))), {
          headers: { 'Content-Type': 'application/timestamp-reply' },
        });
      };
      const digest = hash('frozen test manifest');
      const valid = await timestampService(config, transport)(digest);
      assert.equal(valid.receipt.signerSha256, hash(cert.raw));
      assert.equal(valid.receipt.policyOid, '1.2.3.4.1');
      assert.equal(valid.receipt.qualification, 'not_assessed');
      assert.equal(valid.receipt.responseSha256, hash(valid.response));
      const wrongSigner = structuredClone(config);
      wrongSigner.timestamp.signerSha256 = 'f'.repeat(64);
      await assert.rejects(
        timestampService(wrongSigner, transport)(digest),
        /Unexpected timestamp signer/,
      );
      // Replay a correctly signed response bound to another digest and another nonce.
      const replay: typeof fetch = async () =>
        new Response(new Uint8Array(valid.response), {
          headers: { 'Content-Type': 'application/timestamp-reply' },
        });
      await assert.rejects(timestampService(config, replay)(hash('different manifest')));
      await run([
        'req',
        '-new',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        p('other.key'),
        '-out',
        p('other.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=Unrelated Test Root',
        '-addext',
        'basicConstraints=critical,CA:TRUE',
      ]);
      const wrongCA = structuredClone(config);
      wrongCA.timestamp.caFile = p('other.pem');
      await assert.rejects(timestampService(wrongCA, transport)(digest));
      const wrongPolicy = structuredClone(config);
      wrongPolicy.timestamp.policyOid = '1.2.3.4.99';
      await assert.rejects(timestampService(wrongPolicy, transport)(digest));
      const invalidReply: typeof fetch = async () =>
        new Response('not a timestamp', {
          headers: { 'Content-Type': 'application/timestamp-reply' },
        });
      await assert.rejects(timestampService(config, invalidReply)(digest));
    } finally {
      if (previousConf === undefined) delete process.env.OPENSSL_CONF;
      else process.env.OPENSSL_CONF = previousConf;
      await rm(directory, { recursive: true, force: true });
    }
  },
);
