import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { toISO } from '../utils/dates.js';
import { createJournalEntry } from './ledger.service.js';

export async function listRecurringTemplates(db, orgId) {
  const templates = await db.query(
    `SELECT t.*, j.name AS journal_name,
            (SELECT COUNT(*) FROM posting_template_lines l WHERE l.template_id = t.id) AS line_count
       FROM posting_templates t
       LEFT JOIN journals j ON j.code = t.journal_code AND j.org_id = t.org_id
      WHERE t.org_id = ? AND t.is_recurring = 1
      ORDER BY t.sort_order ASC, t.code ASC`,
    [orgId]
  );
  return templates;
}

export async function configureRecurringTemplate(db, orgId, templateId, opts) {
  const {
    isRecurring = true,
    frequency = 'monthly',
    dayOfMonth = 1,
    startDate,
    endDate,
    autoPost = false,
  } = opts;

  const template = await db.queryOne(
    `SELECT * FROM posting_templates WHERE id = ? AND org_id = ?`,
    [templateId, orgId]
  );
  if (!template) throw new ApiError(404, 'Posting template not found.');

  const start = startDate ? toISO(startDate) : toISO(new Date());
  const end = endDate ? toISO(endDate) : null;

  // Compute initial next_run_date
  let nextRun = new Date(start);
  if (dayOfMonth > 1) {
    nextRun.setDate(Math.min(dayOfMonth, 28));
  }

  await db.query(
    `UPDATE posting_templates
        SET is_recurring = ?,
            frequency = ?,
            day_of_month = ?,
            start_date = ?,
            end_date = ?,
            next_run_date = ?,
            auto_post = ?
      WHERE id = ? AND org_id = ?`,
    [
      isRecurring ? 1 : 0,
      frequency,
      dayOfMonth,
      start,
      end,
      toISO(nextRun),
      autoPost ? 1 : 0,
      templateId,
      orgId,
    ]
  );

  return db.queryOne(`SELECT * FROM posting_templates WHERE id = ?`, [templateId]);
}

export function computeNextRunDate(currentDateStr, frequency, dayOfMonth = 1) {
  const cur = new Date(currentDateStr);
  let monthsToAdd = 1;
  if (frequency === 'quarterly') monthsToAdd = 3;
  else if (frequency === 'semi_annual') monthsToAdd = 6;
  else if (frequency === 'annual') monthsToAdd = 12;

  const next = new Date(cur.getFullYear(), cur.getMonth() + monthsToAdd, Math.min(dayOfMonth, 28));
  return toISO(next);
}

export async function processDueRecurringTemplates(tx, orgId, asOfDate, opts = {}) {
  const targetDate = toISO(asOfDate);
  const dueTemplates = await tx.query(
    `SELECT t.*, j.id AS journal_id
       FROM posting_templates t
       JOIN journals j ON j.code = t.journal_code AND j.org_id = t.org_id
      WHERE t.org_id = ?
        AND t.is_active = 1
        AND t.is_recurring = 1
        AND (t.next_run_date IS NULL OR t.next_run_date <= ?)
        AND (t.end_date IS NULL OR t.end_date >= ?)
      ORDER BY t.next_run_date ASC`,
    [orgId, targetDate, targetDate]
  );

  const results = [];
  for (const t of dueTemplates) {
    const lines = await tx.query(
      `SELECT l.* FROM posting_template_lines l WHERE l.template_id = ? ORDER BY l.line_no ASC`,
      [t.id]
    );

    if (lines.length >= 2) {
      const runDate = t.next_run_date || targetDate;
      const finCc = await tx.queryOne(
        `SELECT id FROM cost_centers WHERE org_id = ? AND code IN ('FIN', 'ADM') ORDER BY code = 'FIN' DESC LIMIT 1`,
        [orgId]
      );

      const entryLines = [];
      let refAmt = 250000;
      for (const l of lines) {
        const acct = await tx.queryOne(
          `SELECT id, code, account_class, requires_third_party FROM accounts WHERE org_id = ? AND code = ?`,
          [orgId, l.account_rule]
        ) || await tx.queryOne(`SELECT id, code, account_class, requires_third_party FROM accounts WHERE id = ?`, [l.account_rule]);
        if (!acct) continue;

        const amt = !isNaN(Number(l.amount_formula)) && Number(l.amount_formula) > 0
          ? Number(l.amount_formula)
          : refAmt;
        refAmt = amt;

        let partnerId = null;
        let partnerType = 'none';
        if (acct.requires_third_party || acct.code.startsWith('40') || acct.code.startsWith('41')) {
          partnerType = l.third_party_rule === 'supplier' ? 'supplier' : (l.third_party_rule === 'customer' ? 'customer' : (acct.code.startsWith('40') ? 'supplier' : 'customer'));
          const p = partnerType === 'supplier'
            ? await tx.queryOne(`SELECT id FROM suppliers WHERE org_id = ? LIMIT 1`, [orgId])
            : await tx.queryOne(`SELECT id FROM customers WHERE org_id = ? LIMIT 1`, [orgId]);
          partnerId = p?.id ?? null;
        }

        entryLines.push({
          accountId: acct.id,
          costCenterId: acct.account_class === '6' ? finCc?.id : undefined,
          partnerType,
          partnerId,
          description: l.note || t.name,
          debit: l.side === 'debit' ? amt : 0,
          credit: l.side === 'credit' ? amt : 0,
        });
      }

      // Calculate balance
      const totalDebit = entryLines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = entryLines.reduce((s, l) => s + (l.credit || 0), 0);
      const canAutoPost = t.auto_post && totalDebit === totalCredit && totalDebit > 0;

      // Create entry
      const created = await createJournalEntry(tx, {
        orgId,
        journalCode: t.journal_code,
        date: runDate,
        reference: `REC-${t.code}`,
        description: `Écriture récurrente (${t.name})`,
        narration: `Génération automatique par modèle d'abonnement ${t.code} - ${t.frequency}.`,
        source: 'recurring',
        sourceRef: String(t.id),
        framework: 'both',
        currency: 'XAF',
        autoPost: Boolean(canAutoPost),
        actor: opts.actor,
        lines: entryLines,
      });

      await tx.query(
        `UPDATE journal_entries SET is_recurring = 1, recurring_template_id = ? WHERE id = ?`,
        [t.id, created.id]
      );

      // Compute and update next run date
      const nextDate = computeNextRunDate(runDate, t.frequency, t.day_of_month);
      await tx.query(
        `UPDATE posting_templates
            SET last_run_at = NOW(),
                next_run_date = ?
          WHERE id = ?`,
        [nextDate, t.id]
      );

      results.push({
        template: { id: t.id, code: t.code, name: t.name },
        entry: created,
        nextRunDate: nextDate,
      });
    }
  }

  return { processedCount: results.length, entries: results };
}
