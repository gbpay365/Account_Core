import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  listFundingPrograms,
  listAnalyticalActivities,
  checkBudgetCeiling,
  getBudgetExecutionReport,
} from '../services/budget.service.js';
import {
  sealPostedEntries,
  verifyHashChain,
  getAuditSealStatus,
} from '../services/audit-seal.service.js';
import {
  generateFecData,
  exportFecString,
} from '../services/fec.service.js';
import { actorOf, isoDate, optionalId } from './helpers.js';

export const governanceRoutes = Router();

// --- Multi-Axial Analytical & Budget Controls ---------------------------------

governanceRoutes.get(
  '/analytical/programs',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const rows = await listFundingPrograms({ query }, req.orgId);
    res.json({ rows, total: rows.length });
  })
);

governanceRoutes.post(
  '/analytical/programs',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(2).max(30),
      name: z.string().trim().min(2).max(200),
      donorName: z.string().trim().max(150).optional().nullable(),
      budgetAmount: z.number().min(0).default(0),
      startDate: isoDate.optional().nullable(),
      endDate: isoDate.optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const { code, name, donorName, budgetAmount, startDate, endDate } = req.body;
    const result = await query(
      `INSERT INTO funding_programs (org_id, code, name, donor_name, budget_amount, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.orgId, code, name, donorName || null, budgetAmount, startDate || null, endDate || null]
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'create',
      entity: 'funding_program',
      entityId: result.insertId,
      summary: `Programme de financement analytique créé : ${code} — ${name}`,
      after: req.body,
      context: requestContext(req),
    });

    res.status(201).json({ id: result.insertId, code, name });
  })
);

governanceRoutes.get(
  '/analytical/activities',
  requirePermission('budget.view', 'coa.view'),
  handler(async (req, res) => {
    const programId = req.query.programId ? Number(req.query.programId) : null;
    const rows = await listAnalyticalActivities({ query }, req.orgId, programId);
    res.json({ rows, total: rows.length });
  })
);

governanceRoutes.post(
  '/analytical/activities',
  requirePermission('budget.manage'),
  validate({
    body: z.object({
      programId: optionalId.nullable(),
      code: z.string().trim().min(2).max(30),
      name: z.string().trim().min(2).max(200),
    }),
  }),
  handler(async (req, res) => {
    const { programId, code, name } = req.body;
    const result = await query(
      `INSERT INTO analytical_activities (org_id, program_id, code, name)
       VALUES (?, ?, ?, ?)`,
      [req.orgId, programId || null, code, name]
    );

    res.status(201).json({ id: result.insertId, code, name });
  })
);

governanceRoutes.post(
  '/budget/check',
  requirePermission('journal.view', 'budget.view'),
  validate({
    body: z.object({
      entryDate: isoDate.optional(),
      fiscalYearId: optionalId.optional(),
      lines: z.array(
        z.object({
          accountId: optionalId.optional(),
          accountCode: z.string().optional(),
          costCenterId: optionalId.optional().nullable(),
          programId: optionalId.optional().nullable(),
          debit: z.number().min(0).default(0),
        })
      ),
    }),
  }),
  handler(async (req, res) => {
    const check = await checkBudgetCeiling({ query, queryOne }, req.orgId, req.body);
    res.json(check);
  })
);

governanceRoutes.get(
  '/budget/execution',
  requirePermission('budget.view', 'report.financial'),
  validate({
    query: z.object({
      fiscalYearId: z.coerce.number().int().positive(),
      costCenterId: optionalId.optional(),
      programId: optionalId.optional(),
    }),
  }),
  handler(async (req, res) => {
    const rep = await getBudgetExecutionReport({ query }, req.orgId, {
      fiscalYearId: Number(req.query.fiscalYearId),
      costCenterId: req.query.costCenterId ? Number(req.query.costCenterId) : null,
      programId: req.query.programId ? Number(req.query.programId) : null,
    });
    res.json(rep);
  })
);

// --- Cryptographic Audit Seal (SHA-256 Chaining) ------------------------------

governanceRoutes.get(
  '/audit/seal-status',
  requirePermission('admin.audit', 'journal.view'),
  handler(async (req, res) => {
    const status = await getAuditSealStatus({ queryOne }, req.orgId);
    res.json(status);
  })
);

governanceRoutes.post(
  '/audit/seal',
  requirePermission('journal.post', 'period.close'),
  validate({
    body: z.object({
      periodId: optionalId.optional(),
      fiscalYearId: optionalId.optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      sealPostedEntries(tx, req.orgId, {
        actor: actorOf(req),
        periodId: req.body.periodId,
        fiscalYearId: req.body.fiscalYearId,
      })
    );

    if (result.sealedCount > 0) {
      await writeAudit({
        orgId: req.orgId,
        userId: req.user.id,
        action: 'seal',
        entity: 'journal_entry',
        entityId: req.orgId,
        summary: `Sceau cryptographique appose : ${result.sealedCount} ecritures scellees (Sceau final : ${result.finalSealHash.slice(0, 16)}...)`,
        after: result,
        context: requestContext(req),
      });
    }

    res.json(result);
  })
);

governanceRoutes.get(
  '/audit/verify-chain',
  requirePermission('admin.audit', 'report.financial'),
  handler(async (req, res) => {
    const report = await verifyHashChain({ query, queryOne }, req.orgId);
    res.json(report);
  })
);

// --- FEC OHADA (Fichier des Écritures Comptables) -----------------------------

governanceRoutes.get(
  '/reports/fec-ohada/preview',
  requirePermission('report.financial', 'report.export'),
  validate({
    query: z.object({
      fiscalYearId: optionalId.optional(),
      periodId: optionalId.optional(),
    }),
  }),
  handler(async (req, res) => {
    const data = await generateFecData({ query, queryOne }, req.orgId, {
      fiscalYearId: req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null,
      periodId: req.query.periodId ? Number(req.query.periodId) : null,
    });

    res.json({
      fileName: data.fileName,
      totalLines: data.totalLines,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
      balanced: data.balanced,
      previewRows: data.rows.slice(0, 50),
    });
  })
);

governanceRoutes.get(
  '/reports/fec-ohada',
  requirePermission('report.financial', 'report.export'),
  validate({
    query: z.object({
      fiscalYearId: optionalId.optional(),
      periodId: optionalId.optional(),
      delimiter: z.enum(['tab', 'pipe']).default('tab'),
      decimalSep: z.enum(['comma', 'dot']).default('comma'),
    }),
  }),
  handler(async (req, res) => {
    const delimiter = req.query.delimiter === 'pipe' ? '|' : '\t';
    const decimalSep = req.query.decimalSep === 'dot' ? '.' : ',';

    const data = await generateFecData({ query, queryOne }, req.orgId, {
      fiscalYearId: req.query.fiscalYearId ? Number(req.query.fiscalYearId) : null,
      periodId: req.query.periodId ? Number(req.query.periodId) : null,
    });

    const fileContent = exportFecString(data, { delimiter, decimalSep });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${data.fileName}"`);
    res.send(fileContent);
  })
);

// --- Admin & Organization Framework Governance --------------------------------

governanceRoutes.get(
  '/admin/organization',
  requirePermission('coa.view', 'admin.audit', 'journal.view'),
  handler(async (req, res) => {
    const org = await queryOne(
      `SELECT id, code, name, legal_name, org_type, country_code,
              functional_currency, presentation_currency, reporting_tier,
              frameworks, tax_id, vat_number, address, city, phone, email
         FROM organizations WHERE id = ?`,
      [req.orgId]
    );
    res.json(org);
  })
);

governanceRoutes.patch(
  '/admin/organization',
  requirePermission('coa.manage', 'admin.audit'),
  validate({
    body: z.object({
      frameworks: z.enum(['ohada', 'ifrs', 'ohada,ifrs']),
      reporting_tier: z.enum(['normal', 'allege', 'smt']).optional(),
    }),
  }),
  handler(async (req, res) => {
    const { frameworks, reporting_tier } = req.body;
    await query(
      `UPDATE organizations
          SET frameworks = ?,
              reporting_tier = COALESCE(?, reporting_tier)
        WHERE id = ?`,
      [frameworks, reporting_tier || null, req.orgId]
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'update',
      entity: 'organization',
      entityId: req.orgId,
      summary: `Référentiel comptable organisation mis à jour : ${frameworks.toUpperCase()}`,
      after: req.body,
      context: requestContext(req),
    });

    const updatedOrg = await queryOne(
      `SELECT id, code, name, legal_name, org_type, country_code,
              functional_currency, presentation_currency, reporting_tier,
              frameworks, tax_id, vat_number, address, city, phone, email
         FROM organizations WHERE id = ?`,
      [req.orgId]
    );

    res.json({ message: 'Organization framework updated successfully', organization: updatedOrg });
  })
);

