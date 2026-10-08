import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

const int = (v, fallback) => (v === undefined || v === '' ? fallback : Number.parseInt(v, 10));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4700),
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'ledgercore',
  },
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
