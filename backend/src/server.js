import { createApp } from './app.js';
import { config } from './config.js';
import { pool, healthcheck } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { runSeed, ensureDemoUsers } from './db/seed.js';

const { app } = createApp();

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

// Background DB initialization with retry loop
async function initDatabase() {
  const maxRetries = 25; // 25 attempts * 2s = 50 seconds
  let db = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      db = await healthcheck();
      console.log(`[api] database ${db.db} on ${config.db.host}:${config.db.port} (${db.version}) connected on attempt ${attempt}`);
      break;
    } catch (err) {
      console.warn(`[api] Waiting for MySQL at ${config.db.host}:${config.db.port} (attempt ${attempt}/${maxRetries}): ${err.message}`);
      if (attempt === maxRetries) {
        console.error(`[api] Could not establish connection to MySQL at ${config.db.host}:${config.db.port} after ${maxRetries} attempts.`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (process.env.AUTO_MIGRATE !== 'false') {
    try {
      console.log('[api] Running database migrations...');
      await runMigrations({ silent: false });
      console.log('[api] Migrations completed.');
    } catch (err) {
      console.error('[api] Migration warning/error:', err.message);
    }

    if (process.env.AUTO_SEED !== 'false') {
      try {
        console.log('[api] Running seeds...');
        await runSeed({ skipDemo: process.env.SEED_DEMO === 'false', silent: false });
        console.log('[api] Seeds completed.');
      } catch (err) {
        console.error('[api] Seed warning/error:', err.message);
      }
    }
  }

  try {
    await ensureDemoUsers();
    console.log('[api] Demo users verified.');
  } catch (err) {
    console.warn('[api] demo user check warning:', err.message);
  }
}

initDatabase().catch((err) => {
  console.error('[api] Uncaught database initialization error:', err.message);
});
