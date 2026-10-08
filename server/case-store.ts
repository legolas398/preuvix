import { randomUUID, verify } from 'node:crypto';
import type { Store } from './store';
import { hash } from './integrity';
import { canonicalJson } from '../shared/canonical';
import type { Attestation } from '../shared/capture';
import type { CaseFile, CaseInput, CaseManifest, CaseSummary } from '../shared/cases';

export class CaseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type VersionRow = {
  case_id: string;
  version: number;
  manifest: string;
  manifest_hash: string;
  attestation: string;
  created_at: string;
};

export function migrateCases(store: Store) {
  store.db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  if (store.db.prepare('SELECT name FROM schema_migrations WHERE name=?').get('cases-v1')) return;
  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db.exec(`
      CREATE TABLE cases (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE case_versions (case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, version INTEGER NOT NULL, manifest TEXT NOT NULL, manifest_hash TEXT NOT NULL, attestation TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(case_id,version));
      CREATE TABLE case_version_files (case_id TEXT NOT NULL, version INTEGER NOT NULL, proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE RESTRICT, FOREIGN KEY(case_id,version) REFERENCES case_versions(case_id,version) ON DELETE CASCADE, PRIMARY KEY(case_id,version,proof_id));
      CREATE TRIGGER immutable_case_version BEFORE UPDATE ON case_versions BEGIN SELECT RAISE(ABORT, 'Case versions are immutable'); END;
      CREATE TABLE case_operations (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, version INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('timestamp','anchor','signature')), state TEXT NOT NULL CHECK(state IN ('pending','confirmed','failed')), provider_key TEXT NOT NULL, provider_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, input TEXT NOT NULL, result TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, source_pdf BLOB, signed_pdf BLOB, tsq BLOB, tsr BLOB, FOREIGN KEY(case_id,version) REFERENCES case_versions(case_id,version) ON DELETE CASCADE, UNIQUE(case_id,version,kind));
      CREATE UNIQUE INDEX case_provider_request ON case_operations(kind,provider_key,provider_id) WHERE provider_id IS NOT NULL;
      CREATE TABLE case_callback_events (kind TEXT NOT NULL, provider_key TEXT NOT NULL, event_id TEXT NOT NULL, body_hash TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(kind,provider_key,event_id));
      CREATE TABLE case_events (id INTEGER PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, version INTEGER NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL);
      CREATE TRIGGER immutable_case_event BEFORE UPDATE ON case_events BEGIN SELECT RAISE(ABORT, 'Case events are append-only'); END;
      CREATE TABLE case_links (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, version INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, include_originals INTEGER NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY(case_id,version) REFERENCES case_versions(case_id,version) ON DELETE CASCADE);
    `);
    store.db
      .prepare('INSERT INTO schema_migrations VALUES (?,?)')
      .run('cases-v1', new Date().toISOString());
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}

export function caseStore(store: Store, attest: (manifest: object) => Attestation) {
  migrateCases(store);
  const event = (id: string, version: number, kind: string) =>
    store.db
      .prepare('INSERT INTO case_events(case_id,version,at,kind) VALUES (?,?,?,?)')
      .run(id, version, new Date().toISOString(), kind);
  function summary(id: string): CaseSummary {
    const row = store.db
      .prepare(
        'SELECT id,title,description,version,created_at AS createdAt,updated_at AS updatedAt FROM cases WHERE id=?',
      )
      .get(id) as CaseSummary | undefined;
    if (!row) throw new CaseError(404, 'Dossier introuvable.');
    return row;
  }
  function version(id: string, number?: number) {
    const current = summary(id);
    const row = store.db
      .prepare('SELECT * FROM case_versions WHERE case_id=? AND version=?')
      .get(id, number ?? current.version) as VersionRow | undefined;
    if (!row) throw new CaseError(404, 'Version introuvable.');
    const signed: Attestation = JSON.parse(row.attestation);
    if (
      hash(row.manifest) !== row.manifest_hash ||
      signed.manifestHash !== row.manifest_hash ||
      signed.keyId !== hash(signed.publicKey) ||
      signed.algorithm !== 'Ed25519' ||
      signed.scope !== 'manifest_bytes' ||
      !store.db
        .prepare('SELECT key_id FROM signing_key_history WHERE key_id=?')
        .get(signed.keyId) ||
      !verify(
        null,
        Buffer.from(row.manifest),
        signed.publicKey,
        Buffer.from(signed.signature, 'base64'),
      )
    )
      throw new CaseError(409, 'Échec du contrôle d’intégrité du manifeste.');
    return { row, manifest: JSON.parse(row.manifest) as CaseManifest, attestation: signed };
  }
  function checkFiles(manifest: CaseManifest) {
    return manifest.files.map((file) => {
      const row = store.get(file.proofId);
      if (!row) throw new CaseError(409, 'Un original référencé est manquant.');
      try {
        store.summary(row);
      } catch {
        throw new CaseError(409, 'Le manifeste ou la signature d’un fichier a été altéré.');
      }
      return {
        proofId: file.proofId,
        originalMatches: hash(row.original) === file.file.sha256,
        manifestMatches: hash(row.manifest) === file.manifestHash,
      };
    });
  }
  function requireIntact(manifest: CaseManifest) {
    const checks = checkFiles(manifest);
    if (checks.some((check) => !check.originalMatches || !check.manifestMatches))
      throw new CaseError(409, 'Un fichier ou son manifeste a été altéré.');
    return checks;
  }
  function persist(manifest: CaseManifest, kind: string) {
    requireIntact(manifest);
    const serialized = canonicalJson(manifest);
    const signed = attest(JSON.parse(serialized));
    store.db
      .prepare('INSERT INTO case_versions VALUES (?,?,?,?,?,?)')
      .run(
        manifest.id,
        manifest.version,
        serialized,
        hash(serialized),
        JSON.stringify(signed),
        manifest.createdAt,
      );
    for (const file of manifest.files)
      store.db
        .prepare('INSERT INTO case_version_files VALUES (?,?,?)')
        .run(manifest.id, manifest.version, file.proofId);
    store.db
      .prepare('UPDATE cases SET title=?,description=?,version=?,updated_at=? WHERE id=?')
      .run(manifest.title, manifest.description, manifest.version, manifest.createdAt, manifest.id);
    event(manifest.id, manifest.version, kind);
  }
  function transaction<T>(fn: () => T): T {
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      store.db.exec('COMMIT');
      return value;
    } catch (error) {
      store.db.exec('ROLLBACK');
      throw error;
    }
  }
  function create(input: CaseInput, requestKey: string) {
    const previous = store.db
      .prepare('SELECT id FROM cases WHERE request_key=?')
      .get(requestKey) as { id: string } | undefined;
    if (previous) {
      const initial = version(previous.id, 1).manifest;
      if (
        initial.title !== input.title ||
        initial.description !== input.description ||
        initial.declaredAddress !== input.declaredAddress
      )
        throw new CaseError(409, 'Cette demande correspond déjà à un autre dossier.');
      return previous.id;
    }
    const id = randomUUID(),
      now = new Date().toISOString();
    transaction(() => {
      store.db
        .prepare('INSERT INTO cases VALUES (?,?,?,?,?,?,?)')
        .run(id, requestKey, input.title, input.description, 1, now, now);
      persist(
        {
          ...input,
          schema: 'preuvix-case/1',
          serialization: 'PREUVIX-JSON-v1',
          id,
          version: 1,
          createdAt: now,
          previousManifestHash: null,
          files: [],
        },
        'dossier_created',
      );
    });
    return id;
  }
  function revise(
    id: string,
    expected: number,
    update: (current: CaseManifest) => CaseManifest,
    kind: string,
  ) {
    transaction(() => {
      const current = version(id);
      if (current.manifest.version !== expected)
        throw new CaseError(409, 'Le dossier a changé. Rechargez la version avant de réessayer.');
      const next = update(current.manifest);
      persist(
        {
          ...next,
          version: expected + 1,
          createdAt: new Date().toISOString(),
          previousManifestHash: current.row.manifest_hash,
        },
        kind,
      );
    });
  }
  function attach(id: string, expected: number, proofId: string, replaceFileId?: string) {
    revise(
      id,
      expected,
      (current) => {
        if (current.files.some((file) => file.proofId === proofId))
          throw new CaseError(409, 'Ce fichier fait déjà partie de cette version.');
        if (!replaceFileId && current.files.length >= 50)
          throw new CaseError(400, 'Maximum 50 fichiers par dossier.');
        const original = store.get(proofId);
        if (!original) throw new CaseError(404, 'Preuve introuvable dans cet espace.');
        const proof = store.summary(original);
        const previous = replaceFileId
          ? current.files.find((file) => file.fileId === replaceFileId)
          : undefined;
        if (replaceFileId && !previous)
          throw new CaseError(404, 'Fichier à remplacer introuvable.');
        const file: CaseFile = {
          fileId: previous?.fileId ?? randomUUID(),
          fileVersion: (previous?.fileVersion ?? 0) + 1,
          supersedes: previous?.proofId ?? null,
          proofId,
          title: proof.manifest.title,
          description: proof.manifest.description,
          receivedAt: proof.manifest.receivedAt,
          manifestHash: proof.manifestHash,
          file: proof.manifest.file,
          capture: proof.manifest.capture ?? null,
        };
        return {
          ...current,
          files: previous
            ? current.files.map((item) => (item.fileId === previous.fileId ? file : item))
            : [...current.files, file],
        };
      },
      replaceFileId ? 'file_version_added' : 'file_added',
    );
  }
  return {
    create,
    version,
    summary,
    checkFiles,
    requireIntact,
    revise,
    attach,
    event,
    transaction,
  };
}
