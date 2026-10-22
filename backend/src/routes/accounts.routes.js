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
import { ensureOrganizationData } from '../db/seed.js';

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
      return res.json(await listIfrsChart(req.orgId, { search, statement, accountClass }));
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

    let rows = await query(
      `SELECT a.id, a.code, a.name, a.name_en, a.account_class, a.account_type, a.normal_side,
              a.parent_id, a.level, a.is_postable, a.is_active, a.requires_cost_center,
              a.requires_asset, a.requires_third_party, a.is_reconcilable, a.is_fixed_asset, a.currency,
              a.in_tier_normal, a.in_tier_allege, a.in_tier_smt, a.is_system,
              MAX(p.code) AS parent_code,
              MAX(i.code) AS ifrs_code, MAX(i.name) AS ifrs_name
         FROM accounts a
         LEFT JOIN accounts p ON p.id = a.parent_id
         LEFT JOIN account_mappings m ON m.account_id = a.id AND m.org_id = a.org_id
         LEFT JOIN ifrs_accounts i ON i.id = m.ifrs_account_id AND i.statement IN ('sofp','pl')
        WHERE a.org_id = ?${filter}
        GROUP BY a.id
        ORDER BY a.code`,
      params
    );
    if (rows.length === 0 && !search && !accountClass) {
      await ensureOrganizationData(req.orgId, { skipDemo: true, silent: true }).catch(() => {});
      rows = await query(
        `SELECT a.id, a.code, a.name, a.name_en, a.account_class, a.account_type, a.normal_side,
                a.parent_id, a.level, a.is_postable, a.is_active, a.requires_cost_center,
                a.requires_asset, a.requires_third_party, a.is_reconcilable, a.is_fixed_asset, a.currency,
                a.in_tier_normal, a.in_tier_allege, a.in_tier_smt, a.is_system,
                MAX(p.code) AS parent_code,
                MAX(i.code) AS ifrs_code, MAX(i.name) AS ifrs_name
           FROM accounts a
           LEFT JOIN accounts p ON p.id = a.parent_id
           LEFT JOIN account_mappings m ON m.account_id = a.id AND m.org_id = a.org_id
           LEFT JOIN ifrs_accounts i ON i.id = m.ifrs_account_id AND i.statement IN ('sofp','pl')
          WHERE a.org_id = ?${filter}
          GROUP BY a.id
          ORDER BY a.code`,
        params
      );
    }

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

// --- cost centres: wards, departments, and units (SRS 2.5) -----------------

accountRoutes.get(
  '/cost-centers',
  requirePermission('coa.view', 'asset.view', 'budget.view'),
  validate({
    query: z.object({
      search: z.string().trim().optional(),
      includeInactive: boolish.optional(),
      type: z.string().trim().optional(),
    }),
  }),
  handler(async (req, res) => {
    const { search, includeInactive, type } = req.query;
    const params = [req.orgId];
    let filter = '';

    if (!includeInactive) {
      filter += ' AND c.is_active = 1';
    }
    if (type) {
      filter += ' AND c.cc_type = ?';
      params.push(type);
    }
    if (search) {
      filter += ' AND (c.code LIKE ? OR c.name LIKE ? OR c.name_en LIKE ? OR c.building LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const rows = await query(
      `SELECT c.*, 
              p.code AS parent_code,
              p.name AS parent_name,
              u.full_name AS manager_name,
              (SELECT COUNT(*) FROM assets a WHERE a.cost_center_id = c.id AND a.status <> 'disposed') AS asset_count
         FROM cost_centers c 
         LEFT JOIN cost_centers p ON p.id = c.parent_id
         LEFT JOIN users u ON u.id = c.manager_user_id
        WHERE c.org_id = ?${filter}
        ORDER BY c.code`,
      params
    );
    res.json({ rows, total: rows.length });
  })
);

accountRoutes.post(
  '/cost-centers',
  requirePermission('coa.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(1).max(20),
      name: z.string().trim().min(2).max(150),
      name_en: z.string().trim().max(150).optional().nullable(),
      cc_type: z.enum(['ward', 'department', 'clinical_service', 'support', 'administration', 'project', 'technical']).default('department'),
      parent_id: z.number().int().positive().optional().nullable(),
      manager_user_id: z.number().int().positive().optional().nullable(),
      building: z.string().trim().max(100).optional().nullable(),
      is_active: boolish.default(true),
    }),
  }),
  handler(async (req, res) => {
    const codeUpper = req.body.code.trim().toUpperCase();
    const existing = await queryOne(
      'SELECT id FROM cost_centers WHERE org_id = ? AND code = ?',
      [req.orgId, codeUpper]
    );
    if (existing) {
      return res.status(422).json({ error: `Cost center with code ${codeUpper} already exists.` });
    }

    const result = await query(
      `INSERT INTO cost_centers (org_id, code, name, name_en, cc_type, parent_id, manager_user_id, building, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.orgId,
        codeUpper,
        req.body.name.trim(),
        req.body.name_en ? req.body.name_en.trim() : null,
        req.body.cc_type || 'department',
        req.body.parent_id || null,
        req.body.manager_user_id || null,
        req.body.building ? req.body.building.trim() : null,
        req.body.is_active ? 1 : 0,
      ]
    );

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'cost_center.create',
      entity: 'cost_center',
      entityId: result.insertId,
      details: { code: codeUpper, name: req.body.name, cc_type: req.body.cc_type },
    }).catch(() => {});

    const created = await queryOne(
      `SELECT c.*, 
              p.code AS parent_code,
              p.name AS parent_name,
              u.full_name AS manager_name,
              0 AS asset_count
         FROM cost_centers c 
         LEFT JOIN cost_centers p ON p.id = c.parent_id
         LEFT JOIN users u ON u.id = c.manager_user_id
        WHERE c.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ cost_center: created });
  })
);

accountRoutes.patch(
  '/cost-centers/:id',
  requirePermission('coa.manage'),
  validate({
    body: z.object({
      code: z.string().trim().min(1).max(20).optional(),
      name: z.string().trim().min(2).max(150).optional(),
      name_en: z.string().trim().max(150).optional().nullable(),
      cc_type: z.enum(['ward', 'department', 'clinical_service', 'support', 'administration', 'project', 'technical']).optional(),
      parent_id: z.number().int().positive().optional().nullable(),
      manager_user_id: z.number().int().positive().optional().nullable(),
      building: z.string().trim().max(100).optional().nullable(),
      is_active: boolish.optional(),
    }),
  }),
  handler(async (req, res) => {
    const id = Number(req.params.id);
    const cc = await queryOne('SELECT * FROM cost_centers WHERE id = ? AND org_id = ?', [id, req.orgId]);
    if (!cc) throw notFound('Cost center not found.');

    const updates = [];
    const params = [];

    if (req.body.code !== undefined) {
      const codeUpper = req.body.code.trim().toUpperCase();
      const dup = await queryOne(
        'SELECT id FROM cost_centers WHERE org_id = ? AND code = ? AND id <> ?',
        [req.orgId, codeUpper, id]
      );
      if (dup) {
        return res.status(422).json({ error: `Cost center with code ${codeUpper} already exists.` });
      }
      updates.push('code = ?');
      params.push(codeUpper);
    }
    if (req.body.name !== undefined) {
      updates.push('name = ?');
      params.push(req.body.name.trim());
    }
    if (req.body.name_en !== undefined) {
      updates.push('name_en = ?');
      params.push(req.body.name_en ? req.body.name_en.trim() : null);
    }
    if (req.body.cc_type !== undefined) {
      updates.push('cc_type = ?');
      params.push(req.body.cc_type);
    }
    if (req.body.parent_id !== undefined) {
      // Prevent cyclical parent
      if (req.body.parent_id === id) {
        return res.status(422).json({ error: 'A cost center cannot be its own parent.' });
      }
      updates.push('parent_id = ?');
      params.push(req.body.parent_id || null);
    }
    if (req.body.manager_user_id !== undefined) {
      updates.push('manager_user_id = ?');
      params.push(req.body.manager_user_id || null);
    }
    if (req.body.building !== undefined) {
      updates.push('building = ?');
      params.push(req.body.building ? req.body.building.trim() : null);
    }
    if (req.body.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(req.body.is_active ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(id, req.orgId);
      await query(`UPDATE cost_centers SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`, params);
    }

    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'cost_center.update',
      entity: 'cost_center',
      entityId: id,
      details: req.body,
    }).catch(() => {});

    const updated = await queryOne(
      `SELECT c.*, 
              p.code AS parent_code,
              p.name AS parent_name,
              u.full_name AS manager_name,
              (SELECT COUNT(*) FROM assets a WHERE a.cost_center_id = c.id AND a.status <> 'disposed') AS asset_count
         FROM cost_centers c 
         LEFT JOIN cost_centers p ON p.id = c.parent_id
         LEFT JOIN users u ON u.id = c.manager_user_id
        WHERE c.id = ?`,
      [id]
    );

    res.json({ cost_center: updated });
  })
);

accountRoutes.delete(
  '/cost-centers/:id',
  requirePermission('coa.manage'),
  handler(async (req, res) => {
    const id = Number(req.params.id);
    const cc = await queryOne('SELECT * FROM cost_centers WHERE id = ? AND org_id = ?', [id, req.orgId]);
    if (!cc) throw notFound('Cost center not found.');

    const [assetsLinked, journalLinked] = await Promise.all([
      queryOne('SELECT COUNT(*) AS count FROM assets WHERE cost_center_id = ?', [id]),
      queryOne('SELECT COUNT(*) AS count FROM journal_lines WHERE cost_center_id = ?', [id]),
    ]);

    if ((assetsLinked?.count || 0) > 0 || (journalLinked?.count || 0) > 0) {
      // Soft-deactivate if linked to existing operational or financial records
      await query('UPDATE cost_centers SET is_active = 0 WHERE id = ? AND org_id = ?', [id, req.orgId]);
      return res.json({
        success: true,
        deactivated: true,
        message: 'Cost center has existing transactions or assets; it has been deactivated rather than deleted.',
      });
    }

    await query('DELETE FROM cost_centers WHERE id = ? AND org_id = ?', [id, req.orgId]);
    await writeAudit({
      orgId: req.orgId,
      userId: req.user.id,
      action: 'cost_center.delete',
      entity: 'cost_center',
      entityId: id,
      details: { code: cc.code, name: cc.name },
    }).catch(() => {});

    res.json({ success: true, message: `Cost center ${cc.code} deleted successfully.` });
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

export const IFRS_STANDARD_CODES = {
  // Class 1: Non-Current & Current Assets (1000-1999)
  'SOFP.PPE': '1100',
  'SOFP.INTANGIBLE': '1200',
  'SOFP.RIGHT_OF_USE': '1300',
  'SOFP.FIN_NC': '1400',
  'SOFP.OTHER_NC': '1500',
  'SOFP.INVENTORY': '1600',
  'SOFP.TRADE_RECV': '1700',
  'SOFP.TAX_RECV': '1800',
  'SOFP.PREPAID': '1850',
  'SOFP.CASH': '1900',
  // Class 2: Non-Current & Current Liabilities (2000-2999)
  'SOFP.LT_BORROW': '2100',
  'SOFP.LEASE_NC': '2200',
  'SOFP.PROV_NC': '2300',
  'SOFP.DEF_GRANT': '2400',
  'SOFP.TRADE_PAY': '2500',
  'SOFP.ST_BORROW': '2600',
  'SOFP.TAX_PAY': '2700',
  'SOFP.PROV_C': '2800',
  'SOFP.DEF_INCOME': '2900',
  // Class 3: Equity (3000-3999)
  'SOFP.SHARE_CAPITAL': '3100',
  'SOFP.SHARE_PREMIUM': '3200',
  'SOFP.REVAL_SURPLUS': '3300',
  'SOFP.OTHER_RESERVES': '3400',
  'SOFP.RETAINED': '3500',
  'SOFP.RESULT': '3600',
  // Class 4: Revenue (4000-4999)
  'PL.REVENUE': '4100',
  'PL.GRANT_INCOME': '4200',
  'PL.OTHER_INCOME': '4900',
  // Class 5: Cost of Sales / Healthcare Consumables (5000-5999)
  'PL.CONSUMABLES': '5100',
  // Class 6: Operating Expenses (6000-6999)
  'PL.STAFF': '6100',
  'PL.DEPRECIATION': '6200',
  'PL.MAINTENANCE': '6300',
  'PL.UTILITIES': '6400',
  'PL.OTHER_OPEX': '6500',
  'PL.IMPAIRMENT': '6600',
  'PL.DISPOSAL_RESULT': '6700',
  // Class 7: Finance & FX (7000-7999)
  'PL.FINANCE_INCOME': '7100',
  'PL.FINANCE_COST': '7200',
  'PL.FX_RESULT': '7300',
  // Class 8: Income Tax (8000-8999)
  'PL.TAX': '8100',
  // Class 9: OCI & Cash Flows (9000-9999)
  'OCI.REVAL': '9100',
  'OCI.FX_TRANSLATION': '9200',
  'CF.OPERATING': '9510',
  'CF.INVESTING': '9520',
  'CF.FINANCING': '9530',
};

function ifrsAccountType(statement, section) {
  if (['non_current_assets', 'current_assets'].includes(section)) return 'asset';
  if (section === 'equity' || statement === 'oci') return 'equity';
  if (String(section || '').includes('liabilit')) return 'liability';
  if (section === 'revenue') return 'revenue';
  if (['operating_expenses', 'tax', 'finance'].includes(section)) return 'expense';
  return 'analytic';
}

function shapeIfrsAccount(row, mappedCount = 0) {
  const stdCode = IFRS_STANDARD_CODES[row.code] || '9900';
  return {
    id: row.id,
    code: stdCode,
    standard_code: stdCode,
    ifrs_ref: row.code,
    account_class: Number(stdCode[0]) || 1,
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

async function listIfrsChart(orgId, { search, statement, accountClass } = {}) {
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

  let shaped = rows.map((r) => shapeIfrsAccount(r, r.mapped_accounts));

  // If search was numerical (e.g. '1100', '11', '6'), search by standard code
  if (search) {
    const sLower = search.trim().toLowerCase();
    shaped = shaped.filter((a) =>
      a.code.includes(sLower) ||
      a.ifrs_ref.toLowerCase().includes(sLower) ||
      a.name.toLowerCase().includes(sLower) ||
      (a.name_en && a.name_en.toLowerCase().includes(sLower))
    );
  }

  // Filter by numerical accountClass if specified (1 = 1000s, 2 = 2000s, etc.)
  if (accountClass) {
    shaped = shaped.filter((a) => a.account_class === Number(accountClass));
  }

  return {
    rows: shaped,
    total: shaped.length,
    framework: 'ifrs',
  };
}
