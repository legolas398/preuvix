// Dedicated loopback-only test instance. Never reads the production/local .env.
import express from 'express';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const folder = path.join(root, '.tools', 'usb-test');
const password = readFileSync(path.join(folder, 'password.txt'), 'utf8').trim();
const control = readFileSync(path.join(folder, 'control.txt'), 'utf8').trim();
const identity = createHash('sha256').update(root).digest('hex');
const config = readConfig({
  OWNER_PASSWORD: password, APP_ORIGIN: 'http://localhost:3016',
  HOST: '127.0.0.1', PORT: '3016', DATA_DIR: path.join(folder, 'data'),
  MOBILE_ENABLED: 'true', COOKIE_SECURE: 'false', NODE_ENV: 'development',
  PRIVATE_PROTOTYPE: 'true', REQUIRE_TIMESTAMP: 'false',
});
const store = new Store(config.dataDir);
const app = express();
app.get('/__usb/health', (_req, res) => res.json({ service: 'preuvix-usb-test', identity, pid: process.pid, port: 3016 }));
const server = createServer(app);
function shutdown() {
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
app.post('/__usb/stop', (req, res) => {
  const provided = Buffer.from(req.get('X-USB-Control') || '');
  const expected = Buffer.from(control);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.sendStatus(403); return;
  }
  res.sendStatus(204);
  shutdown();
});
app.use(createApp(config, store));
app.use(express.static(path.join(root, 'dist'), { index: false }));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
server.requestTimeout = 60000;
server.on('error', (error) => { console.error(error.message); store.close(); process.exit(1); });
server.listen(3016, '127.0.0.1', () => {
  writeFileSync(path.join(folder, 'server.json'), JSON.stringify({ pid: process.pid, identity, startedAt: new Date().toISOString() }));
  console.log('PREUVIX USB ready: http://localhost:3016 (isolated test data).');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, shutdown);
