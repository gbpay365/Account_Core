import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  simulateFxRevaluation,
  createFxRevaluationRun,
  postFxRevaluationRun,
} from '../services/fx-revaluation.service.js';
import { actorOf, isoDate, optionalId } from './helpers.js';

export const fxRevaluationRoutes = Router();

fxRevaluationRoutes.post(
  '/periods/:id/fx-revaluation/simulate',
  requirePermission('journal.view', 'report.financial'),
  handler(async (req, res) => {
    const sim = await simulateFxRevaluation({ query, queryOne }, req.orgId, Number(req.params.id));
    res.json(sim);
  })
);

fxRevaluationRoutes.post(
  '/periods/:id/fx-revaluation/runs',
  requirePermission('journal.post'),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      createFxRevaluationRun(tx, req.orgId, Number(req.params.id), { actor: actorOf(req) })
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'create',
      entity: 'currency_revaluation_run',
      entityId: result.runId,
      summary: `Simulation de reevaluation devises preparee pour la periode #${req.params.id}`,
      after: result.totals,
      context: requestContext(req),
    });

    res.status(201).json(result);
  })
);

fxRevaluationRoutes.post(
  '/fx-revaluation/runs/:id/post',
  requirePermission('journal.post'),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      postFxRevaluationRun(tx, req.orgId, Number(req.params.id), { actor: actorOf(req) })
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'post',
      entity: 'currency_revaluation_run',
      entityId: req.params.id,
      summary: `Reevaluation devises validee pour la periode ${result.periodCode} (Pertes latentes: ${result.totals.totalLatentLoss}, Gains latents: ${result.totals.totalLatentGain})`,
      after: result.totals,
      context: requestContext(req),
    });

    res.json(result);
  })
);

fxRevaluationRoutes.get(
  '/fx-revaluation/runs',
  requirePermission('journal.view'),
  handler(async (req, res) => {
    const rows = await query(
      `SELECT r.*, p.code AS period_code, p.end_date AS period_end_date,
              u.full_name AS run_by_name,
              e.entry_no AS conversion_entry_no,
              pe.entry_no AS provision_entry_no
         FROM currency_revaluation_runs r
         JOIN accounting_periods p ON p.id = r.period_id
         LEFT JOIN users u ON u.id = r.run_by
         LEFT JOIN journal_entries e ON e.id = r.entry_id
         LEFT JOIN journal_entries pe ON pe.id = r.provision_entry_id
        WHERE r.org_id = ?
        ORDER BY r.id DESC`,
      [req.orgId]
    );
    res.json({ rows, total: rows.length });
  })
);

fxRevaluationRoutes.get(
  '/fx-revaluation/runs/:id',
  requirePermission('journal.view'),
  handler(async (req, res) => {
    const run = await queryOne(
      `SELECT r.*, p.code AS period_code, p.end_date AS period_end_date,
              u.full_name AS run_by_name,
              e.entry_no AS conversion_entry_no,
              pe.entry_no AS provision_entry_no
         FROM currency_revaluation_runs r
         JOIN accounting_periods p ON p.id = r.period_id
         LEFT JOIN users u ON u.id = r.run_by
         LEFT JOIN journal_entries e ON e.id = r.entry_id
         LEFT JOIN journal_entries pe ON pe.id = r.provision_entry_id
        WHERE r.id = ? AND r.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!run) return res.status(404).json({ error: 'Revaluation run not found.' });

    const lines = await query(
      `SELECT l.*, a.code AS account_code, a.name AS account_name,
              s.code AS subledger_code, s.name AS subledger_name
         FROM currency_revaluation_lines l
         JOIN accounts a ON a.id = l.account_id
         LEFT JOIN subledger_accounts s ON s.id = l.subledger_id
        WHERE l.run_id = ?
        ORDER BY l.id ASC`,
      [req.params.id]
    );

    res.json({ run, lines });
  })
);
