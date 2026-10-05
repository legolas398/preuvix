import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import path from 'node:path';
const [directory, original, trustedKey] = process.argv.slice(2);
if (!directory || !original)
  throw new Error(
    'Usage: node scripts/verify-photo-report.mjs dossier-extrait original [cle-de-confiance.pem]',
  );
const read = (name) => readFileSync(path.join(directory, name));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = read('manifest.json');
const manifest = JSON.parse(bytes);
const attestation = JSON.parse(read('attestation.json'));
const pem = read('signer-public.pem');
const key = createPublicKey(pem);
const signature = read('manifest.sig');
if (
  manifest.schema !== 'preuvix-photo-verification/1' ||
  key.asymmetricKeyType !== 'ed25519' ||
  attestation.algorithm !== 'Ed25519' ||
  attestation.scope !== 'manifest_bytes' ||
  attestation.manifestHash !== hash(bytes) ||
  attestation.keyId !== hash(pem) ||
  attestation.publicKey !== pem.toString() ||
  attestation.signature !== signature.toString('base64') ||
  !verify(null, bytes, key, signature)
)
  throw new Error('Signature ou manifeste invalide.');
const file = readFileSync(original);
if (hash(file) !== manifest.file.sha256 || file.length !== manifest.file.bytes)
  throw new Error('Contenu différent de celui du rapport.');
if (
  trustedKey &&
  !createPublicKey(readFileSync(trustedKey))
    .export({ type: 'spki', format: 'der' })
    .equals(key.export({ type: 'spki', format: 'der' }))
)
  throw new Error('Signataire différent de la clé indépendante.');
console.log('SHA-256 de l’original et signature Ed25519 du manifeste valides.');
console.log(
  trustedKey
    ? 'Correspondance avec la clé indépendante fournie.'
    : 'Identité du signataire non établie.',
);
console.log(
  'Ne réexécute pas C2PA ; ne prouve ni absence d’IA, ni scène réelle, ni horodatage indépendant.',
);
