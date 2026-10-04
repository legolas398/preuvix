import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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
let reviews = [];
try {
  reviews = JSON.parse(read('reviews.json'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const review of reviews) {
  const content = JSON.parse(review.payload);
  if (
    content.type !== 'preuvix-challenge-review-v1' ||
    content.proofId !== manifest.id ||
    content.manifestHash !== attestation.manifestHash ||
    hash(review.publicKey) !== review.keyId ||
    !verify(
      null,
      Buffer.from(review.payload),
      review.publicKey,
      Buffer.from(review.signature, 'base64'),
    )
  )
    throw new Error('Invalid challenge review');
  console.log(
    `Challenge review verified: ${content.outcome} by ${content.reviewer} (declared name) at ${content.reviewedAt}.`,
  );
}
const signedBy = (item) => {
  if (hash(item.publicKey) !== item.keyId) return false;
  if (process.argv[3] && item.publicKey !== readFileSync(process.argv[3]).toString()) return false;
  return verify(
    null,
    Buffer.from(item.payload),
    item.publicKey,
    Buffer.from(item.signature, 'base64'),
  );
};
// Signed inventory: every file of the export, nothing added or removed.
if (existsSync(path.join(directory, 'SHA256SUMS'))) {
  const sums = read('SHA256SUMS');
  if (!verify(null, sums, publicKey, read('SHA256SUMS.sig')))
    throw new Error('Invalid SHA256SUMS signature');
  const listed = new Map(
    sums
      .toString()
      .trim()
      .split('\n')
      .map((line) => {
        const [digest, ...name] = line.split('  ');
        return [name.join('  '), digest];
      }),
  );
  const walk = (dir, prefix = '') =>
    readdirSync(dir).flatMap((name) =>
      statSync(path.join(dir, name)).isDirectory()
        ? walk(path.join(dir, name), `${prefix}${name}/`)
        : [`${prefix}${name}`],
    );
  const present = walk(directory).filter((name) => !name.startsWith('SHA256SUMS'));
  for (const name of present)
    if (!listed.has(name)) throw new Error(`File not in signed inventory: ${name}`);
  for (const [name, digest] of listed)
    if (hash(read(name)) !== digest) throw new Error(`Inventory mismatch: ${name}`);
  console.log(`Signed inventory verified: ${listed.size} files, none added, removed or altered.`);
} else console.log('No SHA256SUMS: export predates the signed inventory.');
// Custody journal: sequence, links to the previous entry, signatures.
if (existsSync(path.join(directory, 'custody.json'))) {
  const custody = JSON.parse(read('custody.json'));
  let prev = '0'.repeat(64);
  custody.forEach((item, index) => {
    const entry = JSON.parse(item.payload);
    if (
      entry.type !== 'preuvix-custody-v1' ||
      entry.proofId !== manifest.id ||
      entry.seq !== index ||
      entry.prev !== prev ||
      !signedBy(item) ||
      (entry.kind === 'manifest_signed' && entry.detail.manifestHash !== attestation.manifestHash)
    )
      throw new Error(`Custody journal broken at entry ${index}`);
    prev = hash(item.payload);
  });
  console.log(
    `Custody journal verified: ${custody.length} chained and signed entries, head ${prev}.`,
  );
}
// Annexes: signed statement bound to this manifest, and the file bytes.
if (existsSync(path.join(directory, 'annexes.json'))) {
  const annexes = JSON.parse(read('annexes.json'));
  const files = readdirSync(path.join(directory, 'annexes'));
  for (const item of annexes) {
    const annex = JSON.parse(item.payload);
    const file = files.find((name) => name.startsWith(`A${annex.seq}-`));
    if (
      annex.type !== 'preuvix-annex-v1' ||
      annex.proofId !== manifest.id ||
      annex.manifestHash !== attestation.manifestHash ||
      !signedBy(item) ||
      !file ||
      hash(read(path.join('annexes', file))) !== annex.sha256
    )
      throw new Error(`Invalid annex A${annex.seq}`);
    console.log(`Annex A${annex.seq} verified: ${annex.name} (${annex.sha256}).`);
  }
}
console.log('Original SHA-256 and Ed25519 manifest signature verified.');
console.log(
  process.argv[3]
    ? 'Signer matches the supplied trusted key.'
    : 'Signer identity NOT independently verified. Obtain its key through a trusted channel.',
);
console.log('This does not authenticate the scene, rule out AI, or verify an RFC 3161 timestamp.');
