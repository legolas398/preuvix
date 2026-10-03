import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Manifest, Proof, RecipientLink, TimestampReceipt } from '../shared/types';
import { hash } from './integrity';
import type { Attestation, SignedReview } from '../shared/capture';
import { verify } from 'node:crypto';

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
    this.addEvent(proofId, 'recipient_link_created');
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
      this.addEvent(link.proof_id, 'recipient_viewed');
    }
    const row = this.get(link.proof_id);
    return row ? { link, row } : undefined;
  }
  addEvent(id: string, kind: string) {
    const row = this.get(id);
    if (!row) return;
    const events = [...JSON.parse(row.events), { at: new Date().toISOString(), kind }];
    this.db.prepare('UPDATE proofs SET events=? WHERE id=?').run(JSON.stringify(events), id);
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
        this.db.prepare('SELECT coalesce(sum(length(original)),0) AS total FROM proofs').get() as {
          total: number;
        }
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
    this.db
      .prepare("UPDATE proofs SET status='timestamped',receipt=?,tsq=?,tsr=?,events=? WHERE id=?")
      .run(JSON.stringify(receipt), query, response, JSON.stringify(events), id);
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
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  share(id: string, token: string | null) {
    this.db.prepare('UPDATE proofs SET share_token=? WHERE id=?').run(token, id);
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
