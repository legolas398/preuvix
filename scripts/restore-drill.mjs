import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createHash, verify } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { restoreBackup } from './backup.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function manifests(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Restore drill refuses symbolic links.');
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await manifests(file)));
    else if (entry.name === 'backup-manifest.json') result.push(root);
  }
  return result;
}
export async function restoreDrill(downloaded, destination) {
  const snapshots = await manifests(downloaded);
  if (snapshots.length !== 1)
    throw new Error('Exactly one verified snapshot is required in the downloaded archive.');
  await restoreBackup(snapshots[0], destination);
  const db = new DatabaseSync(path.join(destination, 'preuvix.sqlite'), { readOnly: true });
  try {
    let proofs = 0,
      signed = 0;
    for (const row of db
      .prepare('SELECT id,original,manifest,manifest_hash FROM proofs')
      .iterate()) {
      const manifest = JSON.parse(row.manifest);
      if (hash(row.original) !== manifest.file.sha256 || hash(row.manifest) !== row.manifest_hash)
        throw new Error('Restored proof hash mismatch.');
      const record = db.prepare('SELECT payload FROM attestations WHERE proof_id=?').get(row.id);
      if (record) {
        const attestation = JSON.parse(record.payload);
        if (
          attestation.algorithm !== 'Ed25519' ||
          attestation.scope !== 'manifest_bytes' ||
          attestation.manifestHash !== row.manifest_hash ||
          hash(attestation.publicKey) !== attestation.keyId ||
          !db
            .prepare('SELECT key_id FROM signing_key_history WHERE key_id=?')
            .get(attestation.keyId) ||
          !verify(
            null,
            Buffer.from(row.manifest),
            attestation.publicKey,
            Buffer.from(attestation.signature, 'base64'),
          )
        )
          throw new Error('Restored signature mismatch.');
        signed++;
      }
      proofs++;
    }
    if (
      Number(db.prepare('SELECT count(*) AS n FROM sessions').get().n) ||
      Number(db.prepare('SELECT count(*) AS n FROM capture_sessions').get().n)
    )
      throw new Error('Restored sessions must be revoked.');
    return { restored: true, proofs, signaturesVerified: signed, sessionsRevoked: true };
  } finally {
    db.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [downloaded, destination] = process.argv.slice(2);
    if (!downloaded || !destination)
      throw new Error('Usage: node scripts/restore-drill.mjs DOWNLOADED NEW_DESTINATION');
    console.log(JSON.stringify(await restoreDrill(downloaded, destination)));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
