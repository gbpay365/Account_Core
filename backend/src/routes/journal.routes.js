import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import { createJournalEntry, postJournalEntry, reverseJournalEntry } from '../services/ledger.service.js';
import { buildTrialBalance, loadBalances } from '../services/reporting.service.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { actorOf, can, isoDate, optionalId, boolish, pagination, paged, reportRange } from './helpers.js';

export const journalRoutes = Router();

journalRoutes.get(
  '/journals',
  requirePermission('journal.view'),
  handler(async (req, res) => {
    const rows = await query(
      `SELECT j.*, COUNT(e.id) AS entry_count
         FROM journals j
         LEFT JOIN journal_entries e ON e.journal_id = j.id
        WHERE j.org_id = ? AND j.is_active = 1
        GROUP BY j.id ORDER BY j.code`,
      [req.orgId]
    );
    res.json({ rows, total: rows.length });
  })
);

journalRoutes.post(
  '/journals',
  requirePermission('journal.create', 'coa.manage', 'admin.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(1).max(10).toUpperCase(),
      name: z.string().trim().min(1).max(100),
      nameEn: z.string().trim().max(100).optional().nullable(),
      journalType: z.enum(['sales', 'purchase', 'cash', 'bank', 'payroll', 'asset', 'depreciation', 'general', 'closing', 'fx']).default('general'),
      defaultAccountId: optionalId.nullable().optional(),
      allowManual: boolish.default(true),
    }),
  }),
  handler(async (req, res) => {
    const { code, name, nameEn, journalType, defaultAccountId, allowManual } = req.body;
    const existing = await queryOne('SELECT id FROM journals WHERE org_id = ? AND code = ?', [req.orgId, code]);
    if (existing) throw badRequest(`Journal with code ${code} already exists.`);
    const result = await query(
      `INSERT INTO journals (org_id, code, name, name_en, journal_type, default_account_id, allow_manual, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [req.orgId, code, name, nameEn || null, journalType, defaultAccountId || null, allowManual ? 1 : 0]
    );
    const created = await queryOne('SELECT * FROM journals WHERE id = ?', [result.insertId]);
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'journal', entityId: created.id,
      summary: `Created journal ${created.code} (${created.name})`,
      after: created, context: requestContext(req),
    });
    res.status(201).json({ journal: created });
  })
);

// --- journal entries (FR-GL-002) -------------------------------------------

journalRoutes.get(
  '/entries',
  requirePermission('journal.view'),
  validate({
    query: pagination.extend({
      search: z.string().trim().optional(),
      journalId: optionalId,
      periodId: optionalId,
      status: z.enum(['draft', 'posted', 'reversed']).optional(),
      source: z.string().trim().optional(),
      framework: z.enum(['both', 'ohada', 'ifrs']).optional(),
      basis: z.enum(['ohada', 'ifrs']).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
  }),
  handler(async (req, res) => {
    const { page, pageSize, search, journalId, periodId, status, source, framework, basis, from, to } = req.query;
    const params = [req.orgId];
    let filter = '';
    if (journalId) { filter += ' AND e.journal_id = ?'; params.push(journalId); }
    if (periodId) { filter += ' AND e.period_id = ?'; params.push(periodId); }
    if (status) { filter += ' AND e.status = ?'; params.push(status); }
    if (source) { filter += ' AND e.source = ?'; params.push(source); }
    if (framework) {
      filter += ' AND e.framework = ?';
      params.push(framework);
    } else if (basis) {
      const allowed = basis === 'ifrs' ? ['both', 'ifrs'] : ['both', 'ohada'];
      filter += ` AND e.framework IN (${allowed.map(() => '?').join(',')})`;
      params.push(...allowed);
    }
    if (from) { filter += ' AND e.entry_date >= ?'; params.push(from); }
    if (to) { filter += ' AND e.entry_date <= ?'; params.push(to); }
    if (search) {
      filter += ' AND (e.entry_no LIKE ? OR e.reference LIKE ? OR e.description LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM journal_entries e WHERE e.org_id = ?${filter}`,
      params
    );
    const rows = await query(
      `SELECT e.id, e.entry_no, e.entry_date, e.reference, e.description, e.source, e.framework,
              e.total_debit, e.total_credit, e.status, e.is_reversal, e.reverses_entry_id,
              e.reversed_by_entry_id, e.closed_period_override, e.override_reason, e.posted_at,
              j.code AS journal_code, j.name AS journal_name, j.name_en AS journal_name_en,
              p.code AS period_code, p.status AS period_status,
              cu.full_name AS created_by_name, pu.full_name AS posted_by_name
         FROM journal_entries e
         JOIN journals j ON j.id = e.journal_id
         JOIN accounting_periods p ON p.id = e.period_id
         LEFT JOIN users cu ON cu.id = e.created_by
         LEFT JOIN users pu ON pu.id = e.posted_by
        WHERE e.org_id = ?${filter}
        ORDER BY e.entry_date DESC, e.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json(paged(rows, Number(total), { page, pageSize }));
  })
);

journalRoutes.get(
  '/entries/:id',
  requirePermission('journal.view'),
  handler(async (req, res) => {
    const entry = await queryOne(
      `SELECT e.*, j.code AS journal_code, j.name AS journal_name, j.name_en AS journal_name_en,
              p.code AS period_code, p.status AS period_status,
              cu.full_name AS created_by_name, pu.full_name AS posted_by_name,
              ou.full_name AS override_by_name,
              rev.entry_no AS reversed_by_entry_no, org.entry_no AS reverses_entry_no
         FROM journal_entries e
         JOIN journals j ON j.id = e.journal_id
         JOIN accounting_periods p ON p.id = e.period_id
         LEFT JOIN users cu ON cu.id = e.created_by
         LEFT JOIN users pu ON pu.id = e.posted_by
         LEFT JOIN users ou ON ou.id = e.override_by
         LEFT JOIN journal_entries rev ON rev.id = e.reversed_by_entry_id
         LEFT JOIN journal_entries org ON org.id = e.reverses_entry_id
        WHERE e.id = ? AND e.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!entry) throw notFound('Journal entry not found.');

    const lines = await query(
      `SELECT l.*, a.code AS account_code, a.name AS account_name, a.name_en AS account_name_en,
              a.account_class,
              c.code AS cost_center_code, c.name AS cost_center_name, c.name_en AS cost_center_name_en,
              ast.asset_tag, ast.name AS asset_name,
              t.code AS tax_code,
              sub.code AS subledger_code, sub.name AS subledger_name
         FROM journal_lines l
         JOIN accounts a ON a.id = l.account_id
         LEFT JOIN cost_centers c ON c.id = l.cost_center_id
         LEFT JOIN assets ast ON ast.id = l.asset_id
         LEFT JOIN tax_codes t ON t.id = l.tax_code_id
         LEFT JOIN subledger_accounts sub ON sub.id = l.subledger_id
        WHERE l.entry_id = ? ORDER BY l.line_no`,
      [entry.id]
    );
    const attachments = await query(
      `SELECT id, doc_type, title, file_name, mime_type, size_bytes, issue_date, created_at
         FROM attachments
        WHERE org_id = ? AND entity_type = 'journal_entry' AND entity_id = ?
        ORDER BY id`,
      [req.orgId, entry.id]
    );
    res.json({ entry, lines, attachments });
  })
);

const lineBody = z.object({
  accountId: optionalId,
  accountCode: z.string().trim().optional(),
  costCenterId: optionalId.nullable(),
  assetId: optionalId.nullable(),
  subledgerId: optionalId.nullable(),
  projectCode: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  taxCodeId: optionalId.nullable(),
  taxBase: z.coerce.number().optional().nullable(),
  partnerType: z.enum(['none', 'supplier', 'customer', 'employee']).default('none'),
  partnerId: optionalId.nullable(),
  origin: z.enum(['manual', 'proposed', 'edited']).default('manual'),
  proposalSource: z.string().trim().max(30).optional().nullable(),
  proposalRuleCode: z.string().trim().max(40).optional().nullable(),
  proposalReason: z.string().trim().max(250).optional().nullable(),
}).refine((l) => l.accountId || l.accountCode, { message: 'Each line needs an account.' });

journalRoutes.post(
  '/entries',
  requirePermission('journal.create'),
  validate({
    body: z.object({
      journalCode: z.string().trim().min(1),
      date: isoDate,
      description: z.string().trim().min(1).max(300),
      narration: z.string().trim().max(2000).optional().nullable(),
      reference: z.string().trim().max(80).optional().nullable(),
      framework: z.enum(['both', 'ohada', 'ifrs']).default('both'),
      currency: z.string().trim().length(3).optional(),
      fxRate: z.coerce.number().positive().default(1),
      autoPost: boolish.default(false),
      overrideReason: z.string().trim().max(500).optional().nullable(),
      lines: z.array(lineBody).min(2, 'A double-entry journal needs at least two lines.'),
    }),
  }),
  handler(async (req, res) => {
    // Capturing and posting are separate permissions, so a clerk can prepare an
    // entry but only an approver may commit it to the ledger.
    if (req.body.autoPost && !can(req, 'journal.post')) {
      throw forbidden('You may capture an entry, but posting it requires the journal.post permission.');
    }

    const created = await transaction((tx) =>
      createJournalEntry(tx, { ...req.body, orgId: req.orgId, source: 'manual', actor: actorOf(req) })
    );

    await writeAudit({
      orgId: req.orgId, userId: req.user.id,
      action: created.status === 'posted' ? 'post' : 'create',
      entity: 'journal_entry', entityId: created.id,
      summary: `Ecriture ${created.entry_no} ${created.status === 'posted' ? 'comptabilisee' : 'saisie'} - ` +
        `${money(created.total_debit)} ${req.user.functional_currency}`,
      after: created, context: requestContext(req),
    });
    res.status(201).json({ entry: created });
  })
);

journalRoutes.post(
  '/entries/:id/post',
  requirePermission('journal.post'),
  validate({ body: z.object({ overrideReason: z.string().trim().max(500).optional().nullable() }).default({}) }),
  handler(async (req, res) => {
    const posted = await transaction((tx) =>
      postJournalEntry(tx, req.orgId, Number(req.params.id), actorOf(req), req.body.overrideReason ?? null)
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'post', entity: 'journal_entry', entityId: posted.id,
      summary: `Ecriture ${posted.entry_no} comptabilisee`, context: requestContext(req),
    });
    res.json({ entry: posted });
  })
);

journalRoutes.post(
  '/entries/:id/reverse',
  requirePermission('journal.reverse'),
  validate({
    body: z.object({
      date: isoDate.optional(),
      reason: z.string().trim().min(5, 'Give a reason of at least 5 characters for the reversal.'),
    }),
  }),
  handler(async (req, res) => {
    const reversal = await transaction((tx) =>
      reverseJournalEntry(tx, req.orgId, Number(req.params.id), {
        date: req.body.date ?? null,
        reason: req.body.reason,
        actor: actorOf(req),
      })
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'reverse', entity: 'journal_entry',
      entityId: req.params.id,
      summary: `Extourne par ${reversal.entry_no} : ${req.body.reason}`, context: requestContext(req),
    });
    res.status(201).json({ reversal });
  })
);

journalRoutes.delete(
  '/entries/:id',
  requirePermission('journal.create'),
  handler(async (req, res) => {
    const entry = await queryOne('SELECT * FROM journal_entries WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!entry) throw notFound('Journal entry not found.');
    // A posted entry is part of the record and is reversed, never deleted.
    if (entry.status !== 'draft') throw forbidden(`Entry ${entry.entry_no} is ${entry.status} and can only be reversed.`);

    await transaction(async (tx) => {
      await tx.query('DELETE FROM tax_transactions WHERE entry_id = ?', [entry.id]);
      await tx.query('DELETE FROM journal_lines WHERE entry_id = ?', [entry.id]);
      await tx.query('DELETE FROM journal_entries WHERE id = ?', [entry.id]);
    });
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'delete', entity: 'journal_entry', entityId: entry.id,
      summary: `Brouillon ${entry.entry_no} supprime`, before: entry, context: requestContext(req),
    });
    res.json({ ok: true, deleted: entry.entry_no });
  })
);

// --- general ledger and trial balance --------------------------------------

journalRoutes.get(
  '/ledger/trial-balance',
  requirePermission('journal.view', 'report.financial'),
  validate({ query: reportRange.extend({ includeZero: boolish.default(false) }) }),
  handler(async (req, res) => {
    res.json(await buildTrialBalance({ query }, req.orgId, req.query));
  })
);

/** Account detail with a running balance, the view an auditor works from. */
journalRoutes.get(
  '/ledger/account/:accountId',
  requirePermission('journal.view'),
  validate({ query: reportRange.omit({ framework: true }).extend({
    framework: z.enum(['ohada', 'ifrs']).default('ohada'),
    matchFilter: z.enum(['all', 'unmatched', 'matched']).default('all'),
  }) }),
  handler(async (req, res) => {
    const { from, to, framework, costCenterId, matchFilter } = req.query;
    const account = await queryOne(
      'SELECT * FROM accounts WHERE id = ? AND org_id = ?',
      [req.params.accountId, req.orgId]
    );
    if (!account) throw notFound('Account not found.');

    const balances = await loadBalances({ query }, req.orgId, { from, to, framework, costCenterId });
    const opening = balances.get(account.code)?.opening ?? 0;

    const frameworks = framework === 'ifrs' ? ['both', 'ifrs'] : ['both', 'ohada'];
    let filter = costCenterId ? ' AND l.cost_center_id = ?' : '';
    if (matchFilter === 'unmatched') {
      filter += ' AND l.match_code IS NULL';
    } else if (matchFilter === 'matched') {
      filter += ' AND l.match_code IS NOT NULL';
    }

    const rows = await query(
      `SELECT e.id AS entry_id, e.entry_no, e.entry_date, e.reference, e.framework, e.status,
              j.code AS journal_code, l.id AS line_id, l.line_no, l.description, l.debit, l.credit,
              l.match_code, l.match_date, l.match_type,
              c.code AS cost_center_code, ast.asset_tag,
              sub.id AS subledger_id, sub.code AS subledger_code, sub.name AS subledger_name
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN journals j ON j.id = e.journal_id
         LEFT JOIN cost_centers c ON c.id = l.cost_center_id
         LEFT JOIN assets ast ON ast.id = l.asset_id
         LEFT JOIN subledger_accounts sub ON sub.id = l.subledger_id
        WHERE l.account_id = ? AND e.org_id = ? AND e.status = 'posted'
          AND e.framework IN (${frameworks.map(() => '?').join(',')})
          AND e.entry_date BETWEEN ? AND ?${filter}
        ORDER BY e.entry_date, e.id, l.line_no`,
      [account.id, req.orgId, ...frameworks, from, to, ...(costCenterId ? [costCenterId] : [])]
    );

    let running = opening;
    const movements = rows.map((r) => {
      running = money(running + Number(r.debit) - Number(r.credit));
      return { ...r, balance: running };
    });

    res.json({
      account,
      from,
      to,
      framework,
      match_filter: matchFilter,
      opening_balance: opening,
      closing_balance: running,
      total_debit: money(rows.reduce((t, r) => t + Number(r.debit), 0)),
      total_credit: money(rows.reduce((t, r) => t + Number(r.credit), 0)),
      rows: movements,
    });
  })
);

/** IFRS presentation line: rolled-up movements of the SYSCOHADA accounts that map to it. */
journalRoutes.get(
  '/ledger/ifrs-line/:code',
  requirePermission('journal.view'),
  validate({ query: reportRange.omit({ framework: true }) }),
  handler(async (req, res) => {
    const { from, to, costCenterId } = req.query;
    const line = await queryOne(
      'SELECT * FROM ifrs_accounts WHERE org_id = ? AND code = ?',
      [req.orgId, req.params.code]
    );
    if (!line) throw notFound('IFRS presentation line not found.');

    const pack = await buildTrialBalance({ query }, req.orgId, {
      from, to, framework: 'ifrs', costCenterId, includeZero: true,
    });
    const rolled = pack.rows.find((r) => r.code === line.code) || {
      opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 0,
      closing_debit: 0, closing_credit: 0, components: [],
    };
    const opening = money(Number(rolled.opening_debit) - Number(rolled.opening_credit));

    const ccFilter = costCenterId ? ' AND l.cost_center_id = ?' : '';
    const rows = await query(
      `SELECT e.id AS entry_id, e.entry_no, e.entry_date, e.reference, e.framework, e.status,
              j.code AS journal_code, l.line_no, l.description, l.debit, l.credit,
              a.code AS account_code, a.name AS account_name, a.name_en AS account_name_en,
              c.code AS cost_center_code, ast.asset_tag
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN journals j ON j.id = e.journal_id
         JOIN accounts a ON a.id = l.account_id
         JOIN account_mappings m ON m.account_id = a.id AND m.org_id = e.org_id
         LEFT JOIN cost_centers c ON c.id = l.cost_center_id
         LEFT JOIN assets ast ON ast.id = l.asset_id
        WHERE m.ifrs_account_id = ? AND e.org_id = ? AND e.status = 'posted'
          AND e.framework IN ('both', 'ifrs')
          AND e.entry_date BETWEEN ? AND ?${ccFilter}
        ORDER BY e.entry_date, e.id, l.line_no`,
      [line.id, req.orgId, from, to, ...(costCenterId ? [costCenterId] : [])]
    );

    let running = opening;
    const movements = rows.map((r) => {
      running = money(running + Number(r.debit) - Number(r.credit));
      return { ...r, balance: running };
    });

    res.json({
      account: {
        id: line.id,
        code: line.code,
        name: line.name_fr || line.name,
        name_en: line.name,
        name_fr: line.name_fr,
        statement: line.statement,
        section: line.section,
        normal_side: Number(line.sign) === 1 ? 'debit' : 'credit',
      },
      from,
      to,
      framework: 'ifrs',
      opening_balance: opening,
      closing_balance: running,
      total_debit: money(rows.reduce((t, r) => t + Number(r.debit), 0)),
      total_credit: money(rows.reduce((t, r) => t + Number(r.credit), 0)),
      components: rolled.components || [],
      rows: movements,
    });
  })
);
