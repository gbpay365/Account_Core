import { money } from '../utils/money.js';
import { ApiError } from '../utils/errors.js';

/**
 * Letters for matching (AA, AB, ... ZZ, AAA, etc.)
 */
export function formatMatchCode(num) {
  let s = '';
  let n = num;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s.length === 1 ? `A${s}` : s;
}

export async function getNextMatchCode(tx, orgId) {
  const row = await tx.queryOne(
    `SELECT MAX(match_code) AS max_code
       FROM journal_lines
      WHERE org_id = ? AND match_code IS NOT NULL AND match_code REGEXP '^[A-Z]+$'`,
    [orgId]
  );
  if (!row || !row.max_code) return 'AA';

  // Decode existing letters to integer
  const code = row.max_code;
  let val = 0;
  for (let i = 0; i < code.length; i += 1) {
    val = val * 26 + (code.charCodeAt(i) - 64);
  }
  return formatMatchCode(val + 1);
}

export async function listSubledgerAccounts(db, orgId, opts = {}) {
  const { collectiveAccountId, partnerType, activeOnly = true } = opts;
  const params = [orgId];
  let filter = '';
  if (collectiveAccountId) {
    filter += ' AND s.collective_account_id = ?';
    params.push(collectiveAccountId);
  }
  if (partnerType) {
    filter += ' AND s.partner_type = ?';
    params.push(partnerType);
  }
  if (activeOnly) {
    filter += ' AND s.is_active = 1';
  }

  const rows = await db.query(
    `SELECT s.*, a.code AS collective_code, a.name AS collective_name,
            COALESCE(SUM(CASE WHEN e.status = 'posted' THEN l.debit ELSE 0 END), 0) AS total_debit,
            COALESCE(SUM(CASE WHEN e.status = 'posted' THEN l.credit ELSE 0 END), 0) AS total_credit
       FROM subledger_accounts s
       JOIN accounts a ON a.id = s.collective_account_id
       LEFT JOIN journal_lines l ON l.subledger_id = s.id
       LEFT JOIN journal_entries e ON e.id = l.entry_id
      WHERE s.org_id = ?${filter}
      GROUP BY s.id
      ORDER BY s.code`,
    params
  );

  return rows.map((r) => {
    const debit = money(r.total_debit);
    const credit = money(r.total_credit);
    return {
      ...r,
      total_debit: debit,
      total_credit: credit,
      balance: money(debit - credit),
    };
  });
}

export async function buildAuxiliaryBalance(db, orgId, opts = {}) {
  const { from = '1900-01-01', to = '2099-12-31', collectiveAccountId, partnerType, includeZero = false } = opts;
  const params = [orgId, from, to, orgId, from];
  let extraFilter = '';
  if (collectiveAccountId) {
    extraFilter += ' AND s.collective_account_id = ?';
    params.push(collectiveAccountId);
  }
  if (partnerType) {
    extraFilter += ' AND s.partner_type = ?';
    params.push(partnerType);
  }

  const rows = await db.query(
    `SELECT s.id, s.code, s.name, s.partner_type, s.partner_id,
            a.code AS collective_code, a.name AS collective_name,
            COALESCE(op.open_debit, 0) AS open_debit,
            COALESCE(op.open_credit, 0) AS open_credit,
            COALESCE(cur.period_debit, 0) AS period_debit,
            COALESCE(cur.period_credit, 0) AS period_credit,
            COALESCE(unm.unmatched_count, 0) AS unmatched_count
       FROM subledger_accounts s
       JOIN accounts a ON a.id = s.collective_account_id
       LEFT JOIN (
         SELECT l.subledger_id,
                SUM(l.debit) AS period_debit,
                SUM(l.credit) AS period_credit
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id
          WHERE l.org_id = ? AND e.status = 'posted'
            AND e.entry_date BETWEEN ? AND ?
          GROUP BY l.subledger_id
       ) cur ON cur.subledger_id = s.id
       LEFT JOIN (
         SELECT l.subledger_id,
                SUM(l.debit) AS open_debit,
                SUM(l.credit) AS open_credit
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id
          WHERE l.org_id = ? AND e.status = 'posted'
            AND e.entry_date < ?
          GROUP BY l.subledger_id
       ) op ON op.subledger_id = s.id
       LEFT JOIN (
         SELECT l.subledger_id, COUNT(*) AS unmatched_count
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id
          WHERE l.org_id = ? AND e.status = 'posted'
            AND l.match_code IS NULL
          GROUP BY l.subledger_id
       ) unm ON unm.subledger_id = s.id
      WHERE s.org_id = ?${extraFilter}
      ORDER BY s.code`,
    [orgId, from, to, orgId, from, orgId, orgId, ...(collectiveAccountId ? [collectiveAccountId] : []), ...(partnerType ? [partnerType] : [])]
  );

  const formatted = [];
  const totals = {
    opening_debit: 0,
    opening_credit: 0,
    period_debit: 0,
    period_credit: 0,
    ytd_debit: 0,
    ytd_credit: 0,
    closing_debit: 0,
    closing_credit: 0,
  };

  for (const r of rows) {
    const opNet = money(Number(r.open_debit) - Number(r.open_credit));
    const opDr = opNet > 0 ? opNet : 0;
    const opCr = opNet < 0 ? -opNet : 0;

    const perDr = money(r.period_debit);
    const perCr = money(r.period_credit);

    const ytdDr = money(opDr + perDr);
    const ytdCr = money(opCr + perCr);

    const closeNet = money(ytdDr - ytdCr);
    const closeDr = closeNet > 0 ? closeNet : 0;
    const closeCr = closeNet < 0 ? -closeNet : 0;

    if (!includeZero && opDr === 0 && opCr === 0 && perDr === 0 && perCr === 0) {
      continue;
    }

    totals.opening_debit = money(totals.opening_debit + opDr);
    totals.opening_credit = money(totals.opening_credit + opCr);
    totals.period_debit = money(totals.period_debit + perDr);
    totals.period_credit = money(totals.period_credit + perCr);
    totals.ytd_debit = money(totals.ytd_debit + ytdDr);
    totals.ytd_credit = money(totals.ytd_credit + ytdCr);
    totals.closing_debit = money(totals.closing_debit + closeDr);
    totals.closing_credit = money(totals.closing_credit + closeCr);

    formatted.push({
      id: r.id,
      code: r.code,
      name: r.name,
      partner_type: r.partner_type,
      partner_id: r.partner_id,
      collective_code: r.collective_code,
      collective_name: r.collective_name,
      opening_debit: opDr,
      opening_credit: opCr,
      opening_balance: opNet,
      period_debit: perDr,
      period_credit: perCr,
      ytd_debit: ytdDr,
      ytd_credit: ytdCr,
      closing_debit: closeDr,
      closing_credit: closeCr,
      closing_balance: closeNet,
      unmatched_count: Number(r.unmatched_count),
    });
  }

  return {
    rows: formatted,
    totals,
    balanced: money(totals.closing_debit) === money(totals.closing_credit),
  };
}

export async function buildAuxiliaryLedger(db, orgId, opts = {}) {
  const { subledgerId, from = '1900-01-01', to = '2099-12-31', matchFilter = 'all' } = opts;
  const sub = await db.queryOne(
    `SELECT s.*, a.code AS collective_code, a.name AS collective_name
       FROM subledger_accounts s
       JOIN accounts a ON a.id = s.collective_account_id
      WHERE s.id = ? AND s.org_id = ?`,
    [subledgerId, orgId]
  );
  if (!sub) throw new ApiError(404, 'Auxiliary subledger account not found.');

  // Opening balance before 'from'
  const opRow = await db.queryOne(
    `SELECT COALESCE(SUM(l.debit), 0) AS d, COALESCE(SUM(l.credit), 0) AS c
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.subledger_id = ? AND l.org_id = ? AND e.status = 'posted'
        AND e.entry_date < ?`,
    [subledgerId, orgId, from]
  );
  const opening = money(Number(opRow.d) - Number(opRow.c));

  let filter = '';
  if (matchFilter === 'unmatched') {
    filter += ' AND l.match_code IS NULL';
  } else if (matchFilter === 'matched') {
    filter += ' AND l.match_code IS NOT NULL';
  }

  const rows = await db.query(
    `SELECT l.id AS line_id, l.line_no, l.description, l.debit, l.credit,
            l.match_code, l.match_date, l.match_type,
            e.id AS entry_id, e.entry_no, e.entry_date, e.reference,
            j.code AS journal_code
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN journals j ON j.id = e.journal_id
      WHERE l.subledger_id = ? AND l.org_id = ? AND e.status = 'posted'
        AND e.entry_date BETWEEN ? AND ?${filter}
      ORDER BY e.entry_date, e.id, l.line_no`,
    [subledgerId, orgId, from, to]
  );

  let running = opening;
  const movements = rows.map((r) => {
    running = money(running + Number(r.debit) - Number(r.credit));
    return {
      ...r,
      debit: money(r.debit),
      credit: money(r.credit),
      balance: running,
    };
  });

  return {
    subledger: sub,
    from,
    to,
    opening_balance: opening,
    closing_balance: running,
    total_debit: money(rows.reduce((t, r) => t + Number(r.debit), 0)),
    total_credit: money(rows.reduce((t, r) => t + Number(r.credit), 0)),
    rows: movements,
  };
}

export async function matchLines(tx, orgId, { lineIds, customMatchCode, actor = null }) {
  if (!Array.isArray(lineIds) || lineIds.length < 2) {
    throw new ApiError(422, 'At least two lines are required for matching (lettrage).');
  }

  const placeholders = lineIds.map(() => '?').join(',');
  const lines = await tx.query(
    `SELECT l.id, l.debit, l.credit, l.match_code, l.account_id, l.subledger_id, e.status
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.id IN (${placeholders}) AND l.org_id = ?`,
    [...lineIds, orgId]
  );

  if (lines.length !== lineIds.length) {
    throw new ApiError(404, 'One or more journal lines were not found.');
  }

  for (const l of lines) {
    if (l.status !== 'posted') {
      throw new ApiError(422, `Line #${l.id} belongs to an unposted entry. Only posted entries may be lettered.`);
    }
    if (l.match_code) {
      throw new ApiError(409, `Line #${l.id} is already matched with code "${l.match_code}". Unmatch it first.`);
    }
  }

  const sumDebit = money(lines.reduce((s, l) => s + Number(l.debit), 0));
  const sumCredit = money(lines.reduce((s, l) => s + Number(l.credit), 0));
  const diff = money(Math.abs(sumDebit - sumCredit));

  if (diff > 0.01) {
    throw new ApiError(
      422,
      `Selected lines do not balance. Total debit: ${sumDebit}, total credit: ${sumCredit}. Difference: ${diff}.`
    );
  }

  const matchCode = (customMatchCode || (await getNextMatchCode(tx, orgId))).trim().toUpperCase();

  await tx.query(
    `UPDATE journal_lines
        SET match_code = ?, match_date = NOW(), match_type = 'manual',
            reconciled = 1, reconciled_at = NOW()
      WHERE id IN (${placeholders}) AND org_id = ?`,
    [matchCode, ...lineIds, orgId]
  );

  return {
    match_code: matchCode,
    count: lines.length,
    matched_amount: sumDebit,
  };
}

export async function unmatchLines(tx, orgId, { matchCode, lineIds = [], actor = null }) {
  if (!matchCode && (!Array.isArray(lineIds) || lineIds.length === 0)) {
    throw new ApiError(422, 'Provide either a matchCode or a list of line IDs to unmatch.');
  }

  let result;
  if (matchCode) {
    result = await tx.query(
      `UPDATE journal_lines
          SET match_code = NULL, match_date = NULL, match_type = 'none',
              reconciled = 0, reconciled_at = NULL
        WHERE match_code = ? AND org_id = ?`,
      [matchCode, orgId]
    );
  } else {
    const placeholders = lineIds.map(() => '?').join(',');
    result = await tx.query(
      `UPDATE journal_lines
          SET match_code = NULL, match_date = NULL, match_type = 'none',
              reconciled = 0, reconciled_at = NULL
        WHERE id IN (${placeholders}) AND org_id = ?`,
      [...lineIds, orgId]
    );
  }

  return { ok: true, unmatched_count: result.affectedRows };
}

export async function getOpenItems(db, orgId, opts = {}) {
  const { subledgerId, collectiveAccountId, partnerType, from, to } = opts;
  const params = [orgId];
  let filter = '';

  if (subledgerId) {
    filter += ' AND l.subledger_id = ?';
    params.push(subledgerId);
  }
  if (collectiveAccountId) {
    filter += ' AND l.account_id = ?';
    params.push(collectiveAccountId);
  }
  if (partnerType) {
    filter += ' AND s.partner_type = ?';
    params.push(partnerType);
  }
  if (from) {
    filter += ' AND e.entry_date >= ?';
    params.push(from);
  }
  if (to) {
    filter += ' AND e.entry_date <= ?';
    params.push(to);
  }

  const rows = await db.query(
    `SELECT l.id, l.debit, l.credit, l.description, l.match_code,
            e.id AS entry_id, e.entry_no, e.entry_date, e.reference,
            s.id AS subledger_id, s.code AS subledger_code, s.name AS subledger_name,
            a.code AS account_code, a.name AS account_name
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id
       LEFT JOIN subledger_accounts s ON s.id = l.subledger_id
      WHERE l.org_id = ? AND e.status = 'posted' AND l.match_code IS NULL
        AND (a.account_class = 4 OR l.subledger_id IS NOT NULL)${filter}
      ORDER BY e.entry_date, e.id, l.line_no`,
    params
  );

  return rows.map((r) => ({
    ...r,
    debit: money(r.debit),
    credit: money(r.credit),
  }));
}
