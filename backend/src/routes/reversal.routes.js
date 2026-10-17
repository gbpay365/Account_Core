import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  getDueReversals,
  reverseAccrualEntry,
  processAllDueReversals,
  setAutoReverseDate,
} from '../services/reversal.service.js';
import {
  listRecurringTemplates,
  configureRecurringTemplate,
  processDueRecurringTemplates,
} from '../services/recurring.service.js';
import { actorOf, isoDate, optionalId, boolish } from './helpers.js';

export const reversalRoutes = Router();

// --- Accrual Reversals (Extournes Automatiques) -------------------------------

reversalRoutes.get(
  '/accruals/due-reversals',
  requirePermission('journal.view'),
  validate({
    query: z.object({
      asOfDate: isoDate.optional(),
    }),
  }),
  handler(async (req, res) => {
    const asOfDate = req.query.asOfDate || new Date();
    const rows = await getDueReversals({ query }, req.orgId, asOfDate);
    res.json({ rows, total: rows.length, asOfDate });
  })
);

reversalRoutes.post(
  '/accruals/process-reversals',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      asOfDate: isoDate.optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const asOfDate = req.body.asOfDate || new Date();
    const result = await transaction((tx) =>
      processAllDueReversals(tx, req.orgId, asOfDate, { actor: actorOf(req) })
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'post',
      entity: 'journal_entry',
      entityId: req.orgId,
      summary: `Extournes automatiques traitees : ${result.processedCount} ecritures contre-passees`,
      after: { count: result.processedCount },
      context: requestContext(req),
    });

    res.json(result);
  })
);

reversalRoutes.post(
  '/entries/:id/schedule-reversal',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      autoReverseDate: isoDate.nullable(),
    }),
  }),
  handler(async (req, res) => {
    const entry = await setAutoReverseDate({ query, queryOne }, req.orgId, Number(req.params.id), req.body.autoReverseDate);
    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'update',
      entity: 'journal_entry',
      entityId: req.params.id,
      summary: req.body.autoReverseDate
        ? `Extourne automatique programmee au ${req.body.autoReverseDate} pour l'ecriture ${entry.entry_no}`
        : `Extourne automatique annulee pour l'ecriture ${entry.entry_no}`,
      after: { autoReverseDate: req.body.autoReverseDate },
      context: requestContext(req),
    });
    res.json({ entry });
  })
);

reversalRoutes.post(
  '/entries/:id/reverse-accrual',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      reversalDate: isoDate.optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const reversed = await transaction((tx) =>
      reverseAccrualEntry(tx, req.orgId, Number(req.params.id), {
        reversalDate: req.body.reversalDate,
        actor: actorOf(req),
      })
    );
    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'post',
      entity: 'journal_entry',
      entityId: reversed.id,
      summary: `Extourne immediate de l'ecriture #${req.params.id} -> Nouvelle ecriture ${reversed.entry_no}`,
      after: reversed,
      context: requestContext(req),
    });
    res.json({ entry: reversed });
  })
);

// --- Recurring Subscriptions (Abonnements Récurrents) ------------------------

reversalRoutes.get(
  '/templates',
  requirePermission('journal.view'),
  handler(async (req, res) => {
    const rows = await query(
      `SELECT t.*, j.name AS journal_name,
              (SELECT COUNT(*) FROM posting_template_lines l WHERE l.template_id = t.id) AS line_count
         FROM posting_templates t
         LEFT JOIN journals j ON j.code = t.journal_code AND j.org_id = t.org_id
        WHERE t.org_id = ?
        ORDER BY t.sort_order ASC, t.code ASC`,
      [req.orgId]
    );
    res.json({ rows, total: rows.length });
  })
);

reversalRoutes.get(
  '/templates/recurring',
  requirePermission('journal.view'),
  handler(async (req, res) => {
    const rows = await listRecurringTemplates({ query }, req.orgId);
    res.json({ rows, total: rows.length });
  })
);

reversalRoutes.post(
  '/templates/:id/recurring-schedule',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      isRecurring: boolish.default(true),
      frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']).default('monthly'),
      dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
      startDate: isoDate.optional(),
      endDate: isoDate.optional().nullable(),
      autoPost: boolish.default(false),
    }),
  }),
  handler(async (req, res) => {
    const updated = await configureRecurringTemplate({ query, queryOne }, req.orgId, Number(req.params.id), req.body);
    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'update',
      entity: 'posting_template',
      entityId: req.params.id,
      summary: `Abonnement recurrent configure : ${updated.code} (${req.body.frequency})`,
      after: updated,
      context: requestContext(req),
    });
    res.json({ template: updated });
  })
);

reversalRoutes.post(
  '/templates/recurring/process',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      asOfDate: isoDate.optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const asOfDate = req.body.asOfDate || new Date();
    const result = await transaction((tx) =>
      processDueRecurringTemplates(tx, req.orgId, asOfDate, { actor: actorOf(req) })
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'post',
      entity: 'posting_template',
      entityId: req.orgId,
      summary: `Generation des ecritures recurrentes d'abonnement : ${result.processedCount} ecritures generees`,
      after: { count: result.processedCount },
      context: requestContext(req),
    });

    res.json(result);
  })
);
