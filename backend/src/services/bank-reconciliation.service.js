import { pool, query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { toISO } from '../utils/dates.js';
import { money } from '../utils/money.js';
import { createJournalEntry } from './ledger.service.js';

/**
 * Bank Reconciliation Service for CEMAC / SYSCOHADA.
 * Supports Afriland First Bank, SG Cameroun, BICEC, BGFI, UBA, Ecobank, Central Cash and Mobile Money.
 */

/**
 * List all bank and cash accounts configured with their GL accounts and current ledger balance.
 */
export async function listBankAccounts(orgId) {
  const accounts = await query(
    `SELECT ba.*,
            a.code AS gl_account_code,
            a.name AS gl_account_name,
            COALESCE(SUM(jl.debit - jl.credit), 0) AS current_ledger_balance,
            (SELECT COUNT(*) FROM bank_statements bs WHERE bs.bank_account_id = ba.id) AS statement_count,
            (SELECT MAX(bs.statement_date) FROM bank_statements bs WHERE bs.bank_account_id = ba.id) AS last_statement_date
       FROM bank_accounts ba
       JOIN accounts a ON a.id = ba.account_id
  LEFT JOIN journal_lines jl ON jl.account_id = ba.account_id
  LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
      WHERE ba.org_id = ?
   GROUP BY ba.id
   ORDER BY ba.code ASC`,
    [orgId]
  );
  return accounts.map(a => ({
    ...a,
    current_ledger_balance: Number(a.current_ledger_balance || 0),
    opening_balance: Number(a.opening_balance || 0),
  }));
}

/**
 * Get details of a single bank account.
 */
export async function getBankAccount(orgId, bankAccountId) {
  const ba = await queryOne(
    `SELECT ba.*,
            a.code AS gl_account_code,
            a.name AS gl_account_name
       FROM bank_accounts ba
       JOIN accounts a ON a.id = ba.account_id
      WHERE ba.org_id = ? AND ba.id = ?`,
    [orgId, bankAccountId]
  );
  if (!ba) throw new ApiError(404, 'Bank account not found.');

  const ledgerRes = await queryOne(
    `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS current_ledger_balance,
            COUNT(jl.id) AS total_ledger_transactions
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id = ? AND je.status = 'posted' AND je.org_id = ?`,
    [ba.account_id, orgId]
  );

  return {
    ...ba,
    current_ledger_balance: Number(ledgerRes?.current_ledger_balance || 0),
    total_ledger_transactions: Number(ledgerRes?.total_ledger_transactions || 0),
  };
}

/**
 * List imported statements for a bank account.
 */
export async function listStatements(orgId, bankAccountId) {
  const statements = await query(
    `SELECT bs.*,
            COUNT(bsl.id) AS total_lines,
            COALESCE(SUM(CASE WHEN bsl.reconciled = 1 THEN 1 ELSE 0 END), 0) AS reconciled_lines,
            COALESCE(SUM(CASE WHEN bsl.reconciled = 1 THEN bsl.amount ELSE 0 END), 0) AS reconciled_amount
       FROM bank_statements bs
  LEFT JOIN bank_statement_lines bsl ON bsl.statement_id = bs.id
      WHERE bs.org_id = ? AND bs.bank_account_id = ?
   GROUP BY bs.id
   ORDER BY bs.statement_date DESC, bs.id DESC`,
    [orgId, bankAccountId]
  );

  return statements.map(s => {
    const totalLines = Number(s.total_lines || 0);
    const recLines = Number(s.reconciled_lines || 0);
    const pct = totalLines > 0 ? Math.round((recLines / totalLines) * 100) : 0;
    return {
      ...s,
      total_lines: totalLines,
      reconciled_lines: recLines,
      reconciliation_progress: pct,
      opening_balance: Number(s.opening_balance || 0),
      closing_balance: Number(s.closing_balance || 0),
    };
  });
}

/**
 * Import a bank statement with its lines.
 */
export async function importStatement(orgId, bankAccountId, payload, userId) {
  const {
    statement_number,
    statement_date,
    start_date,
    end_date,
    opening_balance = 0,
    closing_balance = 0,
    source_format = 'excel',
    original_file_name = null,
    lines = [],
  } = payload;

  if (!statement_number || !statement_date || !start_date || !end_date) {
    throw new ApiError(400, 'Missing mandatory statement header information.');
  }

  // Check if statement number already exists for this bank account
  const existing = await queryOne(
    `SELECT id FROM bank_statements WHERE bank_account_id = ? AND statement_number = ?`,
    [bankAccountId, statement_number]
  );
  if (existing) {
    throw new ApiError(409, `Statement "${statement_number}" has already been imported for this account.`);
  }

  return await transaction(async (tx) => {
    const res = await tx.query(
      `INSERT INTO bank_statements
       (org_id, bank_account_id, statement_number, statement_date, start_date, end_date,
        opening_balance, closing_balance, source_format, original_file_name, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?)`,
      [
        orgId,
        bankAccountId,
        statement_number,
        statement_date,
        start_date,
        end_date,
        opening_balance,
        closing_balance,
        source_format,
        original_file_name,
        userId,
      ]
    );
    const statementId = res.insertId;

    if (lines && lines.length > 0) {
      for (const line of lines) {
        await tx.query(
          `INSERT INTO bank_statement_lines
           (statement_id, line_date, value_date, amount, reference, cheque_no, description, partner_name, reconciled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            statementId,
            line.line_date || line.date || statement_date,
            line.value_date || line.line_date || line.date || statement_date,
            Number(line.amount || 0),
            line.reference || null,
            line.cheque_no || null,
            line.description || 'Opération bancaire',
            line.partner_name || null,
          ]
        );
      }
    }

    return {
      id: statementId,
      statement_number,
      lines_imported: lines.length,
    };
  });
}

/**
 * Get all lines for a statement.
 */
export async function getStatementLines(orgId, statementId) {
  const statement = await queryOne(
    `SELECT bs.*, ba.name AS bank_account_name, ba.code AS bank_account_code, ba.account_id
       FROM bank_statements bs
       JOIN bank_accounts ba ON ba.id = bs.bank_account_id
      WHERE bs.id = ? AND bs.org_id = ?`,
    [statementId, orgId]
  );
  if (!statement) throw new ApiError(404, 'Statement not found.');

  const lines = await query(
    `SELECT bsl.*,
            je.entry_no AS reconciled_entry_number,
            je.entry_date AS reconciled_entry_date,
            jl.debit AS matched_debit,
            jl.credit AS matched_credit,
            jl.description AS matched_description
       FROM bank_statement_lines bsl
  LEFT JOIN journal_entries je ON je.id = bsl.reconciled_entry_id
  LEFT JOIN journal_lines jl ON jl.id = bsl.reconciled_line_id
      WHERE bsl.statement_id = ?
   ORDER BY bsl.line_date ASC, bsl.id ASC`,
    [statementId]
  );

  return {
    statement: {
      ...statement,
      opening_balance: Number(statement.opening_balance),
      closing_balance: Number(statement.closing_balance),
    },
    lines: lines.map(l => ({
      ...l,
      amount: Number(l.amount),
      matched_debit: l.matched_debit !== null ? Number(l.matched_debit) : null,
      matched_credit: l.matched_credit !== null ? Number(l.matched_credit) : null,
    })),
  };
}

/**
 * Get unreconciled ledger entries for the bank's GL account.
 */
export async function getUnreconciledLedgerLines(orgId, bankAccountId, options = {}) {
  const ba = await queryOne(
    `SELECT * FROM bank_accounts WHERE id = ? AND org_id = ?`,
    [bankAccountId, orgId]
  );
  if (!ba) throw new ApiError(404, 'Bank account not found.');

  // Find all journal lines on ba.account_id not yet matched in bank_statement_lines
  const lines = await query(
    `SELECT jl.id AS journal_line_id,
            jl.entry_id,
            jl.line_no,
            jl.description,
            jl.debit,
            jl.credit,
            je.entry_no,
            je.entry_date,
            je.reference,
            je.source_ref
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
  LEFT JOIN bank_statement_lines bsl ON bsl.reconciled_line_id = jl.id
      WHERE jl.account_id = ?
        AND je.org_id = ?
        AND je.status = 'posted'
        AND bsl.id IS NULL
   ORDER BY je.entry_date ASC, jl.id ASC`,
    [ba.account_id, orgId]
  );

  return lines.map(l => ({
    ...l,
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
    net_amount: Number(l.debit || 0) - Number(l.credit || 0),
  }));
}

/**
 * Auto-matching engine for Bank Reconciliation.
 * Matches statement lines with General Ledger lines using multi-pass heuristic scoring:
 * - Pass 1: Cheque number match (exact cheque reference + amount match) -> score 100
 * - Pass 2: Exact amount match and date proximity within 3 days -> score 95
 * - Pass 3: Exact amount match and reference text match -> score 90
 * - Pass 4: Exact amount match within statement date window -> score 80
 */
export async function autoReconcile(orgId, statementId, userId) {
  const statement = await queryOne(
    `SELECT bs.*, ba.account_id
       FROM bank_statements bs
       JOIN bank_accounts ba ON ba.id = bs.bank_account_id
      WHERE bs.id = ? AND bs.org_id = ?`,
    [statementId, orgId]
  );
  if (!statement) throw new ApiError(404, 'Statement not found.');

  // Get unreconciled statement lines
  const stmtLines = await query(
    `SELECT * FROM bank_statement_lines
      WHERE statement_id = ? AND reconciled = 0
      ORDER BY line_date ASC, id ASC`,
    [statementId]
  );

  if (stmtLines.length === 0) {
    return { matchedCount: 0, matchedAmount: 0, message: 'All statement lines are already reconciled.' };
  }

  // Get unreconciled ledger lines on this account
  const ledgerLines = await query(
    `SELECT jl.id AS journal_line_id,
            jl.entry_id,
            jl.description,
            jl.debit,
            jl.credit,
            je.entry_no,
            je.entry_date,
            je.reference,
            je.source_ref
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
  LEFT JOIN bank_statement_lines bsl ON bsl.reconciled_line_id = jl.id
      WHERE jl.account_id = ?
        AND je.org_id = ?
        AND je.status = 'posted'
        AND bsl.id IS NULL
   ORDER BY je.entry_date ASC, jl.id ASC`,
    [statement.account_id, orgId]
  );

  let matchedCount = 0;
  let matchedAmount = 0;
  const claimedLedgerIds = new Set();

  await transaction(async (tx) => {
    for (const sLine of stmtLines) {
      const sAmt = Number(sLine.amount);
      const sDate = new Date(sLine.line_date).getTime();
      const sCheque = (sLine.cheque_no || '').trim().toLowerCase();
      const sRef = (sLine.reference || '').trim().toLowerCase();

      let bestMatch = null;
      let bestScore = 0;

      for (const lLine of ledgerLines) {
        if (claimedLedgerIds.has(lLine.journal_line_id)) continue;

        // In bank statement:
        // Credit (positive amount) = Bank received deposit -> in ledger it is a DEBIT to account 521.
        // Debit (negative amount) = Bank paid out withdrawal -> in ledger it is a CREDIT to account 521.
        const lDebit = Number(lLine.debit);
        const lCredit = Number(lLine.credit);
        const lAmt = lDebit > 0 ? lDebit : -lCredit;

        // Check if magnitude and sign match within 0.01 tolerance
        if (Math.abs(sAmt - lAmt) > 0.01) continue;

        const lDate = new Date(lLine.entry_date).getTime();
        const daysDiff = Math.abs(sDate - lDate) / (1000 * 60 * 60 * 24);
        const lRef = ((lLine.reference || '') + ' ' + (lLine.source_ref || '')).toLowerCase();

        let score = 0;

        // Pass 1: Cheque match
        if (sCheque && lRef.includes(sCheque)) {
          score = 100;
        } else if (daysDiff <= 3) {
          // Pass 2: Exact amount and +/- 3 days
          score = 95 - daysDiff;
        } else if (sRef && (lRef.includes(sRef) || sRef.includes(lRef))) {
          // Pass 3: Text match
          score = 90;
        } else if (daysDiff <= 31) {
          // Pass 4: In same month
          score = 80 - Math.min(daysDiff, 20);
        }

        if (score > bestScore && score >= 60) {
          bestScore = score;
          bestMatch = lLine;
        }
      }

      if (bestMatch) {
        claimedLedgerIds.add(bestMatch.journal_line_id);
        await tx.query(
          `UPDATE bank_statement_lines
              SET reconciled = 1,
                  reconciled_entry_id = ?,
                  reconciled_line_id = ?,
                  reconciled_at = NOW()
            WHERE id = ?`,
          [bestMatch.entry_id, bestMatch.journal_line_id, sLine.id]
        );
        matchedCount++;
        matchedAmount += Math.abs(sAmt);
      }
    }
  });

  return {
    matchedCount,
    matchedAmount,
    remainingUnreconciled: stmtLines.length - matchedCount,
  };
}

/**
 * Manually reconcile a statement line with a general ledger line.
 */
export async function manualReconcile(orgId, statementLineId, journalLineId, userId) {
  const stmtLine = await queryOne(
    `SELECT bsl.*, bs.org_id, bs.bank_account_id, ba.account_id
       FROM bank_statement_lines bsl
       JOIN bank_statements bs ON bs.id = bsl.statement_id
       JOIN bank_accounts ba ON ba.id = bs.bank_account_id
      WHERE bsl.id = ? AND bs.org_id = ?`,
    [statementLineId, orgId]
  );
  if (!stmtLine) throw new ApiError(404, 'Statement line not found.');

  const jlLine = await queryOne(
    `SELECT jl.*, je.entry_no, je.status
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.id = ? AND je.org_id = ?`,
    [journalLineId, orgId]
  );
  if (!jlLine) throw new ApiError(404, 'Journal line not found.');

  if (jlLine.status !== 'posted') {
    throw new ApiError(400, 'Cannot reconcile with an unposted journal entry.');
  }

  if (jlLine.account_id !== stmtLine.account_id) {
    throw new ApiError(400, 'Selected journal line does not belong to this bank account.');
  }

  await query(
    `UPDATE bank_statement_lines
        SET reconciled = 1,
            reconciled_entry_id = ?,
            reconciled_line_id = ?,
            reconciled_at = NOW()
      WHERE id = ?`,
    [jlLine.entry_id, jlLine.id, statementLineId]
  );

  return { success: true };
}

/**
 * Cancel reconciliation for a statement line.
 */
export async function unreconcile(orgId, statementLineId) {
  const stmtLine = await queryOne(
    `SELECT bsl.id
       FROM bank_statement_lines bsl
       JOIN bank_statements bs ON bs.id = bsl.statement_id
      WHERE bsl.id = ? AND bs.org_id = ?`,
    [statementLineId, orgId]
  );
  if (!stmtLine) throw new ApiError(404, 'Statement line not found.');

  await query(
    `UPDATE bank_statement_lines
        SET reconciled = 0,
            reconciled_entry_id = NULL,
            reconciled_line_id = NULL,
            reconciled_at = NULL
      WHERE id = ?`,
    [statementLineId]
  );

  return { success: true };
}

/**
 * Generate official statutory CEMAC / OHADA "État de Rapprochement Bancaire".
 */
export async function getReconciliationReport(orgId, bankAccountId, statementId) {
  const ba = await queryOne(
    `SELECT ba.*, a.code AS gl_code, a.name AS gl_name
       FROM bank_accounts ba
       JOIN accounts a ON a.id = ba.account_id
      WHERE ba.id = ? AND ba.org_id = ?`,
    [bankAccountId, orgId]
  );
  if (!ba) throw new ApiError(404, 'Bank account not found.');

  const statement = await queryOne(
    `SELECT * FROM bank_statements WHERE id = ? AND bank_account_id = ? AND org_id = ?`,
    [statementId, bankAccountId, orgId]
  );
  if (!statement) throw new ApiError(404, 'Statement not found.');

  // 1. Bank Statement Closing Balance
  const stmtClosing = Number(statement.closing_balance);

  // 2. Ledger Closing Balance on the statement's end date
  const ledgerRes = await queryOne(
    `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id = ?
        AND je.org_id = ?
        AND je.status = 'posted'
        AND je.entry_date <= ?`,
    [ba.account_id, orgId, statement.end_date]
  );
  const ledgerClosing = Number(ledgerRes?.balance || 0);

  // 3. Outstanding Cheques / Disbursals:
  // Payments recorded in ledger up to statement date, but NOT yet appearing/cleared on bank statement.
  const outstandingCheques = await query(
    `SELECT jl.id, jl.entry_id, je.entry_no, je.entry_date, je.reference, jl.description, jl.credit AS amount
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
  LEFT JOIN bank_statement_lines bsl ON bsl.reconciled_line_id = jl.id
      WHERE jl.account_id = ?
        AND je.org_id = ?
        AND je.status = 'posted'
        AND je.entry_date <= ?
        AND jl.credit > 0
        AND bsl.id IS NULL`,
    [ba.account_id, orgId, statement.end_date]
  );
  const outstandingChequesTotal = outstandingCheques.reduce((sum, r) => sum + Number(r.amount), 0);

  // 4. Outstanding Deposits / Receipts in transit:
  // Receipts recorded in ledger up to statement date, but NOT yet appearing on bank statement.
  const outstandingDeposits = await query(
    `SELECT jl.id, jl.entry_id, je.entry_no, je.entry_date, je.reference, jl.description, jl.debit AS amount
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
  LEFT JOIN bank_statement_lines bsl ON bsl.reconciled_line_id = jl.id
      WHERE jl.account_id = ?
        AND je.org_id = ?
        AND je.status = 'posted'
        AND je.entry_date <= ?
        AND jl.debit > 0
        AND bsl.id IS NULL`,
    [ba.account_id, orgId, statement.end_date]
  );
  const outstandingDepositsTotal = outstandingDeposits.reduce((sum, r) => sum + Number(r.amount), 0);

  // 5. Unrecorded Bank Charges, Commissions, Interest (Debited by bank, not yet entered in ledger)
  const unrecordedCharges = await query(
    `SELECT id, line_date, amount, reference, cheque_no, description
       FROM bank_statement_lines
      WHERE statement_id = ?
        AND reconciled = 0
        AND amount < 0`,
    [statementId]
  );
  const unrecordedChargesTotal = unrecordedCharges.reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);

  // 6. Unrecorded Bank Credits (Transfers received, dividends credited by bank, not yet entered in ledger)
  const unrecordedCredits = await query(
    `SELECT id, line_date, amount, reference, cheque_no, description
       FROM bank_statement_lines
      WHERE statement_id = ?
        AND reconciled = 0
        AND amount > 0`,
    [statementId]
  );
  const unrecordedCreditsTotal = unrecordedCredits.reduce((sum, r) => sum + Number(r.amount), 0);

  // Standard OHADA / CEMAC Reconciliation Equation:
  // Bank Perspective:
  //   Statement Balance
  //   + Outstanding Deposits
  //   - Outstanding Cheques
  //   = Adjusted Bank Balance
  const adjustedBankBalance = stmtClosing + outstandingDepositsTotal - outstandingChequesTotal;

  // Book / Ledger Perspective:
  //   Ledger Balance
  //   + Unrecorded Credits from Bank
  //   - Unrecorded Charges from Bank
  //   = Adjusted Book Balance
  const adjustedBookBalance = ledgerClosing + unrecordedCreditsTotal - unrecordedChargesTotal;

  const discrepancy = Math.abs(adjustedBankBalance - adjustedBookBalance);
  const isBalanced = discrepancy < 0.05;

  return {
    bank_account: ba,
    statement,
    statement_closing_balance: stmtClosing,
    ledger_closing_balance: ledgerClosing,
    outstanding_cheques: outstandingCheques.map(c => ({ ...c, amount: Number(c.amount) })),
    outstanding_cheques_total: outstandingChequesTotal,
    outstanding_deposits: outstandingDeposits.map(d => ({ ...d, amount: Number(d.amount) })),
    outstanding_deposits_total: outstandingDepositsTotal,
    unrecorded_charges: unrecordedCharges.map(u => ({ ...u, amount: Math.abs(Number(u.amount)) })),
    unrecorded_charges_total: unrecordedChargesTotal,
    unrecorded_credits: unrecordedCredits.map(u => ({ ...u, amount: Number(u.amount) })),
    unrecorded_credits_total: unrecordedCreditsTotal,
    adjusted_bank_balance: adjustedBankBalance,
    adjusted_book_balance: adjustedBookBalance,
    discrepancy,
    is_balanced: isBalanced,
  };
}

/**
 * One-click posting of unrecorded bank charges (agios, fees, commissions).
 * Debits Account 6311 (Frais bancaires), optionally 4454 (TVA sur services),
 * Credits the bank account (Account 5211...), and reconciles the statement line.
 */
export async function postBankCharge(orgId, bankAccountId, payload, actor) {
  const {
    statementLineId,
    date,
    amount,
    description = 'Frais bancaires et commissions de tenue de compte',
    hasTva = false,
  } = payload;

  const stmtLine = await queryOne(
    `SELECT bsl.*, bs.bank_account_id, ba.account_id AS bank_gl_account_id, ba.currency
       FROM bank_statement_lines bsl
       JOIN bank_statements bs ON bs.id = bsl.statement_id
       JOIN bank_accounts ba ON ba.id = bs.bank_account_id
      WHERE bsl.id = ? AND bs.org_id = ?`,
    [statementLineId, orgId]
  );
  if (!stmtLine) throw new ApiError(404, 'Statement line not found.');
  if (stmtLine.reconciled) throw new ApiError(400, 'This line is already reconciled.');

  const absAmount = Math.abs(Number(amount || stmtLine.amount));
  if (absAmount <= 0) throw new ApiError(400, 'Charge amount must be positive.');

  return await transaction(async (tx) => {
    // Resolve fee account 6311 or 631
    const feeAcct = await tx.queryOne(
      `SELECT id FROM accounts WHERE org_id = ? AND (code = '6311' OR code = '631') LIMIT 1`,
      [orgId]
    );
    if (!feeAcct) throw new ApiError(422, 'Account 6311 / 631 (Frais bancaires) is not defined in chart of accounts.');

    let netFee = absAmount;
    let tvaAmount = 0;
    let tvaAcctId = null;

    if (hasTva) {
      // CEMAC 19.25% TVA extraction: Total = HT * 1.1925
      netFee = money.round(absAmount / 1.1925);
      tvaAmount = money.round(absAmount - netFee);
      const tvaAcct = await tx.queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND (code = '4454' OR code = '445') LIMIT 1`,
        [orgId]
      );
      if (tvaAcct) tvaAcctId = tvaAcct.id;
      else netFee = absAmount; // Fallback if no TVA account
    }

    const lines = [
      {
        accountId: feeAcct.id,
        description: description,
        debit: netFee,
        credit: 0,
      },
    ];

    if (tvaAmount > 0 && tvaAcctId) {
      lines.push({
        accountId: tvaAcctId,
        description: `TVA 19.25% déductible sur ${description}`,
        debit: tvaAmount,
        credit: 0,
      });
    }

    // Credit Bank Account
    lines.push({
      accountId: stmtLine.bank_gl_account_id,
      description: description,
      debit: 0,
      credit: absAmount,
    });

    // Create and post journal entry in Bank Journal (BQ)
    const entry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'BQ',
      date: date || stmtLine.line_date,
      description: description,
      framework: 'both',
      autoPost: true,
      lines,
      actor,
    });

    // Find the journal line that credited the bank account
    const bankJournalLine = await tx.queryOne(
      `SELECT id FROM journal_lines WHERE entry_id = ? AND account_id = ? AND credit > 0 LIMIT 1`,
      [entry.id, stmtLine.bank_gl_account_id]
    );

    // Auto-reconcile statement line with this new journal line
    await tx.query(
      `UPDATE bank_statement_lines
          SET reconciled = 1,
              reconciled_entry_id = ?,
              reconciled_line_id = ?,
              reconciled_at = NOW()
        WHERE id = ?`,
      [entry.id, bankJournalLine?.id || null, statementLineId]
    );

    return {
      success: true,
      entry_id: entry.id,
      entry_number: entry.entry_no,
      amount: absAmount,
    };
  });
}
