import express, { type Express, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import type { Config } from './config';
import type { Store } from './store';
import type { TimestampService } from './timestamp';
import type { Attestation } from '../shared/capture';
import {
  caseInput,
  type CaseDetail,
  type CaseOperation,
  type CaseSummary,
  type ServiceKind,
  type ServiceResult,
} from '../shared/cases';
import { caseStore, CaseError } from './case-store';
import { caseArchive, caseReport } from './case-export';
import {
  evidenceClient,
  validCallback,
  type RemoteKind,
  providerStatus,
} from './evidence-services';
import { hash } from './integrity';

type Op = {
  id: string;
  case_id: string;
  version: number;
  kind: ServiceKind;
  state: 'pending' | 'confirmed' | 'failed';
  provider_key: string;
  provider_id: string | null;
  input: string;
  result: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  source_pdf: Uint8Array | null;
  signed_pdf: Uint8Array | null;
};
const kindSchema = z.enum(['timestamp', 'anchor', 'signature']);
const versionNumber = z.coerce.number().int().positive();

export function createCases(
  config: Config,
  store: Store,
  attest: (manifest: object) => Attestation,
  timestamp: TimestampService,
  transport: typeof fetch = fetch,
) {
  const cases = caseStore(store, attest),
    client = evidenceClient(config.evidenceServices, transport);
  const active = new Set<string>();
  const operation = (id: string) => {
    const op = store.db.prepare('SELECT * FROM case_operations WHERE id=?').get(id) as
      Op | undefined;
    if (!op) throw new CaseError(404, 'Demande introuvable.');
    return op;
  };
  const publicOp = (op: Op): CaseOperation => ({
    id: op.id,
    kind: op.kind,
    state: op.state,
    attempts: op.attempts,
    createdAt: op.created_at,
    updatedAt: op.updated_at,
    error: op.error,
    result: op.result ? JSON.parse(op.result) : null,
  });
  function detail(id: string, version?: number): CaseDetail {
    const current = cases.version(id, version);
    return {
      manifest: current.manifest,
      manifestHash: current.row.manifest_hash,
      attestation: current.attestation,
      latestVersion: cases.summary(id).version,
      versions: store.db
        .prepare(
          'SELECT version,created_at AS createdAt,manifest_hash AS manifestHash FROM case_versions WHERE case_id=? ORDER BY version DESC',
        )
        .all(id) as CaseDetail['versions'],
      operations: (
        store.db
          .prepare(
            'SELECT * FROM case_operations WHERE case_id=? AND version=? ORDER BY created_at',
          )
          .all(id, current.manifest.version) as Op[]
      ).map(publicOp),
      events: store.db
        .prepare(
          'SELECT at,kind,version FROM case_events WHERE case_id=? ORDER BY id DESC LIMIT 200',
        )
        .all(id) as CaseDetail['events'],
      services: {
        timestamp: {
          configured: config.timestampConfigured,
          provider: config.timestampConfigured ? config.timestamp.name : null,
        },
        anchor: {
          configured: config.evidenceServices.anchor.configured,
          provider: config.evidenceServices.anchor.configured
            ? config.evidenceServices.anchor.name
            : null,
        },
        signature: {
          configured: config.evidenceServices.signature.configured,
          provider: config.evidenceServices.signature.configured
            ? config.evidenceServices.signature.name
            : null,
        },
      },
    };
  }
  function configured(kind: ServiceKind) {
    return kind === 'timestamp'
      ? config.timestampConfigured
      : config.evidenceServices[kind].configured;
  }
  function providerKey(kind: ServiceKind) {
    return kind === 'timestamp'
      ? hash(config.timestamp.url + '\n' + config.timestamp.signerSha256)
      : config.evidenceServices[kind].key;
  }
  async function applyRemote(op: Op, value: z.infer<typeof providerStatus>) {
    const dossier = cases.version(op.case_id, op.version);
    cases.requireIntact(dossier.manifest);
    if (
      value.digest !== dossier.row.manifest_hash ||
      (op.provider_id && op.provider_id !== value.requestId)
    )
      throw new Error('Service response does not match request');
    // Persist the remote ID before retrieving a document; retries can poll the same request.
    store.db
      .prepare('UPDATE case_operations SET provider_id=? WHERE id=?')
      .run(value.requestId, op.id);
    if (value.state === 'failed') throw new Error('Provider reported failure');
    const kind = op.kind as RemoteKind;
    const result: ServiceResult = {
      provider: config.evidenceServices[kind].name,
      providerRequestId: value.requestId,
      manifestHash: value.digest,
    };
    let state: Op['state'] = value.state;
    let signed: Buffer | null = null;
    if (kind === 'anchor') {
      if (value.network !== config.evidenceServices.anchor.network)
        throw new Error('Unexpected network');
      result.network = value.network;
      result.confirmations = value.confirmations ?? 0;
      if (value.transactionId) result.transactionId = value.transactionId;
      if (state === 'confirmed' && (!value.transactionId || !value.confirmedAt))
        throw new Error('Missing confirmation evidence');
      if (
        state === 'confirmed' &&
        result.confirmations < config.evidenceServices.anchor.minConfirmations
      )
        state = 'pending';
    } else {
      if (!op.source_pdf || value.sourceDocumentSha256 !== hash(op.source_pdf))
        throw new Error('Signed source document mismatch');
      result.sourceDocumentSha256 = value.sourceDocumentSha256;
      result.reportedLevel = value.reportedLevel ?? 'unspecified';
      result.qualificationVerified = false;
      if (value.evidenceReference) result.evidenceReference = value.evidenceReference;
      if (state === 'confirmed') {
        if (!value.signedDocumentSha256 || !value.evidenceReference || !value.confirmedAt)
          throw new Error('Missing signature evidence');
        signed = await client.document(value.requestId);
        if (
          hash(signed) !== value.signedDocumentSha256 ||
          !signed.subarray(0, 5).equals(Buffer.from('%PDF-'))
        )
          throw new Error('Signed document digest mismatch');
        const pdf = await PDFDocument.load(signed, { ignoreEncryption: false });
        if (!pdf.getPageCount() || pdf.getPageCount() > 500) throw new Error('Invalid signed PDF');
        result.signedDocumentSha256 = value.signedDocumentSha256;
      }
    }
    if (state === 'confirmed') result.confirmedAt = value.confirmedAt;
    store.db
      .prepare(
        'UPDATE case_operations SET state=?,result=?,signed_pdf=COALESCE(?,signed_pdf),error=NULL,updated_at=? WHERE id=?',
      )
      .run(state, JSON.stringify(result), signed, new Date().toISOString(), op.id);
    cases.event(op.case_id, op.version, `${kind}_${state}`);
  }
  async function run(id: string) {
    let op = operation(id);
    if (op.state === 'confirmed') return;
    if (!configured(op.kind)) throw new CaseError(409, 'Service non configuré.');
    if (op.provider_key !== providerKey(op.kind))
      throw new CaseError(
        409,
        'Le prestataire a changé. Rétablissez sa configuration pour suivre cette demande.',
      );
    if (active.has(id)) throw new CaseError(409, 'Cette demande est déjà en cours.');
    active.add(id);
    try {
      const dossier = cases.version(op.case_id, op.version);
      cases.requireIntact(dossier.manifest);
      store.db
        .prepare(
          "UPDATE case_operations SET state='pending',attempts=attempts+1,error=NULL,updated_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), id);
      cases.event(op.case_id, op.version, `${op.kind}_requested`);
      if (op.kind === 'timestamp') {
        const stamped = await timestamp(dossier.row.manifest_hash);
        if (hash(stamped.response) !== stamped.receipt.responseSha256)
          throw new Error('Timestamp receipt mismatch');
        store.db
          .prepare(
            "UPDATE case_operations SET state='confirmed',result=?,tsq=?,tsr=?,updated_at=? WHERE id=?",
          )
          .run(
            JSON.stringify({
              timestamp: stamped.receipt,
              provider: stamped.receipt.provider,
              manifestHash: dossier.row.manifest_hash,
              confirmedAt: stamped.receipt.verifiedAt,
            }),
            stamped.query,
            stamped.response,
            new Date().toISOString(),
            id,
          );
        cases.event(op.case_id, op.version, 'timestamp_confirmed');
      } else {
        if (op.kind === 'signature' && !op.source_pdf) {
          // Store one exact PDF before the first provider call. Its bytes never change on retry.
          const source = await caseReport(detail(op.case_id, op.version));
          store.db
            .prepare('UPDATE case_operations SET source_pdf=? WHERE id=? AND source_pdf IS NULL')
            .run(source, id);
          op = operation(id);
        }
        const remoteKind = op.kind as RemoteKind;
        const status = op.provider_id
          ? await client.status(remoteKind, op.provider_id)
          : await client.create(
              remoteKind,
              id,
              dossier.row.manifest_hash,
              remoteKind === 'signature'
                ? { pdf: Buffer.from(op.source_pdf!), email: JSON.parse(op.input).signerEmail }
                : undefined,
            );
        await applyRemote(op, status);
      }
    } catch (error) {
      const message =
        error instanceof CaseError
          ? error.message
          : 'Le service n’a pas pu confirmer la demande. Réessayez ; la même référence sera réutilisée.';
      store.db
        .prepare(
          "UPDATE case_operations SET state='failed',error=?,updated_at=? WHERE id=? AND state!='confirmed'",
        )
        .run(message, new Date().toISOString(), id);
      cases.event(op.case_id, op.version, `${op.kind}_failed`);
      throw new CaseError(error instanceof CaseError ? error.status : 502, message);
    } finally {
      active.delete(id);
    }
  }
  const safe =
    (handler: (req: express.Request, res: express.Response) => unknown): RequestHandler =>
    async (req, res, next) => {
      try {
        await handler(req, res);
      } catch (error) {
        if (error instanceof CaseError)
          return void res.status(error.status).json({ error: error.message });
        if (error instanceof z.ZodError)
          return void res
            .status(400)
            .json({ error: 'Données invalides. Vérifiez les champs et la version.' });
        if (error instanceof SyntaxError)
          return void res.status(400).json({ error: 'Document JSON invalide.' });
        next(error);
      }
    };
  function webhooks(app: Express) {
    app.post(
      '/api/evidence/callback/:kind',
      rateLimit({ windowMs: 60000, limit: 60 }),
      express.raw({ type: 'application/json', limit: '64kb' }),
      safe(async (req, res) => {
        const kind = z.enum(['anchor', 'signature']).parse(req.params.kind),
          provider = config.evidenceServices[kind];
        if (!provider.configured) throw new CaseError(503, 'Service non configuré.');
        if (
          !Buffer.isBuffer(req.body) ||
          !validCallback(
            req.body,
            req.get('X-Preuvix-Timestamp') || '',
            req.get('X-Preuvix-Signature') || '',
            provider.webhookSecret,
          )
        )
          throw new CaseError(401, 'Callback non authentifié.');
        const body = z
          .object({
            eventId: z.string().min(1).max(120),
            requestId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
          })
          .strict()
          .parse(JSON.parse(req.body.toString('utf8')));
        const bodyHash = hash(req.body);
        const previous = store.db
          .prepare(
            'SELECT body_hash FROM case_callback_events WHERE kind=? AND provider_key=? AND event_id=?',
          )
          .get(kind, provider.key, body.eventId) as { body_hash: string } | undefined;
        if (previous) {
          if (previous.body_hash !== bodyHash)
            throw new CaseError(409, 'Identifiant de callback réutilisé avec un autre contenu.');
          return void res.json({ received: true, duplicate: true });
        }
        const row = store.db
          .prepare(
            'SELECT id FROM case_operations WHERE kind=? AND provider_key=? AND provider_id=?',
          )
          .get(kind, provider.key, body.requestId) as { id: string } | undefined;
        if (!row) throw new CaseError(404, 'Demande inconnue. Réessayez après son enregistrement.');
        // Never trust callback completion flags: retrieve the bound result over authenticated HTTPS.
        await run(row.id);
        store.db
          .prepare('INSERT OR IGNORE INTO case_callback_events VALUES (?,?,?,?,?)')
          .run(kind, provider.key, body.eventId, bodyHash, new Date().toISOString());
        res.json({ received: true });
      }),
    );
  }
  function routes(app: Express, requireAuth: RequestHandler) {
    app.get(
      '/api/cases',
      requireAuth,
      safe((_req, res) =>
        res.json({
          cases: store.db
            .prepare(
              'SELECT id,title,description,version,created_at AS createdAt,updated_at AS updatedAt FROM cases ORDER BY updated_at DESC',
            )
            .all() as CaseSummary[],
        }),
      ),
    );
    app.post(
      '/api/cases',
      requireAuth,
      safe((req, res) => {
        const input = z
          .object({ requestKey: z.uuid(), dossier: caseInput })
          .strict()
          .parse(req.body);
        res.status(201).json(detail(cases.create(input.dossier, input.requestKey)));
      }),
    );
    app.get(
      '/api/cases/:id',
      requireAuth,
      safe((req, res) =>
        res.json(
          detail(
            z.uuid().parse(req.params.id),
            req.query.version === undefined ? undefined : versionNumber.parse(req.query.version),
          ),
        ),
      ),
    );
    app.put(
      '/api/cases/:id',
      requireAuth,
      safe((req, res) => {
        const input = z
          .object({ expectedVersion: versionNumber, dossier: caseInput })
          .strict()
          .parse(req.body);
        const id = z.uuid().parse(req.params.id);
        cases.revise(
          id,
          input.expectedVersion,
          (current) => ({ ...current, ...input.dossier }),
          'metadata_version_added',
        );
        res.json(detail(id));
      }),
    );
    app.post(
      '/api/cases/:id/files',
      requireAuth,
      safe((req, res) => {
        const input = z
          .object({
            expectedVersion: versionNumber,
            proofId: z.uuid(),
            replaceFileId: z.uuid().optional(),
          })
          .strict()
          .parse(req.body);
        const id = z.uuid().parse(req.params.id);
        cases.attach(id, input.expectedVersion, input.proofId, input.replaceFileId);
        res.status(201).json(detail(id));
      }),
    );
    app.post(
      '/api/cases/:id/verify',
      requireAuth,
      safe((req, res) => {
        const id = z.uuid().parse(req.params.id),
          version = versionNumber.parse(req.body.version);
        const current = cases.version(id, version),
          files = cases.checkFiles(current.manifest);
        cases.event(
          id,
          version,
          files.every((file) => file.originalMatches && file.manifestMatches)
            ? 'integrity_verified'
            : 'integrity_failed',
        );
        res.json({ manifestMatches: true, checkedAt: new Date().toISOString(), files });
      }),
    );
    app.post(
      '/api/cases/:id/services/:kind',
      requireAuth,
      safe(async (req, res) => {
        const input = z
          .object({
            version: versionNumber,
            consent: z.literal(true),
            signerEmail: z.email().max(254).optional(),
          })
          .strict()
          .parse(req.body);
        const id = z.uuid().parse(req.params.id),
          kind = kindSchema.parse(req.params.kind),
          dossier = cases.version(id, input.version);
        cases.requireIntact(dossier.manifest);
        if (!dossier.manifest.files.length)
          throw new CaseError(400, 'Ajoutez un fichier avant de demander un service.');
        if (!configured(kind)) throw new CaseError(409, 'Service non configuré.');
        if (kind === 'signature' && !input.signerEmail)
          throw new CaseError(400, 'Renseignez l’adresse e-mail du signataire.');
        let op = store.db
          .prepare('SELECT id,input FROM case_operations WHERE case_id=? AND version=? AND kind=?')
          .get(id, input.version, kind) as { id: string; input: string } | undefined;
        if (op && kind === 'signature' && JSON.parse(op.input).signerEmail !== input.signerEmail)
          throw new CaseError(
            409,
            'Cette version a déjà une demande pour un autre signataire. Créez une nouvelle version pour changer de destinataire.',
          );
        if (!op) {
          const operationId = randomUUID(),
            now = new Date().toISOString();
          store.db
            .prepare(
              "INSERT INTO case_operations(id,case_id,version,kind,state,provider_key,input,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?,?,?)",
            )
            .run(
              operationId,
              id,
              input.version,
              kind,
              providerKey(kind),
              JSON.stringify(kind === 'signature' ? { signerEmail: input.signerEmail } : {}),
              now,
              now,
            );
          op = { id: operationId, input: '{}' };
        }
        await run(op.id);
        res.json(detail(id, input.version));
      }),
    );
    app.post(
      '/api/cases/:id/operations/:operationId/retry',
      requireAuth,
      safe(async (req, res) => {
        const id = z.uuid().parse(req.params.id),
          op = operation(z.uuid().parse(req.params.operationId));
        if (op.case_id !== id) throw new CaseError(404, 'Demande introuvable dans ce dossier.');
        await run(op.id);
        res.json(detail(id, op.version));
      }),
    );
    app.get(
      '/api/cases/:id/operations/:operationId/document',
      requireAuth,
      safe((req, res) => {
        const op = operation(z.uuid().parse(req.params.operationId));
        if (
          op.case_id !== req.params.id ||
          op.kind !== 'signature' ||
          op.state !== 'confirmed' ||
          !op.signed_pdf
        )
          throw new CaseError(404, 'Document signé indisponible.');
        const result: ServiceResult = JSON.parse(op.result!);
        if (hash(op.signed_pdf) !== result.signedDocumentSha256)
          throw new CaseError(409, 'Document retourné altéré.');
        res.setHeader('Content-Disposition', `attachment; filename="signature-${op.id}.pdf"`);
        res.type('application/pdf').send(Buffer.from(op.signed_pdf));
      }),
    );
    app.get(
      '/api/cases/:id/export',
      requireAuth,
      safe(async (req, res) => {
        const current = detail(
          z.uuid().parse(req.params.id),
          versionNumber.parse(req.query.version),
        );
        cases.requireIntact(current.manifest);
        const include = z.enum(['true', 'false']).parse(req.query.originals ?? 'false') === 'true';
        const archive = await caseArchive(store, current, attest, include);
        cases.event(
          current.manifest.id,
          current.manifest.version,
          include ? 'export_with_originals' : 'export_summary',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="preuvix-dossier-${current.manifest.id}-v${current.manifest.version}.zip"`,
        );
        res.type('application/zip').send(archive);
      }),
    );
    app.get(
      '/api/cases/:id/report',
      requireAuth,
      safe(async (req, res) => {
        const current = detail(
          z.uuid().parse(req.params.id),
          versionNumber.parse(req.query.version),
        );
        cases.requireIntact(current.manifest);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="preuvix-dossier-v${current.manifest.version}.pdf"`,
        );
        res.type('application/pdf').send(await caseReport(current));
      }),
    );
    app.get(
      '/api/cases/:id/manifest',
      requireAuth,
      safe((req, res) => {
        const current = cases.version(
          z.uuid().parse(req.params.id),
          versionNumber.parse(req.query.version),
        );
        res.setHeader('Content-Disposition', 'attachment; filename="dossier.json"');
        res.type('application/json').send(current.row.manifest);
      }),
    );
    app.post(
      '/api/cases/:id/links',
      requireAuth,
      safe((req, res) => {
        const input = z
          .object({
            version: versionNumber,
            confirmed: z.literal(true),
            includeOriginals: z.boolean(),
            days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
          })
          .strict()
          .parse(req.body);
        const id = z.uuid().parse(req.params.id);
        cases.requireIntact(cases.version(id, input.version).manifest);
        const token = randomBytes(32).toString('hex'),
          linkId = randomUUID(),
          now = new Date().toISOString();
        store.db
          .prepare('INSERT INTO case_links VALUES (?,?,?,?,?,?,NULL,?)')
          .run(
            linkId,
            id,
            input.version,
            hash(token),
            Number(input.includeOriginals),
            new Date(Date.now() + input.days * 86400000).toISOString(),
            now,
          );
        cases.event(id, input.version, 'share_created');
        res.status(201).json({ id: linkId, url: `/consultation-dossier/${token}` });
      }),
    );
    app.get(
      '/api/cases/:id/links',
      requireAuth,
      safe((req, res) => {
        const id = z.uuid().parse(req.params.id);
        cases.summary(id);
        res.json(
          store.db
            .prepare(
              'SELECT id,version,include_originals AS includeOriginals,expires_at AS expiresAt,revoked_at AS revokedAt,created_at AS createdAt FROM case_links WHERE case_id=? ORDER BY created_at DESC',
            )
            .all(id),
        );
      }),
    );
    app.delete(
      '/api/cases/:id/links/:linkId',
      requireAuth,
      safe((req, res) => {
        const link = store.db
          .prepare('SELECT version FROM case_links WHERE id=? AND case_id=?')
          .get(z.uuid().parse(req.params.linkId), z.uuid().parse(req.params.id)) as
          { version: number } | undefined;
        if (!link) throw new CaseError(404, 'Lien introuvable.');
        store.db
          .prepare('UPDATE case_links SET revoked_at=COALESCE(revoked_at,?) WHERE id=?')
          .run(new Date().toISOString(), String(req.params.linkId));
        cases.event(String(req.params.id), link.version, 'share_revoked');
        res.status(204).end();
      }),
    );
    function linked(token: string) {
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new CaseError(404, 'Lien expiré, révoqué ou introuvable.');
      const row = store.db
        .prepare(
          'SELECT case_id,version,include_originals,expires_at FROM case_links WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',
        )
        .get(hash(token), new Date().toISOString()) as
        | { case_id: string; version: number; include_originals: number; expires_at: string }
        | undefined;
      if (!row) throw new CaseError(404, 'Lien expiré, révoqué ou introuvable.');
      const current = detail(row.case_id, row.version);
      cases.requireIntact(current.manifest);
      // A link grants only its frozen version, never the history or other version titles.
      current.versions = current.versions.filter((version) => version.version === row.version);
      current.latestVersion = row.version;
      current.events = [];
      return { row, current };
    }
    app.get(
      '/api/case-consultation/:token',
      safe((req, res) => {
        const { row, current } = linked(String(req.params.token));
        res.json({
          dossier: current,
          includeOriginals: Boolean(row.include_originals),
          expiresAt: row.expires_at,
        });
      }),
    );
    app.get(
      '/api/case-consultation/:token/export',
      safe(async (req, res) => {
        const token = String(req.params.token),
          { row, current } = linked(token);
        const archive = await caseArchive(store, current, attest, Boolean(row.include_originals));
        linked(token);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="preuvix-dossier-v${row.version}.zip"`,
        );
        res.type('application/zip').send(archive);
      }),
    );
  }
  return { webhooks, routes };
}
