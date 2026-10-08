import { createApp } from './app.js';
import { config } from './config.js';
import { pool, healthcheck } from './db/pool.js';

const { app } = createApp();

try {
  const db = await healthcheck();
  console.log(`[api] database ${db.db} on ${config.db.host}:${config.db.port} (${db.version})`);
} catch (err) {
  console.error(`[api] cannot reach MySQL at ${config.db.host}:${config.db.port} - ${err.message}`);
  console.error('[api] start MariaDB from the XAMPP control panel, then try again.');
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`[api] LedgerCore API listening on http://127.0.0.1:${config.port} (${config.env})`);
});

// Finish in-flight requests and release the pool so nodemon restarts and
// container stops do not leave half-written transactions behind.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
  });
}
