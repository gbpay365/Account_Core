import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';

/**
 * Multi-Donor Project & Grant Accounting Service (Tompro / Succès Parity).
 * Manages donor projects, conventions, eligible expenditure categories,
 * Demandes de Retrait de Fonds (DRF), and Statement of Expenditures (SOE).
 */

/**
 * List all donor projects with budget and expenditure progress.
 */
export async function listProjects(orgId) {
  const projects = await query(
    `SELECT dp.*, ba.name AS bank_account_name, ba.bank_name, ba.account_number AS bank_account_number,
            (SELECT COALESCE(SUM(budget_allocated), 0) FROM donor_expense_categories WHERE project_id = dp.id) AS total_categories_budget,
            (SELECT COALESCE(SUM(dei.eligible_amount), 0)
               FROM donor_expenditure_items dei
               JOIN donor_disbursement_requests drf ON drf.id = dei.drf_id
              WHERE drf.project_id = dp.id) AS total_disbursed_or_claimed
       FROM donor_projects dp
  LEFT JOIN bank_accounts ba ON ba.id = dp.designated_bank_account_id
      WHERE dp.org_id = ?
   ORDER BY dp.start_date DESC, dp.id DESC`,
    [orgId]
  );

  return projects.map(p => {
    const budget = Number(p.total_budget || 0);
    const spent = Number(p.total_disbursed_or_claimed || 0);
    const remaining = money(budget - spent);
    const execRate = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

    return {
      ...p,
      total_budget: budget,
      total_disbursed_or_claimed: spent,
      remaining_budget: remaining,
      execution_rate: execRate,
    };
  });
}

/**
 * Get full project details including categories and DRFs.
 */
export async function getProjectDetails(orgId, projectId) {
  const project = await queryOne(
    `SELECT dp.*, ba.name AS bank_account_name, ba.bank_name, ba.account_number AS bank_account_number
       FROM donor_projects dp
  LEFT JOIN bank_accounts ba ON ba.id = dp.designated_bank_account_id
      WHERE dp.id = ? AND dp.org_id = ?`,
    [projectId, orgId]
  );
  if (!project) throw new ApiError(404, 'Donor project not found.');

  const categories = await query(
    `SELECT dcat.*,
            (SELECT COALESCE(SUM(dei.eligible_amount), 0)
               FROM donor_expenditure_items dei
              WHERE dei.category_id = dcat.id) AS total_spent
       FROM donor_expense_categories dcat
      WHERE dcat.project_id = ?
   ORDER BY dcat.category_code ASC`,
    [projectId]
  );

  const formattedCategories = categories.map(c => {
    const budget = Number(c.budget_allocated || 0);
    const spent = Number(c.total_spent || 0);
    const remaining = money(budget - spent);
    const rate = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    return {
      ...c,
      budget_allocated: budget,
      total_spent: spent,
      remaining_budget: remaining,
      execution_rate: rate,
    };
  });

  const drfs = await query(
    `SELECT drf.*,
            (SELECT COUNT(*) FROM donor_expenditure_items WHERE drf_id = drf.id) AS items_count
       FROM donor_disbursement_requests drf
      WHERE drf.project_id = ?
   ORDER BY drf.request_date DESC, drf.id DESC`,
    [projectId]
  );

  return {
    project: {
      ...project,
      total_budget: Number(project.total_budget),
    },
    categories: formattedCategories,
    drfs: drfs.map(d => ({
      ...d,
      initial_advance: Number(d.initial_advance),
      total_expenditures_claimed: Number(d.total_expenditures_claimed),
      eligible_amount_claimed: Number(d.eligible_amount_claimed),
      replenishment_requested: Number(d.replenishment_requested),
      designated_account_balance: Number(d.designated_account_balance),
    })),
  };
}

/**
 * Create a new donor project.
 */
export async function createProject(orgId, payload) {
  const {
    donor_name,
    project_code,
    project_name,
    agreement_ref,
    currency = 'XAF',
    total_budget,
    financing_rate = 100.0,
    designated_bank_account_id = null,
    start_date,
    end_date = null,
    notes = null,
  } = payload;

  if (!donor_name || !project_code || !project_name || !total_budget || !start_date) {
    throw new ApiError(400, 'Missing mandatory project fields.');
  }

  const res = await query(
    `INSERT INTO donor_projects
     (org_id, donor_name, project_code, project_name, agreement_ref, currency, total_budget, financing_rate, designated_bank_account_id, start_date, end_date, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [orgId, donor_name, project_code, project_name, agreement_ref || null, currency, total_budget, financing_rate, designated_bank_account_id, start_date, end_date, notes]
  );

  return { id: res.insertId, ...payload };
}

/**
 * Add an expense category to a project.
 */
export async function addCategory(orgId, projectId, payload) {
  const project = await queryOne(`SELECT id FROM donor_projects WHERE id = ? AND org_id = ?`, [projectId, orgId]);
  if (!project) throw new ApiError(404, 'Project not found.');

  const { category_code, name, budget_allocated = 0, eligible_rate = 100.0 } = payload;
  const res = await query(
    `INSERT INTO donor_expense_categories
     (project_id, category_code, name, budget_allocated, eligible_rate)
     VALUES (?, ?, ?, ?, ?)`,
    [projectId, category_code, name, budget_allocated, eligible_rate]
  );

  return { id: res.insertId, project_id: projectId, ...payload };
}

/**
 * Get DRF details along with itemized SOE (Statement of Expenditures).
 */
export async function getDRFDetails(orgId, drfId) {
  const drf = await queryOne(
    `SELECT drf.*, dp.project_code, dp.project_name, dp.donor_name, dp.agreement_ref, dp.currency AS project_currency,
            ba.name AS bank_name, ba.account_number AS bank_number
       FROM donor_disbursement_requests drf
       JOIN donor_projects dp ON dp.id = drf.project_id
  LEFT JOIN bank_accounts ba ON ba.id = dp.designated_bank_account_id
      WHERE drf.id = ? AND dp.org_id = ?`,
    [drfId, orgId]
  );
  if (!drf) throw new ApiError(404, 'DRF disbursement request not found.');

  const items = await query(
    `SELECT dei.*, dcat.category_code, dcat.name AS category_name
       FROM donor_expenditure_items dei
       JOIN donor_expense_categories dcat ON dcat.id = dei.category_id
      WHERE dei.drf_id = ?
   ORDER BY dcat.category_code ASC, dei.voucher_date ASC`,
    [drfId]
  );

  // Group by category for summary
  const summaryByCategory = {};
  for (const it of items) {
    if (!summaryByCategory[it.category_code]) {
      summaryByCategory[it.category_code] = {
        code: it.category_code,
        name: it.category_name,
        total_amount: 0,
        eligible_amount: 0,
        count: 0,
      };
    }
    summaryByCategory[it.category_code].total_amount = money(summaryByCategory[it.category_code].total_amount + Number(it.total_amount));
    summaryByCategory[it.category_code].eligible_amount = money(summaryByCategory[it.category_code].eligible_amount + Number(it.eligible_amount));
    summaryByCategory[it.category_code].count += 1;
  }

  return {
    drf: {
      ...drf,
      initial_advance: Number(drf.initial_advance),
      total_expenditures_claimed: Number(drf.total_expenditures_claimed),
      eligible_amount_claimed: Number(drf.eligible_amount_claimed),
      replenishment_requested: Number(drf.replenishment_requested),
      designated_account_balance: Number(drf.designated_account_balance),
    },
    items: items.map(it => ({
      ...it,
      total_amount: Number(it.total_amount),
      eligible_rate: Number(it.eligible_rate),
      eligible_amount: Number(it.eligible_amount),
    })),
    summary: Object.values(summaryByCategory),
  };
}

/**
 * Create a new DRF with itemized vouchers.
 */
export async function createDRF(orgId, projectId, payload) {
  const project = await queryOne(`SELECT * FROM donor_projects WHERE id = ? AND org_id = ?`, [projectId, orgId]);
  if (!project) throw new ApiError(404, 'Project not found.');

  const {
    drf_number,
    request_date,
    period_start,
    period_end,
    initial_advance = 0,
    designated_account_balance = 0,
    notes = null,
    items = [],
  } = payload;

  return await transaction(async (tx) => {
    let totalExpenditures = 0;
    let totalEligible = 0;

    for (const item of items) {
      const amt = Number(item.total_amount || 0);
      const rate = Number(item.eligible_rate || 100.0);
      const eligible = money(amt * (rate / 100));
      totalExpenditures = money(totalExpenditures + amt);
      totalEligible = money(totalEligible + eligible);
    }

    const replenishment = totalEligible;

    const resDrf = await tx.query(
      `INSERT INTO donor_disbursement_requests
       (project_id, drf_number, request_date, period_start, period_end, initial_advance,
        total_expenditures_claimed, eligible_amount_claimed, replenishment_requested,
        designated_account_balance, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [
        projectId,
        drf_number,
        request_date,
        period_start,
        period_end,
        initial_advance,
        totalExpenditures,
        totalEligible,
        replenishment,
        designated_account_balance,
        notes,
      ]
    );

    const drfId = resDrf.insertId;

    for (const it of items) {
      const amt = Number(it.total_amount || 0);
      const rate = Number(it.eligible_rate || 100.0);
      const eligible = money(amt * (rate / 100));

      await tx.query(
        `INSERT INTO donor_expenditure_items
         (drf_id, category_id, voucher_ref, voucher_date, beneficiary_name, description, total_amount, currency, eligible_rate, eligible_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          drfId,
          it.category_id,
          it.voucher_ref,
          it.voucher_date,
          it.beneficiary_name,
          it.description,
          amt,
          it.currency || project.currency,
          rate,
          eligible,
          it.notes || null,
        ]
      );
    }

    return {
      id: drfId,
      drf_number,
      total_expenditures_claimed: totalExpenditures,
      eligible_amount_claimed: totalEligible,
      replenishment_requested: replenishment,
      items_count: items.length,
    };
  });
}
