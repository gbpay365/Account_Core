import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import { query, queryOne } from '../db/pool.js';
import {
  listProjects,
  getProjectDetails,
  createProject,
  addCategory,
  getDRFDetails,
  createDRF,
} from '../services/donor-project.service.js';
import {
  listCofinancingKeys,
  getCofinancingKeyById,
  createCofinancingKey,
  updateCofinancingKey,
  simulateCofinancingSplit,
  executeCofinancingSplit,
  listCofinancingSplits,
  getCofinancingStats,
} from '../services/donor-cofinancing.service.js';
import { seedPhase3 } from '../db/seed_phase3.js';

export const donorProjectRoutes = Router();

function getDb() {
  return { query, queryOne };
}

donorProjectRoutes.get(
  '/donor-projects',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    let rows = await listProjects(req.orgId);
    if (!rows || rows.length === 0) {
      await seedPhase3(req.orgId).catch(console.error);
      rows = await listProjects(req.orgId);
    }
    res.json({ rows, total: rows.length });
  })
);

donorProjectRoutes.get(
  '/donor-projects/:id',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const data = await getProjectDetails(req.orgId, Number(req.params.id));
    res.json(data);
  })
);

donorProjectRoutes.post(
  '/donor-projects',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      donor_name: z.string().trim().min(2),
      project_code: z.string().trim().min(2),
      project_name: z.string().trim().min(2),
      agreement_ref: z.string().optional().nullable(),
      currency: z.string().default('XAF'),
      total_budget: z.number().min(0),
      financing_rate: z.number().min(0).max(100).default(100.0),
      designated_bank_account_id: z.number().optional().nullable(),
      start_date: z.string(),
      end_date: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await createProject(req.orgId, req.body);
    res.status(201).json(result);
  })
);

donorProjectRoutes.post(
  '/donor-projects/:id/categories',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      category_code: z.string().trim().min(2),
      name: z.string().trim().min(2),
      budget_allocated: z.number().min(0).default(0),
      eligible_rate: z.number().min(0).max(100).default(100.0),
    }),
  }),
  handler(async (req, res) => {
    const result = await addCategory(req.orgId, Number(req.params.id), req.body);
    res.status(201).json(result);
  })
);

donorProjectRoutes.get(
  '/donor-projects/drfs/:drfId',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const data = await getDRFDetails(req.orgId, Number(req.params.drfId));
    res.json(data);
  })
);

donorProjectRoutes.post(
  '/donor-projects/:id/drfs',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      drf_number: z.string().trim().min(2),
      request_date: z.string(),
      period_start: z.string(),
      period_end: z.string(),
      initial_advance: z.number().min(0).default(0),
      designated_account_balance: z.number().min(0).default(0),
      notes: z.string().optional().nullable(),
      items: z.array(
        z.object({
          category_id: z.number(),
          voucher_ref: z.string(),
          voucher_date: z.string(),
          beneficiary_name: z.string(),
          description: z.string(),
          total_amount: z.number().min(0),
          currency: z.string().optional(),
          eligible_rate: z.number().min(0).max(100).default(100.0),
          notes: z.string().optional().nullable(),
        })
      ),
    }),
  }),
  handler(async (req, res) => {
    const result = await createDRF(req.orgId, Number(req.params.id), req.body);
    res.status(201).json(result);
  })
);

// -----------------------------------------------------------------------------
// Phase 7: Multi-Donor Co-Financing Keys & Expense Proration (TOMPRO Standard)
// -----------------------------------------------------------------------------

donorProjectRoutes.get(
  '/donor-cofinancing/keys',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const rows = await listCofinancingKeys(db, req.orgId);
    res.json({ rows, total: rows.length });
  })
);

donorProjectRoutes.get(
  '/donor-cofinancing/keys/:id',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const key = await getCofinancingKeyById(db, req.orgId, Number(req.params.id));
    if (!key) {
      return res.status(404).json({ error: 'Clé de co-financement introuvable' });
    }
    res.json(key);
  })
);

donorProjectRoutes.post(
  '/donor-cofinancing/keys',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(2),
      name: z.string().trim().min(2),
      description: z.string().optional().nullable(),
      lines: z.array(
        z.object({
          project_id: z.number(),
          category_id: z.number().optional().nullable(),
          percentage: z.number().min(0.01).max(100.0),
          notes: z.string().optional().nullable(),
        })
      ).min(1),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const key = await createCofinancingKey(db, req.orgId, req.body);
      res.status(201).json(key);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

donorProjectRoutes.put(
  '/donor-cofinancing/keys/:id',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional().nullable(),
      is_active: z.boolean().optional(),
      lines: z.array(
        z.object({
          project_id: z.number(),
          category_id: z.number().optional().nullable(),
          percentage: z.number().min(0.01).max(100.0),
          notes: z.string().optional().nullable(),
        })
      ).optional(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const key = await updateCofinancingKey(db, req.orgId, Number(req.params.id), req.body);
      res.json(key);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

donorProjectRoutes.post(
  '/donor-cofinancing/simulate',
  requirePermission('journal.view', 'budget.view'),
  validate({
    body: z.object({
      keyId: z.number(),
      amount: z.number().positive(),
      currency: z.string().default('XAF'),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const sim = await simulateCofinancingSplit(db, req.orgId, req.body);
      res.json(sim);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

donorProjectRoutes.post(
  '/donor-cofinancing/splits',
  requirePermission('journal.post', 'budget.manage'),
  validate({
    body: z.object({
      keyId: z.number(),
      sourceAmount: z.number().positive(),
      currency: z.string().default('XAF'),
      commitmentId: z.number().optional().nullable(),
      paymentOrderId: z.number().optional().nullable(),
      voucherRef: z.string().optional().nullable(),
      stage: z.enum(['commitment', 'mandat', 'disbursed']).default('commitment'),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await executeCofinancingSplit(db, req.orgId, req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

donorProjectRoutes.get(
  '/donor-cofinancing/splits',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const { keyId, projectId, commitmentId, paymentOrderId, stage } = req.query;
    const rows = await listCofinancingSplits(db, req.orgId, {
      keyId: keyId ? Number(keyId) : null,
      projectId: projectId ? Number(projectId) : null,
      commitmentId: commitmentId ? Number(commitmentId) : null,
      paymentOrderId: paymentOrderId ? Number(paymentOrderId) : null,
      stage: stage ? String(stage) : null,
    });
    res.json({ rows, total: rows.length });
  })
);

donorProjectRoutes.get(
  '/donor-cofinancing/stats',
  requirePermission('journal.view', 'budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const stats = await getCofinancingStats(db, req.orgId);
    res.json(stats);
  })
);

