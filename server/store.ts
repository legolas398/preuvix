import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Manifest, Proof, TimestampReceipt } from '../shared/types';
import { hash } from './integrity';
import type { Attestation } from '../shared/capture';
import { verify } from 'node:crypto';

type Row = {
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
    return {
      id: row.id,
      manifest: JSON.parse(row.manifest),
      manifestHash: row.manifest_hash,
      status: row.status,
      receipt: row.receipt ? JSON.parse(row.receipt) : null,
      events: JSON.parse(row.events),
      shareToken: row.share_token,
      attestation,
    };
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
