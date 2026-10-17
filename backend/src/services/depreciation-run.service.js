import { money } from '../utils/money.js';
import { toISO, compare } from '../utils/dates.js';
import { ApiError } from '../utils/errors.js';
import { createJournalEntry } from './ledger.service.js';
import { computeDualBasis } from './depreciation.service.js';

/**
 * FR-AM-030 :: calculate depreciation per asset and post it to the general
 * ledger each period, on both the OHADA and IFRS bases where they diverge.
 *
 * Posting model (FR-STD-020): the statutory basis is the book of record and is
 * posted with framework='both'. Only the difference between the two bases is
 * posted as a second, framework='ifrs' entry, so the IFRS statements pick up
 * base + delta while the OHADA statements only ever see the base. That keeps a
 * single ledger and guarantees both sets of statements tie to the same
 * transaction set - the reconciliation criterion in SRS section 10.
 */

const DEPRECIABLE_STATUSES = [
  'in_service',
  'under_maintenance',
  'awaiting_parts',
  'calibration_overdue',
  'quarantined',
  'out_of_service',
];

export async function simulateRun(tx, orgId, periodId, opts = {}) {
  const period = await tx.queryOne(
    'SELECT * FROM accounting_periods WHERE id = ? AND org_id = ?',
    [periodId, orgId]
  );
  if (!period) throw new ApiError(404, 'Accounting period not found.');

  const basisOfRecord = opts.basisOfRecord || 'ohada';

  const assets = await tx.query(
    `SELECT a.*, c.code AS category_code, c.name AS category_name, c.domain,
            c.depr_expense_account_id, c.accum_depr_account_id,
            c.subsidy_account_id, c.subsidy_income_account_id
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
      WHERE a.org_id = ?
        AND a.is_capitalized = 1
        AND a.status IN (${DEPRECIABLE_STATUSES.map(() => '?').join(',')})
        AND a.depr_start_date IS NOT NULL
        AND a.depr_start_date <= ?
      ORDER BY a.asset_tag`,
    [orgId, ...DEPRECIABLE_STATUSES, period.end_date]
  );

  // Months already charged drive the declining-balance / straight-line switch,
  // and a period already posted must never be charged twice. Both are read for
  // the whole population up front rather than per asset inside the loop.
  const history = new Map();
  const charged = new Set();
  if (assets.length > 0) {
    const rows = await tx.query(
      `SELECT dl.asset_id,
              COALESCE(SUM(CASE WHEN dl.basis='ohada' THEN dl.months_charged END),0) AS ohada,
              COALESCE(SUM(CASE WHEN dl.basis='ifrs'  THEN dl.months_charged END),0) AS ifrs,
              MAX(dl.period_id = ?) AS this_period
         FROM depreciation_lines dl
         JOIN depreciation_runs r ON r.id = dl.run_id
        WHERE r.org_id = ? AND r.status = 'posted'
        GROUP BY dl.asset_id`,
      [periodId, orgId]
    );
    for (const r of rows) {
      history.set(r.asset_id, { ohada: Number(r.ohada), ifrs: Number(r.ifrs) });
      if (Number(r.this_period) > 0) charged.add(r.asset_id);
    }
  }

  const lines = [];
  for (const asset of assets) {
    if (charged.has(asset.id)) continue;

    const { ohada, ifrs } = computeDualBasis(
      asset,
      period.start_date,
      period.end_date,
      history.get(asset.id) || { ohada: 0, ifrs: 0 }
    );

    if (ohada.amount === 0 && ifrs.amount === 0) continue;

    const isDonated = asset.funding_source === 'donation' || asset.funding_source === 'grant';
    const subsidyAmount = isDonated && asset.subsidy_account_id && asset.subsidy_income_account_id ? ohada.amount : 0;

    lines.push({
      asset,
      ohada,
      ifrs,
      delta: money(ifrs.amount - ohada.amount),
      subsidy_amount: subsidyAmount,
    });
  }

  const totals = {
    assetCount: lines.length,
    ohada: money(lines.reduce((s, l) => s + l.ohada.amount, 0)),
    ifrs: money(lines.reduce((s, l) => s + l.ifrs.amount, 0)),
    subsidy: money(lines.reduce((s, l) => s + (l.subsidy_amount || 0), 0)),
  };
  totals.delta = money(totals.ifrs - totals.ohada);

  return { period, basisOfRecord, lines, totals };
}

export async function createRun(tx, orgId, periodId, opts = {}) {
  const sim = await simulateRun(tx, orgId, periodId, opts);
  if (sim.lines.length === 0) {
    throw new ApiError(422, `Nothing to depreciate in ${sim.period.code}. Either no assets are in service or the period has already been run.`);
  }

  const res = await tx.query(
    `INSERT INTO depreciation_runs
       (org_id, period_id, run_date, basis, status, asset_count, total_ohada, total_ifrs, run_by, notes)
     VALUES (?,?,?, 'both', 'simulated', ?,?,?,?,?)`,
    [
      orgId, periodId, toISO(opts.runDate || sim.period.end_date),
      sim.totals.assetCount, sim.totals.ohada, sim.totals.ifrs,
      opts.actor?.id ?? null, opts.notes ?? null,
    ]
  );
  const runId = res.insertId;

  for (const l of sim.lines) {
    for (const basis of ['ohada', 'ifrs']) {
      const r = l[basis];
      await tx.query(
        `INSERT INTO depreciation_lines
           (run_id, org_id, asset_id, period_id, basis, depreciable_base,
            opening_accum_depr, opening_nbv, depreciation_amount,
            closing_accum_depr, closing_nbv, method, annual_rate, months_charged,
            is_final_period, cost_center_id, expense_account_id, accum_account_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          runId, orgId, l.asset.id, periodId, basis, r.depreciableBase,
          r.openingAccumDepr, r.openingNbv, r.amount,
          r.closingAccumDepr, r.closingNbv, r.method, r.annualRate, r.monthsCharged,
          r.isFinalPeriod ? 1 : 0, l.asset.cost_center_id,
          l.asset.depr_expense_account_id, l.asset.accum_depr_account_id,
        ]
      );
    }
  }

  return { runId, ...sim };
}

export async function postRun(tx, orgId, runId, opts = {}) {
  const run = await tx.queryOne('SELECT * FROM depreciation_runs WHERE id = ? AND org_id = ?', [runId, orgId]);
  if (!run) throw new ApiError(404, 'Depreciation run not found.');
  if (run.status === 'posted') throw new ApiError(409, 'This run has already been posted.');
  if (run.status === 'reversed') throw new ApiError(409, 'This run has been reversed.');

  const period = await tx.queryOne('SELECT * FROM accounting_periods WHERE id = ?', [run.period_id]);
  const basisOfRecord = opts.basisOfRecord || 'ohada';
  const deltaBasis = basisOfRecord === 'ohada' ? 'ifrs' : 'ohada';

  const lines = await tx.query(
    `SELECT dl.*, a.asset_tag, a.name AS asset_name, a.funding_source,
            c.subsidy_account_id, c.subsidy_income_account_id
       FROM depreciation_lines dl
       JOIN assets a ON a.id = dl.asset_id
       JOIN asset_categories c ON c.id = a.category_id
      WHERE dl.run_id = ?`,
    [runId]
  );
  if (lines.length === 0) throw new ApiError(422, 'This run has no calculated lines.');

  // --- 1. Statutory entry (book of record) ----------------------------------
  const recordLines = lines.filter((l) => l.basis === basisOfRecord && money(l.depreciation_amount) > 0);
  const grouped = new Map();
  for (const l of recordLines) {
    const key = `${l.expense_account_id}|${l.cost_center_id ?? 0}|${l.accum_account_id}`;
    const g = grouped.get(key) || {
      expenseAccountId: l.expense_account_id,
      costCenterId: l.cost_center_id,
      accumAccountId: l.accum_account_id,
      amount: 0,
      count: 0,
    };
    g.amount = money(g.amount + Number(l.depreciation_amount));
    g.count += 1;
    grouped.set(key, g);
  }

  const journalLines = [];
  for (const g of grouped.values()) {
    journalLines.push({
      accountId: g.expenseAccountId,
      costCenterId: g.costCenterId,
      description: `Depreciation charge ${period.code} (${g.count} asset(s))`,
      debit: g.amount,
      credit: 0,
    });
    journalLines.push({
      accountId: g.accumAccountId,
      costCenterId: g.costCenterId,
      description: `Accumulated depreciation ${period.code}`,
      debit: 0,
      credit: g.amount,
    });
  }

  if (journalLines.length === 0) throw new ApiError(422, 'Calculated depreciation is zero for this period.');

  const recordEntry = await createJournalEntry(tx, {
    orgId,
    journalCode: 'AMO',
    date: run.run_date,
    description: `Depreciation charge — ${period.name} (basis ${basisOfRecord.toUpperCase()})`,
    reference: `AMO-${period.code}`,
    source: 'depreciation',
    sourceRef: String(runId),
    framework: 'both',
    autoPost: true,
    actor: opts.actor,
    overrideReason: opts.overrideReason,
    lines: journalLines,
  });

  // --- 2. Delta entry for the other framework, only where they diverge ------
  const deltaByGroup = new Map();
  for (const l of lines) {
    const key = `${l.expense_account_id}|${l.cost_center_id ?? 0}|${l.accum_account_id}`;
    const g = deltaByGroup.get(key) || {
      expenseAccountId: l.expense_account_id,
      costCenterId: l.cost_center_id,
      accumAccountId: l.accum_account_id,
      delta: 0,
    };
    const sign = l.basis === deltaBasis ? 1 : -1;
    g.delta = money(g.delta + sign * Number(l.depreciation_amount));
    deltaByGroup.set(key, g);
  }

  const deltaLines = [];
  for (const g of deltaByGroup.values()) {
    if (g.delta === 0) continue;
    if (g.delta > 0) {
      deltaLines.push({ accountId: g.expenseAccountId, costCenterId: g.costCenterId, description: `Additional ${deltaBasis.toUpperCase()} depreciation charge ${period.code}`, debit: g.delta, credit: 0 });
      deltaLines.push({ accountId: g.accumAccountId, costCenterId: g.costCenterId, description: `Additional ${deltaBasis.toUpperCase()} accumulated depreciation`, debit: 0, credit: g.delta });
    } else {
      const amt = money(-g.delta);
      deltaLines.push({ accountId: g.accumAccountId, costCenterId: g.costCenterId, description: `Reduction of ${deltaBasis.toUpperCase()} accumulated depreciation`, debit: amt, credit: 0 });
      deltaLines.push({ accountId: g.expenseAccountId, costCenterId: g.costCenterId, description: `Reduction of ${deltaBasis.toUpperCase()} depreciation charge ${period.code}`, debit: 0, credit: amt });
    }
  }

  let deltaEntry = null;
  if (deltaLines.length > 0) {
    deltaEntry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'AMO',
      date: run.run_date,
      description: `Depreciation difference ${deltaBasis.toUpperCase()} vs ${basisOfRecord.toUpperCase()} — ${period.name}`,
      reference: `AMO-${period.code}-${deltaBasis.toUpperCase()}`,
      source: 'depreciation',
      sourceRef: String(runId),
      framework: deltaBasis,
      autoPost: true,
      actor: opts.actor,
      overrideReason: opts.overrideReason,
      lines: deltaLines,
    });
  }

  // --- 3. Donated asset subsidy release entry (Compte 14 -> Compte 865) -----
  const subsidyByGroup = new Map();
  for (const l of lines) {
    if (l.basis !== 'ohada') continue;
    if (l.funding_source !== 'donation' && l.funding_source !== 'grant') continue;
    if (!l.subsidy_account_id || !l.subsidy_income_account_id) continue;
    if (Number(l.depreciation_amount) <= 0) continue;

    const key = `${l.subsidy_account_id}|${l.subsidy_income_account_id}|${l.cost_center_id ?? 0}`;
    const sg = subsidyByGroup.get(key) || {
      subsidyAccountId: l.subsidy_account_id,
      incomeAccountId: l.subsidy_income_account_id,
      costCenterId: l.cost_center_id,
      amount: 0,
      count: 0,
    };
    sg.amount = money(sg.amount + Number(l.depreciation_amount));
    sg.count += 1;
    subsidyByGroup.set(key, sg);
  }

  const subsidyLines = [];
  for (const sg of subsidyByGroup.values()) {
    if (sg.amount <= 0) continue;
    subsidyLines.push({
      accountId: sg.subsidyAccountId,
      costCenterId: sg.costCenterId,
      description: `Reprise subvention investissement ${period.code} (${sg.count} équipement(s) don/bailleur)`,
      debit: sg.amount,
      credit: 0,
    });
    subsidyLines.push({
      accountId: sg.incomeAccountId,
      costCenterId: sg.costCenterId,
      description: `Quote-part de subvention virée au compte de résultat ${period.code}`,
      debit: 0,
      credit: sg.amount,
    });
  }

  let subsidyEntry = null;
  if (subsidyLines.length > 0) {
    subsidyEntry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'AMO',
      date: run.run_date,
      description: `Reprise de subventions d'investissement — ${period.name}`,
      reference: `AMO-${period.code}-SUB`,
      source: 'depreciation',
      sourceRef: String(runId),
      framework: 'both',
      autoPost: true,
      actor: opts.actor,
      overrideReason: opts.overrideReason,
      lines: subsidyLines,
    });
  }

  // --- 3. Roll the asset sub-ledger forward ---------------------------------
  const byAsset = new Map();
  for (const l of lines) {
    const a = byAsset.get(l.asset_id) || {};
    a[l.basis] = l;
    byAsset.set(l.asset_id, a);
  }
  for (const [assetId, b] of byAsset.entries()) {
    await tx.query(
      `UPDATE assets
          SET ohada_accum_depr = ?, ohada_nbv = ?,
              ifrs_accum_depr = ?, ifrs_nbv = ?,
              last_depr_period_id = ?
        WHERE id = ?`,
      [
        b.ohada?.closing_accum_depr ?? 0, b.ohada?.closing_nbv ?? 0,
        b.ifrs?.closing_accum_depr ?? 0, b.ifrs?.closing_nbv ?? 0,
        run.period_id, assetId,
      ]
    );
  }

  await tx.query(
    `UPDATE depreciation_runs
        SET status = 'posted', posted_by = ?, posted_at = NOW(),
            ohada_entry_id = ?, ifrs_entry_id = ?
      WHERE id = ?`,
    [
      opts.actor?.id ?? null,
      basisOfRecord === 'ohada' ? recordEntry.id : deltaEntry?.id ?? null,
      basisOfRecord === 'ifrs' ? recordEntry.id : deltaEntry?.id ?? null,
      runId,
    ]
  );
  await tx.query('UPDATE accounting_periods SET depr_posted = 1 WHERE id = ?', [run.period_id]);

  return {
    runId,
    period: period.code,
    recordEntry,
    deltaEntry,
    subsidyEntry,
    totals: { ohada: money(run.total_ohada), ifrs: money(run.total_ifrs), delta: money(run.total_ifrs - run.total_ohada) },
  };
}

/** FR-AM-031 :: IAS 36 impairment test, posted on the IFRS basis. */
export async function postImpairment(tx, orgId, impairmentId, opts = {}) {
  const imp = await tx.queryOne('SELECT * FROM asset_impairments WHERE id = ? AND org_id = ?', [impairmentId, orgId]);
  if (!imp) throw new ApiError(404, 'Impairment test not found.');
  if (imp.status === 'posted') throw new ApiError(409, 'This impairment has already been posted.');

  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ?', [imp.asset_id]);
  const category = await tx.queryOne('SELECT * FROM asset_categories WHERE id = ?', [asset.category_id]);
  const loss = money(imp.impairment_loss);
  const reversal = money(imp.reversal_amount);
  if (loss === 0 && reversal === 0) throw new ApiError(422, 'Nothing to post: neither a loss nor a reversal.');

  const impairmentContra = { '2412': '294', '2413': '294', '2414': '294', '2415': '294', '2416': '294', '2417': '294', '2418': '294' };
  const assetAccount = await tx.queryOne('SELECT code FROM accounts WHERE id = ?', [category.asset_account_id]);
  const contraCode = impairmentContra[assetAccount.code]
    || (assetAccount.code.startsWith('23') ? '293' : assetAccount.code.startsWith('22') ? '292' : assetAccount.code.startsWith('21') ? '291' : '294');

  const lines = loss > 0
    ? [
        { accountId: category.impairment_account_id, assetId: asset.id, costCenterId: asset.cost_center_id, description: `IAS 36 impairment loss - ${asset.asset_tag}`, debit: loss, credit: 0 },
        { accountCode: contraCode, assetId: asset.id, description: `Impairment ${asset.asset_tag}`, debit: 0, credit: loss },
      ]
    : [
        { accountCode: contraCode, assetId: asset.id, description: `Reversal of impairment ${asset.asset_tag}`, debit: reversal, credit: 0 },
        { accountCode: '794', assetId: asset.id, description: `Reversal of IAS 36 impairment loss - ${asset.asset_tag}`, debit: 0, credit: reversal },
      ];

  const entry = await createJournalEntry(tx, {
    orgId,
    journalCode: 'OD',
    date: imp.test_date,
    description: loss > 0
      ? `IAS 36 impairment loss - ${asset.asset_tag} (${imp.indicator})`
      : `Reversal of IAS 36 impairment loss - ${asset.asset_tag}`,
    reference: `IMP-${asset.asset_tag}`,
    source: 'impairment',
    sourceRef: String(impairmentId),
    // IAS 36 impairment is an IFRS measurement; the statutory basis keeps
    // historical cost, so this posts only into the IFRS presentation.
    framework: 'ifrs',
    autoPost: true,
    actor: opts.actor,
    overrideReason: opts.overrideReason,
    lines,
  });

  await tx.query("UPDATE asset_impairments SET status = 'posted', entry_id = ? WHERE id = ?", [entry.id, impairmentId]);
  await tx.query(
    `UPDATE assets
        SET ifrs_accum_impairment = GREATEST(ifrs_accum_impairment + ? - ?, 0),
            ifrs_nbv = ifrs_cost - ifrs_accum_depr - GREATEST(ifrs_accum_impairment + ? - ?, 0)
      WHERE id = ?`,
    [loss, reversal, loss, reversal, asset.id]
  );
  return entry;
}

/** FR-AM-031 :: IAS 16 revaluation model, surplus through OCI. */
export async function postRevaluation(tx, orgId, revaluationId, opts = {}) {
  const rev = await tx.queryOne('SELECT * FROM asset_revaluations WHERE id = ? AND org_id = ?', [revaluationId, orgId]);
  if (!rev) throw new ApiError(404, 'Revaluation not found.');
  if (rev.status === 'posted') throw new ApiError(409, 'This revaluation has already been posted.');

  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ?', [rev.asset_id]);
  const category = await tx.queryOne('SELECT * FROM asset_categories WHERE id = ?', [asset.category_id]);
  const amount = money(rev.revaluation_amount);
  if (amount === 0) throw new ApiError(422, 'Revaluation amount is zero.');

  const lines = amount > 0
    ? [
        { accountId: category.asset_account_id, assetId: asset.id, description: `Revaluation ${asset.asset_tag}`, debit: amount, credit: 0 },
        { accountId: category.revaluation_surplus_account_id, description: `Revaluation surplus ${asset.asset_tag}`, debit: 0, credit: amount },
      ]
    : [
        { accountId: category.revaluation_surplus_account_id, description: `Reversal of revaluation surplus ${asset.asset_tag}`, debit: -amount, credit: 0 },
        { accountId: category.asset_account_id, assetId: asset.id, description: `Downward revaluation ${asset.asset_tag}`, debit: 0, credit: -amount },
      ];

  const entry = await createJournalEntry(tx, {
    orgId,
    journalCode: 'OD',
    date: rev.revaluation_date,
    description: `IAS 16 revaluation - ${asset.asset_tag} (${rev.valuation_method})`,
    reference: `REV-${asset.asset_tag}`,
    source: 'revaluation',
    sourceRef: String(revaluationId),
    framework: 'ifrs',
    autoPost: true,
    actor: opts.actor,
    overrideReason: opts.overrideReason,
    lines,
  });

  await tx.query("UPDATE asset_revaluations SET status = 'posted', entry_id = ? WHERE id = ?", [entry.id, revaluationId]);
  await tx.query(
    `UPDATE assets
        SET ifrs_cost = ifrs_cost + ?, ifrs_revaluation_surplus = ifrs_revaluation_surplus + ?,
            ifrs_nbv = ifrs_cost + ? - ifrs_accum_depr - ifrs_accum_impairment,
            ifrs_useful_life_months = COALESCE(?, ifrs_useful_life_months),
            ifrs_measurement_model = 'revaluation'
      WHERE id = ?`,
    [amount, amount, amount, rev.new_useful_life_months, asset.id]
  );
  return entry;
}

export { DEPRECIABLE_STATUSES };
