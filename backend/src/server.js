import { createApp } from './app.js';
import { config } from './config.js';
import { pool, healthcheck } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { runSeed, ensureDemoUsers } from './db/seed.js';

const { app } = createApp();

try {
  const db = await healthcheck();
  console.log(`[api] database ${db.db} on ${config.db.host}:${config.db.port} (${db.version})`);

  if (process.env.AUTO_MIGRATE !== 'false') {
    await runMigrations({ silent: false });
    if (process.env.AUTO_SEED !== 'false') {
      await runSeed({ skipDemo: process.env.SEED_DEMO === 'false', silent: false });
    }
  }
  // Ensure default demo users always exist with valid credentials
  await ensureDemoUsers().catch((err) => console.warn('[seed] demo user check warning:', err.message));
} catch (err) {
  console.error(`[api] cannot reach MySQL at ${config.db.host}:${config.db.port} - ${err.message}`);
  if (config.db.host === '127.0.0.1' || config.db.host === 'localhost') {
    console.error('[api] If running locally, start MariaDB from the XAMPP control panel, then try again.');
    console.error('[api] If running on Railway/cloud, attach a MySQL service or set the MYSQL_URL / DATABASE_URL environment variable.');
  } else {
    console.error(`[api] Verify that the MySQL database service on ${config.db.host}:${config.db.port} is online and credentials are correct.`);
  }
  process.exit(1);
}

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] LedgerCore API listening on http://0.0.0.0:${config.port} (${config.env})`);
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
