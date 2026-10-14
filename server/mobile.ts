import type { Express } from 'express';
import type { Config } from './config';
import type { Store } from './store';
import { hash } from './integrity';
import { inspectMedia } from './media';

export function mobileTransport(app: Express, config: Config, store: Store) {
  store.db.exec(
    'CREATE TABLE IF NOT EXISTS mobile_sessions (hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE)',
  );
  app.use('/api', (req, res, next) => {
    const origin = req.get('Origin');
    if (config.mobileEnabled && origin === config.mobileOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      if (req.method === 'OPTIONS') return void res.sendStatus(204);
    }
    const token = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (config.mobileEnabled && token && (!origin || origin === config.mobileOrigin)) {
      const active = store.db
        .prepare(
          'SELECT 1 FROM sessions JOIN mobile_sessions USING(hash) WHERE hash=? AND expires>?',
        )
        .get(hash(token), Date.now());
      if (active) {
        res.locals.mobileAuthorized = true;
        // Reuse existing owner checks and capture-session binding; never set a browser cookie.
        req.cookies.preuvix_session = token;
      } else {
        return void res.status(401).json({ error: 'Session mobile expirée. Reconnectez-vous.' });
      }
    }
    next();
  });
}

export async function inspectMobileFile(bytes: Buffer) {
  if (bytes.length > 50 * 1024 * 1024) throw new Error('Maximum 50 Mo par vidéo.');
  return inspectMedia(bytes);
}
