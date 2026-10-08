import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { handler, requirePermission, validate } from '../middleware/index.js';
import {
  buildTrialBalance, buildOhadaStatement, buildIfrsStatement, buildCashFlow,
  buildChangesInEquity, buildPpeNote, reconcileAssetRegisterToLedger,
} from '../services/reporting.service.js';
import { maintenanceOverview, reliabilityByAsset } from '../services/maintenance.service.js';
import { notFound, badRequest } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { today, compare } from '../utils/dates.js';
import { isoDate, optionalId, boolish } from './helpers.js';

export const reportRoutes = Router();

/** Every reporting endpoint reads the same handle shape as the verify script. */
const db = { query, queryOne };

/** OHADA statement lines are keyed by their statutory line code. */
const lineOf = (statement, code) =>
  money(statement.lines.find((l) => l.line_code === code)?.net ?? 0);

const rangeQuery = z.object({
  from: isoDate,
  to: isoDate,
  costCenterId: optionalId,
}).refine((r) => compare(r.from, r.to) <= 0, { message: 'The start of the period must not be after its end.' });

/**
 * The statements the hospital files. Two presentations of one ledger
 * (FR-STD-020), so the caller picks a framework rather than a data source.
 */
const OHADA_STATEMENTS = {
  bilan: { code: 'BILAN', title: 'Bilan', title_en: 'Statement of financial position' },
  resultat: { code: 'CR', title: 'Compte de resultat', title_en: 'Income statement' },
  tafire: { code: 'TAFIRE', title: 'Tableau des flux de tresorerie (TAFIRE)', title_en: 'Statement of cash flows' },
};

const IFRS_STATEMENTS = {
  sofp: { code: 'sofp', title: 'Statement of financial position', title_en: 'Statement of financial position' },
  pl: { code: 'pl', title: 'Statement of profit or loss', title_en: 'Statement of profit or loss' },
  oci: { code: 'oci', title: 'Other comprehensive income', title_en: 'Other comprehensive income' },
};

reportRoutes.get(
  '/reports/catalog',
  requirePermission('report.financial', 'report.asset'),
  handler(async (req, res) => {
    const org = await queryOne(
      'SELECT name, country_code, functional_currency, reporting_tier, frameworks FROM organizations WHERE id = ?',
      [req.orgId]
    );
    const years = await query(
      `SELECT y.id, y.code, y.start_date, y.end_date, y.status,
              COUNT(p.id) AS period_count,
              SUM(p.status = 'open') AS open_periods
         FROM fiscal_years y
         LEFT JOIN accounting_periods p ON p.fiscal_year_id = y.id
        WHERE y.org_id = ? GROUP BY y.id ORDER BY y.start_date DESC`,
      [req.orgId]
    );
    res.json({
      organisation: org,
      fiscal_years: years,
      statements: {
        ohada: Object.entries(OHADA_STATEMENTS).map(([slug, s]) => ({ slug, ...s })),
        ifrs: [
          ...Object.entries(IFRS_STATEMENTS).map(([slug, s]) => ({ slug, ...s })),
          { slug: 'cash-flow', code: 'cash_flow', title: 'Statement of cash flows (IAS 7, indirect)', title_en: 'Statement of cash flows' },
          { slug: 'equity', code: 'soce', title: 'Statement of changes in equity', title_en: 'Statement of changes in equity' },
          { slug: 'ppe-note', code: 'ppe', title: 'Property, plant and equipment note (IAS 16)', title_en: 'PP&E note' },
        ],
      },
    });
  })
);

// --- OHADA / SYSCOHADA statutory pack --------------------------------------

reportRoutes.get(
  '/reports/ohada/:statement',
  requirePermission('report.financial'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    const meta = OHADA_STATEMENTS[req.params.statement];
    if (!meta) throw notFound(`"${req.params.statement}" is not an OHADA statement. Try bilan, resultat or tafire.`);
    const statement = await buildOhadaStatement(db, req.orgId, meta.code, req.query);
    res.json({ framework: 'ohada', ...meta, ...req.query, ...statement });
  })
);

/** The whole statutory pack in one call, which is what the close needs. */
reportRoutes.get(
  '/reports/ohada',
  requirePermission('report.financial'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    const [bilan, resultat, tafire] = await Promise.all([
      buildOhadaStatement(db, req.orgId, 'BILAN', req.query),
      buildOhadaStatement(db, req.orgId, 'CR', req.query),
      buildOhadaStatement(db, req.orgId, 'TAFIRE', req.query),
    ]);
    res.json({
      framework: 'ohada',
      ...req.query,
      bilan: { ...OHADA_STATEMENTS.bilan, ...bilan },
      resultat: { ...OHADA_STATEMENTS.resultat, ...resultat },
      tafire: { ...OHADA_STATEMENTS.tafire, ...tafire },
      // The Compte de resultat has no self-balancing identity of its own; its
      // check simply carries the net result, so it is not a pass/fail row.
      checks: [bilan.check, tafire.check].filter((c) => c && c.balanced !== undefined),
      net_result: resultat.check.net_result,
    });
  })
);

// --- IFRS presentation -----------------------------------------------------

reportRoutes.get(
  '/reports/ifrs/cash-flow',
  requirePermission('report.financial'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    res.json({ framework: 'ifrs', ...req.query, ...(await buildCashFlow(db, req.orgId, req.query)) });
  })
);

reportRoutes.get(
  '/reports/ifrs/equity',
  requirePermission('report.financial'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    res.json({ framework: 'ifrs', ...req.query, ...(await buildChangesInEquity(db, req.orgId, req.query)) });
  })
);

reportRoutes.get(
  '/reports/ifrs/ppe-note',
  requirePermission('report.financial', 'report.asset'),
  validate({ query: rangeQuery.and(z.object({ basis: z.enum(['ohada', 'ifrs']).default('ifrs') })) }),
  handler(async (req, res) => {
    const note = await buildPpeNote(db, req.orgId, req.query);
    const t = note.totals;
    // The note is only useful if it articulates, so the roll-forward identities
    // travel with it rather than being left to whoever renders the table.
    const identity = (label, computed, reported) => ({
      label,
      computed: money(computed),
      reported: money(reported),
      difference: money(computed - reported),
      balanced: Math.abs(money(computed - reported)) < 0.02,
    });
    res.json({
      ...req.query,
      ...note,
      checks: [
        identity(
          'Opening cost + additions - disposals + revaluation = closing cost',
          t.opening_cost + t.additions - t.disposals_cost + t.revaluation,
          t.closing_cost
        ),
        identity(
          'Opening depreciation + charge - disposals = closing depreciation',
          t.opening_accum_depr + t.depreciation_charge - t.disposals_accum_depr,
          t.closing_accum_depr
        ),
        identity(
          'Closing cost less depreciation and impairment = carrying amount',
          t.closing_cost - t.closing_accum_depr - t.accum_impairment,
          t.carrying_amount
        ),
      ],
    });
  })
);

reportRoutes.get(
  '/reports/ifrs/:statement',
  requirePermission('report.financial'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    const meta = IFRS_STATEMENTS[req.params.statement];
    if (!meta) throw notFound(`"${req.params.statement}" is not an IFRS statement. Try sofp, pl, oci, cash-flow or equity.`);
    const statement = await buildIfrsStatement(db, req.orgId, meta.code, req.query);
    res.json({ framework: 'ifrs', ...meta, ...req.query, ...statement });
  })
);

reportRoutes.get(
  '/reports/ifrs',
  requirePermission('report.financial'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    const [sofp, pl, oci, cashFlow, equity] = await Promise.all([
      buildIfrsStatement(db, req.orgId, 'sofp', req.query),
      buildIfrsStatement(db, req.orgId, 'pl', req.query),
      buildIfrsStatement(db, req.orgId, 'oci', req.query),
      buildCashFlow(db, req.orgId, req.query),
      buildChangesInEquity(db, req.orgId, req.query),
    ]);
    res.json({
      framework: 'ifrs',
      ...req.query,
      sofp: { ...IFRS_STATEMENTS.sofp, ...sofp },
      pl: { ...IFRS_STATEMENTS.pl, ...pl },
      oci: { ...IFRS_STATEMENTS.oci, ...oci },
      cash_flow: cashFlow,
      equity,
      checks: [sofp.check, cashFlow.check, equity.check].filter((c) => c && c.balanced !== undefined),
      profit_for_the_year: pl.totals.profit_for_the_year,
      total_oci: oci.totals.total_oci,
    });
  })
);

/**
 * FR-STD-020 :: the bridge between the two presentations. The statutory result
 * plus the IFRS-only divergence entries must equal the IFRS profit, and this
 * is the reconciliation an auditor asks for first.
 */
reportRoutes.get(
  '/reports/dual-standard-bridge',
  requirePermission('report.financial'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    const { from, to } = req.query;
    const [ohada, ifrs, byFramework, deltas] = await Promise.all([
      buildOhadaStatement(db, req.orgId, 'CR', req.query),
      buildIfrsStatement(db, req.orgId, 'pl', req.query),
      query(
        `SELECT e.framework, COUNT(*) AS entries, COALESCE(SUM(e.total_debit), 0) AS total
           FROM journal_entries e
          WHERE e.org_id = ? AND e.status = 'posted' AND e.entry_date BETWEEN ? AND ?
          GROUP BY e.framework`,
        [req.orgId, from, to]
      ),
      query(
        `SELECT e.id, e.entry_no, e.entry_date, e.description, e.source,
                COALESCE(SUM(l.credit - l.debit), 0) AS profit_effect
           FROM journal_entries e
           JOIN journal_lines l ON l.entry_id = e.id
           JOIN accounts a ON a.id = l.account_id
          WHERE e.org_id = ? AND e.status = 'posted' AND e.framework = 'ifrs'
            AND e.entry_date BETWEEN ? AND ? AND a.account_class IN (6, 7, 8)
          GROUP BY e.id ORDER BY e.entry_date, e.id`,
        [req.orgId, from, to]
      ),
    ]);

    const ohadaResult = money(ohada.check.net_result);
    const ifrsResult = money(ifrs.totals.profit_for_the_year);
    const deltaTotal = money(deltas.reduce((s, d) => s + Number(d.profit_effect), 0));

    res.json({
      ...req.query,
      entries_by_framework: byFramework,
      ohada_result: ohadaResult,
      ifrs_only_adjustments: deltaTotal,
      ifrs_result: ifrsResult,
      difference: money(ohadaResult + deltaTotal - ifrsResult),
      reconciled: money(ohadaResult + deltaTotal - ifrsResult) === 0,
      adjustments: deltas.map((d) => ({ ...d, profit_effect: money(d.profit_effect) })),
    });
  })
);

// --- ledger reports --------------------------------------------------------

reportRoutes.get(
  '/reports/trial-balance',
  requirePermission('report.financial'),
  validate({
    query: rangeQuery.and(z.object({
      framework: z.enum(['ohada', 'ifrs']).default('ohada'),
      includeZero: boolish.default(false),
    })),
  }),
  handler(async (req, res) => {
    res.json({ ...req.query, ...(await buildTrialBalance(db, req.orgId, req.query)) });
  })
);

// --- asset and maintenance reports (FR-AM-050) -----------------------------

/** The fixed-asset register as a report: gross, depreciation, net by category. */
reportRoutes.get(
  '/reports/asset-register',
  requirePermission('report.asset'),
  validate({
    query: z.object({
      asOf: isoDate.optional(),
      basis: z.enum(['ohada', 'ifrs']).default('ohada'),
      groupBy: z.enum(['category', 'domain', 'cost_center', 'location', 'funding_source']).default('category'),
      domain: z.enum(['biomedical', 'facility', 'fleet', 'it_office']).optional(),
    }),
  }),
  handler(async (req, res) => {
    const asOf = req.query.asOf || today();
    const ifrs = req.query.basis === 'ifrs';
    const GROUP = {
      category: ['c.code', 'c.name'],
      domain: ['c.domain', 'c.domain'],
      cost_center: ['cc.code', 'cc.name'],
      location: ['l.code', 'l.name'],
      funding_source: ['a.funding_source', 'a.funding_source'],
    }[req.query.groupBy];

    const params = [asOf, asOf, req.orgId];
    let filter = '';
    if (req.query.domain) { filter = ' AND c.domain = ?'; params.push(req.query.domain); }

    const rows = await query(
      `SELECT ${GROUP[0]} AS group_code, ${GROUP[1]} AS group_name, c.domain,
              COUNT(*) AS asset_count,
              COALESCE(SUM(${ifrs ? 'a.ifrs_cost' : 'a.ohada_cost'}), 0) AS gross,
              COALESCE(SUM(${ifrs ? 'a.ifrs_accum_depr' : 'a.ohada_accum_depr'}), 0) AS accumulated_depreciation,
              COALESCE(SUM(${ifrs ? 'a.ifrs_accum_impairment' : '0'}), 0) AS impairment,
              COALESCE(SUM(${ifrs ? 'a.ifrs_nbv' : 'a.ohada_nbv'}), 0) AS net,
              COALESCE(SUM(a.total_maintenance_cost), 0) AS maintenance_cost,
              SUM(a.use_restricted) AS restricted_count
         FROM assets a
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
         LEFT JOIN asset_locations l ON l.id = a.location_id
         LEFT JOIN asset_disposals d ON d.id = a.disposal_id AND d.status = 'completed'
        WHERE a.is_capitalized = 1
          AND COALESCE(a.capitalization_date, a.acquisition_date) <= ?
          AND (a.status <> 'disposed' OR d.disposal_date > ?)
          AND a.org_id = ?${filter}
        GROUP BY group_code, group_name, c.domain
        ORDER BY gross DESC`,
      params
    );

    const totals = rows.reduce(
      (t, r) => ({
        asset_count: t.asset_count + Number(r.asset_count),
        gross: money(t.gross + Number(r.gross)),
        accumulated_depreciation: money(t.accumulated_depreciation + Number(r.accumulated_depreciation)),
        impairment: money(t.impairment + Number(r.impairment)),
        net: money(t.net + Number(r.net)),
        maintenance_cost: money(t.maintenance_cost + Number(r.maintenance_cost)),
      }),
      { asset_count: 0, gross: 0, accumulated_depreciation: 0, impairment: 0, net: 0, maintenance_cost: 0 }
    );

    res.json({ as_of: asOf, basis: req.query.basis, group_by: req.query.groupBy, rows, totals });
  })
);

/**
 * The SRS section 10 acceptance test, exposed so the close checklist can be
 * evidenced from the application rather than from a script.
 */
reportRoutes.get(
  '/reports/register-reconciliation',
  requirePermission('report.asset', 'report.financial'),
  validate({ query: z.object({ asOf: isoDate, basis: z.enum(['ohada', 'ifrs']).default('ohada') }) }),
  handler(async (req, res) => {
    res.json({ ...req.query, ...(await reconcileAssetRegisterToLedger(db, req.orgId, req.query)) });
  })
);

/** FR-AM-030 :: the depreciation charge for a window, by period and category. */
reportRoutes.get(
  '/reports/depreciation',
  requirePermission('report.asset'),
  validate({ query: rangeQuery }),
  handler(async (req, res) => {
    const { from, to } = req.query;
    const byPeriod = await query(
      `SELECT p.code AS period_code, p.start_date, p.end_date, r.id AS run_id, r.status,
              COALESCE(SUM(CASE WHEN dl.basis = 'ohada' THEN dl.depreciation_amount END), 0) AS ohada,
              COALESCE(SUM(CASE WHEN dl.basis = 'ifrs'  THEN dl.depreciation_amount END), 0) AS ifrs,
              COUNT(DISTINCT dl.asset_id) AS asset_count
         FROM depreciation_runs r
         JOIN accounting_periods p ON p.id = r.period_id
         JOIN depreciation_lines dl ON dl.run_id = r.id
        WHERE r.org_id = ? AND r.status = 'posted' AND p.start_date >= ? AND p.end_date <= ?
        GROUP BY r.id ORDER BY p.start_date`,
      [req.orgId, from, to]
    );
    const byCategory = await query(
      `SELECT c.code AS category_code, c.name AS category_name, c.domain,
              COALESCE(SUM(CASE WHEN dl.basis = 'ohada' THEN dl.depreciation_amount END), 0) AS ohada,
              COALESCE(SUM(CASE WHEN dl.basis = 'ifrs'  THEN dl.depreciation_amount END), 0) AS ifrs,
              COUNT(DISTINCT dl.asset_id) AS asset_count
         FROM depreciation_lines dl
         JOIN depreciation_runs r ON r.id = dl.run_id
         JOIN accounting_periods p ON p.id = dl.period_id
         JOIN assets a ON a.id = dl.asset_id
         JOIN asset_categories c ON c.id = a.category_id
        WHERE dl.org_id = ? AND r.status = 'posted' AND p.start_date >= ? AND p.end_date <= ?
        GROUP BY c.id ORDER BY ohada DESC`,
      [req.orgId, from, to]
    );

    const totals = byPeriod.reduce(
      (t, r) => ({ ohada: money(t.ohada + Number(r.ohada)), ifrs: money(t.ifrs + Number(r.ifrs)) }),
      { ohada: 0, ifrs: 0 }
    );
    res.json({
      ...req.query,
      by_period: byPeriod.map((r) => ({ ...r, delta: money(Number(r.ifrs) - Number(r.ohada)) })),
      by_category: byCategory.map((r) => ({ ...r, delta: money(Number(r.ifrs) - Number(r.ohada)) })),
      totals: { ...totals, delta: money(totals.ifrs - totals.ohada) },
    });
  })
);

/** FR-AM-022 :: the calibration and safety compliance report for the regulator. */
reportRoutes.get(
  '/reports/compliance',
  requirePermission('report.asset'),
  validate({ query: z.object({ asOf: isoDate.optional(), horizonDays: z.coerce.number().int().min(1).max(365).default(60) }) }),
  handler(async (req, res) => {
    const asOf = req.query.asOf || today();
    const overview = await maintenanceOverview(db, req.orgId, { asOf, horizonDays: req.query.horizonDays });

    const coverage = await query(
      `SELECT c.domain,
              COUNT(*) AS assets_requiring,
              SUM(a.next_calibration_date >= ?) AS in_date,
              SUM(a.next_calibration_date < ?) AS overdue,
              SUM(a.next_calibration_date IS NULL) AS never_calibrated
         FROM assets a JOIN asset_categories c ON c.id = a.category_id
        WHERE a.org_id = ? AND c.requires_calibration = 1
          AND a.status NOT IN ('disposed','pending_disposal','draft')
        GROUP BY c.domain`,
      [asOf, asOf, req.orgId]
    );

    const withRate = coverage.map((r) => ({
      ...r,
      compliance_pct: Number(r.assets_requiring) > 0
        ? money((Number(r.in_date) / Number(r.assets_requiring)) * 100)
        : null,
    }));

    res.json({
      as_of: asOf,
      calibration_coverage: withRate,
      overall_compliance_pct: withRate.length
        ? money(
          (withRate.reduce((s, r) => s + Number(r.in_date), 0)
            / Math.max(1, withRate.reduce((s, r) => s + Number(r.assets_requiring), 0))) * 100
        )
        : null,
      overdue: overview.overdue,
      due_soon: overview.due_soon,
      restricted: overview.restricted,
      contracts: overview.contracts,
    });
  })
);

/** FR-AM-032 :: what each asset costs to own, for replacement decisions. */
reportRoutes.get(
  '/reports/cost-of-ownership',
  requirePermission('report.asset'),
  validate({
    query: rangeQuery.and(z.object({
      domain: z.enum(['biomedical', 'facility', 'fleet', 'it_office']).optional(),
    })),
  }),
  handler(async (req, res) => {
    const rows = await reliabilityByAsset(db, req.orgId, req.query);
    // A device whose lifetime repairs exceed a third of its cost is the
    // classic replace-rather-than-repair candidate.
    const candidates = rows.filter((r) => Number(r.maintenance_to_cost_pct) >= 33);
    res.json({
      ...req.query,
      rows,
      replacement_candidates: candidates.map((r) => ({
        asset_tag: r.asset_tag, name: r.name, criticality: r.criticality,
        cost: r.ohada_cost, lifetime_maintenance: r.total_maintenance_cost,
        maintenance_to_cost_pct: r.maintenance_to_cost_pct,
        availability_pct: r.availability_pct, failures: r.failures,
      })),
      total: rows.length,
    });
  })
);

/** The action history behind every figure above (SRS non-functional control). */
reportRoutes.get(
  '/audit-log',
  requirePermission('admin.audit'),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
      entity: z.string().trim().max(40).optional(),
      entityId: optionalId,
      action: z.string().trim().max(40).optional(),
      userId: optionalId,
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query;
    const params = [req.orgId];
    let filter = '';
    if (q.entity) { filter += ' AND al.entity_type = ?'; params.push(q.entity); }
    if (q.entityId) { filter += ' AND al.entity_id = ?'; params.push(String(q.entityId)); }
    if (q.action) { filter += ' AND al.action = ?'; params.push(q.action); }
    if (q.userId) { filter += ' AND al.user_id = ?'; params.push(q.userId); }
    if (q.from) { filter += ' AND al.created_at >= ?'; params.push(`${q.from} 00:00:00`); }
    if (q.to) { filter += ' AND al.created_at <= ?'; params.push(`${q.to} 23:59:59`); }

    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM audit_log al WHERE al.org_id = ?${filter}`, params
    );
    const rows = await query(
      `SELECT al.id, al.created_at, al.action, al.entity_type, al.entity_id, al.summary,
              al.user_email, al.ip_address, u.full_name AS user_name, r.name AS role_name
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE al.org_id = ?${filter}
        ORDER BY al.id DESC LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json({ rows, page: q.page, pageSize: q.pageSize, total: Number(total) });
  })
);

/** The landing dashboard: one call, because it is the first screen after login. */
reportRoutes.get(
  '/dashboard',
  requirePermission('coa.view', 'asset.view', 'wo.view', 'errand.view'),
  validate({ query: z.object({ framework: z.enum(['ohada', 'ifrs']).default('ohada') }) }),
  handler(async (req, res) => {
    const framework = req.query.framework === 'ifrs' ? 'ifrs' : 'ohada';
    const period = await queryOne(
      `SELECT p.*, y.code AS fiscal_year FROM accounting_periods p
         JOIN fiscal_years y ON y.id = p.fiscal_year_id
        WHERE p.org_id = ? AND p.status = 'open' AND p.is_adjustment = 0
        ORDER BY p.start_date LIMIT 1`,
      [req.orgId]
    );
    const year = await queryOne(
      "SELECT * FROM fiscal_years WHERE org_id = ? AND status <> 'closed' ORDER BY start_date DESC LIMIT 1",
      [req.orgId]
    );
    if (!year) throw badRequest('No fiscal year is open.');

    const range = { from: year.start_date, to: period?.end_date || year.end_date };
    const can = (code) => req.user.permissions.includes(code);
    const fwIn = framework === 'ifrs' ? ['both', 'ifrs'] : ['both', 'ohada'];
    const nbvCol = framework === 'ifrs' ? 'ifrs_nbv' : 'ohada_nbv';
    const costCol = framework === 'ifrs' ? 'ifrs_cost' : 'ohada_cost';

    const [assets, maintenance, ledger, resultat] = await Promise.all([
      can('asset.view')
        ? queryOne(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(a.${nbvCol}), 0) AS net_book_value,
                  COALESCE(SUM(a.${costCol}), 0) AS gross,
                  SUM(a.use_restricted) AS restricted,
                  SUM(a.status = 'out_of_service') AS out_of_service,
                  SUM(a.criticality = 'critical') AS critical
             FROM assets a WHERE a.org_id = ? AND a.status <> 'disposed'`,
          [req.orgId]
        )
        : null,
      can('wo.view') ? maintenanceOverview(db, req.orgId, { horizonDays: 30 }) : null,
      can('journal.view')
        ? queryOne(
          `SELECT COUNT(*) AS posted_entries,
                  SUM(e.status = 'draft') AS draft_entries
             FROM journal_entries e
            WHERE e.org_id = ? AND e.entry_date BETWEEN ? AND ?
              AND e.framework IN (?, ?)`,
          [req.orgId, range.from, range.to, ...fwIn]
        )
        : null,
      can('report.financial')
        ? (framework === 'ifrs'
          ? buildIfrsStatement(db, req.orgId, 'pl', range)
          : buildOhadaStatement(db, req.orgId, 'CR', range))
        : null,
    ]);

    let result = null;
    if (resultat && framework === 'ifrs') {
      const lines = (resultat.sections || []).flatMap((s) => s.lines || []);
      const amt = (code) => money(lines.find((l) => l.code === code)?.amount ?? 0);
      result = {
        revenue: amt('PL.REVENUE'),
        operating_grants: amt('PL.GRANT_INCOME'),
        operating_result: money(resultat.totals?.operating_profit ?? 0),
        net_result: money(resultat.totals?.profit_for_the_year ?? 0),
      };
    } else if (resultat) {
      result = {
        // XB is turnover; TG is the State operating subsidy, which for a
        // public hospital is most of what funds the year.
        revenue: lineOf(resultat, 'XB'),
        operating_grants: lineOf(resultat, 'TG'),
        operating_result: lineOf(resultat, 'XE'),
        net_result: money(resultat.check.net_result),
      };
    }

    res.json({
      period: period ? { id: period.id, code: period.code, start_date: period.start_date, end_date: period.end_date, status: period.status } : null,
      fiscal_year: { id: year.id, code: year.code, start_date: year.start_date, end_date: year.end_date },
      year_to_date: range,
      framework,
      assets,
      maintenance: maintenance && {
        work_orders: maintenance.work_orders,
        overdue_assets: maintenance.overdue.length,
        due_soon: maintenance.due_soon.length,
        restricted: maintenance.restricted,
        expiring_contracts: maintenance.contracts.filter((c) => Number(c.days_to_expiry) <= 60).length,
      },
      ledger,
      result,
    });
  })
);
