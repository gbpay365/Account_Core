import { money } from '../utils/money.js';
import { executeCofinancingSplit } from './donor-cofinancing.service.js';

/**
 * Multi-Axial Analytical & Budget Control Service
 * Implements West African Institutional & Enterprise Budget Management
 * (OHADA / UEMOA / CEMAC Budget Execution Cycle, Multi-Axial Commitments,
 *  Asset Capex Linking, Credit Transfers / Virements, and Real-Time Controls).
 */

export async function listFundingPrograms({ query }, orgId) {
  return query(
    `SELECT fp.*,
            (SELECT COUNT(*) FROM analytical_activities aa WHERE aa.program_id = fp.id) AS activity_count
       FROM funding_programs fp
      WHERE fp.org_id = ?
      ORDER BY fp.is_active DESC, fp.code ASC`,
    [orgId]
  );
}

export async function listAnalyticalActivities({ query }, orgId, programId = null) {
  const sql = `
    SELECT aa.*, fp.code AS program_code, fp.name AS program_name
      FROM analytical_activities aa
      LEFT JOIN funding_programs fp ON fp.id = aa.program_id
     WHERE aa.org_id = ?
       ${programId ? 'AND aa.program_id = ?' : ''}
     ORDER BY aa.is_active DESC, aa.code ASC`;
  const params = programId ? [orgId, programId] : [orgId];
  return query(sql, params);
}

// -----------------------------------------------------------------------------
// 1. Budget Master & Planning
// -----------------------------------------------------------------------------

export async function listBudgets({ query }, orgId, { fiscalYearId = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (fiscalYearId) {
    filter = 'AND b.fiscal_year_id = ?';
    params.push(fiscalYearId);
  }

  return query(
    `SELECT b.*,
            fy.code AS fiscal_year_code,
            fy.name AS fiscal_year_name,
            u.full_name AS approver_name,
            (SELECT COUNT(*) FROM budget_lines bl WHERE bl.budget_id = b.id) AS line_count,
            (SELECT COALESCE(SUM(bl.amount), 0) FROM budget_lines bl WHERE bl.budget_id = b.id) AS total_amount,
            (SELECT COALESCE(SUM(bl.amount), 0) FROM budget_lines bl WHERE bl.budget_id = b.id AND bl.budget_type = 'opex') AS total_opex,
            (SELECT COALESCE(SUM(bl.amount), 0) FROM budget_lines bl WHERE bl.budget_id = b.id AND bl.budget_type = 'capex') AS total_capex
       FROM budgets b
       JOIN fiscal_years fy ON fy.id = b.fiscal_year_id
       LEFT JOIN users u ON u.id = b.approved_by
      WHERE b.org_id = ? ${filter}
      ORDER BY b.created_at DESC`,
    params
  );
}

// -----------------------------------------------------------------------------
// Helper: Periodic Phasing & Spread Curves (SAP S/4HANA & Sage X3 Model)
// -----------------------------------------------------------------------------

export function calculateSpreadQuarters(amount, spreadCurve = 'equal_quarterly', customQuarters = null) {
  const tot = Number(amount || 0);
  if (tot <= 0) {
    return { q1: 0, q2: 0, q3: 0, q4: 0, spreadCurve };
  }

  if (spreadCurve === 'custom' && customQuarters) {
    const q1 = Number(customQuarters.q1 || 0);
    const q2 = Number(customQuarters.q2 || 0);
    const q3 = Number(customQuarters.q3 || 0);
    const q4 = Number(customQuarters.q4 || 0);
    return { q1, q2, q3, q4, spreadCurve: 'custom' };
  }

  if (spreadCurve === 'front_loaded') {
    // 40% Q1, 30% Q2, 20% Q3, 10% Q4
    const q1 = Math.round(tot * 0.40 * 100) / 100;
    const q2 = Math.round(tot * 0.30 * 100) / 100;
    const q3 = Math.round(tot * 0.20 * 100) / 100;
    const q4 = Math.round((tot - q1 - q2 - q3) * 100) / 100;
    return { q1, q2, q3, q4, spreadCurve };
  }

  if (spreadCurve === 'back_loaded') {
    // 10% Q1, 20% Q2, 30% Q3, 40% Q4
    const q1 = Math.round(tot * 0.10 * 100) / 100;
    const q2 = Math.round(tot * 0.20 * 100) / 100;
    const q3 = Math.round(tot * 0.30 * 100) / 100;
    const q4 = Math.round((tot - q1 - q2 - q3) * 100) / 100;
    return { q1, q2, q3, q4, spreadCurve };
  }

  // equal_quarterly and even_monthly (25% / quarter)
  const qBase = Math.round((tot / 4) * 100) / 100;
  const q1 = qBase;
  const q2 = qBase;
  const q3 = qBase;
  const q4 = Math.round((tot - qBase * 3) * 100) / 100;
  return { q1, q2, q3, q4, spreadCurve: spreadCurve === 'even_monthly' ? 'even_monthly' : 'equal_quarterly' };
}

export async function getBudgetById({ query, queryOne }, orgId, budgetId) {
  const budget = await queryOne(
    `SELECT b.*, fy.code AS fiscal_year_code, fy.name AS fiscal_year_name, u.full_name AS approver_name
       FROM budgets b
       JOIN fiscal_years fy ON fy.id = b.fiscal_year_id
       LEFT JOIN users u ON u.id = b.approved_by
      WHERE b.org_id = ? AND b.id = ? LIMIT 1`,
    [orgId, budgetId]
  );
  if (!budget) return null;

  // Fetch lines with execution and commitments
  const lines = await query(
    `SELECT bl.*,
            ac.code AS account_code,
            ac.name AS account_name,
            ac.name_en AS account_name_en,
            ac.account_class,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            cc.name_en AS cost_center_name_en,
            fp.code AS program_code,
            fp.name AS program_name,
            -- Committed expenditures (approved or draft commitments)
            COALESCE(comm.total_committed, 0) AS total_committed,
            COALESCE(comm.pre_committed_amount, 0) AS pre_committed_amount,
            COALESCE(comm.firm_committed_amount, 0) AS firm_committed_amount,
            COALESCE(comm.q1_committed, 0) AS q1_committed,
            COALESCE(comm.q2_committed, 0) AS q2_committed,
            COALESCE(comm.q3_committed, 0) AS q3_committed,
            COALESCE(comm.q4_committed, 0) AS q4_committed,
            -- Actual general ledger postings
            COALESCE(act.total_actual, 0) AS total_actual,
            COALESCE(act.q1_actual, 0) AS q1_actual,
            COALESCE(act.q2_actual, 0) AS q2_actual,
            COALESCE(act.q3_actual, 0) AS q3_actual,
            COALESCE(act.q4_actual, 0) AS q4_actual,
            -- Net transfers (transfers in - transfers out)
            COALESCE(tr_in.total_in, 0) - COALESCE(tr_out.total_out, 0) AS net_transfers
       FROM budget_lines bl
       JOIN accounts ac ON ac.id = bl.account_id
       LEFT JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN funding_programs fp ON fp.id = bl.program_id
       LEFT JOIN (
         SELECT budget_line_id,
                SUM(amount) AS total_committed,
                SUM(CASE WHEN stage = 'pre_commitment' THEN amount ELSE 0 END) AS pre_committed_amount,
                SUM(CASE WHEN stage = 'firm_commitment' THEN amount ELSE 0 END) AS firm_committed_amount,
                SUM(CASE WHEN QUARTER(committed_date) = 1 THEN amount ELSE 0 END) AS q1_committed,
                SUM(CASE WHEN QUARTER(committed_date) = 2 THEN amount ELSE 0 END) AS q2_committed,
                SUM(CASE WHEN QUARTER(committed_date) = 3 THEN amount ELSE 0 END) AS q3_committed,
                SUM(CASE WHEN QUARTER(committed_date) = 4 THEN amount ELSE 0 END) AS q4_committed
           FROM budget_commitments
          WHERE status IN ('approved', 'draft')
          GROUP BY budget_line_id
       ) comm ON comm.budget_line_id = bl.id
       LEFT JOIN (
         SELECT jl.account_id, jl.cost_center_id, jl.program_id,
                SUM(jl.debit - jl.credit) AS total_actual,
                SUM(CASE WHEN ap.period_no BETWEEN 1 AND 3 THEN jl.debit - jl.credit ELSE 0 END) AS q1_actual,
                SUM(CASE WHEN ap.period_no BETWEEN 4 AND 6 THEN jl.debit - jl.credit ELSE 0 END) AS q2_actual,
                SUM(CASE WHEN ap.period_no BETWEEN 7 AND 9 THEN jl.debit - jl.credit ELSE 0 END) AS q3_actual,
                SUM(CASE WHEN ap.period_no BETWEEN 10 AND 12 THEN jl.debit - jl.credit ELSE 0 END) AS q4_actual
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.entry_id
           JOIN accounting_periods ap ON ap.id = je.period_id
          WHERE je.org_id = ? AND ap.fiscal_year_id = ? AND je.status = 'posted'
          GROUP BY jl.account_id, jl.cost_center_id, jl.program_id
       ) act ON act.account_id = bl.account_id
            AND (bl.cost_center_id IS NULL OR act.cost_center_id = bl.cost_center_id)
            AND (bl.program_id IS NULL OR act.program_id = bl.program_id)
       LEFT JOIN (
         SELECT target_line_id, SUM(amount) AS total_in
           FROM budget_transfers WHERE status = 'approved' GROUP BY target_line_id
       ) tr_in ON tr_in.target_line_id = bl.id
       LEFT JOIN (
         SELECT source_line_id, SUM(amount) AS total_out
           FROM budget_transfers WHERE status = 'approved' GROUP BY source_line_id
       ) tr_out ON tr_out.source_line_id = bl.id
      WHERE bl.budget_id = ?
      ORDER BY bl.budget_type ASC, ac.code ASC`,
    [orgId, budget.fiscal_year_id, budgetId]
  );

  const budgetWarningPct = Number(budget.warning_threshold_pct ?? 80.0);
  const budgetBlockPct = Number(budget.block_threshold_pct ?? 100.0);

  const formattedLines = lines.map((l) => {
    const initial = Number(l.initial_amount || l.amount || 0);
    const netTransfers = Number(l.net_transfers || 0);
    const revised = Number(l.amount || 0); // current amount is updated upon transfer approval
    const committed = Number(l.total_committed || 0);
    const actual = Number(l.total_actual || 0);
    const consumed = committed + actual;
    const available = Math.max(0, revised - consumed);
    const overrun = consumed > revised ? consumed - revised : 0;
    const pctConsumed = revised > 0 ? Number(((consumed / revised) * 100).toFixed(1)) : 0;

    // Progressive Availability Control (AVC) status
    const lineWarningPct = l.warning_threshold_pct !== null && l.warning_threshold_pct !== undefined
      ? Number(l.warning_threshold_pct)
      : budgetWarningPct;

    let avcStatus = 'normal';
    if (consumed > revised || pctConsumed >= budgetBlockPct) {
      avcStatus = 'breach';
    } else if (pctConsumed >= lineWarningPct) {
      avcStatus = 'warning';
    }

    // Quarterly Phasing amounts and consumption
    const q1Amt = Number(l.q1_amount || 0);
    const q2Amt = Number(l.q2_amount || 0);
    const q3Amt = Number(l.q3_amount || 0);
    const q4Amt = Number(l.q4_amount || 0);

    const q1Spent = Number(l.q1_committed || 0) + Number(l.q1_actual || 0);
    const q2Spent = Number(l.q2_committed || 0) + Number(l.q2_actual || 0);
    const q3Spent = Number(l.q3_committed || 0) + Number(l.q3_actual || 0);
    const q4Spent = Number(l.q4_committed || 0) + Number(l.q4_actual || 0);

    const q1Avail = Math.max(0, q1Amt - q1Spent);
    const q2Avail = Math.max(0, q2Amt - q2Spent);
    const q3Avail = Math.max(0, q3Amt - q3Spent);
    const q4Avail = Math.max(0, q4Amt - q4Spent);

    const q1Rate = q1Amt > 0 ? Number(((q1Spent / q1Amt) * 100).toFixed(1)) : 0;
    const q2Rate = q2Amt > 0 ? Number(((q2Spent / q2Amt) * 100).toFixed(1)) : 0;
    const q3Rate = q3Amt > 0 ? Number(((q3Spent / q3Amt) * 100).toFixed(1)) : 0;
    const q4Rate = q4Amt > 0 ? Number(((q4Spent / q4Amt) * 100).toFixed(1)) : 0;

    return {
      ...l,
      initial_amount: money(initial),
      carried_forward_amount: money(Number(l.carried_forward_amount || 0)),
      net_transfers: money(netTransfers),
      revised_amount: money(revised),
      total_committed: money(committed),
      pre_committed_amount: money(Number(l.pre_committed_amount || 0)),
      firm_committed_amount: money(Number(l.firm_committed_amount || 0)),
      total_actual: money(actual),
      total_consumed: money(consumed),
      available_balance: money(available),
      overrun_amount: money(overrun),
      pct_consumed: pctConsumed,
      is_overspent: consumed > revised,

      // Progressive AVC & tolerance thresholds
      warning_threshold_pct: lineWarningPct,
      block_threshold_pct: budgetBlockPct,
      avc_status: avcStatus,

      // Quarterly Phasing (T1-T4)
      spread_curve: l.spread_curve || 'equal_quarterly',
      q1_amount: money(q1Amt),
      q2_amount: money(q2Amt),
      q3_amount: money(q3Amt),
      q4_amount: money(q4Amt),
      q1_spent: money(q1Spent),
      q2_spent: money(q2Spent),
      q3_spent: money(q3Spent),
      q4_spent: money(q4Spent),
      q1_available: money(q1Avail),
      q2_available: money(q2Avail),
      q3_available: money(q3Avail),
      q4_available: money(q4Avail),
      q1_rate: q1Rate,
      q2_rate: q2Rate,
      q3_rate: q3Rate,
      q4_rate: q4Rate,
    };
  });

  return {
    ...budget,
    warning_threshold_pct: budgetWarningPct,
    block_threshold_pct: budgetBlockPct,
    lines: formattedLines,
  };
}

export async function createBudget(
  { query, queryOne },
  orgId,
  { fiscalYearId, code, name, notes = null, version = 1, warningThresholdPct = 80.0, blockThresholdPct = 100.0 }
) {
  const res = await query(
    `INSERT INTO budgets (org_id, fiscal_year_id, code, name, version, status, warning_threshold_pct, block_threshold_pct, notes)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [orgId, fiscalYearId, code, name, version, Number(warningThresholdPct || 80.0), Number(blockThresholdPct || 100.0), notes]
  );
  return { id: res.insertId, code, name, status: 'draft', warningThresholdPct, blockThresholdPct };
}

export async function updateBudget(
  { query },
  orgId,
  budgetId,
  { name, notes, warningThresholdPct, blockThresholdPct }
) {
  const updates = [];
  const params = [];
  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (notes !== undefined) {
    updates.push('notes = ?');
    params.push(notes);
  }
  if (warningThresholdPct !== undefined && warningThresholdPct !== null) {
    updates.push('warning_threshold_pct = ?');
    params.push(Number(warningThresholdPct));
  }
  if (blockThresholdPct !== undefined && blockThresholdPct !== null) {
    updates.push('block_threshold_pct = ?');
    params.push(Number(blockThresholdPct));
  }
  if (updates.length > 0) {
    params.push(orgId, budgetId);
    await query(`UPDATE budgets SET ${updates.join(', ')} WHERE org_id = ? AND id = ?`, params);
  }
  return { ok: true };
}

export async function approveBudget({ query }, orgId, budgetId, userId) {
  await query(
    `UPDATE budgets
        SET status = 'approved', approved_by = ?, approved_at = NOW()
      WHERE org_id = ? AND id = ?`,
    [userId, orgId, budgetId]
  );
  return { ok: true, status: 'approved' };
}

export async function addBudgetLine({ query, queryOne }, orgId, budgetId, payload) {
  const {
    accountId,
    costCenterId = null,
    programId = null,
    budgetType = 'opex',
    amount = 0,
    controlMode = 'strict_block',
    spreadCurve = 'equal_quarterly',
    warningThresholdPct = null,
    q1Amount = null,
    q2Amount = null,
    q3Amount = null,
    q4Amount = null,
    notes = null,
  } = payload;

  const numAmount = Number(amount || 0);

  // Calculate or accept quarterly spreading
  let q1 = q1Amount !== null && q1Amount !== undefined ? Number(q1Amount) : null;
  let q2 = q2Amount !== null && q2Amount !== undefined ? Number(q2Amount) : null;
  let q3 = q3Amount !== null && q3Amount !== undefined ? Number(q3Amount) : null;
  let q4 = q4Amount !== null && q4Amount !== undefined ? Number(q4Amount) : null;

  if (q1 === null || q2 === null || q3 === null || q4 === null || spreadCurve !== 'custom') {
    const spread = calculateSpreadQuarters(numAmount, spreadCurve);
    q1 = spread.q1;
    q2 = spread.q2;
    q3 = spread.q3;
    q4 = spread.q4;
  }

  const res = await query(
    `INSERT INTO budget_lines 
     (budget_id, account_id, cost_center_id, program_id, budget_type, initial_amount, amount, control_mode, spread_curve, warning_threshold_pct, q1_amount, q2_amount, q3_amount, q4_amount, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      budgetId,
      accountId,
      costCenterId || null,
      programId || null,
      budgetType,
      numAmount,
      numAmount,
      controlMode,
      spreadCurve,
      warningThresholdPct !== null && warningThresholdPct !== undefined ? Number(warningThresholdPct) : null,
      q1,
      q2,
      q3,
      q4,
      notes || null,
    ]
  );
  return { id: res.insertId, budgetId, amount: numAmount, q1, q2, q3, q4, spreadCurve };
}

export async function updateBudgetLine({ query, queryOne }, orgId, budgetId, lineId, payload) {
  const {
    amount,
    controlMode,
    spreadCurve,
    warningThresholdPct,
    q1Amount,
    q2Amount,
    q3Amount,
    q4Amount,
    notes,
  } = payload;

  const line = await queryOne(
    `SELECT bl.* FROM budget_lines bl JOIN budgets b ON b.id = bl.budget_id WHERE b.org_id = ? AND bl.budget_id = ? AND bl.id = ?`,
    [orgId, budgetId, lineId]
  );
  if (!line) throw new Error('Budget line not found');

  const newAmount = amount !== undefined ? Number(amount) : Number(line.amount);
  const activeCurve = spreadCurve || line.spread_curve || 'equal_quarterly';

  let q1 = q1Amount !== undefined && q1Amount !== null ? Number(q1Amount) : Number(line.q1_amount);
  let q2 = q2Amount !== undefined && q2Amount !== null ? Number(q2Amount) : Number(line.q2_amount);
  let q3 = q3Amount !== undefined && q3Amount !== null ? Number(q3Amount) : Number(line.q3_amount);
  let q4 = q4Amount !== undefined && q4Amount !== null ? Number(q4Amount) : Number(line.q4_amount);

  if (activeCurve !== 'custom' && (amount !== undefined || spreadCurve !== undefined)) {
    const spread = calculateSpreadQuarters(newAmount, activeCurve);
    q1 = spread.q1;
    q2 = spread.q2;
    q3 = spread.q3;
    q4 = spread.q4;
  }

  await query(
    `UPDATE budget_lines
        SET amount = ?,
            control_mode = COALESCE(?, control_mode),
            spread_curve = ?,
            warning_threshold_pct = ?,
            q1_amount = ?,
            q2_amount = ?,
            q3_amount = ?,
            q4_amount = ?,
            notes = COALESCE(?, notes)
      WHERE id = ?`,
    [
      newAmount,
      controlMode || line.control_mode,
      activeCurve,
      warningThresholdPct !== undefined ? (warningThresholdPct === null ? null : Number(warningThresholdPct)) : line.warning_threshold_pct,
      q1,
      q2,
      q3,
      q4,
      notes !== undefined ? notes : line.notes,
      lineId,
    ]
  );

  return { id: lineId, amount: newAmount, spreadCurve: activeCurve, q1, q2, q3, q4 };
}

export async function reSpreadBudget({ query }, orgId, budgetId, { spreadCurve = 'equal_quarterly' }) {
  const lines = await query(
    `SELECT bl.id, bl.amount FROM budget_lines bl JOIN budgets b ON b.id = bl.budget_id WHERE b.org_id = ? AND bl.budget_id = ?`,
    [orgId, budgetId]
  );

  for (const l of lines) {
    const spread = calculateSpreadQuarters(Number(l.amount || 0), spreadCurve);
    await query(
      `UPDATE budget_lines
          SET spread_curve = ?, q1_amount = ?, q2_amount = ?, q3_amount = ?, q4_amount = ?
        WHERE id = ?`,
      [spreadCurve, spread.q1, spread.q2, spread.q3, spread.q4, l.id]
    );
  }

  return { ok: true, linesUpdated: lines.length, spreadCurve };
}

export async function deleteBudgetLine({ query }, orgId, budgetId, lineId) {
  await query(
    `DELETE bl FROM budget_lines bl
       JOIN budgets b ON b.id = bl.budget_id
      WHERE b.org_id = ? AND bl.budget_id = ? AND bl.id = ?`,
    [orgId, budgetId, lineId]
  );
  return { ok: true };
}

// -----------------------------------------------------------------------------
// 2. Budget Commitments (Engagements budgétaires)
// -----------------------------------------------------------------------------

export async function listCommitments({ query }, orgId, { budgetId = null, budgetLineId = null, status = null, assetId = null, stage = null } = {}) {
  const params = [orgId];
  const conditions = [];

  if (budgetId) {
    conditions.push('bc.budget_id = ?');
    params.push(budgetId);
  }
  if (budgetLineId) {
    conditions.push('bc.budget_line_id = ?');
    params.push(budgetLineId);
  }
  if (status) {
    conditions.push('bc.status = ?');
    params.push(status);
  }
  if (assetId) {
    conditions.push('bc.asset_id = ?');
    params.push(assetId);
  }
  if (stage) {
    conditions.push('bc.stage = ?');
    params.push(stage);
  }

  const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  return query(
    `SELECT bc.*,
            bl.budget_type,
            bl.amount AS line_budget_amount,
            ac.code AS account_code,
            ac.name AS account_name,
            ac.name_en AS account_name_en,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            cc.name_en AS cost_center_name_en,
            v.name AS vendor_name,
            ast.asset_tag AS asset_tag,
            ast.name AS asset_name,
            u.full_name AS approver_name,
            pbc.commitment_number AS parent_commitment_number,
            bo.ticket_number AS override_ticket_number
       FROM budget_commitments bc
       JOIN budget_lines bl ON bl.id = bc.budget_line_id
       JOIN accounts ac ON ac.id = bl.account_id
       LEFT JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN suppliers v ON v.id = bc.vendor_id
       LEFT JOIN assets ast ON ast.id = bc.asset_id
       LEFT JOIN users u ON u.id = bc.approved_by
       LEFT JOIN budget_commitments pbc ON pbc.id = bc.parent_commitment_id
       LEFT JOIN budget_overrides bo ON bo.id = bc.override_id
      WHERE bc.org_id = ? ${whereClause}
      ORDER BY bc.committed_date DESC, bc.created_at DESC`,
    params
  );
}

export async function createCommitment({ query, queryOne }, orgId, userId, payload) {
  const {
    budgetLineId,
    description,
    vendorId = null,
    assetId = null,
    workOrderId = null,
    amount = 0,
    committedDate,
    stage = 'firm_commitment',
    parentCommitmentId = null,
    overrideId = null,
    overrideTicketNumber = null,
    cofinancingKeyId = null,
    notes = null,
  } = payload;

  const numAmount = Number(amount);
  if (numAmount <= 0) {
    throw new Error('Commitment amount must be strictly positive.');
  }

  // 1. Retrieve budget line, budget master and control mode
  const line = await queryOne(
    `SELECT bl.*, b.id AS budget_id, b.status AS budget_status, b.fiscal_year_id,
            b.warning_threshold_pct AS budget_warning_threshold_pct,
            b.block_threshold_pct AS budget_block_threshold_pct
       FROM budget_lines bl
       JOIN budgets b ON b.id = bl.budget_id
      WHERE b.org_id = ? AND bl.id = ? LIMIT 1`,
    [orgId, budgetLineId]
  );

  if (!line) {
    throw new Error('Budget line not found or does not belong to this organization.');
  }

  // If converting/parent commitment specified, verify parent
  let parentComm = null;
  if (parentCommitmentId) {
    parentComm = await queryOne(
      `SELECT * FROM budget_commitments WHERE id = ? AND org_id = ? AND budget_line_id = ?`,
      [parentCommitmentId, orgId, budgetLineId]
    );
  }

  // 2. Check current commitments on this line (excluding parent if converting)
  const parentFilter = parentCommitmentId ? `AND id != ${Number(parentCommitmentId)}` : '';
  const commRes = await queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total_committed
       FROM budget_commitments
      WHERE budget_line_id = ? AND status IN ('approved', 'draft') ${parentFilter}`,
    [budgetLineId]
  );

  const budgetCap = Number(line.amount || 0);
  const alreadyConsumed = Number(commRes?.total_committed || 0);
  const available = budgetCap - alreadyConsumed;

  const warningPct = Number(line.warning_threshold_pct ?? line.budget_warning_threshold_pct ?? 80.0);
  const blockPct = Number(line.budget_block_threshold_pct ?? 100.0);
  const projectedConsumed = alreadyConsumed + numAmount;
  const projectedPct = budgetCap > 0 ? (projectedConsumed / budgetCap) * 100 : 0;

  let activeOverride = null;
  let warningNotice = null;

  // Check if an Emergency Controller Override Ticket is supplied OR if a breach occurs
  if (overrideId || overrideTicketNumber) {
    const ovrParams = [orgId, budgetLineId];
    let ovrClause = '';
    if (overrideId) {
      ovrClause = 'bo.id = ?';
      ovrParams.unshift(overrideId);
    } else {
      ovrClause = 'bo.ticket_number = ?';
      ovrParams.unshift(overrideTicketNumber.trim());
    }

    activeOverride = await queryOne(
      `SELECT bo.* FROM budget_overrides bo
        WHERE ${ovrClause} AND bo.org_id = ? AND bo.budget_line_id = ? AND bo.status = 'approved' AND bo.expires_at >= NOW() LIMIT 1`,
      ovrParams
    );

    if (!activeOverride) {
      throw new Error(
        `Invalid or expired Controller Override Ticket. An active, approved override ticket for this budget line is required.`
      );
    }

    const deficit = Math.max(0, numAmount - available);
    if (deficit > 0 && Number(activeOverride.overrun_amount) < deficit) {
      throw new Error(
        `Override ticket ${activeOverride.ticket_number} ceiling (${money(activeOverride.overrun_amount)} XAF) is insufficient to cover the required deficit (${money(deficit)} XAF).`
      );
    }

    warningNotice = `🛡️ Emergency Derogation Applied: Authorized by Controller (Ticket ${activeOverride.ticket_number}) for emergency overrun of ${money(deficit)} XAF.`;
  } else if (line.control_mode === 'strict_block' && (numAmount > available || projectedPct > blockPct)) {
    throw new Error(
      `Budget ceiling breach! Line has only ${money(Math.max(0, available))} XAF available. Proposed commitment (${money(numAmount)} XAF) would consume ${projectedPct.toFixed(1)}% of total budget allocation, exceeding the hard stop limit of ${blockPct}%. (Emergency purchase? Request a Controller Override Ticket).`
    );
  } else if (projectedPct >= warningPct) {
    warningNotice = `⚠️ Advisory AVC Notice: This commitment brings budget consumption to ${projectedPct.toFixed(1)}%, exceeding the ${warningPct}% warning threshold. Remaining available: ${money(Math.max(0, budgetCap - projectedConsumed))} XAF.`;
  }

  // 3. Generate sequential commitment number
  // Prefix: DA-YYYY-NNNN for Pre-Commitment (Demande d'Achat), BC-YYYY-NNNN for Firm Commitment (Bon de Commande)
  const isPre = stage === 'pre_commitment';
  const prefix = isPre ? 'DA' : 'BC';
  const yr = new Date(committedDate || Date.now()).getFullYear();
  const maxRow = await queryOne(
    `SELECT MAX(CAST(SUBSTRING_INDEX(commitment_number, '-', -1) AS UNSIGNED)) AS max_seq
       FROM budget_commitments
      WHERE org_id = ? AND commitment_number LIKE ?`,
    [orgId, `${prefix}-${yr}-%`]
  );
  const seq = (maxRow?.max_seq || 0) + 1;
  const commitmentNumber = `${prefix}-${yr}-${String(seq).padStart(4, '0')}`;

  const ins = await query(
    `INSERT INTO budget_commitments
     (org_id, budget_id, budget_line_id, cofinancing_key_id, commitment_number, stage, parent_commitment_id, override_id, description, vendor_id, asset_id, work_order_id, amount, committed_date, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      orgId,
      line.budget_id,
      budgetLineId,
      cofinancingKeyId ? Number(cofinancingKeyId) : null,
      commitmentNumber,
      isPre ? 'pre_commitment' : 'firm_commitment',
      parentCommitmentId || null,
      activeOverride ? activeOverride.id : null,
      description,
      vendorId || null,
      assetId || null,
      workOrderId || null,
      numAmount,
      committedDate || new Date().toISOString().slice(0, 10),
      notes || null,
    ]
  );

  const newCommId = ins.insertId;

  // If a co-financing key is selected, automatically prorate and materialize multi-donor splits
  if (cofinancingKeyId) {
    try {
      await executeCofinancingSplit({ query, queryOne }, orgId, userId, {
        keyId: Number(cofinancingKeyId),
        sourceAmount: numAmount,
        currency: 'XAF',
        commitmentId: newCommId,
        voucherRef: commitmentNumber,
        stage: 'commitment',
        notes: `Ventilation automatique co-financement pour engagement ${commitmentNumber}: ${description}`,
      });
    } catch (cofinErr) {
      console.error('Automated co-financing split failed:', cofinErr.message);
    }
  }

  // If override was used, mark ticket as used
  if (activeOverride) {
    await query(
      `UPDATE budget_overrides SET status = 'used', used_at = NOW(), used_in_commitment_id = ? WHERE id = ?`,
      [newCommId, activeOverride.id]
    );
  }

  // If parent pre-commitment was converted, mark parent as 'converted'
  if (parentCommitmentId) {
    await query(
      `UPDATE budget_commitments SET status = 'converted' WHERE id = ? AND org_id = ?`,
      [parentCommitmentId, orgId]
    );
  }

  // If assetId is supplied, update asset with budget_line_id
  if (assetId) {
    await query(`UPDATE assets SET budget_line_id = ? WHERE org_id = ? AND id = ?`, [budgetLineId, orgId, assetId]);
  }

  return {
    id: newCommId,
    commitmentNumber,
    stage: isPre ? 'pre_commitment' : 'firm_commitment',
    amount: numAmount,
    availableRemaining: Math.max(0, available - numAmount),
    projectedPctConsumed: Number(projectedPct.toFixed(1)),
    warningNotice,
    overrideApplied: !!activeOverride,
    status: 'draft',
  };
}

export async function convertPreCommitment({ query, queryOne }, orgId, userId, preCommitmentId, payload = {}) {
  const preComm = await queryOne(
    `SELECT * FROM budget_commitments WHERE id = ? AND org_id = ? AND stage = 'pre_commitment'`,
    [preCommitmentId, orgId]
  );
  if (!preComm) {
    throw new Error('Pre-commitment (Demande d’achat) not found.');
  }
  if (preComm.status === 'converted') {
    throw new Error('This pre-commitment has already been converted to a firm commitment.');
  }
  if (preComm.status === 'cancelled') {
    throw new Error('Cannot convert a cancelled pre-commitment.');
  }

  const numAmount = payload.amount !== undefined ? Number(payload.amount) : Number(preComm.amount);
  const vendorId = payload.vendorId !== undefined ? payload.vendorId : preComm.vendor_id;
  const description = payload.description || preComm.description;
  const yr = new Date(payload.committedDate || Date.now()).getFullYear();

  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM budget_commitments WHERE org_id = ? AND commitment_number LIKE ?`,
    [orgId, `BC-${yr}-%`]
  );
  const seq = (countRow?.cnt || 0) + 1;
  const commitmentNumber = `BC-${yr}-${String(seq).padStart(4, '0')}`;

  // 1. Mark pre-commitment as converted
  await query(
    `UPDATE budget_commitments SET status = 'converted' WHERE id = ?`,
    [preCommitmentId]
  );

  // 2. Insert firm commitment
  const ins = await query(
    `INSERT INTO budget_commitments
     (org_id, budget_id, budget_line_id, commitment_number, stage, parent_commitment_id, description, vendor_id, asset_id, work_order_id, amount, committed_date, status, approved_by, approved_at, notes)
     VALUES (?, ?, ?, ?, 'firm_commitment', ?, ?, ?, ?, ?, ?, ?, 'approved', ?, NOW(), ?)`,
    [
      orgId,
      preComm.budget_id,
      preComm.budget_line_id,
      commitmentNumber,
      preCommitmentId,
      description,
      vendorId || null,
      preComm.asset_id || null,
      preComm.work_order_id || null,
      numAmount,
      payload.committedDate || new Date().toISOString().slice(0, 10),
      userId,
      payload.notes || `Converted from Pre-Commitment (DA) ${preComm.commitment_number}`,
    ]
  );

  return {
    id: ins.insertId,
    commitmentNumber,
    parentCommitmentNumber: preComm.commitment_number,
    stage: 'firm_commitment',
    status: 'approved',
    amount: numAmount,
  };
}

export async function approveCommitment({ query }, orgId, commitmentId, userId) {
  await query(
    `UPDATE budget_commitments
        SET status = 'approved', approved_by = ?, approved_at = NOW()
      WHERE org_id = ? AND id = ?`,
    [userId, orgId, commitmentId]
  );
  return { ok: true, status: 'approved' };
}

export async function liquidateCommitment({ query }, orgId, commitmentId, { journalEntryId = null } = {}) {
  await query(
    `UPDATE budget_commitments
        SET status = 'liquidated', liquidated_at = NOW(), journal_entry_id = ?
      WHERE org_id = ? AND id = ?`,
    [journalEntryId || null, orgId, commitmentId]
  );
  return { ok: true, status: 'liquidated' };
}

// -----------------------------------------------------------------------------
// 3. Budget Transfers (Virements de crédits)
// -----------------------------------------------------------------------------

export async function listTransfers({ query }, orgId, { budgetId = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (budgetId) {
    filter = 'AND bt.budget_id = ?';
    params.push(budgetId);
  }

  return query(
    `SELECT bt.*,
            b.code AS budget_code,
            src_ac.code AS source_account_code,
            src_ac.name AS source_account_name,
            src_ac.name_en AS source_account_name_en,
            src_bl.budget_type AS source_budget_type,
            tgt_ac.code AS target_account_code,
            tgt_ac.name AS target_account_name,
            tgt_ac.name_en AS target_account_name_en,
            tgt_bl.budget_type AS target_budget_type,
            u.full_name AS authorizer_name
       FROM budget_transfers bt
       JOIN budgets b ON b.id = bt.budget_id
       JOIN budget_lines src_bl ON src_bl.id = bt.source_line_id
       JOIN accounts src_ac ON src_ac.id = src_bl.account_id
       JOIN budget_lines tgt_bl ON tgt_bl.id = bt.target_line_id
       JOIN accounts tgt_ac ON tgt_ac.id = tgt_bl.account_id
       LEFT JOIN users u ON u.id = bt.authorized_by
      WHERE bt.org_id = ? ${filter}
      ORDER BY bt.created_at DESC`,
    params
  );
}

export async function createTransfer({ query, queryOne }, orgId, userId, payload) {
  const { budgetId, sourceLineId, targetLineId, amount, reason } = payload;
  const numAmount = Number(amount);

  if (numAmount <= 0) {
    throw new Error('Transfer amount must be strictly positive.');
  }
  if (sourceLineId === targetLineId) {
    throw new Error('Source and target budget lines cannot be the same.');
  }

  // Verify source line has sufficient uncommitted budget
  const srcLine = await queryOne(
    `SELECT bl.*,
            (SELECT COALESCE(SUM(amount), 0) FROM budget_commitments WHERE budget_line_id = bl.id AND status IN ('approved', 'draft')) AS committed
       FROM budget_lines bl
      WHERE bl.id = ? AND bl.budget_id = ? LIMIT 1`,
    [sourceLineId, budgetId]
  );
  if (!srcLine) {
    throw new Error('Source budget line not found.');
  }

  const available = Number(srcLine.amount || 0) - Number(srcLine.committed || 0);
  if (numAmount > available) {
    throw new Error(
      `Insufficient available credit in source line! Max transferrable: ${money(Math.max(0, available))} XAF.`
    );
  }

  const yr = new Date().getFullYear();
  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM budget_transfers WHERE org_id = ? AND transfer_number LIKE ?`,
    [orgId, `VIR-${yr}-%`]
  );
  const transferNumber = `VIR-${yr}-${String((countRow?.cnt || 0) + 1).padStart(4, '0')}`;

  const ins = await query(
    `INSERT INTO budget_transfers (org_id, budget_id, transfer_number, source_line_id, target_line_id, amount, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [orgId, budgetId, transferNumber, sourceLineId, targetLineId, numAmount, reason]
  );

  return { id: ins.insertId, transferNumber, status: 'pending' };
}

export async function approveTransfer({ query, queryOne }, orgId, transferId, userId) {
  const tr = await queryOne(
    `SELECT * FROM budget_transfers WHERE org_id = ? AND id = ? AND status = 'pending' LIMIT 1`,
    [orgId, transferId]
  );
  if (!tr) {
    throw new Error('Transfer not found or already processed.');
  }

  const numAmount = Number(tr.amount);

  // Atomically update both budget lines
  await query(`UPDATE budget_lines SET amount = amount - ? WHERE id = ?`, [numAmount, tr.source_line_id]);
  await query(`UPDATE budget_lines SET amount = amount + ? WHERE id = ?`, [numAmount, tr.target_line_id]);
  await query(
    `UPDATE budget_transfers
        SET status = 'approved', authorized_by = ?, authorized_at = NOW()
      WHERE id = ?`,
    [userId, transferId]
  );

  return { ok: true, status: 'approved' };
}

// -----------------------------------------------------------------------------
// 4. Real-time Budget Ceiling & Execution
// -----------------------------------------------------------------------------

export async function checkBudgetCeiling({ query, queryOne }, orgId, { lines, entryDate, fiscalYearId = null }) {
  let fyId = fiscalYearId;
  if (!fyId && entryDate) {
    const period = await queryOne(
      `SELECT fiscal_year_id FROM accounting_periods
        WHERE org_id = ? AND ? BETWEEN start_date AND end_date LIMIT 1`,
      [orgId, entryDate]
    );
    fyId = period?.fiscal_year_id;
  }
  if (!fyId) {
    const activeFy = await queryOne(
      `SELECT id FROM fiscal_years WHERE org_id = ? AND status != 'closed' ORDER BY start_date DESC LIMIT 1`,
      [orgId]
    );
    fyId = activeFy?.id;
  }

  const results = [];
  let totalBreaches = 0;

  for (const line of lines || []) {
    const debit = Number(line.debit || 0);
    if (debit <= 0) continue;

    const acct = await queryOne(
      `SELECT id, code, name, account_class FROM accounts WHERE id = ? OR code = ? LIMIT 1`,
      [line.accountId || 0, line.accountCode || '']
    );
    if (!acct) continue;

    // Monitor Class 6 (Operating Expenses) and Class 2 (Capex/Assets)
    if (acct.account_class !== 6 && acct.account_class !== 2) {
      continue;
    }

    const ccId = line.costCenterId || null;
    const progId = line.programId || null;

    let budgetLine = await queryOne(
      `SELECT bl.id, bl.amount, bl.control_mode, bl.warning_threshold_pct AS line_warning_pct,
              b.code AS budget_code, b.name AS budget_name,
              b.warning_threshold_pct AS budget_warning_pct,
              b.block_threshold_pct AS budget_block_pct
         FROM budget_lines bl
         JOIN budgets b ON b.id = bl.budget_id
        WHERE b.org_id = ? AND b.fiscal_year_id = ? AND b.status = 'approved'
          AND bl.account_id = ?
          AND (bl.cost_center_id = ? OR bl.cost_center_id IS NULL)
          AND (bl.program_id = ? OR bl.program_id IS NULL)
        ORDER BY (bl.cost_center_id IS NOT NULL) DESC, (bl.program_id IS NOT NULL) DESC
        LIMIT 1`,
      [orgId, fyId, acct.id, ccId, progId]
    );

    let derivationNotice = null;
    if (!budgetLine) {
      // Check derivation rule (FMDERIVE rollup)
      const dRule = await queryOne(
        `SELECT bdr.*, ac.id AS derived_account_id, ac.code AS derived_account_code, ac.name AS derived_account_name
           FROM budget_derivation_rules bdr
           JOIN accounts ac ON ac.id = bdr.target_account_id
          WHERE bdr.org_id = ? AND bdr.dimension_type = 'account' AND bdr.is_active = 1
            AND ? LIKE REPLACE(bdr.source_pattern, '*', '%')
          ORDER BY bdr.priority ASC LIMIT 1`,
        [orgId, acct.code]
      );
      if (dRule) {
        budgetLine = await queryOne(
          `SELECT bl.id, bl.amount, bl.control_mode, bl.warning_threshold_pct AS line_warning_pct,
                  b.code AS budget_code, b.name AS budget_name,
                  b.warning_threshold_pct AS budget_warning_pct,
                  b.block_threshold_pct AS budget_block_pct
             FROM budget_lines bl
             JOIN budgets b ON b.id = bl.budget_id
            WHERE b.org_id = ? AND b.fiscal_year_id = ? AND b.status = 'approved'
              AND bl.account_id = ?
              AND (bl.cost_center_id = ? OR bl.cost_center_id IS NULL)
              AND (bl.program_id = ? OR bl.program_id IS NULL)
            ORDER BY (bl.cost_center_id IS NOT NULL) DESC, (bl.program_id IS NOT NULL) DESC
            LIMIT 1`,
          [orgId, fyId, dRule.derived_account_id, ccId, progId]
        );
        if (budgetLine) {
          derivationNotice = `Derived via Rule ${dRule.rule_code} -> Budget envelope ${dRule.derived_account_code}`;
        }
      }
    }

    // Sum actual expenditures and active commitments
    const actualRes = await queryOne(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total_actual
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.entry_id
         JOIN accounting_periods ap ON ap.id = je.period_id
        WHERE je.org_id = ? AND ap.fiscal_year_id = ? AND je.status = 'posted'
          AND jl.account_id = ?
          AND (? IS NULL OR jl.cost_center_id = ?)`,
      [orgId, fyId, acct.id, ccId, ccId]
    );

    const commRes = budgetLine
      ? await queryOne(
          `SELECT COALESCE(SUM(amount), 0) AS total_committed
             FROM budget_commitments
            WHERE budget_line_id = ? AND status = 'approved'`,
          [budgetLine.id]
        )
      : { total_committed: 0 };

    const budgetAmount = Number(budgetLine?.amount || 0);
    const spentAmount = Number(actualRes?.total_actual || 0);
    const committedAmount = Number(commRes?.total_committed || 0);
    const totalConsumed = spentAmount + committedAmount;
    const projectedSpent = totalConsumed + debit;
    const isExceeded = budgetAmount > 0 && projectedSpent > budgetAmount;
    const overrun = isExceeded ? projectedSpent - budgetAmount : 0;
    const pctConsumed = budgetAmount > 0 ? (projectedSpent / budgetAmount) * 100 : 0;

    const warnPct = Number(budgetLine?.line_warning_pct ?? budgetLine?.budget_warning_pct ?? 80.0);
    const blkPct = Number(budgetLine?.budget_block_pct ?? 100.0);

    let avcStatus = 'normal';
    let statusMessage = 'Within authorized budget limits';

    if (isExceeded || pctConsumed >= blkPct) {
      avcStatus = 'hard_breach';
      statusMessage = `Ceiling exceeded: projected spend reaches ${pctConsumed.toFixed(1)}% (Limit: ${blkPct}%)`;
      if (budgetLine?.control_mode === 'strict_block') {
        totalBreaches++;
      }
    } else if (pctConsumed >= warnPct) {
      avcStatus = 'advisory_warning';
      statusMessage = `Approaching ceiling: projected spend reaches ${pctConsumed.toFixed(1)}% (Warning threshold: ${warnPct}%)`;
    }

    results.push({
      accountId: acct.id,
      accountCode: acct.code,
      accountName: acct.name,
      costCenterId: ccId,
      budgetAmount: money(budgetAmount),
      spentAmount: money(spentAmount),
      committedAmount: money(committedAmount),
      proposedAmount: money(debit),
      projectedSpent: money(projectedSpent),
      remainingBudget: money(Math.max(0, budgetAmount - totalConsumed)),
      isExceeded,
      controlMode: budgetLine?.control_mode || 'warning',
      warningThresholdPct: warnPct,
      blockThresholdPct: blkPct,
      avcStatus,
      statusMessage,
      overrunAmount: money(overrun),
      pctConsumed: Number(pctConsumed.toFixed(1)),
      hasBudget: budgetAmount > 0,
      budgetName: budgetLine?.budget_name || null,
    });
  }

  return {
    fiscalYearId: fyId,
    passed: totalBreaches === 0,
    totalBreaches,
    items: results,
  };
}

export async function getBudgetExecutionReport({ query, queryOne }, orgId, { fiscalYearId = null, costCenterId = null, programId = null, budgetType = null } = {}) {
  let fyId = fiscalYearId;
  if (!fyId) {
    const activeFy = await queryOne(
      `SELECT id FROM fiscal_years WHERE org_id = ? AND status != 'closed' ORDER BY start_date DESC LIMIT 1`,
      [orgId]
    );
    fyId = activeFy?.id || null;
  }

  const typeFilter = budgetType ? 'AND bl.budget_type = ?' : '';
  const typeParam = budgetType ? [budgetType] : [];

  const sql = `
    SELECT
      ac.id AS account_id,
      ac.code AS account_code,
      ac.name AS account_name,
      ac.name_en AS account_name_en,
      ac.account_class,
      b_sub.budget_type,
      cc.id AS cost_center_id,
      cc.code AS cost_center_code,
      cc.name AS cost_center_name,
      cc.name_en AS cost_center_name_en,
      fp.id AS program_id,
      fp.code AS program_code,
      fp.name AS program_name,
      COALESCE(b_sub.budget_amount, 0) AS budget_amount,
      COALESCE(b_sub.initial_budget, 0) AS initial_budget,
      COALESCE(comm_sub.committed_amount, 0) AS committed_amount,
      COALESCE(a_sub.actual_spent, 0) AS actual_spent,
      (COALESCE(b_sub.budget_amount, 0) - (COALESCE(comm_sub.committed_amount, 0) + COALESCE(a_sub.actual_spent, 0))) AS remaining_budget,
      CASE
        WHEN COALESCE(b_sub.budget_amount, 0) > 0
        THEN ROUND(((COALESCE(comm_sub.committed_amount, 0) + COALESCE(a_sub.actual_spent, 0)) / b_sub.budget_amount) * 100, 1)
        ELSE 0
      END AS pct_consumed
    FROM accounts ac
    LEFT JOIN cost_centers cc ON (? IS NULL OR cc.id = ?)
    LEFT JOIN funding_programs fp ON (? IS NULL OR fp.id = ?)
    LEFT JOIN (
      SELECT bl.account_id, bl.cost_center_id, bl.program_id, bl.budget_type,
             SUM(bl.initial_amount) AS initial_budget,
             SUM(bl.amount) AS budget_amount
        FROM budget_lines bl
        JOIN budgets b ON b.id = bl.budget_id
       WHERE b.org_id = ? AND b.fiscal_year_id = ? AND b.status = 'approved' ${typeFilter}
       GROUP BY bl.account_id, bl.cost_center_id, bl.program_id, bl.budget_type
    ) b_sub ON b_sub.account_id = ac.id
           AND (b_sub.cost_center_id IS NULL OR b_sub.cost_center_id = cc.id)
           AND (b_sub.program_id IS NULL OR b_sub.program_id = fp.id)
    LEFT JOIN (
      SELECT bl.account_id, bl.cost_center_id, bl.program_id,
             SUM(bc.amount) AS committed_amount
        FROM budget_commitments bc
        JOIN budget_lines bl ON bl.id = bc.budget_line_id
       WHERE bc.org_id = ? AND bc.status IN ('draft', 'approved')
       GROUP BY bl.account_id, bl.cost_center_id, bl.program_id
    ) comm_sub ON comm_sub.account_id = ac.id
              AND (comm_sub.cost_center_id IS NULL OR comm_sub.cost_center_id = cc.id)
              AND (comm_sub.program_id IS NULL OR comm_sub.program_id = fp.id)
    LEFT JOIN (
      SELECT jl.account_id, jl.cost_center_id, jl.program_id, SUM(jl.debit - jl.credit) AS actual_spent
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        JOIN accounting_periods ap ON ap.id = je.period_id
       WHERE je.org_id = ? AND ap.fiscal_year_id = ? AND je.status = 'posted'
       GROUP BY jl.account_id, jl.cost_center_id, jl.program_id
    ) a_sub ON a_sub.account_id = ac.id
           AND (a_sub.cost_center_id IS NULL OR a_sub.cost_center_id = cc.id)
           AND (a_sub.program_id IS NULL OR a_sub.program_id = fp.id)
    WHERE ac.org_id = ? AND ac.account_class IN (6, 2, 7)
      AND (b_sub.budget_amount IS NOT NULL OR a_sub.actual_spent IS NOT NULL OR comm_sub.committed_amount IS NOT NULL)
    ORDER BY b_sub.budget_type ASC, ac.code ASC, cc.code ASC`;

  const rows = await query(sql, [
    costCenterId, costCenterId,
    programId, programId,
    orgId, fyId, ...typeParam,
    orgId,
    orgId, fyId,
    orgId,
  ]);

  let totalBudget = 0;
  let totalCommitted = 0;
  let totalSpent = 0;

  const enrichedRows = rows.map((r) => {
    const bAmt = Number(r.budget_amount || 0);
    const cAmt = Number(r.committed_amount || 0);
    const sAmt = Number(r.actual_spent || 0);
    totalBudget += bAmt;
    totalCommitted += cAmt;
    totalSpent += sAmt;

    const pct = Number(r.pct_consumed || 0);
    let avcStatus = 'normal';
    if (pct >= 100.0 || (bAmt > 0 && cAmt + sAmt > bAmt)) {
      avcStatus = 'breach';
    } else if (pct >= 80.0) {
      avcStatus = 'warning';
    }

    return {
      ...r,
      avc_status: avcStatus,
    };
  });

  const totalConsumed = totalCommitted + totalSpent;

  return {
    fiscalYearId: fyId,
    totalBudget: money(totalBudget),
    totalCommitted: money(totalCommitted),
    totalSpent: money(totalSpent),
    totalConsumed: money(totalConsumed),
    remainingBudget: money(totalBudget - totalConsumed),
    overallPctConsumed: totalBudget > 0 ? Number(((totalConsumed / totalBudget) * 100).toFixed(1)) : 0,
    rows: enrichedRows,
  };
}

// -----------------------------------------------------------------------------
// 5. Budget Carryforward (Report à nouveau budgétaire)
// -----------------------------------------------------------------------------

export async function getUnconsumedBudgetLines(db, orgId, budgetId) {
  const budget = await getBudgetById(db, orgId, budgetId);
  if (!budget) return [];
  return (budget.lines || [])
    .filter((l) => l.available_balance > 0)
    .map((l) => ({
      id: l.id,
      accountId: l.account_id,
      accountCode: l.account_code,
      accountName: l.account_name,
      accountNameEn: l.account_name_en,
      costCenterId: l.cost_center_id,
      costCenterCode: l.cost_center_code,
      costCenterName: l.cost_center_name,
      costCenterNameEn: l.cost_center_name_en,
      programId: l.program_id,
      programCode: l.program_code,
      programName: l.program_name,
      budgetType: l.budget_type,
      controlMode: l.control_mode,
      initialAmount: l.initial_amount,
      carriedForwardAmount: l.carried_forward_amount,
      revisedAmount: l.revised_amount,
      totalCommitted: l.total_committed,
      totalActual: l.total_actual,
      totalConsumed: l.total_consumed,
      unconsumedAvailable: l.available_balance,
    }));
}

export async function carryforwardBudget({ query, queryOne }, orgId, userId, {
  sourceBudgetId,
  targetFiscalYearId,
  targetBudgetId = null,
  lines = [],
  reason = 'Report à nouveau des crédits budgétaires non consommés',
}) {
  const sourceBudget = await getBudgetById({ query, queryOne }, orgId, sourceBudgetId);
  if (!sourceBudget) {
    throw new Error('Source budget not found.');
  }

  const targetFy = await queryOne('SELECT * FROM fiscal_years WHERE id = ? AND org_id = ?', [targetFiscalYearId, orgId]);
  if (!targetFy) {
    throw new Error('Target fiscal year not found.');
  }

  let resolvedTargetBudgetId = targetBudgetId;
  if (!resolvedTargetBudgetId) {
    const existingBudget = await queryOne(
      'SELECT id FROM budgets WHERE org_id = ? AND fiscal_year_id = ? ORDER BY version DESC, id ASC LIMIT 1',
      [orgId, targetFiscalYearId]
    );
    if (existingBudget) {
      resolvedTargetBudgetId = existingBudget.id;
    } else {
      const newCode = `BUD-${targetFy.code}`;
      const newName = `Budget ${targetFy.name || targetFy.code}`;
      const res = await query(
        `INSERT INTO budgets (org_id, fiscal_year_id, code, name, version, status, notes)
         VALUES (?, ?, ?, ?, 1, 'draft', ?)`,
        [orgId, targetFiscalYearId, newCode, newName, `Budget initial avec reports de crédits de ${sourceBudget.code}`]
      );
      resolvedTargetBudgetId = res.insertId;
    }
  }

  const targetBudget = await queryOne('SELECT * FROM budgets WHERE id = ? AND org_id = ?', [resolvedTargetBudgetId, orgId]);
  if (!targetBudget) {
    throw new Error('Target budget not found.');
  }

  const unconsumedLines = await getUnconsumedBudgetLines({ query, queryOne }, orgId, sourceBudgetId);
  const unconsumedById = new Map(unconsumedLines.map((l) => [l.id, l]));

  const linesToCarry = [];
  if (Array.isArray(lines) && lines.length > 0) {
    for (const item of lines) {
      const src = unconsumedById.get(item.lineId);
      if (!src) continue;
      const carryAmt = item.amount !== undefined ? Number(item.amount) : src.unconsumedAvailable;
      if (carryAmt <= 0) continue;
      if (carryAmt > src.unconsumedAvailable + 0.01) {
        throw new Error(`Carryforward amount for ${src.accountCode} exceeds unconsumed available balance.`);
      }
      linesToCarry.push({ src, amount: carryAmt });
    }
  } else {
    for (const src of unconsumedLines) {
      if (src.unconsumedAvailable > 0) {
        linesToCarry.push({ src, amount: src.unconsumedAvailable });
      }
    }
  }

  if (linesToCarry.length === 0) {
    throw new Error('No unconsumed budget balance available to carry forward.');
  }

  let totalCarried = 0;
  const executedRecords = [];

  for (const { src, amount } of linesToCarry) {
    const existingTargetLine = await queryOne(
      `SELECT * FROM budget_lines 
        WHERE budget_id = ? 
          AND account_id = ? 
          AND ((cost_center_id IS NULL AND ? IS NULL) OR cost_center_id = ?)
          AND ((program_id IS NULL AND ? IS NULL) OR program_id = ?)
          AND budget_type = ?`,
      [
        resolvedTargetBudgetId,
        src.accountId,
        src.costCenterId,
        src.costCenterId,
        src.programId,
        src.programId,
        src.budgetType,
      ]
    );

    let targetLineId;
    if (existingTargetLine) {
      targetLineId = existingTargetLine.id;
      await query(
        `UPDATE budget_lines 
            SET amount = amount + ?, 
                carried_forward_amount = carried_forward_amount + ?
          WHERE id = ?`,
        [amount, amount, targetLineId]
      );
    } else {
      const ins = await query(
        `INSERT INTO budget_lines (
           budget_id, account_id, cost_center_id, program_id, budget_type,
           initial_amount, carried_forward_amount, amount, control_mode, notes
         ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          resolvedTargetBudgetId,
          src.accountId,
          src.costCenterId,
          src.programId,
          src.budgetType,
          amount,
          amount,
          src.controlMode || 'strict_block',
          `Report de crédits non consommés exercice ${sourceBudget.fiscal_year_code || ''}`,
        ]
      );
      targetLineId = ins.insertId;
    }

    await query(
      `INSERT INTO budget_carryforwards (
         org_id, source_budget_id, target_budget_id, source_line_id, target_line_id,
         amount, reason, carried_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        sourceBudgetId,
        resolvedTargetBudgetId,
        src.id,
        targetLineId,
        amount,
        reason,
        userId,
      ]
    );

    totalCarried += amount;
    executedRecords.push({
      sourceLineId: src.id,
      targetLineId,
      accountCode: src.accountCode,
      accountName: src.accountName,
      amount,
    });
  }

  return {
    success: true,
    sourceBudgetId,
    targetBudgetId: resolvedTargetBudgetId,
    targetFiscalYearId,
    linesCarried: executedRecords.length,
    totalCarriedAmount: money(totalCarried),
    records: executedRecords,
  };
}

export async function listCarryforwards({ query }, orgId, { budgetId = null, fiscalYearId = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (budgetId) {
    filter += ' AND (cf.source_budget_id = ? OR cf.target_budget_id = ?)';
    params.push(budgetId, budgetId);
  }
  if (fiscalYearId) {
    filter += ' AND (sb.fiscal_year_id = ? OR tb.fiscal_year_id = ?)';
    params.push(fiscalYearId, fiscalYearId);
  }

  return query(
    `SELECT cf.*,
            sb.code AS source_budget_code,
            sb.name AS source_budget_name,
            sfy.code AS source_fy_code,
            tb.code AS target_budget_code,
            tb.name AS target_budget_name,
            tfy.code AS target_fy_code,
            ac.code AS account_code,
            ac.name AS account_name,
            ac.name_en AS account_name_en,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            u.full_name AS carried_by_name
       FROM budget_carryforwards cf
       JOIN budgets sb ON sb.id = cf.source_budget_id
       JOIN fiscal_years sfy ON sfy.id = sb.fiscal_year_id
       JOIN budgets tb ON tb.id = cf.target_budget_id
       JOIN fiscal_years tfy ON tfy.id = tb.fiscal_year_id
       JOIN budget_lines sl ON sl.id = cf.source_line_id
       JOIN accounts ac ON ac.id = sl.account_id
       LEFT JOIN cost_centers cc ON cc.id = sl.cost_center_id
       LEFT JOIN users u ON u.id = cf.carried_by
      WHERE cf.org_id = ? ${filter}
      ORDER BY cf.carried_at DESC`,
    params
  );
}

// -----------------------------------------------------------------------------
// 6. Emergency Budget Overrides (Dérogations Budgétaires - SAP AVC Override)
// -----------------------------------------------------------------------------

export async function createOverrideTicket({ query, queryOne }, orgId, userId, payload) {
  const {
    budgetId,
    budgetLineId,
    overrunAmount,
    justification,
    validityDays = 14,
  } = payload;

  const numAmount = Number(overrunAmount);
  if (numAmount <= 0) {
    throw new Error('Authorized overrun amount must be strictly positive.');
  }
  if (!justification || !justification.trim()) {
    throw new Error('Justification for emergency override is required.');
  }

  const line = await queryOne(
    `SELECT bl.*, b.code AS budget_code FROM budget_lines bl JOIN budgets b ON b.id = bl.budget_id WHERE b.org_id = ? AND bl.id = ?`,
    [orgId, budgetLineId]
  );
  if (!line) {
    throw new Error('Budget line not found.');
  }

  const yr = new Date().getFullYear();
  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM budget_overrides WHERE org_id = ? AND ticket_number LIKE ?`,
    [orgId, `OVR-${yr}-%`]
  );
  const seq = (countRow?.cnt || 0) + 1;
  const ticketNumber = `OVR-${yr}-${String(seq).padStart(4, '0')}`;

  const expiresAt = new Date(Date.now() + validityDays * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  const ins = await query(
    `INSERT INTO budget_overrides
     (org_id, budget_id, budget_line_id, ticket_number, requested_by, authorized_by, overrun_amount, justification, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
    [orgId, line.budget_id, budgetLineId, ticketNumber, userId, userId, numAmount, justification.trim(), expiresAt]
  );

  return {
    id: ins.insertId,
    ticketNumber,
    budgetLineId,
    overrunAmount: numAmount,
    justification: justification.trim(),
    status: 'approved',
    expiresAt,
  };
}

export async function listOverrideTickets({ query }, orgId, { budgetId = null, status = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (budgetId) {
    filter += ' AND bo.budget_id = ?';
    params.push(budgetId);
  }
  if (status) {
    filter += ' AND bo.status = ?';
    params.push(status);
  }

  return query(
    `SELECT bo.*,
            ac.code AS account_code,
            ac.name AS account_name,
            ac.name_en AS account_name_en,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            u_req.full_name AS requester_name,
            u_auth.full_name AS authorizer_name,
            bc.commitment_number AS used_in_commitment_number
       FROM budget_overrides bo
       JOIN budget_lines bl ON bl.id = bo.budget_line_id
       JOIN accounts ac ON ac.id = bl.account_id
       LEFT JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN users u_req ON u_req.id = bo.requested_by
       LEFT JOIN users u_auth ON u_auth.id = bo.authorized_by
       LEFT JOIN budget_commitments bc ON bc.id = bo.used_in_commitment_id
      WHERE bo.org_id = ? ${filter}
      ORDER BY bo.created_at DESC`,
    params
  );
}

// -----------------------------------------------------------------------------
// 7. Multi-Version Comparative Analysis (V0 Initial vs V1 Revised vs Real)
// -----------------------------------------------------------------------------

export async function getBudgetVersionComparison({ query, queryOne }, orgId, budgetId) {
  const budget = await queryOne(
    `SELECT b.*, fy.code AS fiscal_year_code, fy.name AS fiscal_year_name
       FROM budgets b
       JOIN fiscal_years fy ON fy.id = b.fiscal_year_id
      WHERE b.org_id = ? AND b.id = ?`,
    [orgId, budgetId]
  );
  if (!budget) {
    throw new Error('Budget not found.');
  }

  const lines = await query(
    `SELECT bl.*,
            ac.code AS account_code,
            ac.name AS account_name,
            ac.name_en AS account_name_en,
            ac.account_class,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            cc.name_en AS cost_center_name_en,
            fp.code AS program_code,
            fp.name AS program_name,
            -- Pre-commitments (DA)
            COALESCE(da.pre_committed, 0) AS pre_committed_amount,
            -- Firm commitments (BC)
            COALESCE(bc.firm_committed, 0) AS firm_committed_amount,
            -- Actual general ledger postings
            COALESCE(act.actual_spent, 0) AS actual_spent,
            -- Net transfers
            COALESCE(tr_in.total_in, 0) - COALESCE(tr_out.total_out, 0) AS net_transfers
       FROM budget_lines bl
       JOIN accounts ac ON ac.id = bl.account_id
       LEFT JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN funding_programs fp ON fp.id = bl.program_id
       LEFT JOIN (
         SELECT budget_line_id, SUM(amount) AS pre_committed
           FROM budget_commitments
          WHERE status = 'approved' AND stage = 'pre_commitment'
          GROUP BY budget_line_id
       ) da ON da.budget_line_id = bl.id
       LEFT JOIN (
         SELECT budget_line_id, SUM(amount) AS firm_committed
           FROM budget_commitments
          WHERE status IN ('approved', 'draft') AND stage = 'firm_commitment'
          GROUP BY budget_line_id
       ) bc ON bc.budget_line_id = bl.id
       LEFT JOIN (
         SELECT jl.account_id, jl.cost_center_id, jl.program_id,
                SUM(jl.debit - jl.credit) AS actual_spent
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.entry_id
           JOIN accounting_periods ap ON ap.id = je.period_id
          WHERE je.org_id = ? AND ap.fiscal_year_id = ? AND je.status = 'posted'
          GROUP BY jl.account_id, jl.cost_center_id, jl.program_id
       ) act ON act.account_id = bl.account_id
            AND (bl.cost_center_id IS NULL OR act.cost_center_id = bl.cost_center_id)
            AND (bl.program_id IS NULL OR act.program_id = bl.program_id)
       LEFT JOIN (
         SELECT target_line_id, SUM(amount) AS total_in
           FROM budget_transfers WHERE status = 'approved' GROUP BY target_line_id
       ) tr_in ON tr_in.target_line_id = bl.id
       LEFT JOIN (
         SELECT source_line_id, SUM(amount) AS total_out
           FROM budget_transfers WHERE status = 'approved' GROUP BY source_line_id
       ) tr_out ON tr_out.source_line_id = bl.id
      WHERE bl.budget_id = ?
      ORDER BY bl.budget_type ASC, ac.code ASC`,
    [orgId, budget.fiscal_year_id, budgetId]
  );

  let totalV0 = 0;
  let totalCarried = 0;
  let totalTransfers = 0;
  let totalV1 = 0;
  let totalPreCommitted = 0;
  let totalFirmCommitted = 0;
  let totalSpent = 0;

  const comparisonRows = lines.map((l) => {
    const v0 = Number(l.initial_amount || l.amount || 0);
    const carried = Number(l.carried_forward_amount || 0);
    const transfers = Number(l.net_transfers || 0);
    const v1 = Number(l.amount || 0); // revised
    const delta = v1 - v0;
    const deltaPct = v0 > 0 ? Number(((delta / v0) * 100).toFixed(1)) : 0;

    const preComm = Number(l.pre_committed_amount || 0);
    const firmComm = Number(l.firm_committed_amount || 0);
    const spent = Number(l.actual_spent || 0);
    const totalConsumed = preComm + firmComm + spent;
    const available = Math.max(0, v1 - totalConsumed);

    const execVsV0Pct = v0 > 0 ? Number(((totalConsumed / v0) * 100).toFixed(1)) : 0;
    const execVsV1Pct = v1 > 0 ? Number(((totalConsumed / v1) * 100).toFixed(1)) : 0;

    let avcStatus = 'normal';
    if (totalConsumed > v1) {
      avcStatus = 'breach';
    } else if (execVsV1Pct >= Number(budget.warning_threshold_pct || 80.0)) {
      avcStatus = 'warning';
    }

    totalV0 += v0;
    totalCarried += carried;
    totalTransfers += transfers;
    totalV1 += v1;
    totalPreCommitted += preComm;
    totalFirmCommitted += firmComm;
    totalSpent += spent;

    return {
      lineId: l.id,
      accountId: l.account_id,
      accountCode: l.account_code,
      accountName: l.account_name,
      accountNameEn: l.account_name_en,
      budgetType: l.budget_type,
      costCenterCode: l.cost_center_code,
      costCenterName: l.cost_center_name,
      costCenterNameEn: l.cost_center_name_en,
      programCode: l.program_code,
      programName: l.program_name,
      v0Amount: money(v0),
      carriedAmount: money(carried),
      transfersAmount: money(transfers),
      v1Amount: money(v1),
      amendmentDelta: money(delta),
      amendmentDeltaPct: deltaPct,
      preCommittedAmount: money(preComm),
      firmCommittedAmount: money(firmComm),
      actualSpent: money(spent),
      totalConsumed: money(totalConsumed),
      availableBalance: money(available),
      execVsV0Pct,
      execVsV1Pct,
      avcStatus,
    };
  });

  const totalDelta = totalV1 - totalV0;
  const totalConsumedAll = totalPreCommitted + totalFirmCommitted + totalSpent;
  const totalAvailable = Math.max(0, totalV1 - totalConsumedAll);

  return {
    budgetId: budget.id,
    budgetCode: budget.code,
    budgetName: budget.name,
    fiscalYearCode: budget.fiscal_year_code,
    warningThresholdPct: Number(budget.warning_threshold_pct || 80.0),
    blockThresholdPct: Number(budget.block_threshold_pct || 100.0),
    summary: {
      totalV0: money(totalV0),
      totalCarried: money(totalCarried),
      totalTransfers: money(totalTransfers),
      totalV1: money(totalV1),
      totalDelta: money(totalDelta),
      totalDeltaPct: totalV0 > 0 ? Number(((totalDelta / totalV0) * 100).toFixed(1)) : 0,
      totalPreCommitted: money(totalPreCommitted),
      totalFirmCommitted: money(totalFirmCommitted),
      totalSpent: money(totalSpent),
      totalConsumed: money(totalConsumedAll),
      totalAvailable: money(totalAvailable),
      overallExecVsV0Pct: totalV0 > 0 ? Number(((totalConsumedAll / totalV0) * 100).toFixed(1)) : 0,
      overallExecVsV1Pct: totalV1 > 0 ? Number(((totalConsumedAll / totalV1) * 100).toFixed(1)) : 0,
    },
    rows: comparisonRows,
  };
}
