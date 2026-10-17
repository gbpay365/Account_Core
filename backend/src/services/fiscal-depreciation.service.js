import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { createJournalEntry } from './ledger.service.js';

/**
 * CEMAC Fiscal vs Economic Depreciation Service (Amortissement Dérogatoire).
 * Compliant with CEMAC Directives, Cameroon General Tax Code (Art. 7 CGI),
 * and SYSCOHADA AUDCIF (Accounts 151, 851, 861).
 */

export function getDecliningFactor(usefulLifeMonths) {
  const years = usefulLifeMonths / 12;
  if (years < 3) return 1.0;
  if (years <= 4) return 1.5;
  if (years <= 6) return 2.0;
  return 2.5;
}

export function computeAssetFiscalDepreciation(asset, fiscalYear) {
  const cost = Number(asset.acquisition_cost || asset.ohada_cost || 0);
  const salvage = Number(asset.ohada_salvage || 0);
  const depreciableBase = Math.max(0, cost - salvage);
  const lifeMonths = Number(asset.ohada_useful_life_months || 60);
  const lifeYears = Math.max(1, Math.round(lifeMonths / 12));

  // 1. Economic Depreciation (Straight Line)
  const annualEconomic = money(depreciableBase / lifeYears);

  // 2. Fiscal Depreciation (CEMAC Declining Balance)
  const factor = getDecliningFactor(lifeMonths);
  const straightRate = 1.0 / lifeYears;
  const decliningRate = Math.min(0.9, straightRate * factor);

  // Determine asset age in years at this fiscal year
  const acqYear = new Date(asset.acquisition_date).getFullYear();
  const yearIndex = Math.max(1, fiscalYear - acqYear + 1);

  let fiscalAnnual = 0;
  if (yearIndex > lifeYears) {
    fiscalAnnual = 0;
  } else {
    // Declining balance calculation with switch to straight-line
    const remainingYears = lifeYears - yearIndex + 1;
    const straightRateRemaining = 1.0 / remainingYears;

    let openingFiscalNBV = depreciableBase;
    for (let y = 1; y < yearIndex; y++) {
      const remY = lifeYears - y + 1;
      const sRate = 1.0 / remY;
      const yrRate = sRate > decliningRate ? sRate : decliningRate;
      const yrDepr = money(openingFiscalNBV * yrRate);
      openingFiscalNBV = Math.max(0, openingFiscalNBV - yrDepr);
    }

    const appliedRate = straightRateRemaining > decliningRate ? straightRateRemaining : decliningRate;
    fiscalAnnual = money(openingFiscalNBV * appliedRate);
  }

  // 3. Derogatory amount (Fiscal minus Economic)
  const derogatory = money(fiscalAnnual - annualEconomic);

  return {
    asset_id: asset.id,
    asset_tag: asset.asset_tag,
    asset_name: asset.name,
    fiscal_year: fiscalYear,
    cost,
    life_years: lifeYears,
    declining_factor: factor,
    economic_depreciation: annualEconomic,
    fiscal_depreciation: fiscalAnnual,
    derogatory_amount: derogatory,
    action: derogatory >= 0 ? 'Dotation dérogatoire (851 -> 151)' : 'Reprise dérogatoire (151 -> 861)',
  };
}

/**
 * Simulate fiscal depreciation across all active depreciable assets for a fiscal year.
 */
export async function simulateFiscalDepreciation(orgId, fiscalYear) {
  const assets = await query(
    `SELECT a.*, ac.name AS category_name
       FROM assets a
       JOIN asset_categories ac ON ac.id = a.category_id
      WHERE a.org_id = ?
        AND a.status IN ('in_service', 'under_maintenance', 'in_stock')
        AND a.is_capitalized = 1
   ORDER BY a.asset_tag ASC`,
    [orgId]
  );

  const schedules = assets.map(a => computeAssetFiscalDepreciation(a, fiscalYear));

  const totalEconomic = money(schedules.reduce((sum, s) => sum + s.economic_depreciation, 0));
  const totalFiscal = money(schedules.reduce((sum, s) => sum + s.fiscal_depreciation, 0));
  const totalAdditions = money(schedules.filter(s => s.derogatory_amount > 0).reduce((sum, s) => sum + s.derogatory_amount, 0));
  const totalReversals = money(schedules.filter(s => s.derogatory_amount < 0).reduce((sum, s) => sum + Math.abs(s.derogatory_amount), 0));
  const netDerogatory = money(totalAdditions - totalReversals);

  // Check if already posted
  const existingSchedule = await queryOne(
    `SELECT * FROM fiscal_depreciation_schedules WHERE org_id = ? AND fiscal_year = ? AND status = 'posted' LIMIT 1`,
    [orgId, fiscalYear]
  );

  return {
    fiscal_year: fiscalYear,
    total_assets: assets.length,
    total_economic_depreciation: totalEconomic,
    total_fiscal_depreciation: totalFiscal,
    total_derogatory_additions: totalAdditions,
    total_derogatory_reversals: totalReversals,
    net_derogatory: netDerogatory,
    is_posted: Boolean(existingSchedule),
    posted_entry_id: existingSchedule?.entry_id || null,
    schedules,
  };
}

/**
 * Post the annual Amortissement Dérogatoire journal entry.
 */
export async function postFiscalDepreciation(orgId, fiscalYear, actor) {
  const simulation = await simulateFiscalDepreciation(orgId, fiscalYear);
  if (simulation.is_posted) {
    throw new ApiError(409, `Fiscal depreciation for year ${fiscalYear} has already been posted.`);
  }

  const { net_derogatory_movement: net_derogatory, total_derogatory_additions, total_derogatory_reversals, schedules } = simulation;
  if (Math.abs(net_derogatory) < 0.01) {
    throw new ApiError(400, 'Net derogatory depreciation is zero; no journal entry needed.');
  }

  return await transaction(async (tx) => {
    // Resolve SYSCOHADA Accounts:
    // 1511: Amortissements dérogatoires (Postable)
    // 8511: Dotations aux provisions réglementées - amortissements dérogatoires (Postable)
    // 8611: Reprises de provisions réglementées - amortissements dérogatoires (Postable)
    const acct151 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code IN ('1511', '151') AND is_postable = 1 LIMIT 1`, [orgId]);
    const acct851 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code IN ('8511', '851') AND is_postable = 1 LIMIT 1`, [orgId]);
    const acct861 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code IN ('8611', '861') AND is_postable = 1 LIMIT 1`, [orgId]);

    if (!acct151 || !acct851 || !acct861) {
      throw new ApiError(422, 'Mandatory postable accounts 1511, 8511, or 8611 are missing from the chart of accounts.');
    }

    const lines = [];
    const dateStr = `${fiscalYear}-12-31`;

    if (total_derogatory_additions > 0) {
      // Debit 851 (Dotation charges exceptionnelles), Credit 151 (Amortissements dérogatoires capitaux propres)
      lines.push({
        accountId: acct851.id,
        description: `Dotation aux amortissements dérogatoires - Exercice ${fiscalYear}`,
        debit: total_derogatory_additions,
        credit: 0,
      });
      lines.push({
        accountId: acct151.id,
        description: `Dotation aux amortissements dérogatoires - Exercice ${fiscalYear}`,
        debit: 0,
        credit: total_derogatory_additions,
      });
    }

    if (total_derogatory_reversals > 0) {
      // Debit 151 (Amortissements dérogatoires), Credit 861 (Reprise de provisions réglementées)
      lines.push({
        accountId: acct151.id,
        description: `Reprise sur amortissements dérogatoires - Exercice ${fiscalYear}`,
        debit: total_derogatory_reversals,
        credit: 0,
      });
      lines.push({
        accountId: acct861.id,
        description: `Reprise sur amortissements dérogatoires - Exercice ${fiscalYear}`,
        debit: 0,
        credit: total_derogatory_reversals,
      });
    }

    const entry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'OD',
      date: dateStr,
      description: `Amortissements dérogatoires fiscaux (CEMAC) - Exercice ${fiscalYear}`,
      framework: 'both',
      autoPost: true,
      lines,
      actor,
    });

    // Record schedules in fiscal_depreciation_schedules
    for (const s of schedules) {
      await tx.query(
        `INSERT INTO fiscal_depreciation_schedules
         (org_id, asset_id, fiscal_year, economic_depreciation, fiscal_depreciation,
          derogatory_amount, cumulative_derogatory, entry_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted')
         ON DUPLICATE KEY UPDATE
          economic_depreciation = VALUES(economic_depreciation),
          fiscal_depreciation = VALUES(fiscal_depreciation),
          derogatory_amount = VALUES(derogatory_amount),
          entry_id = VALUES(entry_id),
          status = 'posted'`,
        [
          orgId,
          s.asset_id,
          fiscalYear,
          s.economic_depreciation,
          s.fiscal_depreciation,
          s.derogatory_amount,
          s.derogatory_amount,
          entry.id,
        ]
      );
    }

    return {
      success: true,
      entry_id: entry.id,
      entry_no: entry.entry_no,
      fiscal_year: fiscalYear,
      total_derogatory_additions,
      total_derogatory_reversals,
    };
  });
}
