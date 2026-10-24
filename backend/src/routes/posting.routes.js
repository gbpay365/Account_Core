import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  DEFAULT_POSTING_LENGTH, ensureDefaultChild, getPostingLength, getPostingSettings,
  isPostingLengthLocked, listPostableChildren, nextDefaultChildCode, suspenseBalance,
} from '../services/posting-level.service.js';
import { proposeCounterLines } from '../services/proposal.service.js';
import { unprocessable, badRequest } from '../utils/errors.js';
import { boolish, optionalId } from './helpers.js';

export const postingRoutes = Router();

postingRoutes.get(
  '/posting/settings',
  requirePermission('coa.view', 'journal.view'),
  handler(async (req, res) => {
    const settings = await getPostingSettings({ query, queryOne }, req.orgId);
    const queue = await suspenseBalance({ query, queryOne }, req.orgId);
    res.json({ ...settings, suspense_queue: queue });
  })
);

postingRoutes.patch(
  '/posting/settings',
  requirePermission('admin.settings', 'coa.manage'),
  validate({
    body: z.object({
      posting_length: z.coerce.number().int().min(2).max(8).optional(),
      suspense_account: z.string().trim().min(2).max(8).optional(),
      history_suggestions: boolish.optional(),
    }),
  }),
  handler(async (req, res) => {
    if (req.body.posting_length !== undefined) {
      const locked = await isPostingLengthLocked({ query, queryOne }, req.orgId);
      if (locked) {
        await writeAudit({
          orgId: req.orgId, userId: req.user.id, action: 'update', entity: 'setting',
          summary: `Posting length change to ${req.body.posting_length} refused — movements already exist`,
          context: requestContext(req),
        });
        throw unprocessable('The posting length is locked because journal movements already exist.');
      }
      await query(
        `INSERT INTO settings (org_id, setting_key, value_text, data_type, category, description)
         VALUES (?, 'accounting.posting_length', ?, 'int', 'accounting', 'FR-PL-001 posting length')
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [req.orgId, String(req.body.posting_length)]
      );
    }
    if (req.body.suspense_account) {
      await query(
        `INSERT INTO settings (org_id, setting_key, value_text, data_type, category, description)
         VALUES (?, 'accounting.suspense_account', ?, 'string', 'accounting', 'FR-DE-010 suspense account')
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [req.orgId, req.body.suspense_account]
      );
    }
    if (req.body.history_suggestions !== undefined) {
      await query(
        `INSERT INTO settings (org_id, setting_key, value_text, data_type, category, description)
         VALUES (?, 'accounting.history_suggestions', ?, 'bool', 'accounting', 'FR-DE-009 history suggestions')
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [req.orgId, req.body.history_suggestions ? 'true' : 'false']
      );
    }
    res.json(await getPostingSettings({ query, queryOne }, req.orgId));
  })
);

postingRoutes.get(
  '/posting/templates',
  requirePermission('journal.view', 'coa.view'),
  handler(async (req, res) => {
    const rows = await query(
      `SELECT t.*, COUNT(l.id) AS line_count
         FROM posting_templates t
         LEFT JOIN posting_template_lines l ON l.template_id = t.id
        WHERE t.org_id = ? AND t.is_active = 1
        GROUP BY t.id
        ORDER BY t.sort_order, t.code`,
      [req.orgId]
    );
    const lines = await query(
      `SELECT l.*
         FROM posting_template_lines l
         JOIN posting_templates t ON l.template_id = t.id
        WHERE t.org_id = ? AND t.is_active = 1
        ORDER BY l.template_id, l.line_no`,
      [req.orgId]
    );
    const linesByTpl = {};
    for (const line of lines) {
      if (!linesByTpl[line.template_id]) linesByTpl[line.template_id] = [];
      linesByTpl[line.template_id].push(line);
    }
    for (const r of rows) {
      r.lines = linesByTpl[r.id] || [];
    }
    res.json({ rows, total: rows.length });
  })
);

postingRoutes.post(
  '/posting/templates',
  requirePermission('journal.create', 'coa.manage', 'admin.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(1).max(40).toUpperCase(),
      name: z.string().trim().min(1).max(150),
      nameEn: z.string().trim().max(150).optional().nullable(),
      transactionType: z.string().trim().min(1).max(40).toLowerCase().optional().nullable(),
      journalCode: z.string().trim().max(10).optional().nullable(),
      counterpartAccountId: optionalId.optional().nullable(),
      side: z.enum(['credit', 'debit']).default('credit'),
    }),
  }),
  handler(async (req, res) => {
    const { code, name, nameEn, journalCode, counterpartAccountId, side } = req.body;
    const transactionType = req.body.transactionType || code.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const existing = await queryOne('SELECT id FROM posting_templates WHERE org_id = ? AND (code = ? OR transaction_type = ?)', [req.orgId, code, transactionType]);
    if (existing) throw badRequest(`A template with code or transaction type '${code}' already exists.`);

    const created = await transaction(async (tx) => {
      const res = await tx.query(
        `INSERT INTO posting_templates (org_id, code, name, name_en, transaction_type, journal_code, is_active, is_recurring, auto_post, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 50)`,
        [req.orgId, code, name, nameEn || null, transactionType, journalCode || null]
      );
      const templateId = res.insertId;
      if (counterpartAccountId) {
        const acct = await tx.queryOne('SELECT code FROM accounts WHERE id = ?', [counterpartAccountId]);
        await tx.query(
          `INSERT INTO posting_template_lines (template_id, line_no, side, account_rule, amount_formula, is_proposed, note)
           VALUES (?, 1, ?, ?, 'gross', 1, ?)`,
          [templateId, side, acct ? acct.code : 'suspense', `Auto-balancing line for ${name}`]
        );
      }
      return tx.queryOne('SELECT * FROM posting_templates WHERE id = ?', [templateId]);
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'posting_template', entityId: created.id,
      summary: `Created posting template ${created.code} (${created.name})`,
      after: created, context: requestContext(req),
    });
    res.status(201).json({ template: created });
  })
);

const proposeLine = z.object({
  accountId: z.coerce.number().int().positive().optional(),
  accountCode: z.string().trim().optional(),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  partnerType: z.enum(['none', 'supplier', 'customer', 'employee']).default('none'),
  partnerId: z.coerce.number().int().positive().optional().nullable(),
});

postingRoutes.post(
  '/entries/propose',
  requirePermission('journal.create'),
  validate({
    body: z.object({
      transactionType: z.string().trim().max(40).optional().nullable(),
      journalCode: z.string().trim().max(10).optional().nullable(),
      lines: z.array(proposeLine).min(1),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) => proposeCounterLines(tx, req.orgId, req.body));
    res.json(result);
  })
);

postingRoutes.get(
  '/posting/suspense',
  requirePermission('journal.view', 'period.view'),
  handler(async (req, res) => {
    res.json(await suspenseBalance({ query, queryOne }, req.orgId));
  })
);

postingRoutes.get(
  '/partners',
  requirePermission('journal.view', 'coa.view', 'supplier.view'),
  validate({ query: z.object({ type: z.enum(['supplier', 'customer', 'all']).default('supplier') }) }),
  handler(async (req, res) => {
    if (req.query.type === 'all') {
      const [suppliers, customers] = await Promise.all([
        query(
          `SELECT id, code, name, account_id, default_account_id, vat_code, 'supplier' AS partner_type
             FROM suppliers WHERE org_id = ? AND is_active = 1 ORDER BY name`,
          [req.orgId]
        ),
        query(
          `SELECT id, code, name, account_id, default_account_id, vat_code, 'customer' AS partner_type
             FROM customers WHERE org_id = ? AND is_active = 1 ORDER BY name`,
          [req.orgId]
        ),
      ]);
      const rows = [...suppliers, ...customers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return res.json({ rows, total: rows.length, type: 'all' });
    }
    const table = req.query.type === 'customer' ? 'customers' : 'suppliers';
    const rows = await query(
      `SELECT id, code, name, account_id, default_account_id, vat_code, ? AS partner_type
         FROM ${table} WHERE org_id = ? AND is_active = 1 ORDER BY name`,
      [req.query.type, req.orgId]
    );
    res.json({ rows, total: rows.length, type: req.query.type });
  })
);

postingRoutes.post(
  '/accounts/:id/default-child',
  requirePermission('coa.manage'),
  handler(async (req, res) => {
    const parent = await queryOne('SELECT * FROM accounts WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!parent) throw unprocessable('Account not found.');
    const length = await getPostingLength({ query, queryOne }, req.orgId);
    if (String(parent.code).length >= length) {
      throw unprocessable(`${parent.code} is already at the posting length.`);
    }
    const child = await transaction((tx) => ensureDefaultChild(tx, req.orgId, parent, length));
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'account', entityId: child.id,
      summary: `Default postable child ${child.code} created under ${parent.code}`,
      after: child, context: requestContext(req),
    });
    res.status(201).json({
      account: child,
      suggested: await nextDefaultChildCode({ queryOne }, req.orgId, parent.code, length),
      siblings: await listPostableChildren({ query }, req.orgId, parent.code, length),
    });
  })
);

export { DEFAULT_POSTING_LENGTH };
