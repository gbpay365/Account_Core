import { money } from '../utils/money.js';

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
            ac.account_class,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            fp.code AS program_code,
            fp.name AS program_name,
            -- Committed expenditures (approved or draft commitments)
            COALESCE(comm.total_committed, 0) AS total_committed,
            -- Actual general ledger postings
            COALESCE(act.total_actual, 0) AS total_actual,
            -- Net transfers (transfers in - transfers out)
            COALESCE(tr_in.total_in, 0) - COALESCE(tr_out.total_out, 0) AS net_transfers
       FROM budget_lines bl
       JOIN accounts ac ON ac.id = bl.account_id
       LEFT JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN funding_programs fp ON fp.id = bl.program_id
       LEFT JOIN (
         SELECT budget_line_id, SUM(amount) AS total_committed
           FROM budget_commitments
          WHERE status IN ('approved', 'draft')
          GROUP BY budget_line_id
       ) comm ON comm.budget_line_id = bl.id
       LEFT JOIN (
         SELECT jl.account_id, jl.cost_center_id, jl.program_id, SUM(jl.debit - jl.credit) AS total_actual
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

    return {
      ...l,
      initial_amount: money(initial),
      net_transfers: money(netTransfers),
      revised_amount: money(revised),
      total_committed: money(committed),
      total_actual: money(actual),
      total_consumed: money(consumed),
      available_balance: money(available),
      overrun_amount: money(overrun),
      pct_consumed: pctConsumed,
      is_overspent: consumed > revised,
    };
  });

  return {
    ...budget,
    lines: formattedLines,
  };
}

export async function createBudget({ query, queryOne }, orgId, { fiscalYearId, code, name, notes = null, version = 1 }) {
  const res = await query(
    `INSERT INTO budgets (org_id, fiscal_year_id, code, name, version, status, notes)
     VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
    [orgId, fiscalYearId, code, name, version, notes]
  );
  return { id: res.insertId, code, name, status: 'draft' };
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
    notes = null,
  } = payload;

  const res = await query(
    `INSERT INTO budget_lines (budget_id, account_id, cost_center_id, program_id, budget_type, initial_amount, amount, control_mode, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [budgetId, accountId, costCenterId || null, programId || null, budgetType, amount, amount, controlMode, notes || null]
  );
  return { id: res.insertId, budgetId, amount };
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

export async function listCommitments({ query }, orgId, { budgetId = null, budgetLineId = null, status = null, assetId = null } = {}) {
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

  const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  return query(
    `SELECT bc.*,
            bl.budget_type,
            bl.amount AS line_budget_amount,
            ac.code AS account_code,
            ac.name AS account_name,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            v.name AS vendor_name,
            ast.asset_tag AS asset_tag,
            ast.name AS asset_name,
            u.full_name AS approver_name
       FROM budget_commitments bc
       JOIN budget_lines bl ON bl.id = bc.budget_line_id
       JOIN accounts ac ON ac.id = bl.account_id
       LEFT JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN suppliers v ON v.id = bc.vendor_id
       LEFT JOIN assets ast ON ast.id = bc.asset_id
       LEFT JOIN users u ON u.id = bc.approved_by
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
    notes = null,
  } = payload;

  const numAmount = Number(amount);
  if (numAmount <= 0) {
    throw new Error('Commitment amount must be strictly positive.');
  }

  // 1. Retrieve budget line, budget master and control mode
  const line = await queryOne(
    `SELECT bl.*, b.id AS budget_id, b.status AS budget_status, b.fiscal_year_id
       FROM budget_lines bl
       JOIN budgets b ON b.id = bl.budget_id
      WHERE b.org_id = ? AND bl.id = ? LIMIT 1`,
    [orgId, budgetLineId]
  );

  if (!line) {
    throw new Error('Budget line not found or does not belong to this organization.');
  }

  // 2. Check current commitments on this line
  const commRes = await queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total_committed
       FROM budget_commitments
      WHERE budget_line_id = ? AND status IN ('approved', 'draft')`,
    [budgetLineId]
  );

  const budgetCap = Number(line.amount || 0);
  const alreadyConsumed = Number(commRes?.total_committed || 0);
  const available = budgetCap - alreadyConsumed;

  if (line.control_mode === 'strict_block' && numAmount > available) {
    throw new Error(
      `Budget ceiling breach! Line has only ${money(Math.max(0, available))} XAF available. Proposed commitment: ${money(numAmount)} XAF.`
    );
  }

  // 3. Generate sequential commitment number ENG-YYYY-NNNN
  const yr = new Date(committedDate || Date.now()).getFullYear();
  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM budget_commitments WHERE org_id = ? AND commitment_number LIKE ?`,
    [orgId, `ENG-${yr}-%`]
  );
  const seq = (countRow?.cnt || 0) + 1;
  const commitmentNumber = `ENG-${yr}-${String(seq).padStart(4, '0')}`;

  const ins = await query(
    `INSERT INTO budget_commitments
     (org_id, budget_id, budget_line_id, commitment_number, description, vendor_id, asset_id, work_order_id, amount, committed_date, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      orgId,
      line.budget_id,
      budgetLineId,
      commitmentNumber,
      description,
      vendorId || null,
      assetId || null,
      workOrderId || null,
      numAmount,
      committedDate || new Date().toISOString().slice(0, 10),
      notes || null,
    ]
  );

  // If assetId is supplied, update asset with budget_line_id
  if (assetId) {
    await query(`UPDATE assets SET budget_line_id = ? WHERE org_id = ? AND id = ?`, [budgetLineId, orgId, assetId]);
  }

  return {
    id: ins.insertId,
    commitmentNumber,
    amount: numAmount,
    availableRemaining: Math.max(0, available - numAmount),
    status: 'draft',
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
            src_bl.budget_type AS source_budget_type,
            tgt_ac.code AS target_account_code,
            tgt_ac.name AS target_account_name,
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

    const budgetLine = await queryOne(
      `SELECT bl.id, bl.amount, bl.control_mode, b.code AS budget_code, b.name AS budget_name
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
      committedAmount: money(committedAmount),
      proposedAmount: money(debit),
      projectedSpent: money(projectedSpent),
      remainingBudget: money(Math.max(0, budgetAmount - totalConsumed)),
      isExceeded,
      controlMode: budgetLine?.control_mode || 'warning',
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
      ac.account_class,
      b_sub.budget_type,
      cc.id AS cost_center_id,
      cc.code AS cost_center_code,
      cc.name AS cost_center_name,
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

  for (const r of rows) {
    totalBudget += Number(r.budget_amount || 0);
    totalCommitted += Number(r.committed_amount || 0);
    totalSpent += Number(r.actual_spent || 0);
  }

  const totalConsumed = totalCommitted + totalSpent;

  return {
    fiscalYearId: fyId,
    totalBudget: money(totalBudget),
    totalCommitted: money(totalCommitted),
    totalSpent: money(totalSpent),
    totalConsumed: money(totalConsumed),
    remainingBudget: money(totalBudget - totalConsumed),
    overallPctConsumed: totalBudget > 0 ? Number(((totalConsumed / totalBudget) * 100).toFixed(1)) : 0,
    rows,
  };
}
