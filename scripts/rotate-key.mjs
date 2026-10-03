// Rotates the Ed25519 attestation key. Stop the server first, then restart it.
// The old private key is archived (mode 600) and its public key is listed in
// retired-keys.json so that earlier dossiers keep verifying.
import { createPrivateKey, createPublicKey, createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const directory = path.resolve(process.env.DATA_DIR || './data');
const keyPath = path.join(directory, 'attestation-ed25519.pem');
const listPath = path.join(directory, 'retired-keys.json');
if (!existsSync(keyPath)) throw new Error(`No attestation key at ${keyPath}.`);
const publicKey = createPublicKey(createPrivateKey(readFileSync(keyPath, 'utf8')))
  .export({ type: 'spki', format: 'pem' })
  .toString();
const keyId = createHash('sha256').update(publicKey).digest('hex');
const retiredAt = new Date().toISOString();
const retired = existsSync(listPath) ? JSON.parse(readFileSync(listPath, 'utf8')) : [];
retired.push({ keyId, publicKey, retiredAt });
writeFileSync(listPath, JSON.stringify(retired, null, 2) + '\n', { mode: 0o600 });
const archive = path.join(
  directory,
  `attestation-ed25519.retired-${retiredAt.replace(/[:.]/g, '-')}.pem`,
);
renameSync(keyPath, archive);
console.log(`Retired key ${keyId}.`);
console.log(`Private key archived at ${archive}. Destroy it if it may have been compromised.`);
console.log(
  'Restart the server: a new key is generated. Publish its fingerprint from /api/certification/key.',
);
