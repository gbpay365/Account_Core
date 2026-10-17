import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  simulateRun, createRun, postRun, postImpairment, postRevaluation,
} from '../services/depreciation-run.service.js';
import { buildSchedule } from '../services/depreciation.service.js';
import { notFound, unprocessable } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { actorOf, isoDate, optionalId, boolish, pagination, paged } from './helpers.js';

export const depreciationRoutes = Router();

// --- depreciation runs (FR-AM-030) -----------------------------------------

depreciationRoutes.get(
  '/depreciation-runs',
  requirePermission('depr.view'),
  validate({ query: pagination.extend({ status: z.string().trim().optional(), periodId: optionalId }) }),
  handler(async (req, res) => {
    const params = [req.orgId];
    let filter = '';
    if (req.query.periodId) { filter += ' AND r.period_id = ?'; params.push(req.query.periodId); }
    if (req.query.status) {
      const list = req.query.status.split(',').map((s) => s.trim());
      filter += ` AND r.status IN (${list.map(() => '?').join(',')})`;
      params.push(...list);
    }
    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM depreciation_runs r WHERE r.org_id = ?${filter}`, params
    );
    const rows = await query(
      `SELECT r.*, p.code AS period_code, p.start_date, p.end_date, p.status AS period_status,
              ru.full_name AS run_by_name, pu.full_name AS posted_by_name,
              oe.entry_no AS ohada_entry_no, ie.entry_no AS ifrs_entry_no,
              (r.total_ifrs - r.total_ohada) AS delta
         FROM depreciation_runs r
         JOIN accounting_periods p ON p.id = r.period_id
         LEFT JOIN users ru ON ru.id = r.run_by
         LEFT JOIN users pu ON pu.id = r.posted_by
         LEFT JOIN journal_entries oe ON oe.id = r.ohada_entry_id
         LEFT JOIN journal_entries ie ON ie.id = r.ifrs_entry_id
        WHERE r.org_id = ?${filter}
        ORDER BY p.start_date DESC, r.id DESC
        LIMIT ? OFFSET ?`,
      [...params, req.query.pageSize, (req.query.page - 1) * req.query.pageSize]
    );
    res.json(paged(rows, Number(total), req.query));
  })
);

depreciationRoutes.get(
  '/depreciation-runs/:id',
  requirePermission('depr.view'),
  handler(async (req, res) => {
    const run = await queryOne(
      `SELECT r.*, p.code AS period_code, p.start_date, p.end_date,
              ru.full_name AS run_by_name, pu.full_name AS posted_by_name,
              oe.entry_no AS ohada_entry_no, ie.entry_no AS ifrs_entry_no
         FROM depreciation_runs r
         JOIN accounting_periods p ON p.id = r.period_id
         LEFT JOIN users ru ON ru.id = r.run_by
         LEFT JOIN users pu ON pu.id = r.posted_by
         LEFT JOIN journal_entries oe ON oe.id = r.ohada_entry_id
         LEFT JOIN journal_entries ie ON ie.id = r.ifrs_entry_id
        WHERE r.id = ? AND r.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!run) throw notFound('Depreciation run not found.');

    // One row per asset with both bases side by side: that is how an
    // accountant checks the statutory charge against the IFRS charge.
    const flat = await query(
      `SELECT dl.*, a.asset_tag, a.name AS asset_name, c.domain, c.code AS category_code,
              cc.name AS cost_center_name, ea.code AS expense_account, aa.code AS accum_account
         FROM depreciation_lines dl
         JOIN assets a ON a.id = dl.asset_id
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN cost_centers cc ON cc.id = dl.cost_center_id
         LEFT JOIN accounts ea ON ea.id = dl.expense_account_id
         LEFT JOIN accounts aa ON aa.id = dl.accum_account_id
        WHERE dl.run_id = ?
        ORDER BY a.asset_tag, dl.basis`,
      [run.id]
    );

    const byAsset = new Map();
    for (const l of flat) {
      const row = byAsset.get(l.asset_id) || {
        asset_id: l.asset_id, asset_tag: l.asset_tag, asset_name: l.asset_name,
        domain: l.domain, category_code: l.category_code, cost_center_name: l.cost_center_name,
        expense_account: l.expense_account, accum_account: l.accum_account,
      };
      row[l.basis] = {
        depreciable_base: l.depreciable_base, opening_accum_depr: l.opening_accum_depr,
        opening_nbv: l.opening_nbv, amount: l.depreciation_amount,
        closing_accum_depr: l.closing_accum_depr, closing_nbv: l.closing_nbv,
        method: l.method, annual_rate: l.annual_rate, months_charged: l.months_charged,
        is_final_period: Boolean(l.is_final_period),
      };
      byAsset.set(l.asset_id, row);
    }
    const lines = [...byAsset.values()].map((r) => ({
      ...r,
      delta: money(Number(r.ifrs?.amount ?? 0) - Number(r.ohada?.amount ?? 0)),
    }));

    res.json({
      run: { ...run, delta: money(Number(run.total_ifrs) - Number(run.total_ohada)) },
      lines,
      by_domain: summarise(lines, 'domain'),
      by_cost_center: summarise(lines, 'cost_center_name'),
    });
  })
);

function summarise(lines, key) {
  const groups = new Map();
  for (const l of lines) {
    const k = l[key] ?? 'Non affecte';
    const g = groups.get(k) || { [key]: k, asset_count: 0, ohada: 0, ifrs: 0 };
    g.asset_count += 1;
    g.ohada = money(g.ohada + Number(l.ohada?.amount ?? 0));
    g.ifrs = money(g.ifrs + Number(l.ifrs?.amount ?? 0));
    groups.set(k, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, delta: money(g.ifrs - g.ohada) }))
    .sort((a, b) => b.ohada - a.ohada);
}

/** A dry run: nothing is written, so it is safe to call repeatedly. */
depreciationRoutes.post(
  '/periods/:id/depreciation/simulate',
  requirePermission('depr.run'),
  validate({ body: z.object({ assetId: optionalId }).default({}) }),
  handler(async (req, res) => {
    const period = await requirePeriod(req);
    const sim = await transaction((tx) => simulateRun(tx, req.orgId, period.id, req.body));
    res.json({
      period: { id: period.id, code: period.code, status: period.status },
      totals: sim.totals,
      lines: sim.lines.map((l) => ({
        asset_id: l.asset.id, asset_tag: l.asset.asset_tag, asset_name: l.asset.name,
        domain: l.asset.domain, cost_center_name: l.asset.cost_center_name ?? null,
        ohada: l.ohada, ifrs: l.ifrs,
        delta: money(Number(l.ifrs.amount) - Number(l.ohada.amount)),
        subsidy_amount: l.subsidy_amount || 0,
        funding_source: l.asset.funding_source ?? null,
        donor: l.asset.donor ?? null,
      })),
    });
  })
);

/** Materialises the simulation as a run that can then be reviewed and posted. */
depreciationRoutes.post(
  '/periods/:id/depreciation/runs',
  requirePermission('depr.run'),
  validate({
    body: z.object({
      runDate: isoDate.optional(),
      notes: z.string().trim().max(400).optional().nullable(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const period = await requirePeriod(req);

    // Two simulated runs for the same period would both look postable and the
    // second would double the charge, so only one may be open at a time.
    const open = await queryOne(
      "SELECT id FROM depreciation_runs WHERE org_id = ? AND period_id = ? AND status = 'simulated'",
      [req.orgId, period.id]
    );
    if (open) {
      throw unprocessable(
        `Run #${open.id} for ${period.code} is already prepared and not yet posted. Post or delete it first.`
      );
    }
    const posted = await queryOne(
      "SELECT id FROM depreciation_runs WHERE org_id = ? AND period_id = ? AND status = 'posted'",
      [req.orgId, period.id]
    );
    if (posted) throw unprocessable(`Depreciation for ${period.code} has already been posted on run #${posted.id}.`);

    const result = await transaction((tx) =>
      createRun(tx, req.orgId, period.id, { ...req.body, actor: actorOf(req) })
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'depreciation_run',
      entityId: result.runId,
      summary: `Calcul des amortissements ${period.code} : ${result.totals.assetCount} immobilisations, `
        + `OHADA ${result.totals.ohada}, IFRS ${result.totals.ifrs}`,
      after: result.totals, context: requestContext(req),
    });
    res.status(201).json({
      run_id: result.runId,
      period: { id: period.id, code: period.code },
      totals: result.totals,
    });
  })
);

depreciationRoutes.delete(
  '/depreciation-runs/:id',
  requirePermission('depr.run'),
  handler(async (req, res) => {
    const run = await queryOne('SELECT * FROM depreciation_runs WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!run) throw notFound('Depreciation run not found.');
    if (run.status !== 'simulated') {
      throw unprocessable(`Run #${run.id} is ${run.status}; only a prepared run can be discarded.`);
    }
    await query('DELETE FROM depreciation_runs WHERE id = ?', [run.id]);
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'delete', entity: 'depreciation_run', entityId: run.id,
      summary: `Calcul des amortissements #${run.id} abandonne avant comptabilisation`,
      before: run, context: requestContext(req),
    });
    res.json({ deleted: run.id });
  })
);

depreciationRoutes.post(
  '/depreciation-runs/:id/post',
  requirePermission('depr.post'),
  validate({
    body: z.object({
      basisOfRecord: z.enum(['ohada', 'ifrs']).default('ohada'),
      overrideReason: z.string().trim().max(500).optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      postRun(tx, req.orgId, Number(req.params.id), { ...req.body, actor: actorOf(req) })
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'post', entity: 'depreciation_run',
      entityId: req.params.id,
      summary: `Amortissements ${result.period} comptabilises : ecriture ${result.recordEntry.entry_no}`
        + (result.deltaEntry ? ` et ecart IFRS ${result.deltaEntry.entry_no}` : ''),
      after: result.totals, context: requestContext(req),
    });
    res.json(result);
  })
);

/** FR-AM-030 :: the full life schedule for one asset, on both bases. */
depreciationRoutes.get(
  '/assets/:id/depreciation-schedule',
  requirePermission('depr.view'),
  validate({ query: z.object({ basis: z.enum(['ohada', 'ifrs', 'both']).default('both') }) }),
  handler(async (req, res) => {
    const asset = await queryOne(
      `SELECT a.*, c.name AS category_name FROM assets a
         JOIN asset_categories c ON c.id = a.category_id
        WHERE a.id = ? AND a.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!asset) throw notFound('Asset not found.');

    const start = asset.depr_start_date || asset.in_service_date || asset.capitalization_date;
    if (!start) {
      return res.json({ asset_tag: asset.asset_tag, ohada: [], ifrs: [], message: 'This asset has no depreciation start date yet.' });
    }

    const build = (basis) => buildSchedule({
      cost: Number(basis === 'ohada' ? asset.ohada_cost : asset.ifrs_cost),
      residual: Number(basis === 'ohada' ? asset.ohada_salvage : asset.ifrs_residual),
      usefulLifeMonths: Number(basis === 'ohada' ? asset.ohada_useful_life_months : asset.ifrs_useful_life_months),
      method: basis === 'ohada' ? asset.ohada_method : asset.ifrs_method,
      decliningFactor: Number(basis === 'ohada' ? asset.ohada_declining_factor : asset.ifrs_declining_factor),
      startDate: start,
    });

    const posted = await query(
      `SELECT dl.basis, dl.depreciation_amount, dl.months_charged, p.code AS period_code, p.end_date
         FROM depreciation_lines dl
         JOIN depreciation_runs r ON r.id = dl.run_id
         JOIN accounting_periods p ON p.id = dl.period_id
        WHERE dl.asset_id = ? AND r.status = 'posted'
        ORDER BY p.start_date, dl.basis`,
      [asset.id]
    );

    res.json({
      asset: {
        id: asset.id, asset_tag: asset.asset_tag, name: asset.name, category_name: asset.category_name,
        depr_start_date: start,
        ohada: {
          cost: asset.ohada_cost, salvage: asset.ohada_salvage, method: asset.ohada_method,
          useful_life_months: asset.ohada_useful_life_months,
          accum_depr: asset.ohada_accum_depr, nbv: asset.ohada_nbv,
        },
        ifrs: {
          cost: asset.ifrs_cost, residual: asset.ifrs_residual, method: asset.ifrs_method,
          useful_life_months: asset.ifrs_useful_life_months,
          accum_depr: asset.ifrs_accum_depr, impairment: asset.ifrs_accum_impairment, nbv: asset.ifrs_nbv,
        },
      },
      ohada: req.query.basis === 'ifrs' ? [] : build('ohada'),
      ifrs: req.query.basis === 'ohada' ? [] : build('ifrs'),
      posted,
    });
  })
);

// --- IAS 36 impairment and IAS 16 revaluation (FR-AM-031) ------------------

depreciationRoutes.get(
  '/impairments',
  requirePermission('depr.view'),
  validate({ query: pagination.extend({ status: z.string().trim().optional(), assetId: optionalId }) }),
  handler(async (req, res) => {
    const params = [req.orgId];
    let filter = '';
    if (req.query.assetId) { filter += ' AND i.asset_id = ?'; params.push(req.query.assetId); }
    if (req.query.status) { filter += ' AND i.status = ?'; params.push(req.query.status); }
    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM asset_impairments i WHERE i.org_id = ?${filter}`, params
    );
    const rows = await query(
      `SELECT i.*, a.asset_tag, a.name AS asset_name, e.entry_no, u.full_name AS approved_by_name
         FROM asset_impairments i
         JOIN assets a ON a.id = i.asset_id
         LEFT JOIN journal_entries e ON e.id = i.entry_id
         LEFT JOIN users u ON u.id = i.approved_by
        WHERE i.org_id = ?${filter}
        ORDER BY i.test_date DESC, i.id DESC LIMIT ? OFFSET ?`,
      [...params, req.query.pageSize, (req.query.page - 1) * req.query.pageSize]
    );
    res.json(paged(rows, Number(total), req.query));
  })
);

depreciationRoutes.post(
  '/assets/:id/impairments',
  requirePermission('valuation.manage'),
  validate({
    body: z.object({
      testDate: isoDate,
      indicator: z.enum(['obsolescence', 'physical_damage', 'market_decline', 'technology_change', 'idle_asset', 'regulatory', 'restructuring', 'other']),
      valueInUse: z.coerce.number().min(0).optional().nullable(),
      fairValueLessCosts: z.coerce.number().min(0).optional().nullable(),
      discountRate: z.coerce.number().min(0).max(100).optional().nullable(),
      assumptions: z.string().trim().max(600).optional().nullable(),
      post: boolish.default(false),
      overrideReason: z.string().trim().max(500).optional(),
    }).refine((b) => b.valueInUse != null || b.fairValueLessCosts != null, {
      message: 'Give a value in use or a fair value less costs of disposal (IAS 36.18).',
    }),
  }),
  handler(async (req, res) => {
    const asset = await queryOne('SELECT * FROM assets WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!asset) throw notFound('Asset not found.');

    // IAS 36.18: recoverable amount is the higher of the two measures.
    const carrying = money(
      Number(asset.ifrs_cost) - Number(asset.ifrs_accum_depr)
      - Number(asset.ifrs_accum_impairment) + Number(asset.ifrs_revaluation_surplus)
    );
    const recoverable = money(Math.max(req.body.valueInUse ?? 0, req.body.fairValueLessCosts ?? 0));
    const loss = money(Math.max(0, carrying - recoverable));
    // A reversal can never take the asset above what it would have been worth
    // had no impairment been recognised (IAS 36.117).
    const reversal = loss > 0 ? 0 : money(Math.min(Number(asset.ifrs_accum_impairment), recoverable - carrying));

    const result = await transaction(async (tx) => {
      const ins = await tx.query(
        `INSERT INTO asset_impairments
           (org_id, asset_id, test_date, period_id, indicator, carrying_amount, value_in_use,
            fair_value_less_costs, recoverable_amount, impairment_loss, reversal_amount,
            discount_rate, assumptions, status, approved_by)
         VALUES (?,?,?,
                 (SELECT id FROM accounting_periods WHERE org_id = ? AND ? BETWEEN start_date AND end_date
                   ORDER BY is_adjustment LIMIT 1),
                 ?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.orgId, asset.id, req.body.testDate, req.orgId, req.body.testDate,
          req.body.indicator, carrying, req.body.valueInUse ?? null, req.body.fairValueLessCosts ?? null,
          recoverable, loss, reversal, req.body.discountRate ?? null, req.body.assumptions ?? null,
          req.body.post ? 'approved' : 'draft', req.user.id,
        ]
      );
      const id = ins.insertId;
      if (!req.body.post) return { id, carrying, recoverable, loss, reversal, entry: null };
      if (loss === 0 && reversal === 0) {
        return { id, carrying, recoverable, loss, reversal, entry: null, message: 'No impairment: the carrying amount is recoverable.' };
      }
      const entry = await postImpairment(tx, req.orgId, id, {
        actor: actorOf(req), overrideReason: req.body.overrideReason,
      });
      return { id, carrying, recoverable, loss, reversal, entry };
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'impairment', entity: 'asset', entityId: asset.id,
      summary: `Test de perte de valeur IAS 36 (${req.body.indicator}) : VNC ${carrying}, `
        + `valeur recouvrable ${recoverable}, perte ${loss}, reprise ${reversal}`,
      after: result, context: requestContext(req),
    });
    res.status(201).json(result);
  })
);

depreciationRoutes.get(
  '/revaluations',
  requirePermission('depr.view'),
  validate({ query: pagination.extend({ status: z.string().trim().optional(), assetId: optionalId }) }),
  handler(async (req, res) => {
    const params = [req.orgId];
    let filter = '';
    if (req.query.assetId) { filter += ' AND r.asset_id = ?'; params.push(req.query.assetId); }
    if (req.query.status) { filter += ' AND r.status = ?'; params.push(req.query.status); }
    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM asset_revaluations r WHERE r.org_id = ?${filter}`, params
    );
    const rows = await query(
      `SELECT r.*, a.asset_tag, a.name AS asset_name, e.entry_no
         FROM asset_revaluations r
         JOIN assets a ON a.id = r.asset_id
         LEFT JOIN journal_entries e ON e.id = r.entry_id
        WHERE r.org_id = ?${filter}
        ORDER BY r.revaluation_date DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, req.query.pageSize, (req.query.page - 1) * req.query.pageSize]
    );
    res.json(paged(rows, Number(total), req.query));
  })
);

depreciationRoutes.post(
  '/assets/:id/revaluations',
  requirePermission('valuation.manage'),
  validate({
    body: z.object({
      revaluationDate: isoDate,
      fairValue: z.coerce.number().min(0),
      valuerName: z.string().trim().max(200).optional().nullable(),
      valuationMethod: z.enum(['market', 'income', 'depreciated_replacement_cost', 'other']).default('market'),
      newUsefulLifeMonths: z.coerce.number().int().positive().optional().nullable(),
      notes: z.string().trim().max(600).optional().nullable(),
      post: boolish.default(false),
      overrideReason: z.string().trim().max(500).optional(),
    }),
  }),
  handler(async (req, res) => {
    const asset = await queryOne(
      `SELECT a.*, c.ifrs_measurement_model, c.revaluation_surplus_account_id
         FROM assets a JOIN asset_categories c ON c.id = a.category_id
        WHERE a.id = ? AND a.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!asset) throw notFound('Asset not found.');
    if (asset.ifrs_measurement_model !== 'revaluation') {
      throw unprocessable(
        'This asset class is measured at cost under IFRS. Revaluation applies only to classes on the revaluation model (IAS 16.31).'
      );
    }

    const carrying = money(
      Number(asset.ifrs_cost) - Number(asset.ifrs_accum_depr) - Number(asset.ifrs_accum_impairment)
    );
    const amount = money(req.body.fairValue - carrying);
    // A surplus goes to OCI; a deficit first reverses any surplus already
    // held for that asset and only then hits profit or loss (IAS 16.40).
    const toOci = amount > 0
      ? amount
      : -money(Math.min(Number(asset.ifrs_revaluation_surplus), -amount));
    const toPl = amount > 0 ? 0 : money(amount - toOci);

    const result = await transaction(async (tx) => {
      const ins = await tx.query(
        `INSERT INTO asset_revaluations
           (org_id, asset_id, revaluation_date, period_id, previous_carrying, fair_value,
            revaluation_amount, to_oci_surplus, to_profit_or_loss, valuer_name, valuation_method,
            new_useful_life_months, status, approved_by, notes)
         VALUES (?,?,?,
                 (SELECT id FROM accounting_periods WHERE org_id = ? AND ? BETWEEN start_date AND end_date
                   ORDER BY is_adjustment LIMIT 1),
                 ?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.orgId, asset.id, req.body.revaluationDate, req.orgId, req.body.revaluationDate,
          carrying, req.body.fairValue, amount, toOci, toPl,
          req.body.valuerName ?? null, req.body.valuationMethod,
          req.body.newUsefulLifeMonths ?? null,
          req.body.post ? 'approved' : 'draft', req.user.id, req.body.notes ?? null,
        ]
      );
      const id = ins.insertId;
      if (!req.body.post || amount === 0) {
        return { id, previous_carrying: carrying, fair_value: req.body.fairValue, amount, to_oci: toOci, to_pl: toPl, entry: null };
      }
      const entry = await postRevaluation(tx, req.orgId, id, {
        actor: actorOf(req), overrideReason: req.body.overrideReason,
      });
      return { id, previous_carrying: carrying, fair_value: req.body.fairValue, amount, to_oci: toOci, to_pl: toPl, entry };
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'revaluation', entity: 'asset', entityId: asset.id,
      summary: `Reevaluation IAS 16 : VNC ${carrying} -> juste valeur ${req.body.fairValue} (${amount})`,
      after: result, context: requestContext(req),
    });
    res.status(201).json(result);
  })
);

async function requirePeriod(req) {
  const period = await queryOne(
    'SELECT * FROM accounting_periods WHERE id = ? AND org_id = ?',
    [req.params.id, req.orgId]
  );
  if (!period) throw notFound('Accounting period not found.');
  return period;
}
