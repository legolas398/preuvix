// Rotates the Ed25519 attestation key. Stop the server first, then restart it.
// The old private key is archived (mode 600) and its public key is listed in
// retired-keys.json so that earlier dossiers keep verifying.
import { createPrivateKey, createPublicKey, createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { protectSigningKey } from './protect-signing-key.mjs';
import 'dotenv/config';

const directory = path.resolve(process.env.DATA_DIR || './data');
const keyPath = path.join(directory, 'attestation-ed25519.pem');
const listPath = path.join(directory, 'retired-keys.json');
if (!existsSync(keyPath)) throw new Error(`No attestation key at ${keyPath}.`);
const publicKey = createPublicKey(createPrivateKey(readFileSync(keyPath, 'utf8')))
  .export({ type: 'spki', format: 'pem' })
  .toString();
const keyId = createHash('sha256').update(publicKey).digest('hex');
const db = new DatabaseSync(path.join(directory, 'preuvix.sqlite'));
db.exec(
  'CREATE TABLE IF NOT EXISTS signing_key_history (key_id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS active_signing_key (id INTEGER PRIMARY KEY CHECK(id=1), key_id TEXT NOT NULL)',
);
const pinned = db.prepare('SELECT key_id FROM active_signing_key WHERE id=1').get();
if (pinned && pinned.key_id !== keyId)
  throw new Error('Current key does not match the pinned key. Restore it before rotating.');
const replacement = generateKeyPairSync('ed25519');
const nextPublic = replacement.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const nextId = createHash('sha256').update(nextPublic).digest('hex');
const candidate = path.join(directory, 'attestation-ed25519.next.pem');
writeFileSync(candidate, replacement.privateKey.export({ type: 'pkcs8', format: 'pem' }), {
  mode: 0o600,
  flag: 'wx',
});
protectSigningKey(candidate);
const retiredAt = new Date().toISOString();
const retired = existsSync(listPath) ? JSON.parse(readFileSync(listPath, 'utf8')) : [];
retired.push({ keyId, publicKey, retiredAt });
writeFileSync(listPath, JSON.stringify(retired, null, 2) + '\n', { mode: 0o600 });
const archive = path.join(
  directory,
  `attestation-ed25519.retired-${retiredAt.replace(/[:.]/g, '-')}.pem`,
);
renameSync(keyPath, archive);
renameSync(candidate, keyPath);
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('INSERT OR IGNORE INTO signing_key_history VALUES (?)').run(keyId);
  db.prepare('INSERT OR IGNORE INTO signing_key_history VALUES (?)').run(nextId);
  db.prepare('INSERT OR REPLACE INTO active_signing_key VALUES (1,?)').run(nextId);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
console.log(`Retired key ${keyId}.`);
console.log(`Private key archived at ${archive}. Destroy it if it may have been compromised.`);
console.log(
  `New key pinned: ${nextId}. Restart the server and publish its fingerprint through an independent channel.`,
);
