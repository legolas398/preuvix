import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { zipSync, strToU8 } from 'fflate';
import type { Config } from './config';
import type { Manifest, Proof, RecipientDossier } from '../shared/types';
import { Store, type Row } from './store';
import { hash, inspectImage } from './integrity';
import { timestampService, type TimestampService } from './timestamp';
import { makeReport } from './report';
import { readPartners } from './partners';
import { readCommunity } from './community';
import { createBilling } from './billing';
import type Stripe from 'stripe';
import { certification, verifyProgressive } from './certification';
import { reviewOutcomes, type AnnexStatement, type DocumentStatement } from '../shared/capture';
import { certificationLabels } from '../shared/certification-policy';
import { buildChain } from './chain';
import { assessCertification } from '../shared/certification-policy';
import { inspectMedia } from './media';
import { validateContentCredentials } from './c2pa';
import { newWatermarkCode, similarity, watermarking } from './watermark';
import { shortId } from '../shared/format';

export function createApp(
  config: Config,
  store: Store,
  timestamp: TimestampService = timestampService(config),
  stripeClient?: Stripe,
) {
  const app = express();
  const billing = createBilling(config, store, stripeClient);
  const certificates = certification(store, config.dataDir);
  const watermark = watermarking(config.trustmarkModelDir);
  let watermarkBusy = false;
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'blob:', 'data:', 'https://tile.openstreetmap.org'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              formAction: ["'self'"],
              baseUri: ["'self'"],
            },
          }
        : false,
      strictTransportSecurity: config.production ? undefined : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    billing.webhook,
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  const cookieOptions = {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict' as const,
    path: '/',
  };
  const passwordSalt = randomBytes(32);
  const passwordHash = scryptSync(config.password, passwordSalt, 32);
  const busy = new Set<string>();
  let processingUploads = 0;
  const sameOrigin: RequestHandler = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const localOrigins = config.production
      ? []
      : [`http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`];
    if (req.get('Origin') !== config.origin && !localOrigins.includes(req.get('Origin') || ''))
      return void res.status(403).json({ error: 'Origine de requête refusée.' });
    next();
  };
  app.use('/api', sameOrigin);
  function authenticated(req: express.Request) {
    const token = req.cookies?.preuvix_session;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
    return Boolean(
      store.db
        .prepare('SELECT 1 FROM sessions WHERE hash=? AND expires>?')
        .get(hash(token), Date.now()),
    );
  }
  const requireAuth: RequestHandler = (req, res, next) => {
    if (!authenticated(req))
      return void res.status(401).json({ error: 'Connectez-vous à votre espace.' });
    next();
  };
  app.get('/api/config', async (req, res) => {
    const isAuthenticated = authenticated(req);
    const storageLimit = isAuthenticated
      ? (await billing.refreshStatus()).maxStorageMb
      : config.maxStorageMb;
    res.json({
      authenticated: isAuthenticated,
      timestampConfigured: config.timestampConfigured,
      providerName: config.timestampConfigured ? config.timestamp.name : null,
      qualifiedServiceReviewed:
        config.timestampConfigured &&
        Boolean(config.timestamp.trustListUrl) &&
        Date.parse(config.timestamp.reviewValidUntil) > Date.now(),
      maxFileMb: 10,
      maxVideoMb: 50,
      maxStorageMb: storageLimit,
    });
  });
  app.get('/api/partners', async (_req, res) => {
    try {
      res.json({ partners: await readPartners(config.dataDir) });
    } catch {
      res
        .status(503)
        .json({ error: 'Le répertoire des partenaires est temporairement indisponible.' });
    }
  });
  app.get('/api/community', async (_req, res) => {
    try {
      res.json({
        members: await readCommunity(config.dataDir),
        contact: config.communityContact || null,
      });
    } catch {
      res
        .status(503)
        .json({ error: 'Les espaces communautaires sont temporairement indisponibles.' });
    }
  });
  app.use(
    '/api/billing',
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Trop de demandes de facturation. Réessayez dans une minute.' },
    }),
  );
  billing.routes(app, requireAuth);
  app.get('/api/certification/key', (_req, res) =>
    res.json({
      algorithm: 'Ed25519',
      publicKey: certificates.publicKey,
      keyId: certificates.keyId,
      retired: certificates.retiredKeys,
      scope: 'Signature technique de cette installation, identité non vérifiée par un tiers.',
    }),
  );
  app.post('/api/captures', requireAuth, (req, res) => {
    try {
      res.status(201).json(certificates.issue(hash(req.cookies.preuvix_session)));
    } catch (error) {
      res.status(429).json({ error: (error as Error).message });
    }
  });
  app.post('/api/captures/:id/checkpoint', requireAuth, (req, res) => {
    try {
      res.json(
        certificates.progress(
          z.uuid().parse(req.params.id),
          hash(req.cookies.preuvix_session),
          req.body,
        ),
      );
    } catch {
      res.status(409).json({
        error: 'Point d’engagement refusé : session expirée, déjà engagée ou données incohérentes.',
      });
    }
  });
  app.post('/api/captures/:id/commit', requireAuth, (req, res) => {
    try {
      res.json(
        certificates.commit(
          z.uuid().parse(req.params.id),
          hash(req.cookies.preuvix_session),
          req.body,
        ),
      );
    } catch {
      res.status(409).json({
        error:
          'Engagement refusé : données invalides, session expirée, inconnue ou déjà liée à une autre empreinte.',
      });
    }
  });
  app.post(
    '/api/login',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 10,
      skipSuccessfulRequests: true,
      message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
    }),
    (req, res) => {
      const parsed = z.object({ password: z.string().max(256) }).safeParse(req.body);
      if (
        !parsed.success ||
        !timingSafeEqual(
          scryptSync(parsed.success ? parsed.data.password : '', passwordSalt, 32),
          passwordHash,
        )
      )
        return void res.status(401).json({ error: 'Mot de passe incorrect.' });
      store.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
      const token = randomBytes(32).toString('hex');
      store.db
        .prepare('INSERT INTO sessions VALUES (?,?)')
        .run(hash(token), Date.now() + 12 * 60 * 60_000);
      res
        .cookie('preuvix_session', token, { ...cookieOptions, maxAge: 12 * 60 * 60_000 })
        .json({ ok: true });
    },
  );
  app.post('/api/logout', (req, res) => {
    if (typeof req.cookies?.preuvix_session === 'string')
      store.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(req.cookies.preuvix_session));
    res.clearCookie('preuvix_session', cookieOptions).json({ ok: true });
  });
  app.get('/api/verification/:token', (req, res) => {
    if (!/^[a-f0-9]{48}$/.test(req.params.token))
      return void res.status(404).json({ error: 'Lien introuvable ou révoqué.' });
    const row = store.byShare(req.params.token);
    if (!row) return void res.status(404).json({ error: 'Lien introuvable ou révoqué.' });
    const proof = store.summary(row);
    res.json({
      id: proof.id,
      fileHash: proof.manifest.file.sha256,
      manifestHash: proof.manifestHash,
      status: proof.status,
      receipt: proof.receipt,
      storedFileMatches: hash(row.original) === proof.manifest.file.sha256,
      manifestMatches: hash(row.manifest) === proof.manifestHash,
    });
  });
  const recipient = (req: express.Request, res: express.Response, countView = false) => {
    const token = String(req.params.token);
    const found = /^[a-f0-9]{64}$/.test(token)
      ? store.byRecipientToken(hash(token), countView)
      : undefined;
    if (!found) res.status(404).json({ error: 'Lien expiré, révoqué ou introuvable.' });
    return found;
  };
  app.get('/api/dossier/:token', (req, res) => {
    const found = recipient(req, res, true);
    if (!found) return;
    const { shareToken, recipientLinks, events, ...proof } = full(found.row);
    // Other recipients' names stay private: only the event kinds are shown.
    if (proof.custody)
      proof.custody = {
        ...proof.custody,
        entries: proof.custody.entries.map((entry) =>
          entry.kind.startsWith('recipient_') ? { ...entry, detail: {} } : entry,
        ),
      };
    const body: RecipientDossier = {
      proof,
      label: found.link.label,
      expiresAt: found.link.expires_at,
      integrity: {
        originalMatches: hash(found.row.original) === proof.manifest.file.sha256,
        manifestMatches: hash(found.row.manifest) === proof.manifestHash,
      },
    };
    res.json(body);
  });
  app.get('/api/dossier/:token/original', (req, res) => {
    const found = recipient(req, res);
    if (found) sendOriginal(found.row, res);
  });
  app.get('/api/dossier/:token/report', async (req, res) => {
    const found = recipient(req, res);
    if (found) await sendReport(found.row, res);
  });
  app.get('/api/dossier/:token/export', async (req, res) => {
    const found = recipient(req, res);
    if (found) await sendExport(found.row, res);
  });
  app.get('/api/dossier/:token/annexes/:annexId', (req, res) => {
    const found = recipient(req, res);
    if (found) sendAnnex(found.row, String(req.params.annexId), res);
  });
  // Public: anyone holding a PREUVIX report or export can check it was issued unaltered.
  app.get(
    '/api/documents/:sha256',
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Trop de vérifications. Réessayez dans une minute.' },
    }),
    (req, res) => {
      const sha = String(req.params.sha256);
      if (!/^[a-f0-9]{64}$/.test(sha))
        return void res.status(400).json({ error: 'Empreinte SHA-256 invalide.' });
      const signed = store.documentByHash(sha);
      if (!signed) return void res.json({ found: false });
      const row = store.get(signed.content.proofId);
      const manifest: Manifest | null = row ? JSON.parse(row.manifest) : null;
      res.json({
        found: true,
        documentId: signed.content.documentId,
        kind: signed.content.kind,
        issuedAt: signed.content.issuedAt,
        dossier: shortId(signed.content.proofId),
        manifestHash: signed.content.manifestHash,
        custodyLength: signed.content.custodyLength,
        signatureValid: store.validSignature(signed),
        dossierIntact: row ? intact(row) : false,
        status: manifest?.certification ? certificationLabels[manifest.certification.status] : null,
        timestamped: row?.status === 'timestamped',
      });
    },
  );
  // Owner-only: which dossier, annex or document does a local file belong to?
  app.get('/api/lookup/:sha256', requireAuth, (req, res) => {
    const sha = String(req.params.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha))
      return void res.status(400).json({ error: 'Empreinte SHA-256 invalide.' });
    const matches: { kind: string; proofId: string; label: string; at: string }[] = [];
    for (const row of store.db
      .prepare(
        "SELECT id, json_extract(manifest,'$.title') AS title, json_extract(manifest,'$.receivedAt') AS at FROM proofs WHERE json_extract(manifest,'$.file.sha256')=?",
      )
      .all(sha) as { id: string; title: string; at: string }[])
      matches.push({ kind: 'original', proofId: row.id, label: row.title, at: row.at });
    for (const row of store.db
      .prepare(
        "SELECT proof_id, json_extract(payload,'$.name') AS name, json_extract(payload,'$.addedAt') AS at FROM annexes WHERE json_extract(payload,'$.sha256')=?",
      )
      .all(sha) as { proof_id: string; name: string; at: string }[])
      matches.push({ kind: 'annex', proofId: row.proof_id, label: row.name, at: row.at });
    const document = store.documentByHash(sha);
    if (document)
      matches.push({
        kind: document.content.kind,
        proofId: document.content.proofId,
        label: document.content.documentId,
        at: document.content.issuedAt,
      });
    res.json({ matches });
  });
  app.use('/api/proofs', requireAuth);
  app.get('/api/proofs', (_req, res) =>
    res.json({ proofs: store.list(), usedBytes: store.usedBytes() }),
  );
  async function stamp(id: string) {
    if (!config.timestampConfigured) return;
    if (busy.has(id)) return;
    busy.add(id);
    try {
      const row = store.get(id);
      if (!row || row.status === 'timestamped') return;
      if (
        hash(row.manifest) !== row.manifest_hash ||
        hash(row.original) !== JSON.parse(row.manifest).file.sha256
      )
        throw new Error('Integrity mismatch');
      const result = await timestamp(row.manifest_hash);
      store.timestamp(id, result.receipt, result.query, result.response);
    } finally {
      busy.delete(id);
    }
  }
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 7, fieldSize: 4096, parts: 8 },
  });
  const uploadCapacity: RequestHandler = (_req, res, next) => {
    if (processingUploads >= 2)
      return void res
        .status(503)
        .json({ error: 'Deux dépôts sont déjà en cours. Réessayez dans quelques secondes.' });
    processingUploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        processingUploads--;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
  app.post('/api/proofs', uploadCapacity, upload.single('file'), async (req, res) => {
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(1500).default(''),
        source: z.enum(['upload', 'camera']),
        requestKey: z.uuid(),
        clientSha256: z.string().regex(/^[a-f0-9]{64}$/),
        captureId: z.uuid().optional(),
        declaration: z.string().max(3000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success || !req.file)
      return void res.status(400).json({
        error:
          'Choisissez une photo et un titre, puis attendez le calcul SHA-256 avant de déposer.',
      });
    const { title, description, source, requestKey } = parsed.data;
    let declaration: Manifest['declaration'];
    try {
      if (parsed.data.declaration)
        declaration = z
          .object({
            author: z.string().trim().min(2).max(120),
            context: z.string().trim().min(5).max(1200),
            statement: z.literal(
              'Je décris les faits de bonne foi, signale les modifications connues et conserve les éléments utiles au débat contradictoire.',
            ),
          })
          .strict()
          .parse(JSON.parse(parsed.data.declaration));
    } catch {
      return void res.status(400).json({ error: 'Déclaration de contexte invalide.' });
    }
    const fileHash = hash(req.file.buffer);
    if (fileHash !== parsed.data.clientSha256) {
      return void res.status(422).json({
        error:
          'L’empreinte reçue diffère de celle calculée dans votre navigateur. Aucun nouveau dossier n’a été créé. Sélectionnez à nouveau votre fichier.',
      });
    }
    const existingResponse = () => {
      const existing = store.byKey(requestKey);
      if (!existing) return false;
      const proof = store.summary(existing);
      if (
        proof.manifest.file.sha256 !== fileHash ||
        proof.manifest.title !== title ||
        proof.manifest.description !== description ||
        proof.manifest.source !== source ||
        proof.manifest.capture?.id !== parsed.data.captureId ||
        JSON.stringify(proof.manifest.declaration) !== JSON.stringify(declaration)
      )
        res.status(409).json({ error: 'Cet identifiant de dépôt correspond à un autre contenu.' });
      else res.json(proof);
      return true;
    };
    if (existingResponse()) return;
    let capture: Manifest['capture'];
    try {
      if (parsed.data.captureId) {
        if (source !== 'camera')
          throw new Error('Une session de capture ne peut pas être liée à un import.');
        capture = certificates.resolve(
          parsed.data.captureId,
          hash(req.cookies.preuvix_session),
          fileHash,
        );
      }
    } catch (error) {
      return void res.status(409).json({ error: (error as Error).message });
    }
    let inspected;
    try {
      inspected = await inspectMedia(req.file.buffer);
    } catch (error) {
      return void res.status(400).json({ error: (error as Error).message });
    }
    const contentCredentials = await validateContentCredentials(
      req.file.buffer,
      inspected.mime,
      config.c2paTrustAnchors,
    );
    // Recheck after asynchronous image decoding: another request may have completed.
    if (existingResponse()) return;
    if (capture && (capture.kind === 'video') !== inspected.mime.startsWith('video/'))
      return void res
        .status(409)
        .json({ error: 'Le type du média ne correspond pas à la session.' });
    if (capture?.kind === 'video')
      capture = {
        ...capture,
        progressive: verifyProgressive(
          capture,
          req.file.buffer,
          'durationSeconds' in inspected ? (inspected.durationSeconds as number) : 0,
        ),
      };
    const storageLimit = (await billing.refreshStatus()).maxStorageMb;
    if (existingResponse()) return;
    if (store.usedBytes() + req.file.size > storageLimit * 1024 * 1024)
      return void res
        .status(413)
        .json({ error: 'Espace de stockage plein. Exportez et supprimez un dossier.' });
    if (
      capture &&
      store.db
        .prepare("SELECT id FROM proofs WHERE json_extract(manifest, '$.capture.id')=?")
        .get(capture.id)
    )
      return void res
        .status(409)
        .json({ error: 'Cette capture possède déjà un dossier. Consultez vos preuves.' });
    const id = randomUUID();
    const manifest: Manifest = {
      version: 1,
      id,
      receivedAt: new Date().toISOString(),
      title,
      description,
      source,
      sourceAssurance: 'client_declared',
      ...(capture ? { capture } : {}),
      ...(declaration ? { declaration } : {}),
      file: {
        name: req.file.originalname.replace(/[\x00-\x1f\\/]/g, '_').slice(0, 180),
        mime: inspected.mime,
        size: req.file.size,
        sha256: fileHash,
        width: inspected.width,
        height: inspected.height,
        ...('durationSeconds' in inspected
          ? { durationSeconds: inspected.durationSeconds as number }
          : {}),
      },
      provenance: { ...inspected.provenance, contentCredentials },
    };
    manifest.certification = assessCertification(manifest);
    store.insert(manifest, req.file.buffer, requestKey, certificates.attest(manifest));
    try {
      await stamp(id);
    } catch {
      /* Saved as pending; explicitly retryable, never falsely sealed. */
    }
    res.status(201).json(full(store.get(id)!));
  });
  app.get('/api/proofs/:id', (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    res.json(full(row));
  });
  const annexUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, fieldSize: 2048, parts: 5 },
  });
  app.post(
    '/api/proofs/:id/annexes',
    uploadCapacity,
    annexUpload.single('file'),
    async (req, res) => {
      const row = store.get(String(req.params.id));
      if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
      const parsed = z
        .object({
          clientSha256: z.string().regex(/^[a-f0-9]{64}$/),
          note: z.string().trim().max(500).default(''),
          requestKey: z.uuid(),
        })
        .safeParse(req.body);
      if (!parsed.success || !req.file)
        return void res
          .status(400)
          .json({ error: 'Choisissez une pièce et attendez le calcul de son empreinte.' });
      const bytes = req.file.buffer;
      const sha256 = hash(bytes);
      if (sha256 !== parsed.data.clientSha256)
        return void res.status(422).json({
          error:
            'L’empreinte reçue diffère de celle calculée dans votre navigateur. La pièce n’a pas été ajoutée.',
        });
      const previous = store.annexByKey(parsed.data.requestKey);
      if (previous) {
        const existing = store.annex(previous.proof_id, previous.id);
        if (previous.proof_id !== row.id || existing?.signed.content.sha256 !== sha256)
          return void res
            .status(409)
            .json({ error: 'Cet identifiant de dépôt correspond à une autre pièce.' });
        return void res.json(full(row));
      }
      const mime = annexType(bytes);
      if (!mime)
        return void res.status(415).json({
          error:
            'Format non pris en charge. Utilisez un PDF, une image JPEG, PNG ou WebP, ou un texte (TXT, EML, CSV).',
        });
      if (!intact(row))
        return void res.status(409).json({ error: 'Échec du contrôle d’intégrité du dossier.' });
      const count = store.annexes(row.id).length;
      if (count >= 30)
        return void res.status(409).json({ error: 'Trente pièces maximum par dossier.' });
      const storageLimit = (await billing.refreshStatus()).maxStorageMb;
      if (store.usedBytes() + bytes.length > storageLimit * 1024 * 1024)
        return void res
          .status(413)
          .json({ error: 'Espace de stockage plein. Exportez et supprimez un dossier.' });
      const statement: AnnexStatement = {
        type: 'preuvix-annex-v1',
        annexId: randomUUID(),
        proofId: row.id,
        manifestHash: row.manifest_hash,
        seq: count + 1,
        name: req.file.originalname.replace(/[\x00-\x1f\\/"]/g, '_').slice(0, 180) || 'piece',
        mime,
        size: bytes.length,
        sha256,
        note: parsed.data.note,
        addedAt: new Date().toISOString(),
      };
      try {
        store.addAnnex(certificates.signStatement(statement), bytes, parsed.data.requestKey);
      } catch {
        return void res.status(409).json({ error: 'Pièce non ajoutée. Réessayez.' });
      }
      res.status(201).json(full(store.get(row.id)!));
    },
  );
  app.get('/api/proofs/:id/annexes/:annexId', (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    sendAnnex(row, req.params.annexId, res);
  });
  app.post('/api/proofs/:id/timestamp', async (req, res) => {
    if (!store.get(req.params.id))
      return void res.status(404).json({ error: 'Dossier introuvable.' });
    if (!config.timestampConfigured)
      return void res
        .status(503)
        .json({ error: 'Le prestataire d’horodatage n’est pas configuré.' });
    if (busy.has(req.params.id))
      return void res.status(409).json({ error: 'Horodatage déjà en cours.' });
    try {
      await stamp(req.params.id);
      res.json(full(store.get(req.params.id)!));
    } catch {
      res.status(503).json({
        error:
          'Horodatage non obtenu ou non vérifiable. Le fichier reste conservé. Réessayez plus tard.',
      });
    }
  });
  app.post('/api/proofs/:id/review', (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    const manifest: Manifest = JSON.parse(row.manifest);
    if (!manifest.capture?.challenge)
      return void res.status(409).json({ error: 'Ce dossier ne comporte aucun défi en direct.' });
    const parsed = z
      .object({
        outcome: z.enum(reviewOutcomes),
        reviewer: z.string().trim().min(2).max(120),
        note: z.string().trim().max(1000).default(''),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return void res
        .status(400)
        .json({ error: 'Résultat, nom du vérificateur ou note invalide.' });
    store.addReview(
      row.id,
      certificates.signReview({
        type: 'preuvix-challenge-review-v1',
        proofId: row.id,
        manifestHash: row.manifest_hash,
        ...parsed.data,
        reviewedAt: new Date().toISOString(),
      }),
    );
    res.status(201).json(full(store.get(row.id)!));
  });
  app.post('/api/proofs/:id/share', (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'Choix de partage invalide.' });
    store.share(
      row.id,
      parsed.data.enabled ? row.share_token || randomBytes(24).toString('hex') : null,
    );
    res.json(full(store.get(row.id)!));
  });
  app.delete('/api/proofs/:id', (req, res) => {
    if (busy.has(req.params.id))
      return void res
        .status(409)
        .json({ error: 'Attendez la fin de l’horodatage avant de supprimer.' });
    if (!store.get(req.params.id))
      return void res.status(404).json({ error: 'Dossier introuvable.' });
    store.delete(req.params.id);
    res.status(204).end();
  });
  app.get('/api/proofs/:id/original', (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    sendOriginal(row, res);
  });
  const isPhoto = (mime: string) => mime.startsWith('image/');
  // Serializes the CPU-heavy watermark model; a second request waits for the next turn.
  async function withWatermark<T>(res: express.Response, task: () => Promise<T>) {
    if (watermarkBusy) {
      res
        .status(503)
        .json({ error: 'Une protection est déjà en cours. Réessayez dans un instant.' });
      return undefined;
    }
    watermarkBusy = true;
    try {
      return await task();
    } catch {
      res.status(503).json({
        error:
          'Le module de protection n’a pas pu être chargé. Au premier usage, il télécharge ses modèles (65 Mo) : vérifiez la connexion puis réessayez.',
      });
      return undefined;
    } finally {
      watermarkBusy = false;
    }
  }
  app.get('/api/proofs/:id/protected-copy', async (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    const manifest: Manifest = JSON.parse(row.manifest);
    if (!isPhoto(manifest.file.mime))
      return void res
        .status(409)
        .json({ error: 'La copie protégée est disponible pour les photos uniquement.' });
    if (!intact(row)) return void res.status(409).json({ error: 'Échec du contrôle d’intégrité.' });
    const first = !store.watermarkCode(row.id);
    const code = store.ensureWatermark(row.id, newWatermarkCode());
    const copy = await withWatermark(res, () => watermark.protect(Buffer.from(row.original), code));
    if (!copy) return;
    if (first) store.addEvent(row.id, 'protected_copy_issued');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="preuvix-copie-protegee-${shortId(row.id)}.jpg"`,
    );
    res.type('image/jpeg').send(copy);
  });
  app.post(
    '/api/watermark/check',
    requireAuth,
    uploadCapacity,
    upload.single('file'),
    async (req, res) => {
      if (!req.file || req.file.size > 10 * 1024 * 1024)
        return void res.status(400).json({ error: 'Choisissez une image de 10 Mo maximum.' });
      const bytes = req.file.buffer;
      const result = await withWatermark(res, async () => {
        const code = await watermark.read(bytes);
        const row = code ? store.byWatermark(code) : undefined;
        if (!row) return { found: false as const };
        const manifest: Manifest = JSON.parse(row.manifest);
        const score = await similarity(Buffer.from(row.original), bytes);
        return {
          found: true as const,
          proof: { id: row.id, title: manifest.title, receivedAt: manifest.receivedAt },
          similarity: score,
          // Calibrated: recompression and resizing stay ≥ 96 in the most altered zone.
          verdict: score.worstZone >= 96 ? ('no_visible_change' as const) : ('modified' as const),
        };
      }).catch(() => {
        res.status(400).json({ error: 'Image illisible. Utilisez un JPEG, PNG ou WebP.' });
        return undefined;
      });
      if (result) res.json(result);
    },
  );
  app.post('/api/proofs/:id/recipient-links', (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    const parsed = z
      .object({
        label: z.string().trim().min(2).max(120),
        days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return void res.status(400).json({ error: 'Destinataire ou durée de validité invalide.' });
    const active = store
      .recipientLinks(row.id)
      .filter((link) => !link.revokedAt && Date.parse(link.expiresAt) > Date.now());
    if (active.length >= 20)
      return void res
        .status(409)
        .json({ error: 'Vingt liens sont déjà actifs. Révoquez-en un avant d’en créer un autre.' });
    // Only the hash is stored: the link is shown once, at creation.
    const token = randomBytes(32).toString('hex');
    store.addRecipientLink(row.id, {
      id: randomUUID(),
      tokenHash: hash(token),
      label: parsed.data.label,
      expiresAt: new Date(Date.now() + parsed.data.days * 24 * 3600_000).toISOString(),
    });
    res.status(201).json({
      url: `${config.origin}/dossier/${token}`,
      proof: full(store.get(row.id)!),
    });
  });
  app.delete('/api/proofs/:id/recipient-links/:linkId', (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    if (!store.revokeRecipientLink(row.id, req.params.linkId))
      return void res.status(404).json({ error: 'Lien introuvable ou déjà révoqué.' });
    res.json(full(store.get(row.id)!));
  });
  app.get('/api/proofs/:id/report', async (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    await sendReport(row, res);
  });
  app.get('/api/proofs/:id/export', async (req, res) => {
    const row = store.get(req.params.id);
    if (!row) return void res.status(404).json({ error: 'Dossier introuvable.' });
    await sendExport(row, res);
  });
  const intact = (row: Row) =>
    hash(row.manifest) === row.manifest_hash &&
    hash(row.original) === (JSON.parse(row.manifest) as Manifest).file.sha256;
  // Full view: summary plus the chain re-verified from the stored bytes.
  function full(row: Row): Proof {
    const proof = store.summary(row);
    return { ...proof, chain: buildChain(store, row, proof) };
  }
  const documentId = () => {
    const raw = randomBytes(6).toString('hex').toUpperCase();
    return `DOC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  };
  // Every issued document is hashed, signed and journaled: a modified copy is detectable.
  function issue(row: Row, kind: DocumentStatement['kind'], id: string, bytes: Uint8Array) {
    const custody = store.custody(row.id, row.manifest_hash);
    store.addDocument(
      certificates.signStatement<DocumentStatement>({
        type: 'preuvix-document-v1',
        documentId: id,
        proofId: row.id,
        manifestHash: row.manifest_hash,
        kind,
        sha256: hash(bytes),
        size: bytes.length,
        issuedAt: new Date().toISOString(),
        custodyHead: custody.head,
        custodyLength: custody.length,
      }),
    );
  }
  async function report(row: Row) {
    const id = documentId();
    const bytes = await makeReport(full(row), config.origin, Buffer.from(row.original), id);
    issue(row, 'report', id, bytes);
    return bytes;
  }
  async function sendReport(row: Row, res: express.Response) {
    if (!intact(row)) return void res.status(409).json({ error: 'Échec du contrôle d’intégrité.' });
    res.setHeader('Content-Disposition', `attachment; filename="preuvix-${row.id}.pdf"`);
    res.type('application/pdf').send(await report(row));
  }
  function sendAnnex(row: Row, annexId: string, res: express.Response) {
    const annex = store.annex(row.id, annexId);
    if (!annex) return void res.status(404).json({ error: 'Pièce introuvable.' });
    if (hash(annex.content) !== annex.signed.content.sha256)
      return void res.status(409).json({ error: 'Échec du contrôle d’intégrité de la pièce.' });
    const name = annex.signed.content.name.replace(/[^\w.\- ]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res
      .type(
        annex.signed.content.mime === 'text/plain'
          ? 'text/plain; charset=utf-8'
          : annex.signed.content.mime,
      )
      .send(Buffer.from(annex.content));
  }
  function sendOriginal(row: Row, res: express.Response) {
    if (!intact(row)) return void res.status(409).json({ error: 'Échec du contrôle d’intégrité.' });
    const manifest: Manifest = JSON.parse(row.manifest);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="original.${manifest.file.mime.split('/')[1]}"`,
    );
    res.type(manifest.file.mime).send(Buffer.from(row.original));
  }
  async function sendExport(row: Row, res: express.Response) {
    if (!intact(row)) return void res.status(409).json({ error: 'Échec du contrôle d’intégrité.' });
    const rapport = await report(row);
    const current = store.get(row.id)!;
    const proof = full(current);
    const annexes = store.signedAnnexes(row.id);
    const files: Record<string, Uint8Array> = {
      [`original.${proof.manifest.file.mime.split('/')[1]}`]: row.original,
      'manifest.json': strToU8(row.manifest),
      'manifest.sha256': strToU8(`${row.manifest_hash}  manifest.json\n`),
      'receipt.json': strToU8(JSON.stringify(proof.receipt, null, 2)),
      'events.json': strToU8(current.events),
      ...(proof.attestation
        ? {
            'attestation.json': strToU8(JSON.stringify(proof.attestation, null, 2)),
            'manifest.sig': Buffer.from(proof.attestation.signature, 'base64'),
            'signer-public.pem': strToU8(proof.attestation.publicKey),
          }
        : {}),
      ...(proof.reviews?.length
        ? { 'reviews.json': strToU8(JSON.stringify(proof.reviews, null, 2)) }
        : {}),
      'rapport.pdf': rapport,
      'custody.json': strToU8(JSON.stringify(store.signedCustody(row.id), null, 2)),
      'chain.json': strToU8(JSON.stringify(proof.chain, null, 2)),
      ...(annexes.length
        ? {
            'annexes.json': strToU8(
              JSON.stringify(
                annexes.map((annex) => annex.signed),
                null,
                2,
              ),
            ),
            ...Object.fromEntries(
              annexes.map(({ signed, content }) => [
                `annexes/A${signed.content.seq}-${signed.content.name.replace(/[^\w.\- ]/g, '_')}`,
                content,
              ]),
            ),
          }
        : {}),
      'LISEZ-MOI.txt': strToU8(
        'INVENTAIRE SIGNE\nSHA256SUMS liste l empreinte de chaque fichier de cet export ; SHA256SUMS.sig est sa signature Ed25519 :\nopenssl pkeyutl -verify -pubin -inkey signer-public.pem -rawin -in SHA256SUMS -sigfile SHA256SUMS.sig\nsha256sum -c SHA256SUMS\ncustody.json : journal de conservation, chaque entree liee a la precedente (champ prev) et signee.\nannexes.json et annexes/ : pieces annexes et leurs declarations signees.\nrapport.pdf est aussi enregistre a son emission : le deposer sur /verifier-document pour le controler.\nVerification complete : node scripts/verify-export.mjs dossier-extrait [cle-de-confiance.pem]\n\nATTESTATION TECHNIQUE\nLa signature Ed25519 couvre les octets exacts de manifest.json.\nVerifier avec une cle publique obtenue independamment :\nopenssl pkeyutl -verify -pubin -inkey signer-public.pem -rawin -in manifest.json -sigfile manifest.sig\nLa cle fournie dans ce ZIP ne prouve pas a elle seule l identite du signataire.\nreviews.json (si present) : verifications visuelles du defi en direct, chacune signee separement (champ payload).\nCette signature auto-generee n est pas une signature qualifiee eIDAS.\n\n' +
          "PREUVIX — Dossier technique\nLe manifeste est fourni dans ses octets exacts : ne pas le reformater avant verification.\nComparer le SHA-256 de l'original a manifest.json, puis celui du manifeste au jeton.\nLe fichier manifest.sha256 est une aide, pas une ancre de confiance.\nAvec OpenSSL et une chaine de confiance obtenue independamment :\nopenssl ts -verify -data manifest.json -in timestamp.tsr -CAfile trusted-ca.pem\nopenssl ts -verify -queryfile timestamp.tsq -in timestamp.tsr -CAfile trusted-ca.pem\nLa qualification eIDAS exige la verification du service dans la liste de confiance a la date du jeton.\nSans timestamp.tsr : aucun horodatage independant.\nCe dossier n'atteste ni la realite de la scene ni l'absence d'IA.\nL'original peut contenir des metadonnees personnelles.\n",
      ),
    };
    if (row.tsq && row.tsr) {
      files['timestamp.tsq'] = row.tsq;
      files['timestamp.tsr'] = row.tsr;
    }
    // Signed inventory: any added, removed or altered file in the export is detected.
    const sums = strToU8(
      Object.keys(files)
        .sort()
        .map((name) => `${hash(files[name])}  ${name}\n`)
        .join(''),
    );
    files['SHA256SUMS'] = sums;
    files['SHA256SUMS.sig'] = certificates.signBytes(sums);
    const zip = Buffer.from(zipSync(files, { level: 0 }));
    issue(row, 'export', documentId(), zip);
    res.setHeader('Content-Disposition', `attachment; filename="preuvix-${row.id}.zip"`);
    res.type('application/zip').send(zip);
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route introuvable.' }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof multer.MulterError)
      return void res.status(400).json({
        error:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Le média dépasse la limite de 50 Mo (10 Mo pour une photo).'
            : 'Dépôt invalide : un seul média est autorisé.',
      });
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large')
      return void res.status(400).json({ error: 'Requête invalide ou trop volumineuse.' });
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ error: 'Une erreur interne est survenue. Réessayez.' });
  };
  app.use(errorHandler);
  return app;
}

/** Annex formats recognised by their bytes, never by the declared name or type. */
export function annexType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  if (bytes.length && !bytes.includes(0))
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return 'text/plain';
    } catch {
      return null;
    }
  return null;
}
