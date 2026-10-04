import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Manifest, Proof, RecipientLink, TimestampReceipt } from '../shared/types';
import { hash } from './integrity';
import type {
  AnnexStatement,
  Attestation,
  CustodyEntry,
  DocumentStatement,
  Signed,
  SignedReview,
} from '../shared/capture';
import type { AnnexSummary, CustodySummary, DocumentSummary } from '../shared/chain';
import { verify } from 'node:crypto';

const GENESIS = '0'.repeat(64);
type SignedRow = { payload: string; signature: string; key_id: string; public_key: string };
const toSigned = <T>(row: SignedRow): Signed<T> => ({
  payload: row.payload,
  content: JSON.parse(row.payload) as T,
  signature: row.signature,
  keyId: row.key_id,
  publicKey: row.public_key,
});

export type Row = {
  id: string;
  manifest: string;
  manifest_hash: string;
  status: Proof['status'];
  receipt: string | null;
  events: string;
  share_token: string | null;
  original: Uint8Array;
  tsq: Uint8Array | null;
  tsr: Uint8Array | null;
  request_key: string;
};

export class Store {
  db: DatabaseSync;
  // Set by certification(): signs custody entries; keys of this installation (current + retired).
  signer?: <T>(content: T) => Signed<T>;
  trustedKeys = new Set<string>();
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(directory, 'preuvix.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA foreign_keys = ON;
      PRAGMA secure_delete = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS proofs (
        id TEXT PRIMARY KEY, manifest TEXT NOT NULL, manifest_hash TEXT NOT NULL,
        original BLOB NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','timestamped')),
        receipt TEXT, tsq BLOB, tsr BLOB, events TEXT NOT NULL,
        share_token TEXT UNIQUE, request_key TEXT NOT NULL UNIQUE
      );
      CREATE TRIGGER IF NOT EXISTS immutable_original BEFORE UPDATE OF original,manifest,manifest_hash ON proofs
        BEGIN SELECT RAISE(ABORT, 'Original and manifest are immutable'); END;
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attestations (proof_id TEXT PRIMARY KEY REFERENCES proofs(id) ON DELETE CASCADE, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS watermarks (proof_id TEXT PRIMARY KEY REFERENCES proofs(id) ON DELETE CASCADE, code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recipient_links (
        id TEXT PRIMARY KEY, proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL, revoked_at TEXT, views INTEGER NOT NULL DEFAULT 0, last_view_at TEXT
      );
      CREATE TABLE IF NOT EXISTS reviews (proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE, payload TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS append_only_reviews BEFORE UPDATE ON reviews
        BEGIN SELECT RAISE(ABORT, 'Reviews are append-only'); END;
      CREATE TABLE IF NOT EXISTS custody (
        proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE, seq INTEGER NOT NULL,
        payload TEXT NOT NULL, signature TEXT NOT NULL, key_id TEXT NOT NULL, public_key TEXT NOT NULL,
        PRIMARY KEY (proof_id, seq)
      );
      CREATE TRIGGER IF NOT EXISTS append_only_custody BEFORE UPDATE ON custody
        BEGIN SELECT RAISE(ABORT, 'Custody is append-only'); END;
      CREATE TABLE IF NOT EXISTS annexes (
        id TEXT PRIMARY KEY, proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL, content BLOB NOT NULL, request_key TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL, signature TEXT NOT NULL, key_id TEXT NOT NULL, public_key TEXT NOT NULL,
        UNIQUE (proof_id, seq)
      );
      CREATE TRIGGER IF NOT EXISTS immutable_annexes BEFORE UPDATE ON annexes
        BEGIN SELECT RAISE(ABORT, 'Annexes are immutable'); END;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
        sha256 TEXT NOT NULL,
        payload TEXT NOT NULL, signature TEXT NOT NULL, key_id TEXT NOT NULL, public_key TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS documents_sha256 ON documents(sha256);
      CREATE TRIGGER IF NOT EXISTS immutable_documents BEFORE UPDATE ON documents
        BEGIN SELECT RAISE(ABORT, 'Documents are immutable'); END;
    `);
  }
  summary(row: Row): Proof {
    const signed = this.db
      .prepare('SELECT payload FROM attestations WHERE proof_id=?')
      .get(row.id) as { payload: string } | undefined;
    const attestation: Attestation | undefined = signed ? JSON.parse(signed.payload) : undefined;
    if (
      attestation &&
      (attestation.algorithm !== 'Ed25519' ||
        attestation.scope !== 'manifest_bytes' ||
        attestation.manifestHash !== hash(row.manifest) ||
        attestation.keyId !== hash(attestation.publicKey) ||
        !verify(
          null,
          Buffer.from(row.manifest),
          attestation.publicKey,
          Buffer.from(attestation.signature, 'base64'),
        ))
    )
      throw new Error('Attestation integrity mismatch');
    const reviews = (
      this.db
        .prepare('SELECT payload FROM reviews WHERE proof_id=? ORDER BY rowid')
        .all(row.id) as { payload: string }[]
    ).map(({ payload }) => {
      const signed: SignedReview = JSON.parse(payload);
      if (
        signed.keyId !== hash(signed.publicKey) ||
        JSON.stringify(signed.review) !== signed.payload ||
        signed.review.proofId !== row.id ||
        signed.review.manifestHash !== row.manifest_hash ||
        !verify(
          null,
          Buffer.from(signed.payload),
          signed.publicKey,
          Buffer.from(signed.signature, 'base64'),
        )
      )
        throw new Error('Review integrity mismatch');
      return signed;
    });
    return {
      id: row.id,
      annexes: this.annexes(row.id),
      documents: this.documents(row.id),
      custody: this.custody(row.id, row.manifest_hash),
      manifest: JSON.parse(row.manifest),
      manifestHash: row.manifest_hash,
      status: row.status,
      receipt: row.receipt ? JSON.parse(row.receipt) : null,
      events: JSON.parse(row.events),
      shareToken: row.share_token,
      attestation,
      reviews,
      watermarked: Boolean(this.watermarkCode(row.id)),
      recipientLinks: this.recipientLinks(row.id),
    };
  }
  watermarkCode(id: string) {
    return (
      this.db.prepare('SELECT code FROM watermarks WHERE proof_id=?').get(id) as
        { code: string } | undefined
    )?.code;
  }
  // Returns the existing code, or stores the candidate on first use.
  ensureWatermark(id: string, candidate: string) {
    this.db
      .prepare('INSERT OR IGNORE INTO watermarks VALUES (?,?,?)')
      .run(id, candidate, new Date().toISOString());
    return this.watermarkCode(id)!;
  }
  byWatermark(code: string) {
    const found = this.db.prepare('SELECT proof_id FROM watermarks WHERE code=?').get(code) as
      { proof_id: string } | undefined;
    return found ? this.get(found.proof_id) : undefined;
  }
  recipientLinks(id: string): RecipientLink[] {
    return (
      this.db
        .prepare(
          'SELECT id,label,created_at,expires_at,revoked_at,views,last_view_at FROM recipient_links WHERE proof_id=? ORDER BY created_at DESC',
        )
        .all(id) as {
        id: string;
        label: string;
        created_at: string;
        expires_at: string;
        revoked_at: string | null;
        views: number;
        last_view_at: string | null;
      }[]
    ).map((link) => ({
      id: link.id,
      label: link.label,
      createdAt: link.created_at,
      expiresAt: link.expires_at,
      revokedAt: link.revoked_at,
      views: link.views,
      lastViewAt: link.last_view_at,
    }));
  }
  addRecipientLink(
    proofId: string,
    link: { id: string; tokenHash: string; label: string; expiresAt: string },
  ) {
    this.db
      .prepare(
        'INSERT INTO recipient_links (id,proof_id,token_hash,label,created_at,expires_at) VALUES (?,?,?,?,?,?)',
      )
      .run(link.id, proofId, link.tokenHash, link.label, new Date().toISOString(), link.expiresAt);
    this.addEvent(proofId, 'recipient_link_created', {
      label: link.label,
      expiresAt: link.expiresAt,
    });
  }
  revokeRecipientLink(proofId: string, linkId: string) {
    const changed = this.db
      .prepare(
        'UPDATE recipient_links SET revoked_at=? WHERE id=? AND proof_id=? AND revoked_at IS NULL',
      )
      .run(new Date().toISOString(), linkId, proofId).changes;
    if (changed) this.addEvent(proofId, 'recipient_link_revoked');
    return changed > 0;
  }
  // Active (not revoked, not expired) link; records the visit.
  byRecipientToken(tokenHash: string, countView: boolean) {
    const link = this.db
      .prepare(
        'SELECT id,proof_id,label,expires_at FROM recipient_links WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',
      )
      .get(tokenHash, new Date().toISOString()) as
      { id: string; proof_id: string; label: string; expires_at: string } | undefined;
    if (!link) return undefined;
    if (countView) {
      this.db
        .prepare('UPDATE recipient_links SET views=views+1, last_view_at=? WHERE id=?')
        .run(new Date().toISOString(), link.id);
      this.addEvent(link.proof_id, 'recipient_viewed', { label: link.label });
    }
    const row = this.get(link.proof_id);
    return row ? { link, row } : undefined;
  }
  addEvent(id: string, kind: string, detail: CustodyEntry['detail'] = {}) {
    const row = this.get(id);
    if (!row) return;
    const at = new Date().toISOString();
    const events = [...JSON.parse(row.events), { at, kind }];
    this.db.exec('SAVEPOINT event');
    try {
      this.db.prepare('UPDATE proofs SET events=? WHERE id=?').run(JSON.stringify(events), id);
      this.appendCustody(id, kind, detail, at);
      this.db.exec('RELEASE event');
    } catch (error) {
      this.db.exec('ROLLBACK TO event');
      this.db.exec('RELEASE event');
      throw error;
    }
  }
  /** Appends a signed entry linked to the previous one. Call inside the caller's transaction. */
  appendCustody(
    proofId: string,
    kind: string,
    detail: CustodyEntry['detail'],
    at = new Date().toISOString(),
  ): CustodyEntry | undefined {
    if (!this.signer) return;
    const last = this.db
      .prepare('SELECT seq,payload FROM custody WHERE proof_id=? ORDER BY seq DESC LIMIT 1')
      .get(proofId) as { seq: number; payload: string } | undefined;
    if (
      !last &&
      kind !== 'custody_opened' &&
      !['capture_session_issued', 'original_received'].includes(kind)
    ) {
      // Dossier created before the signed journal: open it explicitly, without backdating.
      const row = this.get(proofId);
      this.appendCustody(proofId, 'custody_opened', {
        legacy: true,
        manifestHash: row?.manifest_hash ?? '',
      });
      return this.appendCustody(proofId, kind, detail, at);
    }
    const entry: CustodyEntry = {
      type: 'preuvix-custody-v1',
      proofId,
      seq: last ? last.seq + 1 : 0,
      at,
      kind,
      detail,
      prev: last ? hash(last.payload) : GENESIS,
    };
    const signed = this.signer(entry);
    this.db
      .prepare('INSERT INTO custody VALUES (?,?,?,?,?,?)')
      .run(proofId, entry.seq, signed.payload, signed.signature, signed.keyId, signed.publicKey);
    return entry;
  }
  validSignature(signed: { payload: string; signature: string; keyId: string; publicKey: string }) {
    try {
      return (
        this.trustedKeys.has(signed.keyId) &&
        signed.keyId === hash(signed.publicKey) &&
        verify(
          null,
          Buffer.from(signed.payload),
          signed.publicKey,
          Buffer.from(signed.signature, 'base64'),
        )
      );
    } catch {
      return false;
    }
  }
  signedCustody(proofId: string) {
    return (
      this.db
        .prepare(
          'SELECT payload,signature,key_id,public_key FROM custody WHERE proof_id=? ORDER BY seq',
        )
        .all(proofId) as SignedRow[]
    ).map((row) => toSigned<CustodyEntry>(row));
  }
  /** Walks the whole journal: sequence, links, signatures and installation keys. */
  custody(proofId: string, manifestHash: string): CustodySummary {
    const signed = this.signedCustody(proofId);
    let problem: string | null = null;
    let prev = GENESIS;
    signed.forEach((item, index) => {
      if (problem) return;
      const entry = item.content;
      if (entry.type !== 'preuvix-custody-v1' || entry.proofId !== proofId || entry.seq !== index)
        problem = `Entrée n° ${index + 1} hors séquence.`;
      else if (entry.prev !== prev) problem = `Lien rompu avant l’entrée n° ${index + 1}.`;
      else if (!this.validSignature(item))
        problem = `Signature invalide ou clé inconnue à l’entrée n° ${index + 1}.`;
      else if (entry.kind === 'manifest_signed' && entry.detail.manifestHash !== manifestHash)
        problem = 'Le journal ne correspond pas au manifeste conservé.';
      prev = hash(item.payload);
    });
    return {
      length: signed.length,
      head: signed.length ? prev : GENESIS,
      intact: !problem,
      problem,
      entries: signed.map((item) => item.content),
    };
  }
  annexes(proofId: string): AnnexSummary[] {
    return (
      this.db
        .prepare(
          'SELECT content,payload,signature,key_id,public_key FROM annexes WHERE proof_id=? ORDER BY seq',
        )
        .all(proofId) as (SignedRow & { content: Uint8Array })[]
    ).map((row) => {
      const signed = toSigned<AnnexStatement>(row);
      return {
        ...signed.content,
        signatureValid: this.validSignature(signed) && signed.content.proofId === proofId,
        contentMatches: hash(row.content) === signed.content.sha256,
      };
    });
  }
  signedAnnexes(proofId: string) {
    return (
      this.db
        .prepare(
          'SELECT id,content,payload,signature,key_id,public_key FROM annexes WHERE proof_id=? ORDER BY seq',
        )
        .all(proofId) as (SignedRow & { id: string; content: Uint8Array })[]
    ).map((row) => ({ signed: toSigned<AnnexStatement>(row), content: row.content }));
  }
  annex(proofId: string, annexId: string) {
    const row = this.db
      .prepare(
        'SELECT content,payload,signature,key_id,public_key FROM annexes WHERE proof_id=? AND id=?',
      )
      .get(proofId, annexId) as (SignedRow & { content: Uint8Array }) | undefined;
    return row ? { signed: toSigned<AnnexStatement>(row), content: row.content } : undefined;
  }
  annexByKey(key: string) {
    return this.db.prepare('SELECT id,proof_id FROM annexes WHERE request_key=?').get(key) as
      { id: string; proof_id: string } | undefined;
  }
  addAnnex(statement: Signed<AnnexStatement>, content: Buffer, requestKey: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT INTO annexes VALUES (?,?,?,?,?,?,?,?,?)')
        .run(
          statement.content.annexId,
          statement.content.proofId,
          statement.content.seq,
          content,
          requestKey,
          statement.payload,
          statement.signature,
          statement.keyId,
          statement.publicKey,
        );
      this.addEvent(statement.content.proofId, 'annex_added', {
        annexId: statement.content.annexId,
        name: statement.content.name,
        sha256: statement.content.sha256,
        size: statement.content.size,
        statement: hash(statement.payload),
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  documents(proofId: string): DocumentSummary[] {
    return (
      this.db
        .prepare(
          'SELECT payload,signature,key_id,public_key FROM documents WHERE proof_id=? ORDER BY rowid DESC',
        )
        .all(proofId) as SignedRow[]
    ).map((row) => {
      const signed = toSigned<DocumentStatement>(row);
      return { ...signed.content, signatureValid: this.validSignature(signed) };
    });
  }
  documentByHash(sha256: string) {
    const row = this.db
      .prepare('SELECT payload,signature,key_id,public_key FROM documents WHERE sha256=?')
      .get(sha256) as SignedRow | undefined;
    return row ? toSigned<DocumentStatement>(row) : undefined;
  }
  addDocument(statement: Signed<DocumentStatement>) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT INTO documents VALUES (?,?,?,?,?,?,?)')
        .run(
          statement.content.documentId,
          statement.content.proofId,
          statement.content.sha256,
          statement.payload,
          statement.signature,
          statement.keyId,
          statement.publicKey,
        );
      this.addEvent(statement.content.proofId, 'document_issued', {
        documentId: statement.content.documentId,
        kind: statement.content.kind,
        sha256: statement.content.sha256,
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  list(): Proof[] {
    return (
      this.db
        .prepare(
          'SELECT id,manifest,manifest_hash,status,receipt,events,share_token FROM proofs ORDER BY rowid DESC',
        )
        .all() as unknown as Row[]
    ).map((row) => this.summary(row));
  }
  get(id: string): Row | undefined {
    return this.db.prepare('SELECT * FROM proofs WHERE id = ?').get(id) as Row | undefined;
  }
  byKey(key: string) {
    return this.db.prepare('SELECT * FROM proofs WHERE request_key = ?').get(key) as
      Row | undefined;
  }
  byShare(token: string) {
    return this.db.prepare('SELECT * FROM proofs WHERE share_token = ?').get(token) as
      Row | undefined;
  }
  usedBytes() {
    return Number(
      (
        this.db
          .prepare(
            'SELECT (SELECT coalesce(sum(length(original)),0) FROM proofs) + (SELECT coalesce(sum(length(content)),0) FROM annexes) AS total',
          )
          .get() as { total: number }
      ).total,
    );
  }
  insert(manifest: Manifest, original: Buffer, key: string, attestation?: Attestation) {
    const serialized = JSON.stringify(manifest);
    const events = [
      { at: manifest.receivedAt, kind: 'original_received' },
      { at: new Date().toISOString(), kind: 'manifest_frozen' },
    ];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'INSERT INTO proofs (id,manifest,manifest_hash,original,status,events,request_key) VALUES (?,?,?,?,?,?,?)',
        )
        .run(
          manifest.id,
          serialized,
          hash(serialized),
          original,
          'pending',
          JSON.stringify(events),
          key,
        );
      if (attestation)
        this.db
          .prepare('INSERT INTO attestations VALUES (?,?)')
          .run(manifest.id, JSON.stringify(attestation));
      const capture = manifest.capture;
      if (capture) {
        this.appendCustody(
          manifest.id,
          'capture_session_issued',
          {
            session: capture.id,
            ...(capture.challenge ? { challenge: capture.challenge.code } : {}),
          },
          capture.issuedAt,
        );
        this.appendCustody(
          manifest.id,
          'capture_committed',
          {
            sha256: capture.sha256,
            kind: capture.kind,
            elapsedSeconds: capture.elapsedSeconds ?? -1,
            checkpoints: capture.checkpoints?.length ?? 0,
            ...(capture.device?.label ? { device: capture.device.label } : {}),
          },
          capture.committedAt,
        );
      }
      this.appendCustody(
        manifest.id,
        'original_received',
        { sha256: manifest.file.sha256, size: manifest.file.size, mime: manifest.file.mime },
        manifest.receivedAt,
      );
      this.appendCustody(manifest.id, 'manifest_signed', {
        manifestHash: hash(serialized),
        keyId: attestation?.keyId ?? '',
        policy: manifest.certification?.policy ?? '',
        status: manifest.certification?.status ?? '',
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  timestamp(id: string, receipt: TimestampReceipt, query: Buffer, response: Buffer) {
    const row = this.get(id);
    if (!row) return;
    const events = [
      ...JSON.parse(row.events),
      { at: new Date().toISOString(), kind: 'timestamp_verified' },
    ];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare("UPDATE proofs SET status='timestamped',receipt=?,tsq=?,tsr=?,events=? WHERE id=?")
        .run(JSON.stringify(receipt), query, response, JSON.stringify(events), id);
      this.appendCustody(id, 'timestamp_verified', {
        provider: receipt.provider,
        time: receipt.time,
        response: receipt.responseSha256,
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  addReview(id: string, review: SignedReview) {
    const row = this.get(id);
    if (!row) return;
    const events = [
      ...JSON.parse(row.events),
      { at: review.review.reviewedAt, kind: 'challenge_reviewed' },
    ];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO reviews VALUES (?,?)').run(id, JSON.stringify(review));
      this.db.prepare('UPDATE proofs SET events=? WHERE id=?').run(JSON.stringify(events), id);
      this.appendCustody(
        id,
        'challenge_reviewed',
        {
          outcome: review.review.outcome,
          reviewer: review.review.reviewer,
          review: hash(review.payload),
        },
        review.review.reviewedAt,
      );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  share(id: string, token: string | null) {
    const before = this.get(id)?.share_token ?? null;
    this.db.prepare('UPDATE proofs SET share_token=? WHERE id=?').run(token, id);
    if (Boolean(before) !== Boolean(token))
      this.addEvent(id, token ? 'share_enabled' : 'share_disabled');
  }
  delete(id: string) {
    const row = this.get(id);
    const captureId = row ? (JSON.parse(row.manifest) as Manifest).capture?.id : undefined;
    this.db.prepare('DELETE FROM proofs WHERE id=?').run(id);
    if (captureId) this.db.prepare('DELETE FROM capture_sessions WHERE id=?').run(captureId);
  }
  close() {
    this.db.close();
  }
}
