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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Store } from './store';
import { hash } from './integrity';
import type { Manifest } from '../shared/types';
import {
  captureCommitSchema,
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

export function certification(store: Store, directory: string) {
  store.db.exec('CREATE TABLE IF NOT EXISTS signing_key_history (key_id TEXT PRIMARY KEY)');
  const keyPath = path.join(directory, 'attestation-ed25519.pem');
  let pem: string;
  try {
    pem = readFileSync(keyPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const existing = store.db.prepare('SELECT count(*) AS n FROM attestations').get() as {
      n: number;
    };
    const history = store.db.prepare('SELECT count(*) AS n FROM signing_key_history').get() as {
      n: number;
    };
    if (existing.n > 0 || history.n > 0)
      throw new Error(
        'Clé Ed25519 manquante : restaurez la clé sauvegardée. Aucune régénération automatique.',
      );
    const generated = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    try {
      writeFileSync(keyPath, generated, { mode: 0o600, flag: 'wx' });
      if (process.platform === 'win32') {
        execFileSync('powershell.exe', ['-NoProfile', '-File', fileURLToPath(new URL('../scripts/protect-signing-key.ps1', import.meta.url)), '-KeyPath', keyPath], { windowsHide: true, stdio: 'pipe' });
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    pem = readFileSync(keyPath, 'utf8');
  }
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Invalid attestation key.');
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  const keyId = hash(publicKey);
  store.db.prepare('INSERT OR IGNORE INTO signing_key_history VALUES (?)').run(keyId);
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
  function commit(id: string, owner: string, input: unknown): CaptureRecord {
    const payload = captureCommitSchema.parse(input);
    const row = get(id, owner);
    if (row.record) {
      const previous: CaptureRecord = JSON.parse(row.record);
      if (
        ['sha256', 'kind', 'startedAt', 'endedAt'].some(
          (key) => previous[key as keyof CaptureRecord] !== payload[key as keyof typeof payload],
        )
      )
        throw new Error('Cette session est déjà liée à un autre contenu.');
      return previous;
    }
    const session: CaptureSession = JSON.parse(row.session);
    if (Date.now() > Date.parse(session.expiresAt))
      throw new Error('Session expirée. Recommencez la capture.');
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
  function attest(manifest: object): Attestation {
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
  return { issue, commit, resolve, attest, signReview, publicKey, keyId, retiredKeys };
}
