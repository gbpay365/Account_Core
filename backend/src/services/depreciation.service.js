import { money } from '../utils/money.js';
import { toISO, parts, daysInMonth, compare } from '../utils/dates.js';

/**
 * FR-AM-030 :: depreciation engine.
 *
 * The same asset is carried on two independent bases because OHADA statutory
 * useful-life tables and declining-balance practice diverge from the group IFRS
 * policy (SRS section 11 risk "Diverging OHADA/IFRS depreciation treatment").
 * Each basis has its own cost, residual value, life and method, and produces
 * its own schedule; the caller decides which one hits the ledger directly and
 * which one is posted as a framework-tagged delta.
 */

/** Months of charge inside [periodStart, periodEnd], pro-rated for the first
 *  and last period so a mid-month commissioning is charged fairly. */
export function monthsInPeriod(startDate, periodStart, periodEnd) {
  if (compare(startDate, periodEnd) > 0) return 0;
  const ps = parts(periodStart);
  const pe = parts(periodEnd);
  const wholeMonths = (pe.y - ps.y) * 12 + (pe.m - ps.m) + 1;

  if (compare(startDate, periodStart) <= 0) return wholeMonths;

  // Depreciation starts inside this period: charge from the start date.
  const s = parts(startDate);
  const monthsFromStartMonth = (pe.y - s.y) * 12 + (pe.m - s.m) + 1;
  const dim = daysInMonth(s.y, s.m);
  const fractionOfFirstMonth = (dim - s.d + 1) / dim;
  return Math.max(0, monthsFromStartMonth - 1 + fractionOfFirstMonth);
}

/**
 * One period's charge for one basis.
 *
 * @param {object} p
 * @param {number} p.cost               gross carrying cost on this basis
 * @param {number} p.residual           residual / salvage value
 * @param {number} p.accumDepr          accumulated depreciation brought forward
 * @param {number} p.accumImpairment    accumulated impairment brought forward
 * @param {number} p.usefulLifeMonths   remaining-at-inception life in months
 * @param {'straight_line'|'declining_balance'|'units_of_production'} p.method
 * @param {number} p.decliningFactor    OHADA degressif coefficient
 * @param {string} p.startDate          depreciation start (in-service) date
 * @param {string} p.periodStart
 * @param {string} p.periodEnd
 * @param {number} [p.monthsAlreadyCharged] elapsed months, for declining switch
 */
export function computePeriodCharge(p) {
  const cost = money(p.cost);
  const residual = money(p.residual || 0);
  const accumDepr = money(p.accumDepr || 0);
  const accumImpairment = money(p.accumImpairment || 0);
  const life = Number(p.usefulLifeMonths) || 0;
  const method = p.method || 'straight_line';
  const openingNbv = money(cost - accumDepr - accumImpairment);

  const depreciableBase = money(cost - residual);
  const remainingToCharge = money(depreciableBase - accumDepr);

  const months = monthsInPeriod(p.startDate, p.periodStart, p.periodEnd);

  const zero = {
    depreciableBase,
    openingAccumDepr: accumDepr,
    openingNbv,
    amount: 0,
    closingAccumDepr: accumDepr,
    closingNbv: openingNbv,
    method,
    annualRate: 0,
    monthsCharged: 0,
    isFinalPeriod: remainingToCharge <= 0,
  };

  if (life <= 0 || months <= 0 || remainingToCharge <= 0 || cost <= 0) return zero;

  const elapsed = Number(p.monthsAlreadyCharged) || 0;
  const remainingLife = Math.max(life - elapsed, months);

  let annualRate;
  let amount;

  if (method === 'declining_balance') {
    const years = life / 12;
    const dbAnnualRate = years > 0 ? (1 / years) * (Number(p.decliningFactor) || 1) : 0;
    const dbCharge = openingNbv * dbAnnualRate * (months / 12);
    // OHADA degressif practice: once straight line over the remaining life
    // gives the larger charge, the asset switches to straight line so it is
    // fully written down by the end of its useful life.
    const slCharge = (remainingToCharge / remainingLife) * months;
    if (slCharge >= dbCharge) {
      amount = slCharge;
      annualRate = remainingLife > 0 ? 12 / remainingLife : 0;
    } else {
      amount = dbCharge;
      annualRate = dbAnnualRate;
    }
  } else {
    // Straight line (units_of_production falls back to time apportionment
    // unless the caller supplies usage, which the work-order module feeds in).
    annualRate = 12 / life;
    amount = (depreciableBase / life) * months;
  }

  amount = money(Math.min(amount, remainingToCharge));
  const closingAccumDepr = money(accumDepr + amount);

  return {
    depreciableBase,
    openingAccumDepr: accumDepr,
    openingNbv,
    amount,
    closingAccumDepr,
    closingNbv: money(cost - closingAccumDepr - accumImpairment),
    method,
    annualRate: Number(annualRate.toFixed(6)),
    monthsCharged: Number(months.toFixed(2)),
    isFinalPeriod: money(depreciableBase - closingAccumDepr) <= 0,
  };
}

/**
 * Full life schedule on one basis, month by month. Used for the depreciation
 * schedule report and to derive opening accumulated depreciation at migration.
 */
export function buildSchedule({
  cost,
  residual = 0,
  usefulLifeMonths,
  method = 'straight_line',
  decliningFactor = 1,
  startDate,
  untilDate = null,
}) {
  const rows = [];
  let accum = 0;
  let elapsed = 0;
  let cursor = toISO(startDate);
  if (!cursor || !usefulLifeMonths || cost <= 0) return rows;

  const maxPeriods = Math.ceil(usefulLifeMonths) + 24;
  for (let i = 0; i < maxPeriods; i += 1) {
    const { y, m } = parts(cursor);
    const periodStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const periodEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth(y, m)).padStart(2, '0')}`;

    const row = computePeriodCharge({
      cost,
      residual,
      accumDepr: accum,
      usefulLifeMonths,
      method,
      decliningFactor,
      startDate,
      periodStart,
      periodEnd,
      monthsAlreadyCharged: elapsed,
    });

    if (row.amount > 0 || accum < money(cost - residual)) {
      rows.push({ periodStart, periodEnd, ...row });
    }
    accum = row.closingAccumDepr;
    elapsed += row.monthsCharged;

    if (untilDate && compare(periodEnd, untilDate) >= 0) break;
    if (money(cost - residual - accum) <= 0) break;

    cursor = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  }
  return rows;
}

/** Accumulated depreciation and elapsed months as at `asOf`, from inception. */
export function accumulatedAsOf(opts) {
  const rows = buildSchedule({ ...opts, untilDate: opts.asOf });
  const upto = rows.filter((r) => compare(r.periodEnd, opts.asOf) <= 0);
  return {
    accumDepr: upto.length ? upto[upto.length - 1].closingAccumDepr : 0,
    monthsCharged: money(upto.reduce((s, r) => s + r.monthsCharged, 0)),
    periods: upto.length,
  };
}

/** Both bases at once, as stored on the asset row. */
export function computeDualBasis(asset, periodStart, periodEnd, elapsed = {}) {
  return {
    ohada: computePeriodCharge({
      cost: asset.ohada_cost,
      residual: asset.ohada_salvage,
      accumDepr: asset.ohada_accum_depr,
      usefulLifeMonths: asset.ohada_useful_life_months,
      method: asset.ohada_method,
      decliningFactor: asset.ohada_declining_factor,
      startDate: asset.depr_start_date || asset.in_service_date || asset.capitalization_date,
      periodStart,
      periodEnd,
      monthsAlreadyCharged: elapsed.ohada || 0,
    }),
    ifrs: computePeriodCharge({
      cost: asset.ifrs_cost,
      residual: asset.ifrs_residual,
      accumDepr: asset.ifrs_accum_depr,
      accumImpairment: asset.ifrs_accum_impairment,
      usefulLifeMonths: asset.ifrs_useful_life_months,
      method: asset.ifrs_method,
      decliningFactor: asset.ifrs_declining_factor,
      startDate: asset.depr_start_date || asset.in_service_date || asset.capitalization_date,
      periodStart,
      periodEnd,
      monthsAlreadyCharged: elapsed.ifrs || 0,
    }),
  };
}
