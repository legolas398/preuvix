import 'dotenv/config';
import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { createApp } from './app';
import { readConfig } from './config';
import { Store } from './store';

const config = readConfig();
const store = new Store(config.dataDir);
const app = createApp(config, store);
const server = createHttpServer(app);
if (config.production) {
  app.use(express.static(path.resolve('dist'), { index: false }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server, host: new URL(config.origin).hostname } },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      res
        .type('html')
        .send(await vite.transformIndexHtml(req.originalUrl, await readFile('index.html', 'utf8')));
    } catch (error) {
      next(error);
    }
  });
}
server.listen(config.port, config.host, () =>
  console.log(
    `PREUVIX ready at ${config.origin}\nTimestamp provider: ${config.timestampConfigured ? config.timestamp.name : 'not configured — deposits remain pending'}`,
  ),
);
server.requestTimeout = 60_000;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
