import type { Express, RequestHandler } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config';
import type { Store } from './store';
import { hash } from './integrity';
import {
  transmissionInput,
  type Transmission,
  type TransmissionInput,
  type TransmissionPreview,
} from '../shared/transmission';

type RecordRow = {
  id: string;
  input: string;
  revision: number;
  state: 'draft' | 'ready' | 'created';
  updated_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  snapshot: string | null;
};

export function transmissionRoutes(
  app: Express,
  config: Config,
  store: Store,
  requireAuth: RequestHandler,
) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS transmissions (
    id TEXT PRIMARY KEY, input TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL, token_hash TEXT UNIQUE,
    expires_at TEXT, revoked_at TEXT, snapshot TEXT
  );
  CREATE TRIGGER IF NOT EXISTS delete_transmissions_with_proof AFTER DELETE ON proofs
  BEGIN
    DELETE FROM transmissions WHERE EXISTS (
      SELECT 1 FROM json_each(json_extract(transmissions.input, '$.proofIds')) WHERE value=OLD.id
    );
  END;`);
  const premium: RequestHandler = (_req, res, next) => {
    if (!config.premiumTransmissionTest)
      return void res
        .status(403)
        .json({ error: 'La préparation nécessite un accès Premium de test activé côté serveur.' });
    next();
  };
  const get = (id: string) =>
    store.db.prepare('SELECT * FROM transmissions WHERE id=?').get(id) as RecordRow | undefined;
  function preview(input: TransmissionInput): TransmissionPreview {
    return {
      recipient: input.recipient,
      summary: input.summary,
      includeOriginals: input.includeOriginals,
      includeNotes: input.includeNotes,
      documents: input.proofIds.map((id) => {
        const row = store.get(id);
        if (!row) throw new Error('Une pièce sélectionnée a été supprimée. Modifiez la sélection.');
        const m = JSON.parse(row.manifest);
        if (hash(row.manifest) !== row.manifest_hash || hash(row.original) !== m.file.sha256)
          throw new Error('Une pièce ne correspond plus à son empreinte. Vérifiez le dossier.');
        return {
          id,
          title: m.title,
          sha256: m.file.sha256,
          bytes: m.file.size,
          ...(input.includeNotes ? { notes: m.description } : {}),
        };
      }),
    };
  }
  function view(row: RecordRow): Transmission {
    const input = JSON.parse(row.input) as TransmissionInput;
    // A created link is an immutable snapshot. A missing draft document remains editable.
    let data: TransmissionPreview;
    try {
      data = row.snapshot ? JSON.parse(row.snapshot) : preview(input);
    } catch {
      data = { ...input, documents: [] };
    }
    return {
      id: row.id,
      input,
      revision: row.revision,
      state: row.revoked_at
        ? 'revoked'
        : row.expires_at && Date.parse(row.expires_at) <= Date.now()
          ? 'expired'
          : row.state,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      preview: data,
    };
  }
  app.get('/api/transmissions', requireAuth, (_req, res) => {
    const rows = store.db
      .prepare('SELECT * FROM transmissions ORDER BY updated_at DESC')
      .all() as RecordRow[];
    res.json(rows.map(view));
  });
  app.post('/api/transmissions', requireAuth, premium, (req, res) => {
    const parsed = transmissionInput.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'Préparation invalide.' });
    try {
      preview(parsed.data);
    } catch (e) {
      return void res.status(400).json({ error: (e as Error).message });
    }
    const id = randomUUID();
    store.db
      .prepare('INSERT INTO transmissions(id,input,updated_at) VALUES (?,?,?)')
      .run(id, JSON.stringify(parsed.data), new Date().toISOString());
    res.status(201).json(view(get(id)!));
  });
  app.put('/api/transmissions/:id', requireAuth, premium, (req, res) => {
    const row = get(String(req.params.id));
    if (!row) return void res.status(404).json({ error: 'Préparation introuvable.' });
    const parsed = z
      .object({
        input: transmissionInput,
        revision: z.number().int().positive(),
        ready: z.boolean(),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'Préparation invalide.' });
    if (row.state === 'created' || row.revision !== parsed.data.revision)
      return void res
        .status(409)
        .json({ error: 'Préparation modifiée ou lien déjà créé. Rechargez la liste.' });
    const { input, ready } = parsed.data;
    if (ready && (!input.proofIds.length || input.recipient.length < 2 || input.summary.length < 5))
      return void res
        .status(400)
        .json({ error: 'Sélectionnez au moins une pièce, un résumé et un destinataire.' });
    try {
      preview(input);
    } catch (e) {
      return void res.status(400).json({ error: (e as Error).message });
    }
    store.db
      .prepare(
        'UPDATE transmissions SET input=?, revision=revision+1, state=?, updated_at=? WHERE id=?',
      )
      .run(JSON.stringify(input), ready ? 'ready' : 'draft', new Date().toISOString(), row.id);
    res.json(view(get(row.id)!));
  });
  app.post('/api/transmissions/:id/link', requireAuth, premium, (req, res) => {
    const row = get(String(req.params.id));
    if (!row) return void res.status(404).json({ error: 'Préparation introuvable.' });
    const parsed = z
      .object({ revision: z.number().int().positive(), confirmed: z.literal(true) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return void res.status(400).json({ error: 'Confirmation explicite requise.' });
    if (row.state !== 'ready' || row.revision !== parsed.data.revision)
      return void res
        .status(409)
        .json({ error: 'Vérifiez à nouveau le récapitulatif avant de créer un lien.' });
    const input = JSON.parse(row.input) as TransmissionInput;
    let snapshot: TransmissionPreview;
    try {
      snapshot = preview(input);
    } catch (e) {
      return void res.status(409).json({ error: (e as Error).message });
    }
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + input.days * 86400000).toISOString();
    store.db
      .prepare(
        "UPDATE transmissions SET state='created',snapshot=?,token_hash=?,expires_at=?,updated_at=?,revision=revision+1 WHERE id=?",
      )
      .run(JSON.stringify(snapshot), hash(token), expires, new Date().toISOString(), row.id);
    res.status(201).json({ transmission: view(get(row.id)!), url: `/consultation/${token}` });
  });
  // Reading and revocation deliberately do not require Premium.
  app.delete('/api/transmissions/:id/access', requireAuth, (req, res) => {
    const row = get(String(req.params.id));
    if (!row || row.state !== 'created')
      return void res.status(404).json({ error: 'Accès introuvable.' });
    store.db
      .prepare('UPDATE transmissions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE id=?')
      .run(new Date().toISOString(), new Date().toISOString(), row.id);
    res.json(view(get(row.id)!));
  });
  const access = (token: string) => {
    if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
    const row = store.db
      .prepare(
        "SELECT * FROM transmissions WHERE token_hash=? AND state='created' AND revoked_at IS NULL AND expires_at>?",
      )
      .get(hash(token), new Date().toISOString()) as RecordRow | undefined;
    if (!row) return undefined;
    const data = JSON.parse(row.snapshot!) as TransmissionPreview;
    // Deleting a selected proof invalidates access to the whole selection.
    if (data.documents.some((d) => !store.get(d.id))) return undefined;
    return { row, data };
  };
  app.use('/api/transmission-access', (_req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.get('/api/transmission-access/:token', (req, res) => {
    const found = access(String(req.params.token));
    if (!found)
      return void res.status(404).json({ error: 'Accès expiré, révoqué ou indisponible.' });
    res.json({ preview: found.data, expiresAt: found.row.expires_at });
  });
  app.get('/api/transmission-access/:token/report', (req, res) => {
    const found = access(String(req.params.token));
    if (!found) return void res.status(404).json({ error: 'Accès indisponible.' });
    // Never call the full dossier export: it contains unselected private metadata.
    res
      .attachment('rapport-selection.json')
      .json({
        format: 'preuvix-selection/1',
        ...found.data,
        notice:
          'Rapport de préparation non signé. Références uniquement si les originaux sont exclus. Aucun envoi professionnel, constat ou horodatage indépendant.',
      });
  });
  app.get('/api/transmission-access/:token/original/:id', (req, res) => {
    const found = access(String(req.params.token));
    const selected = found?.data.documents.find((d) => d.id === req.params.id);
    if (!found || !found.data.includeOriginals || !selected)
      return void res.status(404).json({ error: 'Document non accessible.' });
    const row = store.get(selected.id)!;
    if (hash(row.original) !== selected.sha256)
      return void res.status(409).json({ error: 'Intégrité non vérifiée.' });
    const manifest = JSON.parse(row.manifest);
    res
      .attachment(`original-${selected.id}.${manifest.file.mime.split('/')[1]}`)
      .type(manifest.file.mime)
      .send(Buffer.from(row.original));
  });
}
