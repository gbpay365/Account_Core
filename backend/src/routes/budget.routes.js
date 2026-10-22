import { Router } from 'express';
import { z } from 'zod';
import { handler, requirePermission, validate } from '../middleware/index.js';
import { query, queryOne } from '../db/pool.js';
import {
  listBudgets,
  getBudgetById,
  createBudget,
  updateBudget,
  approveBudget,
  addBudgetLine,
  updateBudgetLine,
  reSpreadBudget,
  deleteBudgetLine,
  listCommitments,
  createCommitment,
  convertPreCommitment,
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
  createOverrideTicket,
  listOverrideTickets,
  getBudgetVersionComparison,
} from '../services/budget.service.js';
import {
  listDerivationRules,
  createDerivationRule,
  deleteDerivationRule,
  matchDerivationRule,
  listAllocationCycles,
  getAllocationCycleById,
  createAllocationCycle,
  deleteAllocationCycle,
  simulateAllocationRun,
  executeAllocationRun,
  listAllocationRuns,
} from '../services/cost-allocation.service.js';
import {
  listServiceCertifications,
  getServiceCertificationById,
  createServiceCertification,
  listOpenCommitmentsForRollover,
  executeCommitmentRollover,
  listCommitmentRollovers,
  getPtbaTemplateData,
  importPtbaBatch,
  listPtbaImports,
} from '../services/procurement-certification.service.js';
import {
  listPaymentOrders,
  getPaymentOrderById,
  createPaymentOrder,
  submitPaymentOrder,
  reviewVisaPaymentOrder,
  transmitToTreasury,
  disbursePaymentOrder,
  cancelPaymentOrder,
  getPaymentOrderStats,
} from '../services/payment-order.service.js';
import {
  listProcurementPlans,
  getProcurementPlanById,
  createProcurementPlan,
  approveProcurementPlan,
  listProcurementPackages,
  getProcurementPackageById,
  createProcurementPackage,
  updateProcurementPackage,
  awardProcurementPackage,
  listProcurementThresholds,
  getProcurementStats,
} from '../services/procurement-plan.service.js';

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
      warningThresholdPct: z.number().min(1).max(100).default(80),
      blockThresholdPct: z.number().min(1).max(200).default(100),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await createBudget(db, req.orgId, req.body);
    res.status(201).json(result);
  })
);

budgetRoutes.patch(
  '/budgets/:id',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(150).optional(),
      notes: z.string().optional().nullable(),
      warningThresholdPct: z.number().min(1).max(100).optional(),
      blockThresholdPct: z.number().min(1).max(200).optional(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await updateBudget(db, req.orgId, Number(req.params.id), req.body);
    res.json(result);
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
      spreadCurve: z.enum(['equal_quarterly', 'even_monthly', 'front_loaded', 'back_loaded', 'custom']).default('equal_quarterly'),
      warningThresholdPct: z.number().min(1).max(100).optional().nullable(),
      q1Amount: z.number().min(0).optional().nullable(),
      q2Amount: z.number().min(0).optional().nullable(),
      q3Amount: z.number().min(0).optional().nullable(),
      q4Amount: z.number().min(0).optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await addBudgetLine(db, req.orgId, Number(req.params.id), req.body);
    res.status(201).json(result);
  })
);

budgetRoutes.patch(
  '/budgets/:id/lines/:lineId',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      amount: z.number().min(0).optional(),
      controlMode: z.enum(['strict_block', 'warning', 'none']).optional(),
      spreadCurve: z.enum(['equal_quarterly', 'even_monthly', 'front_loaded', 'back_loaded', 'custom']).optional(),
      warningThresholdPct: z.number().min(1).max(100).optional().nullable(),
      q1Amount: z.number().min(0).optional().nullable(),
      q2Amount: z.number().min(0).optional().nullable(),
      q3Amount: z.number().min(0).optional().nullable(),
      q4Amount: z.number().min(0).optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await updateBudgetLine(db, req.orgId, Number(req.params.id), Number(req.params.lineId), req.body);
    res.json(result);
  })
);

budgetRoutes.post(
  '/budgets/:id/re-spread',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      spreadCurve: z.enum(['equal_quarterly', 'even_monthly', 'front_loaded', 'back_loaded']).default('equal_quarterly'),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const result = await reSpreadBudget(db, req.orgId, Number(req.params.id), req.body);
    res.json(result);
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
    const stage = req.query.stage ? String(req.query.stage) : null;
    const assetId = req.query.assetId ? Number(req.query.assetId) : null;

    const rows = await listCommitments(db, req.orgId, { budgetId, budgetLineId, status, stage, assetId });
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
      stage: z.enum(['pre_commitment', 'firm_commitment']).default('firm_commitment'),
      parentCommitmentId: z.number().int().positive().optional().nullable(),
      overrideId: z.number().int().positive().optional().nullable(),
      overrideTicketNumber: z.string().trim().optional().nullable(),
      vendorId: z.number().int().positive().optional().nullable(),
      assetId: z.number().int().positive().optional().nullable(),
      workOrderId: z.number().int().positive().optional().nullable(),
      amount: z.number().positive(),
      committedDate: z.string().optional().nullable(),
      cofinancingKeyId: z.number().int().positive().optional().nullable(),
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
  '/budget-commitments/:id/convert-to-firm',
  requirePermission('budget.manage', 'journal.post'),
  validate({
    body: z.object({
      amount: z.number().positive().optional(),
      vendorId: z.number().int().positive().optional().nullable(),
      description: z.string().trim().optional(),
      committedDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await convertPreCommitment(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(result);
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

// -----------------------------------------------------------------------------
// 6. Controller Emergency Overrides (Dérogations Budgétaires - SAP AVC Overrides)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budget-overrides',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const budgetId = req.query.budgetId ? Number(req.query.budgetId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const rows = await listOverrideTickets(db, req.orgId, { budgetId, status });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.post(
  '/budget-overrides',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      budgetLineId: z.number().int().positive(),
      overrunAmount: z.number().positive(),
      justification: z.string().trim().min(5).max(500),
      validityDays: z.number().int().min(1).max(90).default(14),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await createOverrideTicket(db, req.orgId, req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

// -----------------------------------------------------------------------------
// 7. Multi-Version Comparative Analysis (V0 Initial vs V1 Revised vs Real)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budgets/:id/comparative-analysis',
  requirePermission('budget.view', 'report.financial'),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await getBudgetVersionComparison(db, req.orgId, Number(req.params.id));
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

// -----------------------------------------------------------------------------
// 8. Budget Derivation Rules (FMDERIVE / Dimension Pyramids)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budget-derivations',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const dimensionType = req.query.dimensionType ? String(req.query.dimensionType) : null;
    const isActive = req.query.isActive !== undefined ? Number(req.query.isActive) : null;
    const rows = await listDerivationRules(db, req.orgId, { dimensionType, isActive });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.post(
  '/budget-derivations',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      ruleCode: z.string().trim().min(2).max(50),
      ruleName: z.string().trim().min(2).max(150),
      dimensionType: z.enum(['account', 'cost_center']).default('account'),
      sourcePattern: z.string().trim().min(1).max(50),
      targetAccountId: z.number().int().positive().optional().nullable(),
      targetCostCenterId: z.number().int().positive().optional().nullable(),
      priority: z.number().int().min(1).max(999).default(10),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await createDerivationRule(db, req.orgId, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.delete(
  '/budget-derivations/:id',
  requirePermission('budget.manage'),
  handler(async (req, res) => {
    const db = getDb();
    const result = await deleteDerivationRule(db, req.orgId, Number(req.params.id));
    res.json(result);
  })
);

budgetRoutes.post(
  '/budget-derivations/match',
  requirePermission('budget.view'),
  validate({
    body: z.object({
      accountCode: z.string().optional().nullable(),
      costCenterCode: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    const matched = await matchDerivationRule(db, req.orgId, req.body);
    res.json({ matched: !!matched, derivation: matched });
  })
);

// -----------------------------------------------------------------------------
// 9. Secondary Cost Allocation Cycles (Cycles de Répartition Analytique)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/cost-allocations/cycles',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const rows = await listAllocationCycles(db, req.orgId);
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.get(
  '/cost-allocations/cycles/:id',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const cycle = await getAllocationCycleById(db, req.orgId, Number(req.params.id));
    res.json(cycle);
  })
);

budgetRoutes.post(
  '/cost-allocations/cycles',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(2).max(50),
      name: z.string().trim().min(2).max(150),
      cycleType: z.enum(['assessment', 'distribution']).default('assessment'),
      description: z.string().optional().nullable(),
      segments: z.array(
        z.object({
          segmentName: z.string().trim().min(2).max(150),
          senderCostCenterId: z.number().int().positive(),
          senderAccountId: z.number().int().positive().optional().nullable(),
          method: z.enum(['percentage', 'fixed_amount', 'headcount', 'square_meters']).default('percentage'),
          notes: z.string().optional().nullable(),
          targets: z.array(
            z.object({
              receiverCostCenterId: z.number().int().positive(),
              weightPct: z.number().min(0).max(100).default(0),
              fixedAmount: z.number().min(0).default(0),
            })
          ).min(1),
        })
      ).min(1),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await createAllocationCycle(db, req.orgId, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.delete(
  '/cost-allocations/cycles/:id',
  requirePermission('budget.manage'),
  handler(async (req, res) => {
    const db = getDb();
    const result = await deleteAllocationCycle(db, req.orgId, Number(req.params.id));
    res.json(result);
  })
);

budgetRoutes.post(
  '/cost-allocations/simulate',
  requirePermission('budget.view', 'coa.view'),
  validate({
    body: z.object({
      cycleId: z.number().int().positive(),
      fiscalYearId: z.number().int().positive(),
      periodId: z.number().int().positive().optional().nullable(),
      poolAmountOverride: z.number().positive().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await simulateAllocationRun(db, req.orgId, req.body);
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/cost-allocations/execute',
  requirePermission('budget.manage', 'journal.post'),
  validate({
    body: z.object({
      cycleId: z.number().int().positive(),
      fiscalYearId: z.number().int().positive(),
      periodId: z.number().int().positive().optional().nullable(),
      runDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      poolAmountOverride: z.number().positive().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await executeAllocationRun(db, req.orgId, req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.get(
  '/cost-allocations/runs',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const db = getDb();
    const cycleId = req.query.cycleId ? Number(req.query.cycleId) : null;
    const fiscalYearId = req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null;
    const rows = await listAllocationRuns(db, req.orgId, { cycleId, fiscalYearId });
    res.json({ rows, total: rows.length });
  })
);

// -----------------------------------------------------------------------------
// 10. Phase 4: Service Certifications (Procès-Verbaux de Réception / Service Fait)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budget-certifications',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const commitmentId = req.query.commitmentId ? Number(req.query.commitmentId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const rows = await listServiceCertifications(db, req.orgId, { commitmentId, status });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.get(
  '/budget-certifications/:id',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const cert = await getServiceCertificationById(db, req.orgId, Number(req.params.id));
    res.json(cert);
  })
);

budgetRoutes.post(
  '/budget-certifications',
  requirePermission('budget.manage', 'journal.post'),
  validate({
    body: z.object({
      commitmentId: z.number().int().positive(),
      certificateDate: z.string().optional().nullable(),
      inspectorName: z.string().trim().min(2).max(150),
      certifiedAmount: z.number().positive(),
      conformityRating: z.enum(['full_conformity', 'minor_reserves', 'major_non_conformity']).default('full_conformity'),
      observations: z.string().optional().nullable(),
      status: z.enum(['draft', 'certified', 'rejected', 'liquidated']).default('certified'),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await createServiceCertification(db, req.orgId, req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

// -----------------------------------------------------------------------------
// 11. Phase 4: Open Purchase Order / Firm Commitment Rollover (Year N -> Year N+1)
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budget-commitments/open-for-rollover',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const fiscalYearId = req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null;
    if (!fiscalYearId) {
      return res.status(400).json({ error: 'fiscalYearId is required' });
    }
    const rows = await listOpenCommitmentsForRollover(db, req.orgId, fiscalYearId);
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.post(
  '/budget-commitments/rollover',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      sourceFiscalYearId: z.number().int().positive(),
      targetFiscalYearId: z.number().int().positive(),
      targetBudgetId: z.number().int().positive(),
      sourceCommitmentIds: z.array(z.number().int().positive()).min(1),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await executeCommitmentRollover(db, req.orgId, req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.get(
  '/budget-commitments/rollovers',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const fiscalYearId = req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null;
    const rows = await listCommitmentRollovers(db, req.orgId, { fiscalYearId });
    res.json({ rows, total: rows.length });
  })
);

// -----------------------------------------------------------------------------
// 12. Phase 4: PTBA Mass Formulation & Batch Excel/CSV Importer
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budgets/:id/ptba/template',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const data = await getPtbaTemplateData(db, req.orgId, Number(req.params.id));
    res.json(data);
  })
);

budgetRoutes.post(
  '/budgets/:id/ptba/import',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      lines: z.array(
        z.object({
          accountCode: z.string().optional(),
          account_code: z.string().optional(),
          costCenterCode: z.string().optional(),
          cost_center_code: z.string().optional(),
          programCode: z.string().optional().nullable(),
          program_code: z.string().optional().nullable(),
          budgetType: z.string().optional(),
          budget_type: z.string().optional(),
          initialAmount: z.number().optional(),
          initial_amount: z.number().optional(),
          q1Amount: z.number().optional(),
          q1_amount: z.number().optional(),
          q2Amount: z.number().optional(),
          q2_amount: z.number().optional(),
          q3Amount: z.number().optional(),
          q3_amount: z.number().optional(),
          q4Amount: z.number().optional(),
          q4_amount: z.number().optional(),
          spreadCurve: z.string().optional(),
          spread_curve: z.string().optional(),
          notes: z.string().optional().nullable(),
        })
      ).min(1),
      updateExisting: z.boolean().default(true),
      fileName: z.string().optional().default('ptba_import.csv'),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const result = await importPtbaBatch(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.get(
  '/budgets/:id/ptba/imports',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const rows = await listPtbaImports(db, req.orgId, Number(req.params.id));
    res.json({ rows, total: rows.length });
  })
);

// -----------------------------------------------------------------------------
// Phase 5: Ordonnancement & Mandats de Paiement Routes
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/budget-payment-orders',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const {
      budgetId,
      budgetLineId,
      commitmentId,
      status,
      visaStatus,
      search,
    } = req.query;

    const rows = await listPaymentOrders(db, req.orgId, {
      budgetId: budgetId ? Number(budgetId) : null,
      budgetLineId: budgetLineId ? Number(budgetLineId) : null,
      commitmentId: commitmentId ? Number(commitmentId) : null,
      status: status || null,
      visaStatus: visaStatus || null,
      search: search || null,
    });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.get(
  '/budget-payment-orders/stats',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const { budgetId } = req.query;
    const stats = await getPaymentOrderStats(db, req.orgId, {
      budgetId: budgetId ? Number(budgetId) : null,
    });
    res.json(stats);
  })
);

budgetRoutes.get(
  '/budget-payment-orders/:id',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const order = await getPaymentOrderById(db, req.orgId, Number(req.params.id));
    if (!order) {
      return res.status(404).json({ error: 'Mandat de paiement introuvable' });
    }
    res.json(order);
  })
);

budgetRoutes.post(
  '/budget-payment-orders',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      budget_id: z.number(),
      budget_line_id: z.number(),
      commitment_id: z.number().optional().nullable(),
      certification_id: z.number().optional().nullable(),
      supplier_id: z.number().optional().nullable(),
      beneficiary_name: z.string().min(1),
      beneficiary_bank_details: z.string().optional().nullable(),
      invoice_number: z.string().optional().nullable(),
      invoice_date: z.string().optional().nullable(),
      gross_amount: z.number().positive(),
      tax_withholding_amount: z.number().min(0).default(0),
      warranty_retention_amount: z.number().min(0).default(0),
      penalty_amount: z.number().min(0).default(0),
      currency: z.string().default('XAF'),
      object_description: z.string().min(1),
      mandat_date: z.string().optional(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const order = await createPaymentOrder(db, req.orgId, req.user.id, req.body);
      res.status(201).json(order);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/budget-payment-orders/:id/submit',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const order = await submitPaymentOrder(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(order);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/budget-payment-orders/:id/visa',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      visaStatus: z.enum(['approved', 'rejected']),
      visaNotes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const order = await reviewVisaPaymentOrder(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(order);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/budget-payment-orders/:id/transmit',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const order = await transmitToTreasury(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(order);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/budget-payment-orders/:id/disburse',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      paymentMethod: z.enum(['bank_transfer', 'check', 'cash', 'other']).default('bank_transfer'),
      bankAccountId: z.number().optional().nullable(),
      paymentReference: z.string().optional().nullable(),
      paidAmount: z.number().positive().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const order = await disbursePaymentOrder(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(order);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/budget-payment-orders/:id/cancel',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      reason: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const order = await cancelPaymentOrder(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(order);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

// -----------------------------------------------------------------------------
// Phase 6: Plan de Passation des Marchés (PPM) & Packages Routes
// -----------------------------------------------------------------------------

budgetRoutes.get(
  '/procurement-plans',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const { fiscalYearId, budgetId, status } = req.query;
    const rows = await listProcurementPlans(db, req.orgId, {
      fiscalYearId: fiscalYearId ? Number(fiscalYearId) : null,
      budgetId: budgetId ? Number(budgetId) : null,
      status: status || null,
    });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.get(
  '/procurement-plans/:id',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const plan = await getProcurementPlanById(db, req.orgId, Number(req.params.id));
    if (!plan) {
      return res.status(404).json({ error: 'Plan de passation des marchés introuvable' });
    }
    res.json(plan);
  })
);

budgetRoutes.post(
  '/procurement-plans',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      budget_id: z.number(),
      fiscal_year_id: z.number(),
      title: z.string().min(1),
      donor_approval_reference: z.string().optional().nullable(),
      donor_approval_date: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const plan = await createProcurementPlan(db, req.orgId, req.user.id, req.body);
      res.status(201).json(plan);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/procurement-plans/:id/approve',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      donorApprovalReference: z.string().optional().nullable(),
      donorApprovalDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const plan = await approveProcurementPlan(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(plan);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.get(
  '/procurement-packages',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const { planId, budgetLineId, category, method, status, search } = req.query;
    const rows = await listProcurementPackages(db, req.orgId, {
      planId: planId ? Number(planId) : null,
      budgetLineId: budgetLineId ? Number(budgetLineId) : null,
      category: category || null,
      method: method || null,
      status: status || null,
      search: search || null,
    });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.get(
  '/procurement-packages/:id',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const pkg = await getProcurementPackageById(db, req.orgId, Number(req.params.id));
    if (!pkg) {
      return res.status(404).json({ error: 'Marché/Lot introuvable' });
    }
    res.json(pkg);
  })
);

budgetRoutes.post(
  '/procurement-packages',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      plan_id: z.number(),
      budget_line_id: z.number(),
      package_number: z.string().optional().nullable(),
      description: z.string().min(1),
      procurement_category: z.enum(['works', 'goods', 'consulting_firms', 'individual_consultants', 'non_consulting_services']).default('goods'),
      procurement_method: z.enum(['AON', 'AOI', 'DC', 'ED', 'SFQ', 'QCBS', 'LCS', '3CV']).default('AON'),
      estimated_amount: z.number().positive(),
      planned_launch_date: z.string().optional().nullable(),
      planned_opening_date: z.string().optional().nullable(),
      planned_award_date: z.string().optional().nullable(),
      planned_completion_date: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const pkg = await createProcurementPackage(db, req.orgId, req.user.id, req.body);
      res.status(201).json(pkg);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.put(
  '/procurement-packages/:id',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      description: z.string().optional(),
      procurement_category: z.enum(['works', 'goods', 'consulting_firms', 'individual_consultants', 'non_consulting_services']).optional(),
      procurement_method: z.enum(['AON', 'AOI', 'DC', 'ED', 'SFQ', 'QCBS', 'LCS', '3CV']).optional(),
      estimated_amount: z.number().positive().optional(),
      status: z.enum(['planned', 'tender_launched', 'bids_evaluated', 'awarded', 'contract_signed', 'cancelled']).optional(),
      planned_launch_date: z.string().optional().nullable(),
      actual_launch_date: z.string().optional().nullable(),
      planned_opening_date: z.string().optional().nullable(),
      actual_opening_date: z.string().optional().nullable(),
      planned_award_date: z.string().optional().nullable(),
      actual_award_date: z.string().optional().nullable(),
      planned_completion_date: z.string().optional().nullable(),
      actual_completion_date: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const pkg = await updateProcurementPackage(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(pkg);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.post(
  '/procurement-packages/:id/award',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      supplierId: z.number().optional().nullable(),
      supplierName: z.string().min(1),
      contractNumber: z.string().min(1),
      contractAmount: z.number().positive(),
      contractSignedDate: z.string().optional(),
      createCommitment: z.boolean().default(true),
      notes: z.string().optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const db = getDb();
    try {
      const pkg = await awardProcurementPackage(db, req.orgId, req.user.id, Number(req.params.id), req.body);
      res.json(pkg);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  })
);

budgetRoutes.get(
  '/procurement-thresholds',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const { donorCode, category } = req.query;
    const rows = await listProcurementThresholds(db, req.orgId, {
      donorCode: donorCode || null,
      category: category || null,
    });
    res.json({ rows, total: rows.length });
  })
);

budgetRoutes.get(
  '/procurement-stats',
  requirePermission('budget.view'),
  handler(async (req, res) => {
    const db = getDb();
    const { planId, fiscalYearId } = req.query;
    const stats = await getProcurementStats(db, req.orgId, {
      planId: planId ? Number(planId) : null,
      fiscalYearId: fiscalYearId ? Number(fiscalYearId) : null,
    });
    res.json(stats);
  })
);




