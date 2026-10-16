// Isolated test instance: never loads the project's .env or existing proof data.
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';

const folder = path.resolve('.tools/free-phone');
const origin = process.argv[2];
if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin || ''))
  throw new Error('Expected a Cloudflare test HTTPS origin.');
const config = readConfig({
  NODE_ENV: 'production', APP_ORIGIN: origin, COOKIE_SECURE: 'true',
  OWNER_PASSWORD: readFileSync(path.join(folder, 'password.txt'), 'utf8').trim(),
  DATA_DIR: path.join(folder, 'data'), HOST: '127.0.0.1', PORT: '3017',
  MOBILE_ENABLED: 'true', PRIVATE_PROTOTYPE: 'true', REQUIRE_TIMESTAMP: 'false',
  MAX_STORAGE_MB: '500', PREMIUM_TRANSMISSION_TEST: 'false',
});
const store = new Store(config.dataDir);
const app = express();
// All tunnel clients share the conservative local rate limit; never trust supplied IPs.
app.use((req, _res, next) => {
  delete req.headers['x-forwarded-for'];
  delete req.headers.forwarded;
  next();
});
// The installer contains the public backend URL, never credentials or proof data.
// Allow direct links from chat apps and Android's download manager without cookies.
app.get('/api/test-android.apk', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const apk = path.join(folder, 'preuvix-test.apk');
  const metadata = path.join(folder, 'apk-origin.txt');
  if (!existsSync(apk) || !existsSync(metadata) || readFileSync(metadata, 'utf8').trim() !== origin)
    return void res.status(409).json({ error: 'APK en preparation pour cette adresse.' });
  res.setHeader('Cache-Control', 'no-store');
  res.download(apk, 'preuvix-test.apk', { dotfiles: 'allow' });
});
app.use(createApp(config, store));
app.use(express.static(path.resolve('dist'), { index: false }));
app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
const server = app.listen(3017, '127.0.0.1', () => console.log('Isolated HTTPS test backend ready.'));
server.on('error', () => { store.close(); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
