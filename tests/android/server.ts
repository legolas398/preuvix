// The Android tests serve the packaged assets themselves; only the real API is needed here.
import { createServer } from 'node:http';
import { createApp } from '../../server/app';
import { readConfig } from '../../server/config';
import { Store } from '../../server/store';

const config = readConfig();
const store = new Store(config.dataDir);
const server = createServer(createApp(config, store));
server.requestTimeout = 90000;
server.listen(config.port, config.host, () =>
  console.log(`Android test API ready: ${config.origin}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
}
