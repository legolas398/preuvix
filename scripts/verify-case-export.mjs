import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, verify } from 'node:crypto';
import { canonicalJson } from '../shared/canonical.ts';

const directory = process.argv[2] && path.resolve(process.argv[2]);
if (!directory)
  throw new Error(
    'Usage: node scripts/verify-case-export.mjs extracted-directory [trusted-public-key.pem]',
  );
const read = (name) => {
  const target = path.resolve(directory, name);
  if (!target.startsWith(directory + path.sep)) throw new Error('Invalid artifact path');
  return readFileSync(target);
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = read('manifest.json'),
  manifest = JSON.parse(bytes);
if (
  manifest.schema !== 'preuvix-case-export/1' ||
  manifest.serialization !== 'PREUVIX-JSON-v1' ||
  canonicalJson(manifest) !== bytes.toString('utf8') ||
  hash(bytes) !== read('manifest.sha256').toString()
)
  throw new Error('Invalid export manifest');
const signature = JSON.parse(read('attestation.json'));
function checkSignature(payload, attestation) {
  if (
    attestation.algorithm !== 'Ed25519' ||
    attestation.scope !== 'manifest_bytes' ||
    hash(payload) !== attestation.manifestHash ||
    hash(attestation.publicKey) !== attestation.keyId ||
    !verify(null, payload, attestation.publicKey, Buffer.from(attestation.signature, 'base64'))
  )
    throw new Error('Invalid signature');
}
checkSignature(bytes, signature);
if (
  read('signer-public.pem').toString() !== signature.publicKey ||
  read('manifest.sig').toString('base64') !== signature.signature
)
  throw new Error('Signature files do not match');
if (process.argv[3] && readFileSync(process.argv[3]).toString() !== signature.publicKey)
  throw new Error('Unexpected signing key');
if (
  canonicalJson(manifest.dossier) !== read('dossier.json').toString() ||
  hash(read('dossier.json')) !== manifest.dossierSha256
)
  throw new Error('Dossier digest mismatch');
checkSignature(read('dossier.json'), JSON.parse(read('dossier-attestation.json')));
const names = new Set();
for (const artifact of manifest.artifacts) {
  if (names.has(artifact.path)) throw new Error('Duplicate artifact path');
  names.add(artifact.path);
  const content = read(artifact.path);
  if (content.length !== artifact.bytes || hash(content) !== artifact.sha256)
    throw new Error(`Artifact mismatch: ${artifact.path}`);
}
console.log('Export integrity verified: manifest, signatures and included artifacts.');
console.log(
  process.argv[3]
    ? 'Export signer matches independently supplied key.'
    : 'Signer identity not independently verified. Supply a trusted public key.',
);
console.log(
  'Provider receipts are preserved, not independently verified by this script. No scene authenticity, blockchain finality or eIDAS qualification is established.',
);
