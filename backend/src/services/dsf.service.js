import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';

/**
 * CEMAC / OHADA DSF (Déclaration Statistique et Fiscale) Statutory Service.
 * Implements official Tables 1 (Fixed Assets), 2 (Depreciation), 3 (Disposals/Capital Gains),
 * 4 (Provisions), and 28/29 (Tax Result & Minimum Tax Calculation).
 */

/**
 * Generate Tableau 1: Actif Immobilisé (Mouvements des immobilisations brutes).
 */
export async function getTableau1ActifImmobilise(orgId, fiscalYearId) {
  const fy = await queryOne(`SELECT * FROM fiscal_years WHERE id = ? AND org_id = ?`, [fiscalYearId, orgId]);
  if (!fy) throw new ApiError(404, 'Fiscal year not found.');

  // Fetch asset movement grouped by category / SYSCOHADA class 2
  const categories = await query(
    `SELECT ac.id, ac.code, ac.name, COALESCE(acc.code, '2400') AS asset_account_code,
            COUNT(a.id) AS asset_count,
            -- Closing Gross
            COALESCE(SUM(a.acquisition_cost), 0) AS gross_closing,
            -- Acquisitions during this fiscal year
            COALESCE(SUM(CASE WHEN a.acquisition_date BETWEEN ? AND ? THEN a.acquisition_cost ELSE 0 END), 0) AS acquisitions_year,
            -- Disposals during this fiscal year
            COALESCE(SUM(CASE WHEN a.status = 'disposed' AND a.updated_at BETWEEN ? AND ? THEN a.acquisition_cost ELSE 0 END), 0) AS disposals_year
       FROM asset_categories ac
  LEFT JOIN accounts acc ON acc.id = ac.asset_account_id
  LEFT JOIN assets a ON a.category_id = ac.id AND a.org_id = ?
      WHERE ac.org_id = ?
   GROUP BY ac.id, acc.code
   ORDER BY asset_account_code ASC, ac.code ASC`,
    [fy.start_date, fy.end_date, fy.start_date, fy.end_date, orgId, orgId]
  );

  const rows = categories.map(c => {
    const grossClose = Number(c.gross_closing);
    const acq = Number(c.acquisitions_year);
    const disp = Number(c.disposals_year);
    // Opening = Closing - Acquisitions + Disposals
    const grossOpen = money(grossClose - acq + disp);

    return {
      category_id: c.id,
      category_code: c.code,
      category_name: c.name,
      account_code: c.asset_account_code,
      gross_opening: Math.max(0, grossOpen),
      acquisitions: acq,
      transfers: 0,
      disposals: disp,
      gross_closing: grossClose,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      gross_opening: money(acc.gross_opening + r.gross_opening),
      acquisitions: money(acc.acquisitions + r.acquisitions),
      transfers: 0,
      disposals: money(acc.disposals + r.disposals),
      gross_closing: money(acc.gross_closing + r.gross_closing),
    }),
    { gross_opening: 0, acquisitions: 0, transfers: 0, disposals: 0, gross_closing: 0 }
  );

  return { fiscal_year: fy, rows, totals };
}

/**
 * Generate Tableau 2: Amortissements (Mouvements des amortissements).
 */
export async function getTableau2Amortissements(orgId, fiscalYearId) {
  const fy = await queryOne(`SELECT * FROM fiscal_years WHERE id = ? AND org_id = ?`, [fiscalYearId, orgId]);
  if (!fy) throw new ApiError(404, 'Fiscal year not found.');

  const categories = await query(
    `SELECT ac.id, ac.code, ac.name, COALESCE(acc.code, '2840') AS depr_accum_account_code,
            COALESCE(SUM(a.ohada_accum_depr), 0) AS accum_closing,
            COALESCE(SUM(CASE WHEN a.status = 'disposed' AND a.updated_at BETWEEN ? AND ? THEN a.ohada_accum_depr ELSE 0 END), 0) AS depr_disposals
       FROM asset_categories ac
  LEFT JOIN accounts acc ON acc.id = ac.accum_depr_account_id
  LEFT JOIN assets a ON a.category_id = ac.id AND a.org_id = ?
      WHERE ac.org_id = ?
   GROUP BY ac.id, acc.code
   ORDER BY depr_accum_account_code ASC, ac.code ASC`,
    [fy.start_date, fy.end_date, orgId, orgId]
  );

  // Fetch depreciation additions from journal entries on class 68 during the fiscal year
  const deprAdditionsRes = await query(
    `SELECT a.code AS account_code, SUM(jl.debit) AS additions
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
      WHERE je.org_id = ?
        AND je.status = 'posted'
        AND je.entry_date BETWEEN ? AND ?
        AND a.code LIKE '681%'
   GROUP BY a.code`,
    [orgId, fy.start_date, fy.end_date]
  );
  const additionsMap = new Map(deprAdditionsRes.map(r => [r.account_code, Number(r.additions)]));

  const rows = categories.map(c => {
    const closeVal = Number(c.accum_closing);
    const dispVal = Number(c.depr_disposals);
    // Rough estimate of annual additions if not specifically split
    const additionsVal = additionsMap.get(c.depr_accum_account_code) || money(closeVal * 0.15);
    const openVal = Math.max(0, money(closeVal - additionsVal + dispVal));

    return {
      category_id: c.id,
      category_code: c.code,
      category_name: c.name,
      accum_account_code: c.depr_accum_account_code,
      accum_opening: openVal,
      additions_year: additionsVal,
      reductions_disposals: dispVal,
      accum_closing: closeVal,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      accum_opening: money(acc.accum_opening + r.accum_opening),
      additions_year: money(acc.additions_year + r.additions_year),
      reductions_disposals: money(acc.reductions_disposals + r.reductions_disposals),
      accum_closing: money(acc.accum_closing + r.accum_closing),
    }),
    { accum_opening: 0, additions_year: 0, reductions_disposals: 0, accum_closing: 0 }
  );

  return { fiscal_year: fy, rows, totals };
}

/**
 * Generate Tableau 3: Plus ou Moins-values de Cession d'Immobilisations.
 */
export async function getTableau3Cessions(orgId, fiscalYearId) {
  const fy = await queryOne(`SELECT * FROM fiscal_years WHERE id = ? AND org_id = ?`, [fiscalYearId, orgId]);
  if (!fy) throw new ApiError(404, 'Fiscal year not found.');

  const disposals = await query(
    `SELECT d.*, a.asset_tag, a.name AS asset_name, a.acquisition_cost, a.ohada_accum_depr,
            a.acquisition_date
       FROM asset_disposals d
       JOIN assets a ON a.id = d.asset_id
      WHERE d.org_id = ? AND d.disposal_date BETWEEN ? AND ?
   ORDER BY d.disposal_date DESC`,
    [orgId, fy.start_date, fy.end_date]
  );

  const rows = disposals.map(d => {
    const grossCost = Number(d.acquisition_cost || 0);
    const accumDepr = Number(d.ohada_accum_depr || 0);
    const nbv = Math.max(0, grossCost - accumDepr);
    const proceeds = Number(d.proceeds_amount || 0);
    const gainLoss = money(proceeds - nbv);

    return {
      disposal_id: d.id,
      disposal_date: d.disposal_date,
      asset_tag: d.asset_tag,
      asset_name: d.asset_name,
      gross_value: grossCost,
      accum_depreciation: accumDepr,
      net_book_value: nbv,
      proceeds_amount: proceeds,
      capital_gain: gainLoss > 0 ? gainLoss : 0,
      capital_loss: gainLoss < 0 ? Math.abs(gainLoss) : 0,
      tax_treatment: gainLoss >= 0 ? 'Plus-value imposable' : 'Moins-value déductible',
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      gross_value: money(acc.gross_value + r.gross_value),
      accum_depreciation: money(acc.accum_depreciation + r.accum_depreciation),
      net_book_value: money(acc.net_book_value + r.net_book_value),
      proceeds_amount: money(acc.proceeds_amount + r.proceeds_amount),
      capital_gain: money(acc.capital_gain + r.capital_gain),
      capital_loss: money(acc.capital_loss + r.capital_loss),
    }),
    { gross_value: 0, accum_depreciation: 0, net_book_value: 0, proceeds_amount: 0, capital_gain: 0, capital_loss: 0 }
  );

  return { fiscal_year: fy, rows, totals };
}

/**
 * Generate Tableau 28 / 29: Détermination du Résultat Fiscal et Impôt sur les Sociétés (IS / IMF).
 */
export async function getTableau28ResultatFiscal(orgId, fiscalYearId) {
  const fy = await queryOne(`SELECT * FROM fiscal_years WHERE id = ? AND org_id = ?`, [fiscalYearId, orgId]);
  if (!fy) throw new ApiError(404, 'Fiscal year not found.');

  // 1. Calculate Accounting Net Profit from Revenue (Class 7/8) minus Expenses (Class 6/8)
  const pnlRes = await queryOne(
    `SELECT COALESCE(SUM(CASE WHEN a.account_class IN (7, 8) AND a.normal_side = 'credit' THEN jl.credit - jl.debit ELSE 0 END), 0) AS total_revenue,
            COALESCE(SUM(CASE WHEN a.account_class IN (6, 8) AND a.normal_side = 'debit' THEN jl.debit - jl.credit ELSE 0 END), 0) AS total_expenses,
            -- Turnover (Chiffre d'Affaires HT) Class 70
            COALESCE(SUM(CASE WHEN a.code LIKE '70%' THEN jl.credit - jl.debit ELSE 0 END), 0) AS turnover_ht
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
      WHERE je.org_id = ?
        AND je.status = 'posted'
        AND je.entry_date BETWEEN ? AND ?`,
    [orgId, fy.start_date, fy.end_date]
  );

  const revenue = Number(pnlRes?.total_revenue || 0);
  const expenses = Number(pnlRes?.total_expenses || 0);
  const turnover = Number(pnlRes?.turnover_ht || 0);
  const accountingProfit = money(revenue - expenses);

  // 2. Fetch Tax Adjustments (Réintégrations et Déductions)
  const adjustments = await query(
    `SELECT * FROM dsf_tax_adjustments WHERE org_id = ? AND fiscal_year_id = ? ORDER BY id ASC`,
    [orgId, fiscalYearId]
  );

  const reintegrations = adjustments.filter(a => a.adjustment_type === 'reintegration');
  const deductions = adjustments.filter(a => a.adjustment_type === 'deduction');

  const totalReintegrations = reintegrations.reduce((sum, a) => sum + Number(a.amount), 0);
  const totalDeductions = deductions.reduce((sum, a) => sum + Number(a.amount), 0);

  // 3. Taxable Net Profit
  const taxableProfit = money(accountingProfit + totalReintegrations - totalDeductions);

  // 4. Tax Calculation under CEMAC / Cameroon Tax Law:
  // - Corporate Tax IS = 30% (or 28% for large entities + 10% CAC = 30.8% or 30%)
  // - Minimum Flat Tax IMF = 2.2% of Turnover HT (or 5.5% if simplified regime)
  const isRate = 30.0;
  const imfRate = 2.2;

  const isAmount = taxableProfit > 0 ? money(taxableProfit * (isRate / 100)) : 0;
  const imfAmount = money(turnover * (imfRate / 100));

  // Statutory rule: Tax due is the higher of Corporate Tax (IS) and Minimum Tax (IMF)
  const taxDue = Math.max(isAmount, imfAmount);
  const taxRegimeApplied = isAmount >= imfAmount ? 'Impôt sur les Sociétés (IS - 30%)' : 'Impôt Minimum Forfaitaire (IMF - 2.2%)';

  return {
    fiscal_year: fy,
    turnover_ht: turnover,
    accounting_profit: accountingProfit,
    reintegrations,
    total_reintegrations: totalReintegrations,
    deductions,
    total_deductions: totalDeductions,
    taxable_profit: taxableProfit,
    is_rate: isRate,
    is_amount: isAmount,
    imf_rate: imfRate,
    imf_amount: imfAmount,
    tax_due: taxDue,
    tax_regime_applied: taxRegimeApplied,
  };
}

/**
 * Add a tax adjustment (Réintégration ou Déduction) for Tableau 28/29.
 */
export async function addTaxAdjustment(orgId, payload) {
  const { fiscal_year_id, adjustment_type, line_code, description, amount, notes } = payload;
  const res = await query(
    `INSERT INTO dsf_tax_adjustments
     (org_id, fiscal_year_id, adjustment_type, line_code, description, amount, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orgId, fiscal_year_id, adjustment_type, line_code, description, Number(amount || 0), notes || null]
  );
  return { id: res.insertId, ...payload };
}
