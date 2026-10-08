import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import { config } from './config.js';
import { healthcheck } from './db/pool.js';
import { authenticate, handler, notFoundHandler, errorHandler } from './middleware/index.js';
import { authRoutes } from './routes/auth.routes.js';
import { accountRoutes } from './routes/accounts.routes.js';
import { journalRoutes } from './routes/journal.routes.js';
import { periodRoutes } from './routes/period.routes.js';
import { assetRoutes } from './routes/asset.routes.js';
import { maintenanceRoutes } from './routes/maintenance.routes.js';
import { depreciationRoutes } from './routes/depreciation.routes.js';
import { reportRoutes } from './routes/report.routes.js';
import { postingRoutes } from './routes/posting.routes.js';
import { errandRoutes } from './routes/errand.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // An empty CORS_ORIGIN means same-origin only, which is the deployed shape;
  // the NiceGUI dev server is listed explicitly in .env.
  app.use(cors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: true,
  }));

  if (config.env !== 'test') {
    app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));
  }

  app.get('/api/health', handler(async (_req, res) => {
    const db = await healthcheck();
    res.json({ ok: true, service: 'ledgercore-api', env: config.env, database: db });
  }));

  app.use('/api/auth', authRoutes);

  // Everything past this point requires a valid session.
  const api = express.Router();
  api.use(authenticate);
  api.use(accountRoutes);
  api.use(postingRoutes);
  api.use(journalRoutes);
  api.use(periodRoutes);
  api.use(assetRoutes);
  api.use(maintenanceRoutes);
  api.use(depreciationRoutes);
  api.use(errandRoutes);
  api.use(reportRoutes);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, api };
}
