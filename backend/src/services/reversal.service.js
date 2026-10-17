import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { createJournalEntry } from './ledger.service.js';
import { toISO } from '../utils/dates.js';

/**
 * Finds all posted journal entries with auto_reverse_date on or before asOfDate
 * that haven't been reversed yet.
 */
export async function getDueReversals(db, orgId, asOfDate) {
  const targetDate = toISO(asOfDate);
  const rows = await db.query(
    `SELECT e.*, j.code AS journal_code, j.name AS journal_name
       FROM journal_entries e
       JOIN journals j ON j.id = e.journal_id
      WHERE e.org_id = ?
        AND e.status = 'posted'
        AND e.auto_reverse_date IS NOT NULL
        AND e.auto_reverse_date <= ?
        AND e.reversed_by_entry_id IS NULL
      ORDER BY e.auto_reverse_date ASC, e.entry_no ASC`,
    [orgId, targetDate]
  );
  return rows;
}

/**
 * Executes automatic reversal (extourne) for an entry:
 * Creates an exact inverse counterpart entry (debits -> credits, credits -> debits),
 * posts it, and links reversed_by_entry_id.
 */
export async function reverseAccrualEntry(tx, orgId, entryId, opts = {}) {
  const entry = await tx.queryOne(
    `SELECT e.*, j.code AS journal_code
       FROM journal_entries e
       JOIN journals j ON j.id = e.journal_id
      WHERE e.id = ? AND e.org_id = ?`,
    [entryId, orgId]
  );
  if (!entry) throw new ApiError(404, 'Journal entry not found.');
  if (entry.status !== 'posted') throw new ApiError(400, 'Only posted entries can be reversed.');
  if (entry.reversed_by_entry_id) throw new ApiError(409, `Entry ${entry.entry_no} is already reversed.`);

  const lines = await tx.query(
    `SELECT l.* FROM journal_lines l WHERE l.entry_id = ? ORDER BY l.line_no ASC`,
    [entry.id]
  );
  if (!lines.length) throw new ApiError(422, 'Cannot reverse an entry with no lines.');

  const reversalDate = opts.reversalDate || entry.auto_reverse_date || new Date();
  const dateStr = toISO(reversalDate);

  // Invert lines: debits become credits, credits become debits
  const reversedLines = lines.map((l) => ({
    accountId: l.account_id,
    costCenterId: l.cost_center_id,
    subledgerId: l.subledger_id,
    partnerId: l.partner_id,
    assetId: l.asset_id,
    projectCode: l.project_code,
    description: `Extourne: ${l.description || entry.description || ''}`,
    reference: l.reference || entry.reference,
    currency: l.currency,
    fxRate: l.fx_rate,
    debit: Number(l.credit),
    credit: Number(l.debit),
  }));

  const created = await createJournalEntry(tx, {
    orgId,
    journalCode: entry.journal_code,
    date: dateStr,
    reference: `EXT-${entry.entry_no}`,
    description: `Extourne automatique : ${entry.description || entry.entry_no}`,
    narration: `Contre-passation automatique au titre du cut-off / charges à payer. Référence originale : ${entry.entry_no}.`,
    source: 'reversal',
    sourceRef: String(entry.id),
    framework: entry.framework,
    currency: entry.currency,
    fxRate: entry.fx_rate,
    autoPost: true,
    actor: opts.actor,
    lines: reversedLines,
  });

  // Link reversal entries
  await tx.query(
    `UPDATE journal_entries SET is_reversal = 1, reverses_entry_id = ? WHERE id = ?`,
    [entry.id, created.id]
  );
  await tx.query(
    `UPDATE journal_entries SET reversed_by_entry_id = ? WHERE id = ?`,
    [created.id, entry.id]
  );

  return created;
}

/**
 * Processes all due accrual reversals on or before asOfDate.
 */
export async function processAllDueReversals(tx, orgId, asOfDate, opts = {}) {
  const due = await getDueReversals(tx, orgId, asOfDate);
  const results = [];
  for (const entry of due) {
    const reversed = await reverseAccrualEntry(tx, orgId, entry.id, opts);
    results.push(reversed);
  }
  return { processedCount: results.length, reversals: results };
}

/**
 * Sets or removes the auto_reverse_date on an existing journal entry.
 */
export async function setAutoReverseDate(db, orgId, entryId, autoReverseDate) {
  const dateVal = autoReverseDate ? toISO(autoReverseDate) : null;
  await db.query(
    `UPDATE journal_entries SET auto_reverse_date = ? WHERE id = ? AND org_id = ?`,
    [dateVal, entryId, orgId]
  );
  return db.queryOne(`SELECT * FROM journal_entries WHERE id = ?`, [entryId]);
}
