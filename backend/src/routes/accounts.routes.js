import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import { notFound, unprocessable } from '../utils/errors.js';
import { boolish, optionalId, where } from './helpers.js';
import {
  getPostingLength, requireExistingParents, validateNewAccountCode,
} from '../services/posting-level.service.js';

export const accountRoutes = Router();

// --- chart of accounts (FR-GL-001) -----------------------------------------

accountRoutes.get(
  '/accounts',
  requirePermission('coa.view'),
  validate({
    query: z.object({
      search: z.string().trim().optional(),
      accountClass: z.coerce.number().int().min(1).max(9).optional(),
      statement: z.enum(['sofp', 'pl', 'oci', 'cf']).optional(),
      postableOnly: boolish.optional(),
      activeOnly: boolish.default(true),
      tier: z.enum(['normal', 'allege', 'smt']).optional(),
      tree: boolish.optional(),
      framework: z.enum(['ohada', 'ifrs']).default('ohada'),
    }),
  }),
  handler(async (req, res) => {
    const { search, accountClass, statement, postableOnly, activeOnly, tier, tree, framework } = req.query;

    if (framework === 'ifrs') {
      return res.json(await listIfrsChart(req.orgId, { search, statement }));
    }
    const params = [req.orgId];
    let filter = '';
    if (accountClass) { filter += ' AND a.account_class = ?'; params.push(accountClass); }
    if (postableOnly) filter += ' AND a.is_postable = 1';
    if (activeOnly) filter += ' AND a.is_active = 1';
    // FR-STD-001: the Systeme Allege and SMT tiers use a reduced chart.
    if (tier) filter += ` AND a.in_tier_${tier} = 1`;
    if (search) {
      filter += ' AND (a.code LIKE ? OR a.name LIKE ? OR a.name_en LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const rows = await query(
      `SELECT a.id, a.code, a.name, a.name_en, a.account_class, a.account_type, a.normal_side,
              a.parent_id, a.level, a.is_postable, a.is_active, a.requires_cost_center,
              a.requires_asset, a.requires_third_party, a.is_reconcilable, a.is_fixed_asset, a.currency,
              a.in_tier_normal, a.in_tier_allege, a.in_tier_smt, a.is_system,
              p.code AS parent_code,
              i.code AS ifrs_code, i.name AS ifrs_name
         FROM accounts a
         LEFT JOIN accounts p ON p.id = a.parent_id
         LEFT JOIN account_mappings m ON m.account_id = a.id AND m.org_id = a.org_id
         LEFT JOIN ifrs_accounts i ON i.id = m.ifrs_account_id AND i.statement IN ('sofp','pl')
        WHERE a.org_id = ?${filter}
        GROUP BY a.id
        ORDER BY a.code`,
      params
    );

    if (!tree) return res.json({ rows, total: rows.length });

    // Assemble the hierarchy in one pass; children are ordered by code because
    // the flat query already is.
    const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
      const parent = node.parent_id ? byId.get(node.parent_id) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    res.json({ rows: roots, total: rows.length });
  })
);

accountRoutes.get(
  '/accounts/:id',
  requirePermission('coa.view'),
  handler(async (req, res) => {
    const account = await queryOne(
      `SELECT a.*, p.code AS parent_code, p.name AS parent_name, p.name_en AS parent_name_en
         FROM accounts a LEFT JOIN accounts p ON p.id = a.parent_id
        WHERE a.id = ? AND a.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!account) throw notFound('Account not found.');

    const mappings = await query(
      `SELECT i.code, i.name, i.statement, i.section, m.allocation_pct
         FROM account_mappings m JOIN ifrs_accounts i ON i.id = m.ifrs_account_id
        WHERE m.account_id = ? AND m.org_id = ?
        ORDER BY i.statement, i.sort_order`,
      [account.id, req.orgId]
    );
    res.json({ account, ifrs_mappings: mappings });
  })
);

const accountBody = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  name_en: z.string().trim().max(200).optional().nullable(),
  account_class: z.coerce.number().int().min(1).max(9),
  account_type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense', 'analytic', 'offbalance']),
  normal_side: z.enum(['debit', 'credit']),
  parent_id: optionalId.nullable(),
  is_postable: boolish.default(true),
  requires_cost_center: boolish.default(false),
  requires_asset: boolish.default(false),
  requires_third_party: boolish.default(false),
  is_reconcilable: boolish.default(false),
  is_fixed_asset: boolish.default(false),
  currency: z.string().trim().length(3).optional().nullable(),
  in_tier_normal: boolish.default(true),
  in_tier_allege: boolish.default(true),
  in_tier_smt: boolish.default(false),
});

accountRoutes.post(
  '/accounts',
  requirePermission('coa.manage'),
  validate({ body: accountBody }),
  handler(async (req, res) => {
    const b = req.body;
    const postingLength = await getPostingLength({ query, queryOne }, req.orgId);
    validateNewAccountCode(b.code, b.account_class, postingLength);
    const clash = await queryOne('SELECT id FROM accounts WHERE org_id = ? AND code = ?', [req.orgId, b.code]);
    if (clash) throw unprocessable(`Account number ${b.code} already exists.`);

    const result = await transaction(async (tx) => {
      await requireExistingParents(tx, req.orgId, b.code);
      // A parent cannot also be a posting account, or its balance would be
      // counted both in its own right and through its children.
      if (b.parent_id) {
        const parent = await tx.queryOne('SELECT * FROM accounts WHERE id = ? AND org_id = ?', [b.parent_id, req.orgId]);
        if (!parent) throw unprocessable('The parent account does not exist.');
        if (!b.code.startsWith(parent.code)) {
          throw unprocessable(`Code ${b.code} does not sit under parent ${parent.code}.`);
        }
        const used = await tx.queryOne('SELECT COUNT(*) AS n FROM journal_lines WHERE account_id = ?', [parent.id]);
        if (Number(used.n) > 0) {
          throw unprocessable(`Account ${parent.code} already has movements. Use the reclassification procedure.`);
        }
        await tx.query('UPDATE accounts SET is_postable = 0 WHERE id = ?', [parent.id]);
      }
      const level = b.parent_id
        ? Number((await tx.queryOne('SELECT level FROM accounts WHERE id = ?', [b.parent_id])).level) + 1
        : 1;
      const postable = b.code.length >= postingLength && b.is_postable ? 1 : 0;
      const ins = await tx.query(
        `INSERT INTO accounts
           (org_id, code, name, name_en, account_class, account_type, normal_side, parent_id, level,
            is_postable, requires_cost_center, requires_asset, requires_third_party, is_reconcilable,
            is_fixed_asset, currency, in_tier_normal, in_tier_allege, in_tier_smt, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        [
          req.orgId, b.code, b.name, b.name_en ?? null, b.account_class, b.account_type, b.normal_side,
          b.parent_id ?? null, level, postable, b.requires_cost_center ? 1 : 0,
          b.requires_asset ? 1 : 0, b.requires_third_party ? 1 : 0, b.is_reconcilable ? 1 : 0,
          b.is_fixed_asset ? 1 : 0,
          b.currency ?? null, b.in_tier_normal ? 1 : 0, b.in_tier_allege ? 1 : 0, b.in_tier_smt ? 1 : 0,
        ]
      );
      return tx.queryOne('SELECT * FROM accounts WHERE id = ?', [ins.insertId]);
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'account', entityId: result.id,
      summary: `Compte ${result.code} - ${result.name} cree`, after: result, context: requestContext(req),
    });
    res.status(201).json({ account: result });
  })
);

accountRoutes.patch(
  '/accounts/:id',
  requirePermission('coa.manage'),
  validate({
    body: accountBody.partial().omit({ code: true, account_class: true }).extend({
      is_active: boolish.optional(),
    }),
  }),
  handler(async (req, res) => {
    const before = await queryOne('SELECT * FROM accounts WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!before) throw notFound('Account not found.');

    const fields = Object.entries(req.body).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return res.json({ account: before });

    // Postings already made cannot be orphaned by turning a posting account
    // into a heading, so refuse rather than silently corrupt the ledger.
    if (req.body.is_postable === false) {
      const used = await queryOne('SELECT COUNT(*) AS n FROM journal_lines WHERE account_id = ?', [before.id]);
      if (Number(used.n) > 0) {
        throw unprocessable(
          `Account ${before.code} already carries ${used.n} posted line(s) and cannot be turned into a heading account.`
        );
      }
    }

    await query(
      `UPDATE accounts SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ? AND org_id = ?`,
      [...fields.map(([, v]) => (typeof v === 'boolean' ? (v ? 1 : 0) : v)), before.id, req.orgId]
    );
    const after = await queryOne('SELECT * FROM accounts WHERE id = ?', [before.id]);

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'update', entity: 'account', entityId: before.id,
      summary: `Compte ${before.code} modifie`, before, after, context: requestContext(req),
    });
    res.json({ account: after });
  })
);

// --- cost centres: wards and departments (SRS 2.5) -------------------------

accountRoutes.get(
  '/cost-centers',
  requirePermission('coa.view', 'asset.view', 'budget.view'),
  handler(async (req, res) => {
    const rows = await query(
      `SELECT c.*, p.code AS parent_code,
              (SELECT COUNT(*) FROM assets a WHERE a.cost_center_id = c.id AND a.status <> 'disposed') AS asset_count
         FROM cost_centers c LEFT JOIN cost_centers p ON p.id = c.parent_id
        WHERE c.org_id = ? AND c.is_active = 1
        ORDER BY c.code`,
      [req.orgId]
    );
    res.json({ rows, total: rows.length });
  })
);

// --- IFRS presentation mapping (FR-STD-020) --------------------------------

accountRoutes.get(
  '/ifrs-accounts',
  requirePermission('coa.view'),
  validate({ query: z.object({ statement: z.enum(['sofp', 'pl', 'oci', 'cf']).optional() }) }),
  handler(async (req, res) => {
    res.json(await listIfrsChart(req.orgId, { statement: req.query.statement }));
  })
);

accountRoutes.get(
  '/ifrs-accounts/:id',
  requirePermission('coa.view'),
  handler(async (req, res) => {
    const account = await queryOne(
      `SELECT i.* FROM ifrs_accounts i
        WHERE i.org_id = ? AND (i.id = ? OR i.code = ?)`,
      [req.orgId, req.params.id, req.params.id]
    );
    if (!account) throw notFound('IFRS presentation line not found.');

    const mapped = await query(
      `SELECT a.id, a.code, a.name, a.name_en, a.account_class, a.account_type,
              a.is_postable, a.normal_side, m.allocation_pct
         FROM account_mappings m
         JOIN accounts a ON a.id = m.account_id
        WHERE m.ifrs_account_id = ? AND m.org_id = ?
        ORDER BY a.code`,
      [account.id, req.orgId]
    );
    res.json({
      account: shapeIfrsAccount(account, mapped.length),
      mapped_accounts: mapped,
    });
  })
);

function ifrsAccountType(statement, section) {
  if (['non_current_assets', 'current_assets'].includes(section)) return 'asset';
  if (section === 'equity' || statement === 'oci') return 'equity';
  if (String(section || '').includes('liabilit')) return 'liability';
  if (section === 'revenue') return 'revenue';
  if (['operating_expenses', 'tax', 'finance'].includes(section)) return 'expense';
  return 'analytic';
}

function shapeIfrsAccount(row, mappedCount = 0) {
  return {
    id: row.id,
    code: row.code,
    name: row.name_fr || row.name,
    name_en: row.name,
    name_fr: row.name_fr,
    statement: row.statement,
    section: row.section,
    sub_section: row.sub_section,
    note_ref: row.note_ref,
    sort_order: row.sort_order,
    account_type: ifrsAccountType(row.statement, row.section),
    normal_side: Number(row.sign) === 1 ? 'debit' : 'credit',
    is_postable: 0,
    is_active: 1,
    mapped_accounts: Number(mappedCount) || Number(row.mapped_accounts) || 0,
  };
}

async function listIfrsChart(orgId, { search, statement } = {}) {
  const f = where([
    ['i.org_id = ?', orgId],
    ['i.statement = ?', statement],
  ]);
  const params = [...f.params];
  let extra = '';
  if (search) {
    extra += ' AND (i.code LIKE ? OR i.name LIKE ? OR i.name_fr LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const rows = await query(
    `SELECT i.*, COUNT(m.id) AS mapped_accounts
       FROM ifrs_accounts i
       LEFT JOIN account_mappings m ON m.ifrs_account_id = i.id AND m.org_id = i.org_id
      WHERE 1 = 1${f.sql}${extra}
      GROUP BY i.id
      ORDER BY i.statement, i.sort_order`,
    params
  );
  return {
    rows: rows.map((r) => shapeIfrsAccount(r, r.mapped_accounts)),
    total: rows.length,
    framework: 'ifrs',
  };
}
