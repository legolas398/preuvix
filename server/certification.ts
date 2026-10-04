import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  randomBytes,
  randomInt,
  randomUUID,
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Store } from './store';
import { hash } from './integrity';
import type { Manifest } from '../shared/types';
import {
  CHAIN_LABEL,
  captureCommitSchema,
  checkpointSchema,
  type Checkpoint,
  type ProgressiveCommitment,
  type Signed,
  type CaptureRecord,
  type CaptureSession,
  type Attestation,
  type ChallengeReview,
  type LivenessChallenge,
  type SignedReview,
} from '../shared/capture';

// Unambiguous characters: easy to handwrite and read back on a photo.
const CODE_ALPHABET = 'ACDEFHJKMNPRTUVWXY3479';
const GESTURES = [
  'Montrez 1 doigt levé',
  'Montrez 2 doigts levés',
  'Montrez 3 doigts levés',
  'Montrez 4 doigts levés',
  'Montrez la main ouverte',
  'Montrez le poing fermé',
  'Montrez le pouce levé',
];
export const CHALLENGE_MAX_SECONDS = 180;

export function newChallenge(): LivenessChallenge {
  const code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return {
    code: code.join(''),
    gesture: GESTURES[randomInt(GESTURES.length)],
    maxSeconds: CHALLENGE_MAX_SECONDS,
  };
}

const MAX_CHECKPOINTS = 400;
export const chainStart = (nonce: string) => hash(`${CHAIN_LABEL}:${nonce}`);
export const chainNext = (previous: string, chunk: Uint8Array) => hash(previous + hash(chunk));

/**
 * Recomputes the progressive chain from the deposited bytes: each checkpoint proves that the
 * first N chunks existed at its server time, so the video was produced while it was recorded.
 */
export function verifyProgressive(
  record: CaptureRecord,
  bytes: Uint8Array,
  durationSeconds = 0,
): ProgressiveCommitment {
  const checkpoints = record.checkpoints ?? [];
  const fail = (detail: string): ProgressiveCommitment => ({
    checkpoints: checkpoints.length,
    verified: false,
    spanSeconds: 0,
    detail,
  });
  if (!checkpoints.length) return fail('Aucun point d’engagement reçu pendant l’enregistrement.');
  const segments = record.segments ?? [];
  if (segments.reduce((a, b) => a + b, 0) !== bytes.length)
    return fail('Le découpage déclaré ne correspond pas à la taille du fichier déposé.');
  let chain = chainStart(record.nonce);
  let offset = 0;
  let next = 0;
  let previousAt = Date.parse(record.issuedAt);
  for (let index = 0; index < segments.length && next < checkpoints.length; index++) {
    chain = chainNext(chain, bytes.subarray(offset, offset + segments[index]));
    offset += segments[index];
    while (next < checkpoints.length && checkpoints[next].chunks === index + 1) {
      const point = checkpoints[next];
      const at = Date.parse(point.at);
      if (point.offset !== offset || point.chain !== chain)
        return fail(`Le point d’engagement n° ${next + 1} ne correspond pas au fichier déposé.`);
      if (at < previousAt || at > Date.parse(record.committedAt))
        return fail('Chronologie des points d’engagement incohérente.');
      previousAt = at;
      next++;
    }
  }
  if (next !== checkpoints.length)
    return fail('Des points d’engagement ne correspondent à aucun segment du fichier.');
  const span = Math.round(
    (Date.parse(checkpoints.at(-1)!.at) - Date.parse(checkpoints[0].at)) / 1000,
  );
  // The checkpoints must cover most of the recording: a prepared file pushed at once would not.
  const required = Math.max(0, Math.min(durationSeconds * 0.6, durationSeconds - 6));
  if (span < required)
    return {
      checkpoints: checkpoints.length,
      verified: false,
      spanSeconds: span,
      detail: `Engagements concentrés sur ${span} s pour une vidéo de ${Math.round(durationSeconds)} s : rythme d’enregistrement non démontré.`,
    };
  return {
    checkpoints: checkpoints.length,
    verified: true,
    spanSeconds: span,
    detail: `${checkpoints.length} engagements progressifs vérifiés sur ${span} s : chaque segment de la vidéo existait à l’heure serveur indiquée, pendant l’enregistrement.`,
  };
}

export function certification(store: Store, directory: string) {
  const keyPath = path.join(directory, 'attestation-ed25519.pem');
  let pem: string;
  try {
    pem = readFileSync(keyPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const generated = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    try {
      writeFileSync(keyPath, generated, { mode: 0o600, flag: 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    pem = readFileSync(keyPath, 'utf8');
  }
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Invalid attestation key.');
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  const keyId = hash(publicKey);
  // Public keys retired by scripts/rotate-key.mjs: older dossiers still verify against them.
  let retiredKeys: { keyId: string; publicKey: string; retiredAt: string }[] = [];
  try {
    retiredKeys = JSON.parse(readFileSync(path.join(directory, 'retired-keys.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  store.db.exec(
    'CREATE TABLE IF NOT EXISTS capture_sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, session TEXT NOT NULL, record TEXT);',
  );
  function issue(owner: string): CaptureSession {
    store.db
      .prepare("DELETE FROM capture_sessions WHERE json_extract(session,'$.expiresAt') < ?")
      .run(new Date(Date.now() - 24 * 3600000).toISOString());
    const active = store.db
      .prepare(
        "SELECT count(*) AS n FROM capture_sessions WHERE owner=? AND json_extract(session,'$.expiresAt') > ?",
      )
      .get(owner, new Date().toISOString()) as { n: number };
    if (active.n >= 20) throw new Error('Trop de sessions de capture. Réessayez dans dix minutes.');
    const session = {
      id: randomUUID(),
      nonce: randomBytes(16).toString('hex'),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
      challenge: newChallenge(),
    };
    store.db
      .prepare('INSERT INTO capture_sessions VALUES (?,?,?,NULL)')
      .run(session.id, owner, JSON.stringify(session));
    return session;
  }
  function get(id: string, owner: string) {
    const row = store.db
      .prepare('SELECT session,record FROM capture_sessions WHERE id=? AND owner=?')
      .get(id, owner) as { session: string; record: string | null } | undefined;
    if (!row) throw new Error('Session de capture inconnue ou appartenant à une autre connexion.');
    return row;
  }
  // Records a progressive checkpoint while a video is being recorded.
  function progress(id: string, owner: string, input: unknown): Checkpoint {
    const payload = checkpointSchema.parse(input);
    const row = get(id, owner);
    if (row.record) throw new Error('Capture déjà engagée.');
    const session: CaptureSession & { checkpoints?: Checkpoint[] } = JSON.parse(row.session);
    if (Date.now() > Date.parse(session.expiresAt))
      throw new Error('Session expirée. Recommencez la capture.');
    const checkpoints = session.checkpoints ?? [];
    const last = checkpoints.at(-1);
    if (checkpoints.length >= MAX_CHECKPOINTS) throw new Error('Trop de points d’engagement.');
    if (last && (payload.chunks <= last.chunks || payload.offset <= last.offset))
      throw new Error('Point d’engagement non croissant.');
    const point = { ...payload, at: new Date().toISOString() };
    store.db
      .prepare('UPDATE capture_sessions SET session=? WHERE id=? AND record IS NULL')
      .run(JSON.stringify({ ...session, checkpoints: [...checkpoints, point] }), id);
    return point;
  }
  function commit(id: string, owner: string, input: unknown): CaptureRecord {
    const payload = captureCommitSchema.parse(input);
    const row = get(id, owner);
    if (row.record) {
      const previous: CaptureRecord = JSON.parse(row.record);
      if (
        ['sha256', 'kind', 'startedAt', 'endedAt', 'device', 'segments'].some(
          (key) =>
            JSON.stringify(previous[key as keyof CaptureRecord]) !==
            JSON.stringify(payload[key as keyof typeof payload]),
        )
      )
        throw new Error('Cette session est déjà liée à un autre contenu.');
      return previous;
    }
    const session: CaptureSession & { checkpoints?: Checkpoint[] } = JSON.parse(row.session);
    if (Date.now() > Date.parse(session.expiresAt))
      throw new Error('Session expirée. Recommencez la capture.');
    if (payload.kind !== 'video' && (payload.segments || session.checkpoints?.length))
      throw new Error('Engagement progressif réservé aux vidéos.');
    const committedAt = new Date();
    const record: CaptureRecord = {
      ...session,
      ...payload,
      committedAt: committedAt.toISOString(),
      assurance: 'browser_declared_server_committed',
      elapsedSeconds: Math.round((committedAt.getTime() - Date.parse(session.issuedAt)) / 1000),
    };
    store.db
      .prepare('UPDATE capture_sessions SET record=? WHERE id=?')
      .run(JSON.stringify(record), id);
    return record;
  }
  function resolve(id: string, owner: string, sha256: string): CaptureRecord {
    const row = get(id, owner);
    if (!row.record) throw new Error('Empreinte de capture non enregistrée.');
    const record: CaptureRecord = JSON.parse(row.record);
    if (record.sha256 !== sha256)
      throw new Error('Le fichier ne correspond pas à la capture engagée.');
    if (Date.now() - Date.parse(record.committedAt) > 24 * 3600000)
      throw new Error('Le délai de dépôt de 24 heures est dépassé.');
    return record;
  }
  function attest(manifest: Manifest): Attestation {
    const bytes = Buffer.from(JSON.stringify(manifest));
    return {
      algorithm: 'Ed25519',
      manifestHash: hash(bytes),
      signature: sign(null, bytes, privateKey).toString('base64'),
      publicKey,
      keyId,
      scope: 'manifest_bytes',
    };
  }
  // Generic signed statement: the exact payload bytes are what the signature covers.
  function signStatement<T>(content: T): Signed<T> {
    const payload = JSON.stringify(content);
    return {
      payload,
      content,
      signature: sign(null, Buffer.from(payload), privateKey).toString('base64'),
      keyId,
      publicKey,
    };
  }
  function signBytes(bytes: Uint8Array) {
    return sign(null, bytes, privateKey);
  }
  // A review is signed separately: the deposit manifest stays immutable.
  function signReview(review: ChallengeReview): SignedReview {
    const payload = JSON.stringify(review);
    return {
      payload,
      review,
      signature: sign(null, Buffer.from(payload), privateKey).toString('base64'),
      keyId,
      publicKey,
    };
  }
  // Custody entries are signed as they are appended by the store.
  store.signer = signStatement;
  store.trustedKeys = new Set([keyId, ...retiredKeys.map((key) => key.keyId)]);
  return {
    issue,
    progress,
    commit,
    resolve,
    attest,
    signReview,
    signStatement,
    signBytes,
    publicKey,
    keyId,
    retiredKeys,
  };
}
