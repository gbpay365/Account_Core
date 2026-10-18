import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

const int = (v, fallback) => (v === undefined || v === '' ? fallback : Number.parseInt(v, 10));

function parseDbConfig() {
  const connectionUrl =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.MYSQL_PUBLIC_URL ||
    process.env.JAWSDB_URL ||
    process.env.CLEARDB_DATABASE_URL;

  let host = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST;
  let port = int(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT, 3306);
  let user = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'root';
  let password = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
  let name = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'ledgercore';

  if (connectionUrl) {
    try {
      const parsed = new URL(connectionUrl);
      host = parsed.hostname;
      if (parsed.port) port = Number.parseInt(parsed.port, 10);
      if (parsed.username) user = decodeURIComponent(parsed.username);
      if (parsed.password) password = decodeURIComponent(parsed.password);
      if (parsed.pathname && parsed.pathname.length > 1) {
        name = decodeURIComponent(parsed.pathname.slice(1));
      }
    } catch (err) {
      console.warn(`[config] Failed to parse database URL: ${err.message}`);
    }
  }

  const sslRequired =
    process.env.DB_SSL === 'true' ||
    process.env.MYSQL_SSL === 'true' ||
    Boolean(connectionUrl && (connectionUrl.includes('ssl=true') || connectionUrl.includes('ssl-mode=REQUIRED')));

  return {
    host: host || '127.0.0.1',
    port: port || 3306,
    user,
    password,
    name,
    ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
  };
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4700),
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  db: parseDbConfig(),
  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  storageDir: path.resolve(here, '..', process.env.STORAGE_DIR || '../storage/attachments'),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 25) * 1024 * 1024,
  defaults: {
    currency: process.env.DEFAULT_CURRENCY || 'XAF',
    locale: process.env.DEFAULT_LOCALE || 'fr',
  },
};

