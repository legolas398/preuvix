import { readFileSync } from 'node:fs';
import { createHash, verify } from 'node:crypto';
import path from 'node:path';
const directory = process.argv[2];
if (!directory)
  throw new Error(
    'Usage: node scripts/verify-export.mjs dossier-extrait [cle-publique-de-confiance.pem]',
  );
const read = (name) => readFileSync(path.join(directory, name));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = read('manifest.json');
const manifest = JSON.parse(manifestBytes);
const attestation = JSON.parse(read('attestation.json'));
const publicKey = read('signer-public.pem').toString();
const signature = read('manifest.sig');
if (
  !['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(manifest.file.mime)
)
  throw new Error('Unsupported media type');
if (hash(read(`original.${manifest.file.mime.split('/')[1]}`)) !== manifest.file.sha256)
  throw new Error('Original fingerprint mismatch');
if (
  hash(manifestBytes) !== attestation.manifestHash ||
  hash(publicKey) !== attestation.keyId ||
  publicKey !== attestation.publicKey ||
  signature.toString('base64') !== attestation.signature ||
  !verify(null, manifestBytes, publicKey, signature)
)
  throw new Error('Invalid attestation');
if (process.argv[3] && readFileSync(process.argv[3]).toString() !== publicKey)
  throw new Error('Signer differs from independently trusted key');
console.log('Original SHA-256 and Ed25519 manifest signature verified.');
console.log(
  process.argv[3]
    ? 'Signer matches the supplied trusted key.'
    : 'Signer identity NOT independently verified. Obtain its key through a trusted channel.',
);
console.log('This does not authenticate the scene, rule out AI, or verify an RFC 3161 timestamp.');
