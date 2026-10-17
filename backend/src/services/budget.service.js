import { money } from '../utils/money.js';

/**
 * Multi-Axial Analytical & Budget Control Service
 * Implements hospital-level analytical dimensions (Ward x Donor/Program x Activity)
 * and real-time budget ceiling validation against approved budgets.
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

export async function checkBudgetCeiling({ query, queryOne }, orgId, { lines, entryDate, fiscalYearId = null }) {
  // Resolve fiscal year
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

    // Check account class
    const acct = await queryOne(
      `SELECT id, code, name, account_class FROM accounts WHERE id = ? OR code = ? LIMIT 1`,
      [line.accountId || 0, line.accountCode || '']
    );
    if (!acct) continue;

    // Budget checks typically monitor Class 6 (Expenses) and Class 2 (Capex)
    if (acct.account_class !== 6 && acct.account_class !== 2) {
      continue;
    }

    const ccId = line.costCenterId || null;
    const progId = line.programId || null;

    // Find applicable budget line in approved budget
    const budgetLine = await queryOne(
      `SELECT bl.amount, b.code AS budget_code, b.name AS budget_name
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

    // Sum actual expenditures already posted in this fiscal year for this account and cost center
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

    const budgetAmount = Number(budgetLine?.amount || 0);
    const spentAmount = Number(actualRes?.total_actual || 0);
    const projectedSpent = spentAmount + debit;
    const isExceeded = budgetAmount > 0 && projectedSpent > budgetAmount;
    const overrun = isExceeded ? projectedSpent - budgetAmount : 0;
    const pctConsumed = budgetAmount > 0 ? (projectedSpent / budgetAmount) * 100 : 0;

    if (isExceeded) {
      totalBreaches++;
    }

    results.push({
      accountId: acct.id,
      accountCode: acct.code,
      accountName: acct.name,
      costCenterId: ccId,
      budgetAmount: money(budgetAmount),
      spentAmount: money(spentAmount),
      proposedAmount: money(debit),
      projectedSpent: money(projectedSpent),
      remainingBudget: money(Math.max(0, budgetAmount - spentAmount)),
      isExceeded,
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

export async function getBudgetExecutionReport({ query }, orgId, { fiscalYearId, costCenterId = null, programId = null }) {
  const sql = `
    SELECT
      ac.id AS account_id,
      ac.code AS account_code,
      ac.name AS account_name,
      ac.account_class,
      cc.id AS cost_center_id,
      cc.code AS cost_center_code,
      cc.name AS cost_center_name,
      fp.id AS program_id,
      fp.code AS program_code,
      fp.name AS program_name,
      COALESCE(b_sub.budget_amount, 0) AS budget_amount,
      COALESCE(a_sub.actual_spent, 0) AS actual_spent,
      (COALESCE(b_sub.budget_amount, 0) - COALESCE(a_sub.actual_spent, 0)) AS remaining_budget,
      CASE
        WHEN COALESCE(b_sub.budget_amount, 0) > 0
        THEN ROUND((COALESCE(a_sub.actual_spent, 0) / b_sub.budget_amount) * 100, 1)
        ELSE 0
      END AS pct_consumed
    FROM accounts ac
    LEFT JOIN cost_centers cc ON (? IS NULL OR cc.id = ?)
    LEFT JOIN funding_programs fp ON (? IS NULL OR fp.id = ?)
    LEFT JOIN (
      SELECT bl.account_id, bl.cost_center_id, bl.program_id, SUM(bl.amount) AS budget_amount
        FROM budget_lines bl
        JOIN budgets b ON b.id = bl.budget_id
       WHERE b.org_id = ? AND b.fiscal_year_id = ? AND b.status = 'approved'
       GROUP BY bl.account_id, bl.cost_center_id, bl.program_id
    ) b_sub ON b_sub.account_id = ac.id
           AND (b_sub.cost_center_id IS NULL OR b_sub.cost_center_id = cc.id)
           AND (b_sub.program_id IS NULL OR b_sub.program_id = fp.id)
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
    WHERE ac.org_id = ? AND ac.account_class IN (6, 2)
      AND (b_sub.budget_amount IS NOT NULL OR a_sub.actual_spent IS NOT NULL)
    ORDER BY ac.code ASC, cc.code ASC`;

  const rows = await query(sql, [
    costCenterId, costCenterId,
    programId, programId,
    orgId, fiscalYearId,
    orgId, fiscalYearId,
    orgId,
  ]);

  let totalBudget = 0;
  let totalSpent = 0;

  for (const r of rows) {
    totalBudget += Number(r.budget_amount || 0);
    totalSpent += Number(r.actual_spent || 0);
  }

  return {
    fiscalYearId,
    totalBudget: money(totalBudget),
    totalSpent: money(totalSpent),
    remainingBudget: money(totalBudget - totalSpent),
    overallPctConsumed: totalBudget > 0 ? Number(((totalSpent / totalBudget) * 100).toFixed(1)) : 0,
    rows,
  };
}
