import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { toISO, addDays } from '../utils/dates.js';
import { createJournalEntry, postJournalEntry } from './ledger.service.js';

/**
 * Finds the closing exchange rate for fromCurrency -> toCurrency on or before date.
 */
export async function getClosingRate(db, orgId, fromCurrency, toCurrency, asOfDate) {
  if (fromCurrency === toCurrency) return 1.0;
  const dateStr = toISO(asOfDate);
  const row = await db.queryOne(
    `SELECT rate FROM exchange_rates
      WHERE org_id = ?
        AND from_currency = ?
        AND to_currency = ?
        AND rate_date <= ?
      ORDER BY rate_date DESC, id DESC
      LIMIT 1`,
    [orgId, fromCurrency, toCurrency, dateStr]
  );
  if (!row) {
    // Check reverse rate
    const rev = await db.queryOne(
      `SELECT rate FROM exchange_rates
        WHERE org_id = ?
          AND from_currency = ?
          AND to_currency = ?
          AND rate_date <= ?
        ORDER BY rate_date DESC, id DESC
        LIMIT 1`,
      [orgId, toCurrency, fromCurrency, dateStr]
    );
    if (rev && Number(rev.rate) > 0) return 1.0 / Number(rev.rate);
    throw new ApiError(422, `No exchange rate found for ${fromCurrency} -> ${toCurrency} as of ${dateStr}.`);
  }
  return Number(row.rate);
}

/**
 * Simulates foreign exchange revaluation across all open foreign currency balances.
 */
export async function simulateFxRevaluation(db, orgId, periodId) {
  const period = await db.queryOne(
    `SELECT * FROM accounting_periods WHERE id = ? AND org_id = ?`,
    [periodId, orgId]
  );
  if (!period) throw new ApiError(404, 'Accounting period not found.');

  const org = await db.queryOne(`SELECT * FROM organizations WHERE id = ?`, [orgId]);
  const funcCurrency = org?.functional_currency || 'XAF';

  // Aggregate all posted transactions in non-functional currency up to period end date
  // Grouped by account, subledger, and currency
  const balances = await db.query(
    `SELECT l.account_id, a.code AS account_code, a.name AS account_name,
            l.subledger_id, s.code AS subledger_code, s.name AS subledger_name,
            l.currency,
            SUM(l.debit) AS total_debit_foreign,
            SUM(l.credit) AS total_credit_foreign,
            SUM(l.debit_func) AS total_debit_func,
            SUM(l.credit_func) AS total_credit_func
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id
       LEFT JOIN subledger_accounts s ON s.id = l.subledger_id
      WHERE l.org_id = ?
        AND e.status = 'posted'
        AND e.entry_date <= ?
        AND l.currency IS NOT NULL
        AND l.currency != ?
        AND (a.code LIKE '4%' OR a.code LIKE '5%' OR a.code LIKE '16%')
      GROUP BY l.account_id, l.subledger_id, l.currency
     HAVING ABS(SUM(l.debit) - SUM(l.credit)) > 0.001`,
    [orgId, period.end_date, funcCurrency]
  );

  const lines = [];
  let totalLatentLoss = 0;
  let totalLatentGain = 0;

  for (const b of balances) {
    const foreignBalance = money(Number(b.total_debit_foreign) - Number(b.total_credit_foreign));
    const bookAmountXaf = money(Number(b.total_debit_func) - Number(b.total_credit_func));

    if (Math.abs(foreignBalance) < 0.01) continue;

    const closingRate = await getClosingRate(db, orgId, b.currency, funcCurrency, period.end_date);
    const revaluedAmountXaf = money(foreignBalance * closingRate);
    const varianceXaf = money(revaluedAmountXaf - bookAmountXaf);

    if (Math.abs(varianceXaf) < 0.01) continue;

    // Check account nature:
    // If account is liability/payable (e.g. 401 suppliers, 16 borrowings): credit balance is normal (foreignBalance < 0).
    // If revalued < book (e.g. was -60,000, now -65,000): we owe MORE -> Latent Loss.
    // If account is asset/receivable (e.g. 411 customers, 521 bank): debit balance is normal (foreignBalance > 0).
    // If revalued < book (e.g. was +60,000, now +55,000): we receive LESS -> Latent Loss.
    let varianceType = 'neutral';
    let latentLossAmount = 0;
    let latentGainAmount = 0;

    const isPayable = b.account_code.startsWith('40') || b.account_code.startsWith('16') || b.account_code.startsWith('42') || b.account_code.startsWith('44');

    if (isPayable) {
      if (varianceXaf < 0) {
        varianceType = 'latent_loss';
        latentLossAmount = Math.abs(varianceXaf);
        totalLatentLoss = money(totalLatentLoss + latentLossAmount);
      } else {
        varianceType = 'latent_gain';
        latentGainAmount = Math.abs(varianceXaf);
        totalLatentGain = money(totalLatentGain + latentGainAmount);
      }
    } else {
      // Asset / Receivable
      if (varianceXaf < 0) {
        varianceType = 'latent_loss';
        latentLossAmount = Math.abs(varianceXaf);
        totalLatentLoss = money(totalLatentLoss + latentLossAmount);
      } else {
        varianceType = 'latent_gain';
        latentGainAmount = Math.abs(varianceXaf);
        totalLatentGain = money(totalLatentGain + latentGainAmount);
      }
    }

    lines.push({
      accountId: b.account_id,
      accountCode: b.account_code,
      accountName: b.account_name,
      subledgerId: b.subledger_id,
      subledgerCode: b.subledger_code,
      subledgerName: b.subledger_name,
      currency: b.currency,
      foreignBalance,
      bookAmountXaf,
      bookRate: foreignBalance !== 0 ? Math.abs(money(bookAmountXaf / foreignBalance)) : closingRate,
      closingRate,
      revaluedAmountXaf,
      varianceXaf,
      varianceType,
      latentLossAmount,
      latentGainAmount,
    });
  }

  const totals = {
    itemCount: lines.length,
    totalLatentLoss: money(totalLatentLoss),
    totalLatentGain: money(totalLatentGain),
    totalProvision: money(totalLatentLoss), // Under SYSCOHADA, provision = total latent loss
  };

  return { period, asOfDate: period.end_date, lines, totals };
}

/**
 * Creates and materializes a currency revaluation run.
 */
export async function createFxRevaluationRun(tx, orgId, periodId, opts = {}) {
  const sim = await simulateFxRevaluation(tx, orgId, periodId);
  if (sim.lines.length === 0) {
    throw new ApiError(422, `No open foreign currency balances require revaluation for period ${sim.period.code}.`);
  }

  const res = await tx.query(
    `INSERT INTO currency_revaluation_runs
       (org_id, period_id, as_of_date, status, total_latent_loss, total_latent_gain, total_provision, run_by)
     VALUES (?, ?, ?, 'simulated', ?, ?, ?, ?)`,
    [
      orgId,
      periodId,
      sim.asOfDate,
      sim.totals.totalLatentLoss,
      sim.totals.totalLatentGain,
      sim.totals.totalProvision,
      opts.actor?.id ?? null,
    ]
  );
  const runId = res.insertId;

  for (const l of sim.lines) {
    await tx.query(
      `INSERT INTO currency_revaluation_lines
         (run_id, account_id, subledger_id, currency, foreign_balance,
          book_rate, closing_rate, book_amount_xaf, revalued_amount_xaf, variance_xaf, variance_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        l.accountId,
        l.subledgerId ?? null,
        l.currency,
        l.foreignBalance,
        l.bookRate,
        l.closingRate,
        l.bookAmountXaf,
        l.revaluedAmountXaf,
        l.varianceXaf,
        l.varianceType,
      ]
    );
  }

  return { runId, ...sim };
}

/**
 * Posts the currency revaluation run:
 * 1. Generates the Écarts de Conversion entry (Comptes 4781, 4782).
 * 2. If latent loss > 0, generates the Provision entry (Debit 6971, Credit 194).
 * 3. Sets auto_reverse_date on the conversion entry for automatic extourne on day 1 of following period.
 */
export async function postFxRevaluationRun(tx, orgId, runId, opts = {}) {
  const run = await tx.queryOne(
    `SELECT r.*, p.code AS period_code, p.end_date AS period_end_date
       FROM currency_revaluation_runs r
       JOIN accounting_periods p ON p.id = r.period_id
      WHERE r.id = ? AND r.org_id = ?`,
    [runId, orgId]
  );
  if (!run) throw new ApiError(404, 'Revaluation run not found.');
  if (run.status === 'posted') throw new ApiError(409, 'This revaluation run has already been posted.');

  const lines = await tx.query(
    `SELECT l.*, a.code AS account_code, a.name AS account_name,
            s.partner_type, s.partner_id
       FROM currency_revaluation_lines l
       JOIN accounts a ON a.id = l.account_id
       LEFT JOIN subledger_accounts s ON s.id = l.subledger_id
      WHERE l.run_id = ?`,
    [runId]
  );

  // Lookup SYSCOHADA revaluation accounts
  const acct4781 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4781'`, [orgId])
    || await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '478'`, [orgId]);
  const acct4782 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4782'`, [orgId])
    || await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '479'`, [orgId]);
  const acct6971 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '6971'`, [orgId])
    || await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '697'`, [orgId]);
  const acct194 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '194'`, [orgId]);
  const odJournal = await tx.queryOne(`SELECT id FROM journals WHERE org_id = ? AND code = 'OD'`, [orgId])
    || await tx.queryOne(`SELECT id FROM journals WHERE org_id = ? LIMIT 1`, [orgId]);

  if (!acct4781 || !acct4782) {
    throw new ApiError(422, 'SYSCOHADA conversion accounts 4781/4782 not found in chart of accounts.');
  }

  // Calculate day 1 of next period for auto-reversal
  const nextDay = addDays(run.period_end_date, 1);

  // 1. Build Conversion Entry Lines
  const conversionEntryLines = [];
  for (const l of lines) {
    const isPayable = l.account_code.startsWith('40') || l.account_code.startsWith('16');
    const amount = Math.abs(Number(l.variance_xaf));

    const pType = l.partner_type || (l.account_code.startsWith('40') ? 'supplier' : (l.account_code.startsWith('41') ? 'customer' : 'none'));
    const pId = l.partner_id || null;

    if (l.variance_type === 'latent_loss') {
      // Debit 4781 (Écart actif), Credit 401/411
      conversionEntryLines.push({
        accountId: acct4781.id,
        description: `Écart conversion actif (Perte latente) : ${l.account_code} ${l.currency}`,
        debit: amount,
        credit: 0,
      });
      conversionEntryLines.push({
        accountId: l.account_id,
        subledgerId: l.subledger_id,
        partnerType: pType,
        partnerId: pId,
        description: `Réévaluation devise ${l.currency} au ${run.period_end_date}`,
        debit: 0,
        credit: amount,
      });
    } else if (l.variance_type === 'latent_gain') {
      // Debit 401/411, Credit 4782 (Écart passif)
      conversionEntryLines.push({
        accountId: l.account_id,
        subledgerId: l.subledger_id,
        partnerType: pType,
        partnerId: pId,
        description: `Réévaluation devise ${l.currency} au ${run.period_end_date}`,
        debit: amount,
        credit: 0,
      });
      conversionEntryLines.push({
        accountId: acct4782.id,
        description: `Écart conversion passif (Gain latent) : ${l.account_code} ${l.currency}`,
        debit: 0,
        credit: amount,
      });
    }
  }

  let conversionEntry = null;
  if (conversionEntryLines.length > 0) {
    conversionEntry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'OD',
      date: toISO(run.period_end_date),
      reference: `REV-FX-${run.period_code}`,
      description: `Écarts de conversion devises au ${run.period_end_date} (${run.period_code})`,
      narration: `Réévaluation périodique des dettes et créances en devises sous SYSCOHADA AUDCIF. Extourne prévue le ${toISO(nextDay)}.`,
      source: 'fx_revaluation',
      sourceRef: String(runId),
      framework: 'both',
      currency: 'XAF',
      autoPost: true,
      actor: opts.actor,
      lines: conversionEntryLines,
    });
    // Set auto_reverse_date on the conversion entry
    await tx.query(
      `UPDATE journal_entries SET auto_reverse_date = ? WHERE id = ?`,
      [toISO(nextDay), conversionEntry.id]
    );
  }

  // 2. Build Provision Entry (Debit 6971, Credit 194) if latent loss > 0
  let provEntry = null;
  if (Number(run.total_latent_loss) > 0 && acct6971 && acct194) {
    const finCc = await tx.queryOne(
      `SELECT id FROM cost_centers WHERE org_id = ? AND code IN ('FIN', 'ADM') ORDER BY code = 'FIN' DESC LIMIT 1`,
      [orgId]
    ) || await tx.queryOne(`SELECT id FROM cost_centers WHERE org_id = ? LIMIT 1`, [orgId]);

    const provLines = [
      {
        accountId: acct6971.id,
        costCenterId: finCc?.id ?? null,
        description: `Dotation aux provisions pour pertes de change - ${run.period_code}`,
        debit: Number(run.total_latent_loss),
        credit: 0,
      },
      {
        accountId: acct194.id,
        description: `Provision pour pertes de change - ${run.period_code}`,
        debit: 0,
        credit: Number(run.total_latent_loss),
      },
    ];
    provEntry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'OD',
      date: toISO(run.period_end_date),
      reference: `PROV-FX-${run.period_code}`,
      description: `Provision pour pertes de change latentes (${run.period_code})`,
      narration: `Provision réglementée pour pertes de change latentes (SYSCOHADA Art. 54). Extourne prévue le ${toISO(nextDay)}.`,
      source: 'fx_revaluation',
      sourceRef: String(runId),
      framework: 'both',
      currency: 'XAF',
      autoPost: true,
      actor: opts.actor,
      lines: provLines,
    });
    await tx.query(
      `UPDATE journal_entries SET auto_reverse_date = ? WHERE id = ?`,
      [toISO(nextDay), provEntry.id]
    );
  }

  // Update run record
  await tx.query(
    `UPDATE currency_revaluation_runs
        SET status = 'posted',
            entry_id = ?,
            provision_entry_id = ?,
            posted_at = NOW()
      WHERE id = ?`,
    [conversionEntry?.id ?? null, provEntry?.id ?? null, runId]
  );

  return {
    runId,
    conversionEntry,
    provisionEntry: provEntry,
    periodCode: run.period_code,
    totals: {
      totalLatentLoss: run.total_latent_loss,
      totalLatentGain: run.total_latent_gain,
      totalProvision: run.total_provision,
    },
  };
}
