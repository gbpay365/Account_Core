/**
 * End-to-end integrity check against the seeded ledger. This is the SRS section
 * 10 acceptance test: one transaction set must produce a balanced trial balance,
 * a balanced OHADA statement pack, a balanced IFRS pack, and an asset register
 * that ties to the general ledger with zero variance.
 */
import { pool, transaction } from '../src/db/pool.js';
import {
  buildTrialBalance, buildOhadaStatement, buildIfrsStatement, buildCashFlow,
  buildChangesInEquity, buildPpeNote, reconcileAssetRegisterToLedger,
} from '../src/services/reporting.service.js';
import { money, formatAmount } from '../src/utils/money.js';
import { today } from '../src/utils/dates.js';

let failures = 0;
const fmt = (n) => formatAmount(Number(n) || 0, 'XAF').padStart(22);

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`          ${detail}`);
  if (!ok) failures += 1;
}

/** Statement self-checks all expose { label, difference, balanced }. */
const checkStatement = (label, c) =>
  check(label, Boolean(c?.balanced), `${c?.label ?? ''} -> difference ${fmt(c?.difference)}`);

await transaction(async (tx) => {
  const org = await tx.queryOne('SELECT * FROM organizations LIMIT 1');
  const from = '2026-01-01';
  const to = '2026-08-31';
  const range = { from, to };

  console.log(`\n${org.name}`);
  console.log(`OHADA / ${org.country_code} - ${org.reporting_tier} - ${org.functional_currency}`);
  console.log(`Period ${from} to ${to}\n`);

  // --- 1. double-entry integrity -------------------------------------------
  console.log('1. Double-entry integrity');
  const je = await tx.queryOne(
    `SELECT COUNT(*) AS n, COALESCE(SUM(ABS(total_debit - total_credit) > 0.005), 0) AS unbalanced
       FROM journal_entries WHERE org_id = ? AND status = 'posted'`,
    [org.id]
  );
  check(`${je.n} posted entries, each internally balanced`, Number(je.unbalanced) === 0);

  const hdr = await tx.queryOne(
    `SELECT COALESCE(SUM(ABS(e.total_debit - t.d) > 0.005 OR ABS(e.total_credit - t.c) > 0.005), 0) AS bad
       FROM journal_entries e
       JOIN (SELECT entry_id, SUM(debit) d, SUM(credit) c FROM journal_lines GROUP BY entry_id) t
         ON t.entry_id = e.id
      WHERE e.org_id = ?`,
    [org.id]
  );
  check('entry headers agree with their own lines', Number(hdr.bad) === 0);

  const orphan = await tx.queryOne(
    `SELECT COUNT(*) AS n FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id
      WHERE a.is_postable = 0`,
    []
  );
  check('no line posted to a non-postable (header) account', Number(orphan.n) === 0);

  const tb = await buildTrialBalance(tx, org.id, range);
  check('trial balance: period debits = period credits',
    tb.totals.period_debit === tb.totals.period_credit,
    `${fmt(tb.totals.period_debit)} vs ${fmt(tb.totals.period_credit)}`);
  check('trial balance: closing debits = closing credits',
    tb.totals.closing_debit === tb.totals.closing_credit,
    `${fmt(tb.totals.closing_debit)} vs ${fmt(tb.totals.closing_credit)}`);

  // --- 2. OHADA statutory pack ---------------------------------------------
  console.log('\n2. OHADA / SYSCOHADA (AUDCIF) statements');
  const bilan = await buildOhadaStatement(tx, org.id, 'BILAN', range);
  checkStatement('Bilan balances', bilan.check);
  console.log(`          total actif net ${fmt(bilan.check.total_assets)}`);
  console.log(`          total passif    ${fmt(bilan.check.total_liabilities)}`);

  const cr = await buildOhadaStatement(tx, org.id, 'CR', range);
  const resultCR = cr.check.net_result;
  console.log(`  ----  Compte de resultat: resultat net ${fmt(resultCR)}`);

  // The Bilan carries the period result at line CJ; it must equal line XI of
  // the Compte de resultat or the two statements tell different stories.
  const cj = bilan.lines.find((l) => l.line_code === 'CJ');
  check('net result in the Compte de resultat = result carried in the Bilan',
    Math.abs(money(resultCR) - money(cj?.net ?? 0)) < 0.02,
    `XI ${fmt(resultCR)} vs CJ ${fmt(cj?.net)}`);

  const tafire = await buildOhadaStatement(tx, org.id, 'TAFIRE', range);
  checkStatement('TAFIRE closing treasury ties to the cash accounts', tafire.check);

  // --- 3. IFRS pack --------------------------------------------------------
  console.log('\n3. IFRS statements (same ledger, IFRS presentation)');
  const sofp = await buildIfrsStatement(tx, org.id, 'sofp', range);
  checkStatement('SOFP: assets = equity + liabilities', sofp.check);
  console.log(`          total assets                  ${fmt(sofp.totals.total_assets)}`);
  console.log(`          total equity and liabilities  ${fmt(sofp.totals.total_equity_and_liabilities)}`);

  const pl = await buildIfrsStatement(tx, org.id, 'pl', range);
  const ifrsProfit = pl.totals.profit_for_the_year;
  console.log(`  ----  IFRS profit for the period ${fmt(ifrsProfit)}`);

  const oci = await buildIfrsStatement(tx, org.id, 'oci', range);
  console.log(`  ----  Other comprehensive income ${fmt(oci.totals.total_oci)}`);

  const cf = await buildCashFlow(tx, org.id, range);
  checkStatement('Cash flow (IAS 7 indirect): opening + movement = ledger cash', cf.check);
  console.log(`          opening ${fmt(cf.totals.opening_cash)}  net change ${fmt(cf.totals.net_change)}`);
  console.log(`          closing ${fmt(cf.totals.closing_cash_ledger)}`);

  const soce = await buildChangesInEquity(tx, org.id, range);
  checkStatement('SOCE: opening equity + movements = closing equity', soce.check);
  const soceClosing = soce.rows.at(-1).total;
  check('Statement of changes in equity: closing equity = equity per SOFP',
    Math.abs(money(soceClosing) - money(sofp.totals.total_equity)) < 0.02,
    `SOCE ${fmt(soceClosing)} vs SOFP ${fmt(sofp.totals.total_equity)}`);

  // --- 4. dual-standard reconciliation (FR-STD-020) ------------------------
  console.log('\n4. Dual-standard reconciliation (FR-STD-020)');
  const fw = await tx.query(
    `SELECT framework, COUNT(*) AS n, COALESCE(SUM(total_debit), 0) AS amt
       FROM journal_entries WHERE org_id = ? AND status = 'posted'
      GROUP BY framework ORDER BY framework`,
    [org.id]
  );
  for (const r of fw) {
    console.log(`          ${r.framework.padEnd(6)} ${String(r.n).padStart(4)} entries ${fmt(r.amt)}`);
  }
  check('a shared book of record plus IFRS-only divergence entries',
    fw.some((r) => r.framework === 'both') && fw.some((r) => r.framework === 'ifrs'));

  // Every IFRS-only entry that touches a P&L class is by definition the bridge
  // between the two results, so OHADA result + those deltas must equal IFRS.
  const bridge = await tx.queryOne(
    `SELECT COALESCE(SUM(l.credit - l.debit), 0) AS effect
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id
      WHERE e.org_id = ? AND e.status = 'posted' AND e.framework = 'ifrs'
        AND e.entry_date BETWEEN ? AND ? AND a.account_class IN (6, 7, 8)`,
    [org.id, from, to]
  );
  const bridged = money(resultCR + Number(bridge.effect));
  check('OHADA result + IFRS-only deltas = IFRS profit',
    Math.abs(bridged - money(ifrsProfit)) < 0.02,
    `${fmt(resultCR)} + ${fmt(bridge.effect)} = ${fmt(bridged)}   IFRS ${fmt(ifrsProfit)}`);

  // --- 5. asset register vs general ledger (SRS section 10) ---------------
  console.log('\n5. Asset register to general ledger');
  for (const basis of ['ohada', 'ifrs']) {
    const rec = await reconcileAssetRegisterToLedger(tx, org.id, { asOf: to, basis });
    const bad = rec.rows.filter((r) => r.variance !== 0);
    check(`${basis.toUpperCase()} basis: register ties to the ledger, zero variance`,
      rec.totals.reconciled,
      bad.length
        ? bad.map((r) => `${r.account} ${r.kind.padEnd(11)} register ${fmt(r.register)} ledger ${fmt(r.ledger)} variance ${fmt(r.variance)}`).join('\n          ')
        : `cost ${fmt(rec.totals.register_cost)}  accumulated ${fmt(rec.totals.register_accum)}`);
  }

  const ppe = await buildPpeNote(tx, org.id, { ...range, basis: 'ifrs' });
  const roll = money(
    ppe.totals.opening_cost + ppe.totals.additions - ppe.totals.disposals_cost + ppe.totals.revaluation
  );
  check('IAS 16 PP&E note: opening cost + additions - disposals + revaluation = closing cost',
    Math.abs(roll - money(ppe.totals.closing_cost)) < 0.02,
    `${fmt(roll)} vs ${fmt(ppe.totals.closing_cost)}`);

  const rollDepr = money(
    ppe.totals.opening_accum_depr + ppe.totals.depreciation_charge - ppe.totals.disposals_accum_depr
  );
  check('IAS 16 PP&E note: accumulated depreciation rolls forward',
    Math.abs(rollDepr - money(ppe.totals.closing_accum_depr)) < 0.02,
    `${fmt(rollDepr)} vs ${fmt(ppe.totals.closing_accum_depr)}`);

  const carrying = money(ppe.totals.closing_cost - ppe.totals.closing_accum_depr - ppe.totals.accum_impairment);
  check('IAS 16 PP&E note: carrying amount = cost less depreciation and impairment',
    Math.abs(carrying - money(ppe.totals.carrying_amount)) < 0.02,
    `${fmt(carrying)} vs ${fmt(ppe.totals.carrying_amount)}`);

  // --- 6. depreciation engine ---------------------------------------------
  console.log('\n6. Depreciation engine (FR-AM-030)');
  const dep = await tx.queryOne(
    `SELECT COUNT(DISTINCT r.id) AS runs,
            COALESCE(SUM(CASE WHEN dl.basis='ohada' THEN dl.depreciation_amount END), 0) AS ohada,
            COALESCE(SUM(CASE WHEN dl.basis='ifrs'  THEN dl.depreciation_amount END), 0) AS ifrs
       FROM depreciation_runs r JOIN depreciation_lines dl ON dl.run_id = r.id
      WHERE r.org_id = ? AND r.status = 'posted'`,
    [org.id]
  );
  console.log(`          ${dep.runs} posted runs`);
  console.log(`          OHADA charge ${fmt(dep.ohada)}`);
  console.log(`          IFRS  charge ${fmt(dep.ifrs)}`);
  check('the two bases genuinely diverge (declining balance vs straight line)',
    Math.abs(Number(dep.ohada) - Number(dep.ifrs)) > 1,
    `divergence ${fmt(Number(dep.ifrs) - Number(dep.ohada))}`);

  const overrun = await tx.query(
    `SELECT asset_tag, name, ohada_cost, ohada_salvage, ohada_accum_depr
       FROM assets
      WHERE org_id = ? AND is_capitalized = 1
        AND (ohada_accum_depr > ohada_cost - ohada_salvage + 0.05
          OR ifrs_accum_depr > ifrs_cost - ifrs_residual + 0.05)`,
    [org.id]
  );
  check('no asset depreciated past its depreciable base on either basis',
    overrun.length === 0,
    overrun.map((a) => `${a.asset_tag} ${a.name}`).join(' | '));

  const nbv = await tx.query(
    `SELECT asset_tag, ohada_nbv, ifrs_nbv
       FROM assets
      WHERE org_id = ? AND is_capitalized = 1
        AND (ABS(ohada_nbv - (ohada_cost - ohada_accum_depr)) > 0.05
          OR ABS(ifrs_nbv - (ifrs_cost - ifrs_accum_depr - ifrs_accum_impairment)) > 0.05)`,
    [org.id]
  );
  check('stored net book value agrees with cost less depreciation and impairment',
    nbv.length === 0,
    nbv.map((a) => a.asset_tag).join(' | '));

  const depGl = await tx.queryOne(
    `SELECT COALESCE(SUM(l.debit), 0) AS charged
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN accounts a ON a.id = l.account_id
      WHERE e.org_id = ? AND e.status = 'posted' AND e.source = 'depreciation'
        AND e.framework = 'both' AND a.account_class = 6`,
    [org.id]
  );
  check('depreciation posted to the general ledger = OHADA charge in the runs',
    Math.abs(Number(depGl.charged) - Number(dep.ohada)) < 0.02,
    `${fmt(depGl.charged)} vs ${fmt(dep.ohada)}`);

  // --- 7. asset compliance -------------------------------------------------
  // Restriction flags are maintained against the current date, not the
  // reporting date, so the assertion has to use the same reference.
  const now = today();
  console.log(`\n7. Asset compliance (FR-AM-022) as at ${now}`);
  const comp = await tx.query(
    `SELECT asset_tag, name, next_calibration_date, next_safety_test_date, status, use_restricted
       FROM assets
      WHERE org_id = ? AND status NOT IN ('disposed','pending_disposal')
        AND ((next_calibration_date IS NOT NULL AND next_calibration_date < ?)
          OR (next_safety_test_date IS NOT NULL AND next_safety_test_date < ?))
      ORDER BY asset_tag`,
    [org.id, now, now]
  );
  for (const a of comp) {
    const overdue = [];
    if (a.next_calibration_date && a.next_calibration_date < now) overdue.push(`calibration due ${a.next_calibration_date}`);
    if (a.next_safety_test_date && a.next_safety_test_date < now) overdue.push(`safety test due ${a.next_safety_test_date}`);
    console.log(`          ${a.asset_tag}  ${a.name.slice(0, 30).padEnd(31)} ${overdue.join(', ').padEnd(46)} ${a.status}`);
  }
  check(`${comp.length} overdue asset(s), every one flagged use-restricted`,
    comp.length > 0 && comp.every((a) => Number(a.use_restricted) === 1));

  // --- 8. period control ---------------------------------------------------
  console.log('\n8. Period control (FR-STD-012)');
  const leak = await tx.queryOne(
    `SELECT COUNT(*) AS n FROM journal_entries e
       JOIN accounting_periods p ON p.id = e.period_id
      WHERE e.org_id = ? AND p.status = 'locked' AND e.status = 'posted'
        AND e.override_reason IS NULL AND e.source <> 'system'`,
    [org.id]
  );
  check('nothing posted into a locked period without a logged override reason', Number(leak.n) === 0);

  const dated = await tx.queryOne(
    `SELECT COUNT(*) AS n FROM journal_entries e
       JOIN accounting_periods p ON p.id = e.period_id
      WHERE e.org_id = ? AND (e.entry_date < p.start_date OR e.entry_date > p.end_date)`,
    [org.id]
  );
  check('every entry falls inside the accounting period it is assigned to', Number(dated.n) === 0);
});

console.log(
  failures === 0
    ? '\nAll checks passed: one ledger, two compliant presentations, register tied to the GL.\n'
    : `\n${failures} check(s) FAILED.\n`
);

await pool.end();
process.exit(failures ? 1 : 0);
