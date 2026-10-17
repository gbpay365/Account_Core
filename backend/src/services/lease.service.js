import { query, queryOne, transaction } from '../db/pool.js';
import { money } from '../utils/money.js';
import { toISO, addDays } from '../utils/dates.js';
import { notFound, unprocessable } from '../utils/errors.js';

/**
 * Calculates Present Value of an annuity:
 * PV = PMT * [1 - (1 + r)^-n] / r
 */
export function calculateLeasePV(monthlyPayment, annualDiscountRatePct, termMonths) {
  const r = (annualDiscountRatePct / 100) / 12;
  if (r <= 0) return money(monthlyPayment * termMonths);
  const pv = monthlyPayment * (1 - Math.pow(1 + r, -termMonths)) / r;
  return money(pv);
}

/**
 * Generates the complete month-by-month IFRS 16 Amortization & Depreciation Schedule.
 */
export function generateSchedule(lease) {
  const schedule = [];
  const monthlyRate = (Number(lease.discount_rate_pct) / 100) / 12;
  const payment = Number(lease.monthly_payment);
  const term = Number(lease.term_months);
  const monthlyDepr = money(Number(lease.initial_rou_asset) / term);

  let currentLiability = Number(lease.initial_liability);
  let currentRou = Number(lease.initial_rou_asset);

  const startDate = new Date(lease.start_date);

  for (let m = 1; m <= term; m++) {
    const periodDate = new Date(startDate.getFullYear(), startDate.getMonth() + (m - 1), 1);
    const dateStr = periodDate.toISOString().slice(0, 10);

    const interest = money(currentLiability * monthlyRate);
    const principal = m === term ? currentLiability : money(payment - interest);
    const actualPayment = m === term ? money(principal + interest) : payment;
    const closingLiability = m === term ? 0 : money(currentLiability - principal);

    const depr = m === term ? currentRou : monthlyDepr;
    const closingRou = m === term ? 0 : money(currentRou - depr);

    schedule.push({
      period: m,
      date: dateStr,
      opening_liability: currentLiability,
      payment: actualPayment,
      interest_expense: interest,
      principal_repayment: principal,
      closing_liability: closingLiability,
      opening_rou: currentRou,
      depreciation_expense: depr,
      closing_rou: closingRou,
    });

    currentLiability = closingLiability;
    currentRou = closingRou;
  }

  return schedule;
}

export async function listLeaseContracts(orgId) {
  const rows = await query(
    `SELECT * FROM lease_contracts
      WHERE org_id = ?
      ORDER BY id DESC`,
    [orgId]
  );

  let totalLiability = 0;
  let totalRou = 0;
  let totalMonthly = 0;

  for (const r of rows) {
    totalLiability = money(totalLiability + Number(r.carrying_liability));
    totalRou = money(totalRou + Number(r.carrying_rou_asset));
    totalMonthly = money(totalMonthly + Number(r.monthly_payment));
  }

  return {
    rows,
    summary: {
      total_leases: rows.length,
      active_leases: rows.filter((r) => r.status === 'active').length,
      total_carrying_liability: totalLiability,
      total_carrying_rou_asset: totalRou,
      total_monthly_commitments: totalMonthly,
      currency: rows[0]?.currency || 'XAF',
    },
  };
}

export async function getLeaseContract(orgId, id) {
  const lease = await queryOne(
    `SELECT * FROM lease_contracts WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!lease) throw notFound('Lease contract not found.');

  const schedule = generateSchedule(lease);
  return {
    lease,
    schedule,
  };
}

export async function createLeaseContract(orgId, data) {
  const {
    contract_ref,
    asset_name,
    lessor_name,
    start_date,
    term_months,
    monthly_payment,
    discount_rate_pct,
    currency = 'XAF',
    notes = '',
  } = data;

  const initialPv = calculateLeasePV(
    Number(monthly_payment),
    Number(discount_rate_pct),
    Number(term_months)
  );

  const res = await query(
    `INSERT INTO lease_contracts
      (org_id, contract_ref, asset_name, lessor_name, start_date, term_months,
       monthly_payment, discount_rate_pct, initial_liability, initial_rou_asset,
       carrying_liability, carrying_rou_asset, currency, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      orgId,
      contract_ref,
      asset_name,
      lessor_name,
      start_date,
      term_months,
      monthly_payment,
      discount_rate_pct,
      initialPv,
      initialPv,
      initialPv,
      initialPv,
      currency,
      notes,
    ]
  );

  return getLeaseContract(orgId, res.insertId);
}
