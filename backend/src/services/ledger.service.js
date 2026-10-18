import { money } from '../utils/money.js';
import { toISO } from '../utils/dates.js';
import { ApiError } from '../utils/errors.js';
import { getPostingLength, resolvePostableAccount } from './posting-level.service.js';

/**
 * The single posting path into the general ledger.
 *
 * FR-GL-002 mandatory balancing validation, FR-GL-003 open/closed period
 * control with a logged override reason, and FR-STD-020 single-entry dual
 * reporting via the `framework` tag all live here. Nothing else in the codebase
 * writes to journal_entries / journal_lines directly.
 */

/** Atomic document numbering. Relies on the caller's transaction. */
export async function nextSequence(tx, orgId, name, date = null) {
  const year = Number(toISO(date || new Date()).slice(0, 4));
  const seq = await tx.queryOne(
    'SELECT * FROM sequences WHERE org_id = ? AND name = ? FOR UPDATE',
    [orgId, name]
  );
  if (!seq) throw new ApiError(500, `Sequence "${name}" is not configured for this organisation.`);

  let next = seq.next_value;
  if (seq.reset_yearly && seq.last_year !== null && seq.last_year !== year) next = 1;

  await tx.query('UPDATE sequences SET next_value = ?, last_year = ? WHERE id = ?', [next + 1, year, seq.id]);

  const body = String(next).padStart(seq.padding, '0');
  return seq.include_year ? `${seq.prefix}${year}-${body}` : `${seq.prefix}${body}`;
}

export async function resolvePeriod(tx, orgId, date) {
  const iso = toISO(date);
  const period = await tx.queryOne(
    'SELECT * FROM accounting_periods WHERE org_id = ? AND ? BETWEEN start_date AND end_date ORDER BY is_adjustment ASC LIMIT 1',
    [orgId, iso]
  );
  if (!period) {
    throw new ApiError(422, `No accounting period is defined for ${iso}. Create the fiscal year first.`);
  }
  return period;
}

/**
 * @param {object} tx transaction handle from db/pool.transaction
 * @param {object} input
 * @param {number} input.orgId
 * @param {string} input.journalCode
 * @param {string} input.date
 * @param {string} input.description
 * @param {Array}  input.lines  [{ accountCode|accountId, costCenterId, assetId, description, debit, credit, taxCodeId, partnerType, partnerId }]
 * @param {'both'|'ohada'|'ifrs'} [input.framework]
 * @param {boolean} [input.autoPost]
 * @param {string}  [input.overrideReason] required to post into a closed period
 * @param {object}  [input.actor] { id, permissions: Set }
 */
export async function createJournalEntry(tx, input) {
  const {
    orgId,
    journalCode,
    date,
    description,
    narration = null,
    reference = null,
    lines = [],
    source = 'manual',
    sourceRef = null,
    framework = 'both',
    currency = null,
    fxRate = 1,
    autoPost = false,
    overrideReason = null,
    actor = null,
  } = input;

  const org = await tx.queryOne('SELECT functional_currency FROM organizations WHERE id = ?', [orgId]);
  if (!org) throw new ApiError(404, 'Organisation not found.');
  const entryCurrency = (currency || org.functional_currency).toUpperCase();
  const rate = Number(fxRate) || 1;

  const journal = await tx.queryOne(
    'SELECT * FROM journals WHERE org_id = ? AND code = ? AND is_active = 1',
    [orgId, journalCode]
  );
  if (!journal) throw new ApiError(422, `Journal "${journalCode}" does not exist.`);

  if (!Array.isArray(lines) || lines.length < 2) {
    throw new ApiError(422, 'A double-entry journal needs at least two lines.');
  }

  const period = await resolvePeriod(tx, orgId, date);
  const isClosed = period.status !== 'open';
  if (isClosed) {
    // FR-GL-003: only an authorised role may post to a closed or locked period,
    // and the override reason is stored on the entry and in the audit log.
    if (actor && actor.permissions && !actor.permissions.has('journal.post_closed')) {
      throw new ApiError(
        403,
        `Period ${period.code} is ${period.status}. You do not have permission to post into it.`
      );
    }
    if (!overrideReason || String(overrideReason).trim().length < 10) {
      throw new ApiError(
        422,
        `Period ${period.code} is ${period.status}. An override reason of at least 10 characters is required.`
      );
    }
  }

  // Resolve and validate every line before writing anything.
  const prepared = [];
  let totalDebit = 0;
  let totalCredit = 0;
  const postingLength = await getPostingLength(tx, orgId);

  for (const [i, raw] of lines.entries()) {
    const n = i + 1;
    let account;
    try {
      account = await resolvePostableAccount(tx, orgId, raw, { source, postingLength });
    } catch (err) {
      if (err instanceof ApiError) {
        throw new ApiError(err.status, `Line ${n}: ${err.message}`);
      }
      throw err;
    }

    const debit = money(raw.debit || 0);
    const credit = money(raw.credit || 0);
    if (debit < 0 || credit < 0) throw new ApiError(422, `Line ${n}: amounts cannot be negative.`);
    if (debit > 0 && credit > 0) throw new ApiError(422, `Line ${n}: a line must be either debit or credit.`);
    if (debit === 0 && credit === 0) throw new ApiError(422, `Line ${n}: amount must be greater than zero.`);

    if (account.requires_cost_center && !raw.costCenterId && source !== 'import' && journalCode !== 'AN') {
      throw new ApiError(422, `Line ${n}: account ${account.code} requires a cost centre (department / ward).`);
    }
    if (account.requires_asset && !raw.assetId && source !== 'import' && journalCode !== 'AN') {
      throw new ApiError(422, `Line ${n}: account ${account.code} requires an asset reference.`);
    }
    if (account.requires_third_party && (!raw.partnerId || raw.partnerType === 'none') && source !== 'import' && journalCode !== 'AN') {
      throw new ApiError(422, `Line ${n}: select the supplier / client for account ${account.code}.`);
    }

    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);

    let subledgerId = raw.subledgerId ?? null;
    if (!subledgerId && raw.partnerId && raw.partnerType && raw.partnerType !== 'none') {
      const sub = await tx.queryOne(
        'SELECT id FROM subledger_accounts WHERE org_id = ? AND partner_type = ? AND partner_id = ? LIMIT 1',
        [orgId, raw.partnerType, raw.partnerId]
      );
      if (sub) subledgerId = sub.id;
    }

    prepared.push({
      account,
      costCenterId: raw.costCenterId ?? null,
      assetId: raw.assetId ?? null,
      subledgerId,
      projectCode: raw.projectCode ?? null,
      description: raw.description ?? null,
      debit,
      credit,
      currency: (raw.currency || entryCurrency).toUpperCase(),
      fxRate: Number(raw.fxRate ?? rate) || 1,
      taxCodeId: raw.taxCodeId ?? null,
      taxBase: raw.taxBase ?? null,
      partnerType: raw.partnerType ?? 'none',
      partnerId: raw.partnerId ?? null,
      origin: raw.origin === 'proposed' || raw.origin === 'edited' ? raw.origin : 'manual',
      proposalSource: raw.proposalSource ?? raw.proposal_source ?? null,
      proposalRuleCode: raw.proposalRuleCode ?? raw.proposal_rule_code ?? null,
      proposalReason: raw.proposalReason ?? raw.proposal_reason ?? null,
    });
  }

  if (totalDebit !== totalCredit) {
    throw new ApiError(
      422,
      `Entry is not balanced. Difference: ${money(totalDebit - totalCredit).toFixed(2)}.`
    );
  }
  if (totalDebit === 0) throw new ApiError(422, 'Entry total is zero.');

  const entryNo = await nextSequence(tx, orgId, 'journal_entry', date);
  const status = autoPost ? 'posted' : 'draft';

  const res = await tx.query(
    `INSERT INTO journal_entries
       (org_id, journal_id, entry_no, entry_date, period_id, reference, description, narration,
        source, source_ref, framework, currency, fx_rate, total_debit, total_credit, status,
        closed_period_override, override_reason, override_by, created_by, posted_by, posted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId, journal.id, entryNo, toISO(date), period.id, reference, description, narration,
      source, sourceRef, framework, entryCurrency, rate, totalDebit, totalCredit, status,
      isClosed ? 1 : 0, isClosed ? overrideReason : null, isClosed ? actor?.id ?? null : null,
      actor?.id ?? null,
      autoPost ? actor?.id ?? null : null, autoPost ? new Date() : null,
    ]
  );
  const entryId = res.insertId;

  for (const [i, l] of prepared.entries()) {
    await tx.query(
      `INSERT INTO journal_lines
         (org_id, entry_id, line_no, account_id, cost_center_id, asset_id, subledger_id, project_code,
          description, debit, credit, currency, fx_rate, debit_func, credit_func,
          tax_code_id, partner_type, partner_id, origin, proposal_source, proposal_rule_code, proposal_reason)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orgId, entryId, i + 1, l.account.id, l.costCenterId, l.assetId, l.subledgerId, l.projectCode,
        l.description, l.debit, l.credit, l.currency, l.fxRate,
        money(l.debit * l.fxRate), money(l.credit * l.fxRate),
        l.taxCodeId, l.partnerType, l.partnerId,
        l.origin, l.proposalSource, l.proposalRuleCode, l.proposalReason,
      ]
    );

    // FR-TX-001: every taxed line feeds the VAT ledger used by the declaration.
    if (l.taxCodeId) {
      const taxCode = await tx.queryOne('SELECT * FROM tax_codes WHERE id = ? AND org_id = ?', [l.taxCodeId, orgId]);
      if (taxCode && taxCode.rate > 0) {
        const taxAmount = money(l.debit + l.credit);
        const base = l.taxBase !== null ? money(l.taxBase) : money((taxAmount / taxCode.rate) * 100);
        await tx.query(
          `INSERT INTO tax_transactions
             (org_id, period_id, tax_code_id, entry_id, direction, base_amount, tax_amount,
              partner_type, partner_id, doc_ref, doc_date)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            orgId, period.id, l.taxCodeId, entryId,
            taxCode.tax_type === 'vat_sale' ? 'output' : 'input',
            base, taxAmount,
            l.partnerType === 'none' ? 'none' : l.partnerType, l.partnerId,
            reference || entryNo, toISO(date),
          ]
        );
      }
    }
  }

  return { id: entryId, entry_no: entryNo, period, status, total_debit: totalDebit, total_credit: totalCredit };
}

export async function postJournalEntry(tx, orgId, entryId, actor = null, overrideReason = null) {
  const entry = await tx.queryOne('SELECT * FROM journal_entries WHERE id = ? AND org_id = ?', [entryId, orgId]);
  if (!entry) throw new ApiError(404, 'Journal entry not found.');
  if (entry.status === 'posted') throw new ApiError(409, `Entry ${entry.entry_no} is already posted.`);
  if (entry.status === 'reversed') throw new ApiError(409, `Entry ${entry.entry_no} has been reversed.`);

  const period = await tx.queryOne('SELECT * FROM accounting_periods WHERE id = ?', [entry.period_id]);
  if (period.status !== 'open') {
    if (actor?.permissions && !actor.permissions.has('journal.post_closed')) {
      throw new ApiError(403, `Period ${period.code} is ${period.status}. You cannot post into it.`);
    }
    if (!overrideReason || String(overrideReason).trim().length < 10) {
      throw new ApiError(422, `Period ${period.code} is ${period.status}. An override reason is required.`);
    }
  }

  const totals = await tx.queryOne(
    'SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c, COUNT(*) AS n FROM journal_lines WHERE entry_id = ?',
    [entryId]
  );
  if (Number(totals.n) < 2) throw new ApiError(422, 'Entry has fewer than two lines.');
  if (money(totals.d) !== money(totals.c)) {
    throw new ApiError(422, `Entry is not balanced. Difference: ${money(Number(totals.d) - Number(totals.c))}.`);
  }
  const heading = await tx.queryOne(
    `SELECT a.code FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.entry_id = ? AND a.is_postable = 0 LIMIT 1`,
    [entryId]
  );
  if (heading) {
    throw new ApiError(422, `${heading.code} is a heading account. Post to a 4-character account.`);
  }

  await tx.query(
    `UPDATE journal_entries
        SET status = 'posted', posted_by = ?, posted_at = NOW(),
            total_debit = ?, total_credit = ?,
            closed_period_override = ?, override_reason = COALESCE(?, override_reason), override_by = COALESCE(?, override_by)
      WHERE id = ?`,
    [
      actor?.id ?? null, money(totals.d), money(totals.c),
      period.status !== 'open' ? 1 : 0,
      period.status !== 'open' ? overrideReason : null,
      period.status !== 'open' ? actor?.id ?? null : null,
      entryId,
    ]
  );
  return { id: entryId, entry_no: entry.entry_no, status: 'posted' };
}

/** Reversal creates a mirrored entry rather than deleting history. */
export async function reverseJournalEntry(tx, orgId, entryId, { date = null, reason, actor = null } = {}) {
  const entry = await tx.queryOne('SELECT * FROM journal_entries WHERE id = ? AND org_id = ?', [entryId, orgId]);
  if (!entry) throw new ApiError(404, 'Journal entry not found.');
  if (entry.status !== 'posted') throw new ApiError(409, 'Only a posted entry can be reversed.');
  if (entry.reversed_by_entry_id) throw new ApiError(409, 'Entry has already been reversed.');
  if (!reason || String(reason).trim().length < 5) throw new ApiError(422, 'A reversal reason is required.');

  const lines = await tx.query('SELECT * FROM journal_lines WHERE entry_id = ? ORDER BY line_no', [entryId]);
  const journal = await tx.queryOne('SELECT code FROM journals WHERE id = ?', [entry.journal_id]);

  const created = await createJournalEntry(tx, {
    orgId,
    journalCode: journal.code,
    date: date || entry.entry_date,
    description: `REVERSAL ${entry.entry_no} - ${reason}`,
    reference: entry.entry_no,
    source: entry.source,
    sourceRef: entry.source_ref,
    framework: entry.framework,
    currency: entry.currency,
    fxRate: entry.fx_rate,
    autoPost: true,
    actor,
    overrideReason: `Reversal of ${entry.entry_no}: ${reason}`,
    lines: lines.map((l) => ({
      accountId: l.account_id,
      costCenterId: l.cost_center_id,
      assetId: l.asset_id,
      description: l.description,
      debit: l.credit,
      credit: l.debit,
      currency: l.currency,
      fxRate: l.fx_rate,
      partnerType: l.partner_type,
      partnerId: l.partner_id,
    })),
  });

  await tx.query('UPDATE journal_entries SET is_reversal = 1, reverses_entry_id = ? WHERE id = ?', [entryId, created.id]);
  await tx.query("UPDATE journal_entries SET status = 'reversed', reversed_by_entry_id = ? WHERE id = ?", [created.id, entryId]);
  return created;
}
