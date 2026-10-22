import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import { query, queryOne } from '../db/pool.js';
import {
  listBudgets,
  getBudgetById,
  createBudget,
  approveBudget,
  addBudgetLine,
  deleteBudgetLine,
  listCommitments,
  createCommitment,
  approveCommitment,
  liquidateCommitment,
  listTransfers,
  createTransfer,
  approveTransfer,
  checkBudgetCeiling,
  getBudgetExecutionReport,
  getUnconsumedBudgetLines,
  carryforwardBudget,
  listCarryforwards,
} from '../services/budget.service.js';

export const budgetRoutes = Router();

function getDb() {
  return { query, queryOne };
}

// -----------------------------------------------------------------------------
// 1. Budget Master & Lines
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budgets',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const fiscalYearId = req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null;
    const rows = await listBudgets(db, req.orgId, { fiscalYearId });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.get(
  '/budgets/:id',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const budget = await getBudgetById(db, req.orgId, Number(req.params.id));
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.json(budget);
  })
);

budgetRoutes.post(
  '/budgets',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      fiscalYearId: z.number().int().positive(),
      code: z.string().trim().min(2).max(30),
      name: z.string().trim().min(2).max(150),
      notes: z.string().optional().nullable(),
      version: z.number().int().min(1).default(1),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await createBudget(db, req.orgId, req.body);
    res.status(201).json(result);
  })
);

budgetRoutes.post(
  '/budgets/:id/approve',
  requirePermission('budget.manage'),
  handler(async (req, res) => {
    const db = getDb();
    const result = await approveBudget(db, req.orgId, Number(req.params.id), req.user.id);
    res.json(result);
  })
);

budgetRoutes.post(
  '/budgets/:id/lines',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      accountId: z.number().int().positive(),
      costCenterId: z.number().int().positive().optional().nullable(),
      programId: z.number().int().positive().optional().nullable(),
      budgetType: z.enum(['opex', 'capex', 'maintenance', 'replacement', 'revenue']).default('opex'),
      amount: z.number().min(0),
      controlMode: z.enum(['strict_block', 'warning', 'none']).default('strict_block'),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await addBudgetLine(db, req.orgId, Number(req.params.id), req.body);
    res.status(201).json(result);
  })
);

budgetRoutes.delete(
  '/budgets/:id/lines/:lineId',
  requirePermission('budget.manage'),
  handler(async (req, res) => {
    const db = getDb();
    const result = await deleteBudgetLine(db, req.orgId, Number(req.params.id), Number(req.params.lineId));
    res.json(result);
  })
);

// -----------------------------------------------------------------------------
// 2. Budget Commitments (Engagements budgétaires)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budget-commitments',
  requirePermission('budget.view', 'journal.view'),
  handler(async (req, res) => {
    const db = getDb();
    const budgetId = req.query.budgetId ? Number(req.query.budgetId) : null;
    const budgetLineId = req.query.budgetLineId ? Number(req.query.budgetLineId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const assetId = req.query.assetId ? Number(req.query.assetId) : null;

    const rows = await listCommitments(db, req.orgId, { budgetId, budgetLineId, status, assetId });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.post(
  '/budget-commitments',
  requirePermission('budget.manage', 'journal.post'),
  validate({
    body: z.object({
      budgetLineId: z.number().int().positive(),
      description: z.string().trim().min(2).max(300),
      vendorId: z.number().int().positive().optional().nullable(),
      assetId: z.number().int().positive().optional().nullable(),
      workOrderId: z.number().int().positive().optional().nullable(),
      amount: z.number().positive(),
      committedDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await createCommitment(db, req.orgId, req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/budget-commitments/:id/approve',
  requirePermission('budget.manage'),
  handler(async (req, res) => {
    const db = getDb();
    const result = await approveCommitment(db, req.orgId, Number(req.params.id), req.user.id);
    res.json(result);
  })
);

budgetRoutes.post(
  '/budget-commitments/:id/liquidate',
  requirePermission('budget.manage', 'journal.post'),
  validate({
    body: z.object({
      journalEntryId: z.number().int().positive().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await liquidateCommitment(db, req.orgId, Number(req.params.id), req.body);
    res.json(result);
  })
);

// -----------------------------------------------------------------------------
// 3. Budget Transfers (Virements de crédits)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budget-transfers',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const budgetId = req.query.budgetId ? Number(req.query.budgetId) : null;
    const rows = await listTransfers(db, req.orgId, { budgetId });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.post(
  '/budget-transfers',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      budgetId: z.number().int().positive(),
      sourceLineId: z.number().int().positive(),
      targetLineId: z.number().int().positive(),
      amount: z.number().positive(),
      reason: z.string().trim().min(3).max(400),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await createTransfer(db, req.orgId, req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/budget-transfers/:id/approve',
  requirePermission('budget.manage'),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await approveTransfer(db, req.orgId, Number(req.params.id), req.user.id);
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

// -----------------------------------------------------------------------------
// 4. Execution Analytics & Checks
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budgets/execution/report',
  requirePermission('budget.view', 'report.financial'),
  handler(async (req, res) => {
    const db = getDb();
    const fiscalYearId = req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null;
    const costCenterId = req.query.costCenterId ? Number(req.query.costCenterId) : null;
    const programId = req.query.programId ? Number(req.query.programId) : null;
    const budgetType = req.query.budgetType ? String(req.query.budgetType) : null;

    const rep = await getBudgetExecutionReport(db, req.orgId, {
      fiscalYearId,
      costCenterId,
      programId,
      budgetType,
    });
    res.json(rep);
  })
);

budgetRoutes.post(
  '/budgets/check-ceiling',
  requirePermission('journal.view', 'budget.view'),
  validate({
    body: z.object({
      lines: z.array(
        z.object({
          accountId: z.number().optional().nullable(),
          accountCode: z.string().optional().nullable(),
          costCenterId: z.number().optional().nullable(),
          programId: z.number().optional().nullable(),
          debit: z.number().min(0).default(0),
        })
      ),
      entryDate: z.string().optional().nullable(),
      fiscalYearId: z.number().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const check = await checkBudgetCeiling(db, req.orgId, req.body);
    res.json(check);
  })
);

// -----------------------------------------------------------------------------
// 5. Budget Carryforward (Report à nouveau budgétaire)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budgets/:id/unconsumed-lines',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const lines = await getUnconsumedBudgetLines(db, req.orgId, Number(req.params.id));
    res.json({ lines, total: lines.length });
  })
);

budgetRoutes.post(
  '/budgets/:id/carryforward',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      targetFiscalYearId: z.number().int().positive(),
      targetBudgetId: z.number().int().positive().optional().nullable(),
      lines: z.array(
        z.object({
          lineId: z.number().int().positive(),
          amount: z.number().min(0).optional(),
        })
      ).optional().default([]),
      reason: z.string().trim().min(3).max(400).optional(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await carryforwardBudget(db, req.orgId, req.user.id, {
        sourceBudgetId: Number(req.params.id),
        targetFiscalYearId: req.body.targetFiscalYearId,
        targetBudgetId: req.body.targetBudgetId || null,
        lines: req.body.lines || [],
        reason: req.body.reason || 'Report à nouveau des crédits budgétaires non consommés',
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.get(
  '/budget-carryforwards',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const budgetId = req.query.budgetId ? Number(req.query.budgetId) : null;
    const fiscalYearId = req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null;
    const rows = await listCarryforwards(db, req.orgId, { budgetId, fiscalYearId });
    res.json({ rows, total: rows.length });
  })
);
