import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import { CLOSE_TASKS } from '../db/seed/reference.js';
import { notFound, unprocessable, conflict } from '../utils/errors.js';
import { suspenseBalance } from '../services/posting-level.service.js';

export const periodRoutes = Router();

periodRoutes.get(
  '/fiscal-years',
  requirePermission('period.view'),
  handler(async (req, res) => {
    const rows = await query(
      `SELECT f.*, COUNT(p.id) AS period_count,
              SUM(p.status = 'open') AS open_periods,
              SUM(p.status = 'closed') AS closed_periods,
              SUM(p.status = 'locked') AS locked_periods
         FROM fiscal_years f
         LEFT JOIN accounting_periods p ON p.fiscal_year_id = f.id
        WHERE f.org_id = ?
        GROUP BY f.id ORDER BY f.start_date DESC`,
      [req.orgId]
    );
    res.json({ rows, total: rows.length });
  })
);

periodRoutes.get(
  '/periods',
  requirePermission('period.view'),
  validate({
    query: z.object({
      fiscalYearId: z.coerce.number().int().positive().optional(),
      status: z.enum(['open', 'closed', 'locked']).optional(),
    }),
  }),
  handler(async (req, res) => {
    const params = [req.orgId];
    let filter = '';
    if (req.query.fiscalYearId) { filter += ' AND p.fiscal_year_id = ?'; params.push(req.query.fiscalYearId); }
    if (req.query.status) { filter += ' AND p.status = ?'; params.push(req.query.status); }

    const rows = await query(
      `SELECT p.*, f.code AS fiscal_year_code,
              COUNT(DISTINCT e.id) AS entry_count,
              COALESCE(SUM(CASE WHEN e.status = 'posted' THEN e.total_debit END), 0) AS posted_debit,
              COUNT(DISTINCT CASE WHEN e.status = 'draft' THEN e.id END) AS draft_count,
              cl.id AS checklist_id, cl.status AS checklist_status
         FROM accounting_periods p
         JOIN fiscal_years f ON f.id = p.fiscal_year_id
         LEFT JOIN journal_entries e ON e.period_id = p.id
         LEFT JOIN close_checklists cl ON cl.period_id = p.id
        WHERE p.org_id = ?${filter}
        GROUP BY p.id, cl.id
        ORDER BY p.start_date`,
      params
    );
    res.json({ rows, total: rows.length });
  })
);

/**
 * FR-GL-003 period control. A period moves open -> closed -> locked; reopening
 * is a separate permission because it makes a signed-off period writable again.
 */
const TRANSITIONS = {
  close: { from: ['open'], to: 'closed', permission: 'period.close', verb: 'cloturee' },
  lock: { from: ['closed'], to: 'locked', permission: 'period.lock', verb: 'verrouillee' },
  reopen: { from: ['closed', 'locked'], to: 'open', permission: 'period.reopen', verb: 'reouverte' },
};

for (const [action, rule] of Object.entries(TRANSITIONS)) {
  periodRoutes.post(
    `/periods/:id/${action}`,
    requirePermission(rule.permission),
    validate({ body: z.object({ reason: z.string().trim().max(500).optional() }).default({}) }),
    handler(async (req, res) => {
      const result = await transaction(async (tx) => {
        const period = await tx.queryOne(
          'SELECT * FROM accounting_periods WHERE id = ? AND org_id = ? FOR UPDATE',
          [req.params.id, req.orgId]
        );
        if (!period) throw notFound('Accounting period not found.');
        if (!rule.from.includes(period.status)) {
          throw conflict(`Period ${period.code} is ${period.status} and cannot be ${action}ed.`);
        }

        if (action === 'close') {
          // Closing with unposted work would leave the period's figures
          // incomplete the moment it is reported on.
          const drafts = await tx.queryOne(
            "SELECT COUNT(*) AS n FROM journal_entries WHERE period_id = ? AND status = 'draft'",
            [period.id]
          );
          if (Number(drafts.n) > 0) {
            throw unprocessable(
              `${drafts.n} draft entr${Number(drafts.n) === 1 ? 'y' : 'ies'} in ${period.code} must be posted or deleted first.`
            );
          }
          const suspense = await suspenseBalance(tx, req.orgId);
          if (Math.abs(Number(suspense.balance || 0)) >= 0.005) {
            const code = suspense.account?.code || 'suspense';
            throw unprocessable(
              `Resolve suspense items on ${code} before closing (balance ${Number(suspense.balance).toFixed(2)}).`
            );
          }
        }

        if (action === 'lock') {
          // FR-CN-002: sign-off gates the lock. Only tasks flagged blocks_lock
          // hold the period open; the rest are advisory.
          const checklist = await tx.queryOne('SELECT * FROM close_checklists WHERE period_id = ?', [period.id]);
          if (checklist && checklist.status !== 'signed_off') {
            const open = await tx.queryOne(
              `SELECT COUNT(*) AS n FROM close_checklist_items
                WHERE checklist_id = ? AND blocks_lock = 1 AND status NOT IN ('done','skipped')`,
              [checklist.id]
            );
            throw unprocessable(
              `The close checklist for ${period.code} is not signed off (${open.n} blocking task(s) outstanding).`
            );
          }
        }

        await tx.query(
          `UPDATE accounting_periods
              SET status = ?,
                  closed_by = ?, closed_at = ?,
                  locked_by = ?, locked_at = ?
            WHERE id = ?`,
          [
            rule.to,
            rule.to === 'open' ? null : req.user.id,
            rule.to === 'open' ? null : new Date(),
            rule.to === 'locked' ? req.user.id : null,
            rule.to === 'locked' ? new Date() : null,
            period.id,
          ]
        );
        return { ...period, status: rule.to };
      });

      await writeAudit({
        orgId: req.orgId, userId: req.user.id, action: `period_${action}`, entity: 'accounting_period',
        entityId: result.id,
        summary: `Periode ${result.code} ${rule.verb}${req.body.reason ? ` : ${req.body.reason}` : ''}`,
        context: requestContext(req),
      });
      res.json({ period: result });
    })
  );
}

// --- period-end close checklist (FR-CN-002) --------------------------------

periodRoutes.get(
  '/periods/:id/checklist',
  requirePermission('close.view'),
  handler(async (req, res) => {
    const checklist = await queryOne(
      `SELECT cl.*, p.code AS period_code, p.status AS period_status, u.full_name AS signed_off_by_name
         FROM close_checklists cl
         JOIN accounting_periods p ON p.id = cl.period_id
         LEFT JOIN users u ON u.id = cl.signed_off_by
        WHERE cl.period_id = ? AND cl.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!checklist) throw notFound('No close checklist exists for that period.');

    const items = await query(
      `SELECT i.*, u.full_name AS completed_by_name
         FROM close_checklist_items i
         LEFT JOIN users u ON u.id = i.completed_by
        WHERE i.checklist_id = ? ORDER BY i.seq`,
      [checklist.id]
    );
    const done = items.filter((i) => i.status === 'done' || i.status === 'skipped').length;
    res.json({
      checklist,
      items,
      progress: { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 },
    });
  })
);

periodRoutes.post(
  '/periods/:id/checklist',
  requirePermission('close.update'),
  handler(async (req, res) => {
    const result = await transaction(async (tx) => {
      const period = await tx.queryOne(
        'SELECT * FROM accounting_periods WHERE id = ? AND org_id = ? FOR UPDATE',
        [req.params.id, req.orgId]
      );
      if (!period) throw notFound('Period not found.');
      if (period.status === 'locked') throw conflict(`${period.code} is locked.`);

      const existing = await tx.queryOne('SELECT id FROM close_checklists WHERE period_id = ?', [period.id]);
      if (existing) throw conflict(`${period.code} already has a close checklist.`);

      const checklist = await tx.query(
        "INSERT INTO close_checklists (org_id, period_id, status, started_by, started_at) VALUES (?,?,'not_started',?,NOW())",
        [req.orgId, period.id, req.user.id]
      );
      let seq = 10;
      for (const [taskCode, title, , category, mandatory, blocks] of CLOSE_TASKS) {
        await tx.query(
          `INSERT INTO close_checklist_items (checklist_id, seq, task_code, title, category, is_mandatory, blocks_lock)
           VALUES (?,?,?,?,?,?,?)`,
          [checklist.insertId, seq, taskCode, title, category, mandatory, blocks]
        );
        seq += 10;
      }
      return { id: checklist.insertId, period };
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'close_start', entity: 'close_checklist',
      entityId: result.id, summary: `Checklist de cloture ouverte pour ${result.period.code}`,
      context: requestContext(req),
    });
    res.status(201).json({ ok: true, checklistId: result.id, tasks: CLOSE_TASKS.length });
  })
);

periodRoutes.patch(
  '/checklist-items/:id',
  requirePermission('close.update'),
  validate({
    body: z.object({
      status: z.enum(['pending', 'in_progress', 'done', 'skipped', 'blocked']),
      notes: z.string().trim().max(500).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const item = await queryOne(
      `SELECT i.*, cl.org_id, cl.period_id FROM close_checklist_items i
         JOIN close_checklists cl ON cl.id = i.checklist_id
        WHERE i.id = ? AND cl.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!item) throw notFound('Checklist task not found.');

    const finished = req.body.status === 'done' || req.body.status === 'skipped';
    await query(
      `UPDATE close_checklist_items
          SET status = ?, notes = COALESCE(?, notes),
              completed_by = ?, completed_at = ?
        WHERE id = ?`,
      [req.body.status, req.body.notes ?? null, finished ? req.user.id : null, finished ? new Date() : null, item.id]
    );
    await query(
      "UPDATE close_checklists SET status = 'in_progress', started_at = COALESCE(started_at, NOW()) WHERE id = ? AND status = 'not_started'",
      [item.checklist_id]
    );

    const items = await query('SELECT status FROM close_checklist_items WHERE checklist_id = ?', [item.checklist_id]);
    const outstanding = items.filter((i) => i.status !== 'done' && i.status !== 'skipped').length;
    if (outstanding === 0) {
      await query("UPDATE close_checklists SET status = 'completed', completed_at = NOW() WHERE id = ?", [item.checklist_id]);
    }

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'close_task', entity: 'close_checklist_item',
      entityId: item.id, summary: `Tache de cloture "${item.title}" -> ${req.body.status}`,
      context: requestContext(req),
    });
    res.json({ ok: true, outstanding });
  })
);

periodRoutes.post(
  '/periods/:id/checklist/sign-off',
  requirePermission('close.signoff'),
  validate({ body: z.object({ notes: z.string().trim().max(1000).optional() }).default({}) }),
  handler(async (req, res) => {
    const result = await transaction(async (tx) => {
      const checklist = await tx.queryOne(
        `SELECT cl.*, p.code AS period_code FROM close_checklists cl
           JOIN accounting_periods p ON p.id = cl.period_id
          WHERE cl.period_id = ? AND cl.org_id = ? FOR UPDATE`,
        [req.params.id, req.orgId]
      );
      if (!checklist) throw notFound('No close checklist exists for that period.');
      if (checklist.status === 'signed_off') throw conflict('This checklist has already been signed off.');

      const outstanding = await tx.queryOne(
        `SELECT COUNT(*) AS n FROM close_checklist_items
          WHERE checklist_id = ? AND is_mandatory = 1 AND status NOT IN ('done','skipped')`,
        [checklist.id]
      );
      if (Number(outstanding.n) > 0) {
        throw unprocessable(`${outstanding.n} close task(s) are still outstanding.`);
      }

      await tx.query(
        `UPDATE close_checklists
            SET status = 'signed_off', signed_off_by = ?, signed_off_at = NOW(),
                completed_at = COALESCE(completed_at, NOW()), notes = COALESCE(?, notes)
          WHERE id = ?`,
        [req.user.id, req.body.notes ?? null, checklist.id]
      );
      return checklist;
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'close_signoff', entity: 'close_checklist',
      entityId: result.id, summary: `Cloture de ${result.period_code} validee par ${req.user.full_name}`,
      context: requestContext(req),
    });
    res.json({ ok: true, message: `Close for ${result.period_code} signed off.` });
  })
);
