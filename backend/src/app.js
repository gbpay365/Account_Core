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
import { subledgerRoutes } from './routes/subledger.routes.js';
import { reversalRoutes } from './routes/reversal.routes.js';
import { fxRevaluationRoutes } from './routes/fx-revaluation.routes.js';
import { governanceRoutes } from './routes/governance.routes.js';
import { bankRoutes } from './routes/bank.routes.js';
import { withholdingRoutes } from './routes/withholding.routes.js';
import { dsfRoutes } from './routes/dsf.routes.js';
import { fiscalDepreciationRoutes } from './routes/fiscal-depreciation.routes.js';
import { assetInventoryRoutes } from './routes/asset-inventory.routes.js';
import { donorProjectRoutes } from './routes/donor-project.routes.js';
import { cashRegisterRoutes } from './routes/cash-register.routes.js';
import { payrollRoutes } from './routes/payroll.routes.js';
import { dfeRoutes } from './routes/dfe.routes.js';
import { interbranchRoutes } from './routes/interbranch.routes.js';
import { leaseRoutes } from './routes/lease.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { budgetRoutes } from './routes/budget.routes.js';
import { integrationRoutes, integrationIngestRoutes } from './routes/integration.routes.js';
import * as dfeService from './services/dfe.service.js';
import { renderLandingPage } from './views/landing.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
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

  // Root route — dashboard / landing page for browsers, structured JSON for API clients
  app.get('/', (req, res) => {
    if (req.accepts('html')) {
      return res.type('html').send(renderLandingPage({ env: config.env }));
    }
    res.json({
      service: 'ledgercore-health-api',
      name: 'LedgerCore Health — Hospital Core Accounting & Asset Management',
      status: 'online',
      version: '1.0.0',
      standards: ['SYSCOHADA (AUDCIF)', 'IFRS (IAS 16, IAS 36, IFRS 16)'],
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/login',
        reportsCatalog: '/api/reports/catalog',
        dfeVerify: '/api/dfe/verify/:token',
      },
    });
  });

  app.get('/api/health', handler(async (_req, res) => {
    const db = await healthcheck();
    res.json({ ok: true, service: 'ledgercore-api', env: config.env, database: db, version: '1.2.4-budgeting' });
  }));

  app.use('/api/auth', authRoutes);

  app.get('/api/dfe/verify/:token', handler(async (req, res) => {
    const result = await dfeService.verifyDfeToken(req.params.token);
    res.json(result);
  }));

  // Public / external gateway for systems like HMS, POS, Billing using API Key
  app.use('/api/integrations', integrationIngestRoutes);

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
  api.use(subledgerRoutes);
  api.use(reversalRoutes);
  api.use(fxRevaluationRoutes);
  api.use(governanceRoutes);
  api.use(budgetRoutes);
  api.use(bankRoutes);
  api.use(withholdingRoutes);
  api.use(dsfRoutes);
  api.use(fiscalDepreciationRoutes);
  api.use(assetInventoryRoutes);
  api.use(donorProjectRoutes);
  api.use(cashRegisterRoutes);
  api.use(payrollRoutes);
  api.use(dfeRoutes);
  api.use(interbranchRoutes);
  api.use(leaseRoutes);
  api.use(adminRoutes);
  api.use(integrationRoutes);
  api.use(reportRoutes);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, api };
}
