import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import * as sageService from '../services/sage.service.js';
import * as integrationService from '../services/integration.service.js';
import { unauthorized, badRequest } from '../utils/errors.js';

export const sageRoutes = Router();
export const sageIngestRoutes = Router();

// Permission guard for Sage management
const budgetGuard = requirePermission('budget.manage', 'budget.view', 'coa.view');

// ============================================================================
// AUTHENTICATED INTERNAL ROUTES (FOR WEB UI & SAGE TAB)
// ============================================================================

// 0. Supported Sage ERP Flavors & Capabilities
sageRoutes.get(
  '/integrations/sage/flavors',
  budgetGuard,
  handler(async (_req, res) => {
    res.json({
      flavors: sageService.SAGE_ERP_FLAVORS,
      supported_tier_count: Object.keys(sageService.SAGE_ERP_FLAVORS).length,
    });
  })
);

// 1. Branches & Multi-Branch Network Status
sageRoutes.get(
  '/integrations/sage/branches',
  budgetGuard,
  handler(async (req, res) => {
    const result = await sageService.listSageBranches(req.orgId);
    res.json(result);
  })
);

sageRoutes.post(
  '/integrations/sage/branches',
  budgetGuard,
  validate({
    body: z.object({
      code: z.string().min(2).max(20),
      name: z.string().min(2).max(150),
      city: z.string().min(2).max(100),
      branch_type: z.enum(['headquarters', 'hospital', 'clinic', 'dispensary', 'pharmacy']).optional(),
      liaison_account_code: z.string().optional(),
      erp_system: z.string().optional(),
      erp_flavor: z.string().optional(),
      auth_type: z.string().optional(),
      api_endpoint_url: z.string().nullable().optional(),
      api_key_or_token: z.string().nullable().optional(),
      sage_company_id: z.string().nullable().optional(),
      sync_frequency: z.string().optional(),
      budget_allocation_total: z.number().min(0).optional(),
      connector_config: z.any().optional(),
    }),
  }),
  handler(async (req, res) => {
    const branch = await sageService.createSageBranch(req.orgId, req.body);
    res.status(201).json(branch);
  })
);

sageRoutes.put(
  '/integrations/sage/branches/:id',
  requirePermission('budget.manage', 'admin.settings'),
  validate({
    body: z.object({
      erp_system: z.string().optional(),
      erp_flavor: z.string().optional(),
      auth_type: z.string().optional(),
      api_endpoint_url: z.string().nullable().optional(),
      api_key_or_token: z.string().nullable().optional(),
      sage_company_id: z.string().nullable().optional(),
      sync_frequency: z.string().optional(),
      budget_allocation_total: z.number().min(0).optional(),
      connector_config: z.any().optional(),
    }),
  }),
  handler(async (req, res) => {
    const result = await sageService.updateBranchErpConfig(req.orgId, req.params.id, req.body);
    res.json(result);
  })
);

// Diagnostic Health Check for Branch Connector (Sage X3, Intacct, 300, 200, 100)
sageRoutes.post(
  '/integrations/sage/branches/:id/test',
  requirePermission('budget.manage', 'budget.view'),
  handler(async (req, res) => {
    const result = await sageService.testSageConnector(req.orgId, req.params.id);
    res.json(result);
  })
);

sageRoutes.get(
  '/integrations/sage/branches/:id/test',
  budgetGuard,
  handler(async (req, res) => {
    const result = await sageService.testSageConnector(req.orgId, req.params.id);
    res.json(result);
  })
);

sageRoutes.post(
  '/integrations/sage/branches/:id/sync',
  requirePermission('budget.manage', 'budget.view'),
  handler(async (req, res) => {
    const result = await sageService.syncBranchWithSage(req.orgId, req.params.id);
    res.json(result);
  })
);

// 2. Sage Budget Export (PNM, CSV, JSON, Sage X3, Sage Intacct, Sage 300, Sage 200)
sageRoutes.get(
  '/integrations/sage/export/:budgetId',
  budgetGuard,
  handler(async (req, res) => {
    const format = req.query.format || 'pnm';
    const result = await sageService.exportBudgetToSageFormat(req.orgId, req.params.budgetId, format);
    
    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Type', result.mimeType);
      return res.send(result.content);
    }
    
    res.json(result);
  })
);

// 3. Sage Budget Import (Multi-Tier)
sageRoutes.post(
  '/integrations/sage/import',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      budgetId: z.coerce.number().int().positive(),
      content: z.string().min(5),
      dryRun: z.boolean().default(false),
    }),
  }),
  handler(async (req, res) => {
    const result = await sageService.importBudgetFromSage(req.orgId, req.body);
    res.json(result);
  })
);

// 4. Multi-Branch Consolidated Budget Execution Matrix
sageRoutes.get(
  '/integrations/sage/consolidated',
  budgetGuard,
  handler(async (req, res) => {
    const result = await sageService.getConsolidatedBranchBudget(req.orgId, req.query.fiscalYearId);
    res.json(result);
  })
);

// 5. Inter-Branch Budget Allocations
sageRoutes.get(
  '/integrations/sage/allocations',
  budgetGuard,
  handler(async (req, res) => {
    const rows = await sageService.listInterbranchBudgetAllocations(req.orgId);
    res.json({ rows, total: rows.length });
  })
);

sageRoutes.post(
  '/integrations/sage/allocations',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      budget_id: z.coerce.number().int().positive(),
      source_branch_id: z.coerce.number().int().positive(),
      dest_branch_id: z.coerce.number().int().positive(),
      allocation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: z.number().positive(),
      currency: z.string().default('XAF'),
      notes: z.string().nullable().optional(),
      post_liaison_entry: z.boolean().default(false),
    }),
  }),
  handler(async (req, res) => {
    const result = await sageService.createInterbranchBudgetAllocation(req.orgId, req.body, req.user?.id);
    res.status(201).json(result);
  })
);

// 6. Sage Sync Logs
sageRoutes.get(
  '/integrations/sage/logs',
  budgetGuard,
  handler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await sageService.listSageSyncLogs(req.orgId, limit);
    res.json(result);
  })
);

// 7. Developer API Specification
sageRoutes.get(
  '/integrations/sage/spec',
  handler(async (_req, res) => {
    res.json(sageService.getSageIntegrationSpec());
  })
);

// 8. Simulator endpoint for testing Sage commitment or actuals push directly from UI
sageRoutes.post(
  '/integrations/sage/test-payload',
  budgetGuard,
  handler(async (req, res) => {
    const { action, payload } = req.body;
    if (action === 'commitment') {
      const result = await sageService.ingestSageCommitment(req.orgId, payload, { ip: req.ip });
      return res.json(result);
    }
    if (action === 'actuals') {
      const result = await sageService.ingestSageActuals(req.orgId, payload, { ip: req.ip });
      return res.json(result);
    }
    throw badRequest('Action must be "commitment" or "actuals".');
  })
);

// ============================================================================
// PUBLIC / SAGE BRANCH API GATEWAY (AUTHENTICATED VIA API KEY)
// ============================================================================

async function verifySageApiKey(req) {
  const apiKey = req.get('x-api-key') ||
    (req.get('authorization')?.startsWith('Bearer ') ? req.get('authorization').slice(7).trim() : null);

  if (!apiKey) {
    throw unauthorized('Sage API authentication required. Send API key in header "X-API-Key: lch_live_..."');
  }

  return await integrationService.authenticateApiKey(apiKey, req.ip);
}

sageIngestRoutes.get(
  '/spec',
  handler(async (_req, res) => {
    res.json(sageService.getSageIntegrationSpec());
  })
);

sageIngestRoutes.post(
  '/commitments',
  handler(async (req, res) => {
    const client = await verifySageApiKey(req);
    const result = await sageService.ingestSageCommitment(client.org_id, req.body, { ip: req.ip });
    res.status(result.duplicate ? 200 : 201).json(result);
  })
);

sageIngestRoutes.post(
  '/actuals',
  handler(async (req, res) => {
    const client = await verifySageApiKey(req);
    const result = await sageService.ingestSageActuals(client.org_id, req.body, { ip: req.ip });
    res.json(result);
  })
);

sageIngestRoutes.get(
  '/export/:budgetId',
  handler(async (req, res) => {
    const client = await verifySageApiKey(req);
    const format = req.query.format || 'pnm';
    const result = await sageService.exportBudgetToSageFormat(client.org_id, req.params.budgetId, format);
    
    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Type', result.mimeType);
      return res.send(result.content);
    }
    res.json(result);
  })
);

sageIngestRoutes.post(
  '/import',
  handler(async (req, res) => {
    const client = await verifySageApiKey(req);
    const result = await sageService.importBudgetFromSage(client.org_id, req.body);
    res.json(result);
  })
);
