import { money } from '../utils/money.js';

// -----------------------------------------------------------------------------
// Procurement Plan (PPM) & Packages Service (TOMPRO & World Bank Standards)
// -----------------------------------------------------------------------------

export async function listProcurementPlans(db, orgId, filters = {}) {
  const { fiscalYearId = null, budgetId = null, status = null } = filters;
  const params = [orgId];
  let whereClause = ' WHERE pp.org_id = ?';

  if (fiscalYearId) {
    whereClause += ' AND pp.fiscal_year_id = ?';
    params.push(fiscalYearId);
  }
  if (budgetId) {
    whereClause += ' AND pp.budget_id = ?';
    params.push(budgetId);
  }
  if (status) {
    whereClause += ' AND pp.status = ?';
    params.push(status);
  }

  const sql = `
    SELECT pp.*,
           b.code AS budget_code,
           b.name AS budget_name,
           fy.code AS fiscal_year_code,
           fy.name AS fiscal_year_name,
           u.full_name AS approved_by_name,
           uc.full_name AS created_by_name,
           (SELECT COUNT(*) FROM procurement_packages WHERE plan_id = pp.id) AS total_packages,
           (SELECT COALESCE(SUM(estimated_amount), 0) FROM procurement_packages WHERE plan_id = pp.id) AS total_estimated_amount,
           (SELECT COALESCE(SUM(contract_amount), 0) FROM procurement_packages WHERE plan_id = pp.id) AS total_contract_amount,
           (SELECT COUNT(*) FROM procurement_packages WHERE plan_id = pp.id AND status = 'contract_signed') AS total_signed_packages
      FROM procurement_plans pp
      JOIN budgets b ON b.id = pp.budget_id
      JOIN fiscal_years fy ON fy.id = pp.fiscal_year_id
      LEFT JOIN users u ON u.id = pp.approved_by
      LEFT JOIN users uc ON uc.id = pp.created_by
      ${whereClause}
     ORDER BY pp.created_at DESC, pp.id DESC
  `;

  return db.query(sql, params);
}

export async function getProcurementPlanById(db, orgId, id) {
  const sql = `
    SELECT pp.*,
           b.code AS budget_code,
           b.name AS budget_name,
           fy.code AS fiscal_year_code,
           fy.name AS fiscal_year_name,
           u.full_name AS approved_by_name,
           uc.full_name AS created_by_name,
           (SELECT COUNT(*) FROM procurement_packages WHERE plan_id = pp.id) AS total_packages,
           (SELECT COALESCE(SUM(estimated_amount), 0) FROM procurement_packages WHERE plan_id = pp.id) AS total_estimated_amount,
           (SELECT COALESCE(SUM(contract_amount), 0) FROM procurement_packages WHERE plan_id = pp.id) AS total_contract_amount
      FROM procurement_plans pp
      JOIN budgets b ON b.id = pp.budget_id
      JOIN fiscal_years fy ON fy.id = pp.fiscal_year_id
      LEFT JOIN users u ON u.id = pp.approved_by
      LEFT JOIN users uc ON uc.id = pp.created_by
     WHERE pp.id = ? AND pp.org_id = ?
  `;

  const plan = await db.queryOne(sql, [id, orgId]);
  if (!plan) return null;

  const packages = await listProcurementPackages(db, orgId, { planId: id });
  return {
    ...plan,
    packages,
  };
}

export async function createProcurementPlan(db, orgId, userId, payload) {
  const {
    budget_id,
    fiscal_year_id,
    title,
    notes = null,
    donor_approval_reference = null,
    donor_approval_date = null,
  } = payload;

  const budget = await db.queryOne(
    `SELECT * FROM budgets WHERE id = ? AND org_id = ?`,
    [budget_id, orgId]
  );
  if (!budget) {
    throw new Error('Plan budgétaire spécifié introuvable.');
  }

  const currentYear = new Date().getFullYear();
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM procurement_plans WHERE org_id = ? AND YEAR(created_at) = ?`,
    [orgId, currentYear]
  );
  const nextSeq = Number(countRow?.total || 0) + 1;
  const planCode = `PPM-${currentYear}-${String(nextSeq).padStart(3, '0')}`;

  const insertRes = await db.query(
    `INSERT INTO procurement_plans (
       org_id, budget_id, fiscal_year_id, plan_code, title,
       donor_approval_reference, donor_approval_date, notes, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      budget_id,
      fiscal_year_id,
      planCode,
      title,
      donor_approval_reference,
      donor_approval_date,
      notes,
      userId,
    ]
  );

  return getProcurementPlanById(db, orgId, insertRes.insertId);
}

export async function approveProcurementPlan(db, orgId, userId, id, payload = {}) {
  const { donorApprovalReference = null, donorApprovalDate = null, notes = null } = payload;
  const plan = await db.queryOne(
    `SELECT * FROM procurement_plans WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!plan) {
    throw new Error('Plan de passation des marchés introuvable.');
  }

  await db.query(
    `UPDATE procurement_plans
        SET status = 'approved',
            donor_approval_reference = COALESCE(?, donor_approval_reference),
            donor_approval_date = COALESCE(?, donor_approval_date),
            approved_by = ?,
            approved_at = NOW(),
            notes = COALESCE(?, notes)
      WHERE id = ? AND org_id = ?`,
    [donorApprovalReference, donorApprovalDate, userId, notes, id, orgId]
  );

  return getProcurementPlanById(db, orgId, id);
}

// -----------------------------------------------------------------------------
// Procurement Packages (Marchés / Lots)
// -----------------------------------------------------------------------------

export async function listProcurementPackages(db, orgId, filters = {}) {
  const {
    planId = null,
    budgetLineId = null,
    category = null,
    method = null,
    status = null,
    search = null,
  } = filters;

  const params = [orgId];
  let whereClause = ' WHERE pkg.org_id = ?';

  if (planId) {
    whereClause += ' AND pkg.plan_id = ?';
    params.push(planId);
  }
  if (budgetLineId) {
    whereClause += ' AND pkg.budget_line_id = ?';
    params.push(budgetLineId);
  }
  if (category) {
    whereClause += ' AND pkg.procurement_category = ?';
    params.push(category);
  }
  if (method) {
    whereClause += ' AND pkg.procurement_method = ?';
    params.push(method);
  }
  if (status) {
    whereClause += ' AND pkg.status = ?';
    params.push(status);
  }
  if (search) {
    whereClause += ' AND (pkg.package_number LIKE ? OR pkg.description LIKE ? OR pkg.contract_number LIKE ? OR pkg.awarded_supplier_name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  const sql = `
    SELECT pkg.*,
           pp.plan_code,
           pp.title AS plan_title,
           pp.status AS plan_status,
           bl.budget_type,
           a.code AS account_code,
           a.name AS account_name,
           cc.code AS cost_center_code,
           cc.name AS cost_center_name,
           fp.code AS program_code,
           fp.name AS program_name,
           s.name AS supplier_official_name,
           bc.commitment_number,
           bc.amount AS commitment_amount,
           bc.status AS commitment_status
      FROM procurement_packages pkg
      JOIN procurement_plans pp ON pp.id = pkg.plan_id
      JOIN budget_lines bl ON bl.id = pkg.budget_line_id
      JOIN accounts a ON a.id = bl.account_id
      JOIN cost_centers cc ON cc.id = bl.cost_center_id
      LEFT JOIN funding_programs fp ON fp.id = bl.program_id
      LEFT JOIN suppliers s ON s.id = pkg.awarded_supplier_id
      LEFT JOIN budget_commitments bc ON bc.id = pkg.commitment_id
      ${whereClause}
     ORDER BY pkg.planned_launch_date ASC, pkg.id ASC
  `;

  return db.query(sql, params);
}

export async function getProcurementPackageById(db, orgId, id) {
  const sql = `
    SELECT pkg.*,
           pp.plan_code,
           pp.title AS plan_title,
           pp.status AS plan_status,
           bl.budget_type,
           a.code AS account_code,
           a.name AS account_name,
           cc.code AS cost_center_code,
           cc.name AS cost_center_name,
           fp.code AS program_code,
           fp.name AS program_name,
           s.name AS supplier_official_name,
           bc.commitment_number,
           bc.amount AS commitment_amount,
           bc.status AS commitment_status
      FROM procurement_packages pkg
      JOIN procurement_plans pp ON pp.id = pkg.plan_id
      JOIN budget_lines bl ON bl.id = pkg.budget_line_id
      JOIN accounts a ON a.id = bl.account_id
      JOIN cost_centers cc ON cc.id = bl.cost_center_id
      LEFT JOIN funding_programs fp ON fp.id = bl.program_id
      LEFT JOIN suppliers s ON s.id = pkg.awarded_supplier_id
      LEFT JOIN budget_commitments bc ON bc.id = pkg.commitment_id
     WHERE pkg.id = ? AND pkg.org_id = ?
  `;

  return db.queryOne(sql, [id, orgId]);
}

export async function createProcurementPackage(db, orgId, userId, payload) {
  const {
    plan_id,
    budget_line_id,
    package_number = null,
    description,
    procurement_category = 'goods',
    procurement_method = 'AON',
    estimated_amount,
    planned_launch_date = null,
    planned_opening_date = null,
    planned_award_date = null,
    planned_completion_date = null,
    notes = null,
  } = payload;

  const est = Number(estimated_amount);
  if (!est || est <= 0) {
    throw new Error('Le montant estimé du marché/lot doit être strictement supérieur à zéro.');
  }

  // Verify plan exists
  const plan = await db.queryOne(
    `SELECT * FROM procurement_plans WHERE id = ? AND org_id = ?`,
    [plan_id, orgId]
  );
  if (!plan) {
    throw new Error('Plan de passation des marchés parent introuvable.');
  }

  // Verify budget line belongs to plan's budget
  const line = await db.queryOne(
    `SELECT bl.*, b.code AS budget_code,
            (SELECT COALESCE(SUM(amount), 0) FROM budget_commitments WHERE budget_line_id = bl.id AND status != 'cancelled') AS total_committed
       FROM budget_lines bl
       JOIN budgets b ON b.id = bl.budget_id
      WHERE bl.id = ? AND bl.budget_id = ? AND b.org_id = ?`,
    [budget_line_id, plan.budget_id, orgId]
  );
  if (!line) {
    throw new Error('La ligne budgétaire sélectionnée n\'appartient pas au budget du PPM.');
  }

  // Automatic Review Type Determination (Prior vs Post Review) based on Thresholds
  const threshold = await db.queryOne(
    `SELECT * FROM procurement_thresholds
      WHERE org_id = ? AND category = ? AND method = ?`,
    [orgId, procurement_category, procurement_method]
  );
  let reviewType = 'post_review';
  if (threshold && est >= Number(threshold.prior_review_threshold)) {
    reviewType = 'prior_review';
  } else if (est >= 50000000) {
    // Default 50M fallback threshold
    reviewType = 'prior_review';
  }

  // Sequential package number if not specified
  let pkgNum = package_number;
  if (!pkgNum) {
    const countRow = await db.queryOne(
      `SELECT COUNT(*) AS total FROM procurement_packages WHERE plan_id = ?`,
      [plan_id]
    );
    const seq = Number(countRow?.total || 0) + 1;
    const catCode = procurement_category.slice(0, 3).toUpperCase();
    pkgNum = `LOT-${plan.plan_code.slice(-4)}-${catCode}-${String(seq).padStart(2, '0')}`;
  }

  const insertRes = await db.query(
    `INSERT INTO procurement_packages (
       org_id, plan_id, budget_line_id, package_number, description,
       procurement_category, procurement_method, review_type, estimated_amount,
       planned_launch_date, planned_opening_date, planned_award_date,
       planned_completion_date, notes, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      plan_id,
      budget_line_id,
      pkgNum,
      description,
      procurement_category,
      procurement_method,
      reviewType,
      est,
      planned_launch_date,
      planned_opening_date,
      planned_award_date,
      planned_completion_date,
      notes,
      userId,
    ]
  );

  return getProcurementPackageById(db, orgId, insertRes.insertId);
}

export async function updateProcurementPackage(db, orgId, userId, id, payload) {
  const pkg = await db.queryOne(
    `SELECT * FROM procurement_packages WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!pkg) {
    throw new Error('Marché/Lot introuvable.');
  }

  const {
    description = pkg.description,
    procurement_category = pkg.procurement_category,
    procurement_method = pkg.procurement_method,
    estimated_amount = pkg.estimated_amount,
    status = pkg.status,
    planned_launch_date = pkg.planned_launch_date,
    actual_launch_date = pkg.actual_launch_date,
    planned_opening_date = pkg.planned_opening_date,
    actual_opening_date = pkg.actual_opening_date,
    planned_award_date = pkg.planned_award_date,
    actual_award_date = pkg.actual_award_date,
    planned_completion_date = pkg.planned_completion_date,
    actual_completion_date = pkg.actual_completion_date,
    notes = pkg.notes,
  } = payload;

  await db.query(
    `UPDATE procurement_packages
        SET description = ?,
            procurement_category = ?,
            procurement_method = ?,
            estimated_amount = ?,
            status = ?,
            planned_launch_date = ?,
            actual_launch_date = ?,
            planned_opening_date = ?,
            actual_opening_date = ?,
            planned_award_date = ?,
            actual_award_date = ?,
            planned_completion_date = ?,
            actual_completion_date = ?,
            notes = ?
      WHERE id = ? AND org_id = ?`,
    [
      description,
      procurement_category,
      procurement_method,
      Number(estimated_amount),
      status,
      planned_launch_date,
      actual_launch_date,
      planned_opening_date,
      actual_opening_date,
      planned_award_date,
      actual_award_date,
      planned_completion_date,
      actual_completion_date,
      notes,
      id,
      orgId,
    ]
  );

  return getProcurementPackageById(db, orgId, id);
}

export async function awardProcurementPackage(db, orgId, userId, id, payload) {
  const {
    supplierId = null,
    supplierName,
    contractNumber,
    contractAmount,
    contractSignedDate = new Date().toISOString().slice(0, 10),
    createCommitment = true,
    notes = null,
  } = payload;

  const pkg = await db.queryOne(
    `SELECT pkg.*, pp.budget_id
       FROM procurement_packages pkg
       JOIN procurement_plans pp ON pp.id = pkg.plan_id
      WHERE pkg.id = ? AND pkg.org_id = ?`,
    [id, orgId]
  );
  if (!pkg) {
    throw new Error('Marché/Lot introuvable.');
  }

  const contractAmt = Number(contractAmount);
  if (!contractAmt || contractAmt <= 0) {
    throw new Error('Le montant contractuel définitif doit être supérieur à zéro.');
  }

  let commitmentId = pkg.commitment_id;

  // If requested and no commitment already linked, generate firm commitment
  if (createCommitment && !commitmentId) {
    const currentYear = new Date().getFullYear();
    const countRow = await db.queryOne(
      `SELECT COUNT(*) AS total FROM budget_commitments WHERE org_id = ? AND YEAR(committed_date) = ?`,
      [orgId, currentYear]
    );
    const nextSeq = Number(countRow?.total || 0) + 1;
    const commNumber = `BC-${currentYear}-${String(nextSeq).padStart(4, '0')}`;

    const commRes = await db.query(
      `INSERT INTO budget_commitments (
         org_id, budget_id, budget_line_id, commitment_number, stage,
         procurement_package_id, description, vendor_id, amount,
         committed_date, status, approved_by, approved_at, notes
       ) VALUES (?, ?, ?, ?, 'firm_commitment', ?, ?, ?, ?, ?, 'approved', ?, NOW(), ?)`,
      [
        orgId,
        pkg.budget_id,
        pkg.budget_line_id,
        commNumber,
        id,
        `Contrat Marché: ${pkg.package_number} — ${contractNumber} (${supplierName})`,
        supplierId,
        contractAmt,
        contractSignedDate,
        userId,
        notes || 'Engagement généré automatiquement à la signature du contrat PPM',
      ]
    );
    commitmentId = commRes.insertId;
  }

  await db.query(
    `UPDATE procurement_packages
        SET status = 'contract_signed',
            awarded_supplier_id = ?,
            awarded_supplier_name = ?,
            contract_number = ?,
            contract_amount = ?,
            contract_signed_date = ?,
            actual_award_date = COALESCE(actual_award_date, ?),
            commitment_id = COALESCE(commitment_id, ?),
            notes = COALESCE(?, notes)
      WHERE id = ? AND org_id = ?`,
    [
      supplierId,
      supplierName,
      contractNumber,
      contractAmt,
      contractSignedDate,
      contractSignedDate,
      commitmentId,
      notes,
      id,
      orgId,
    ]
  );

  return getProcurementPackageById(db, orgId, id);
}

export async function listProcurementThresholds(db, orgId, { donorCode = null, category = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (donorCode) {
    filter += ' AND donor_code = ?';
    params.push(donorCode);
  }
  if (category) {
    filter += ' AND category = ?';
    params.push(category);
  }

  return db.query(
    `SELECT * FROM procurement_thresholds WHERE org_id = ? ${filter} ORDER BY category, min_amount ASC`,
    params
  );
}

export async function getProcurementStats(db, orgId, { planId = null, fiscalYearId = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (planId) {
    filter += ' AND pkg.plan_id = ?';
    params.push(planId);
  }
  if (fiscalYearId) {
    filter += ' AND pp.fiscal_year_id = ?';
    params.push(fiscalYearId);
  }

  const row = await db.queryOne(
    `SELECT COUNT(*) AS total_packages,
            COALESCE(SUM(pkg.estimated_amount), 0) AS total_estimated_amount,
            COALESCE(SUM(pkg.contract_amount), 0) AS total_contract_amount,
            COALESCE(SUM(CASE WHEN pkg.status = 'planned' THEN 1 ELSE 0 END), 0) AS count_planned,
            COALESCE(SUM(CASE WHEN pkg.status = 'tender_launched' THEN 1 ELSE 0 END), 0) AS count_launched,
            COALESCE(SUM(CASE WHEN pkg.status = 'bids_evaluated' THEN 1 ELSE 0 END), 0) AS count_evaluated,
            COALESCE(SUM(CASE WHEN pkg.status = 'awarded' THEN 1 ELSE 0 END), 0) AS count_awarded,
            COALESCE(SUM(CASE WHEN pkg.status = 'contract_signed' THEN 1 ELSE 0 END), 0) AS count_signed,
            COALESCE(SUM(CASE WHEN pkg.review_type = 'prior_review' THEN 1 ELSE 0 END), 0) AS count_prior_review,
            COALESCE(SUM(CASE WHEN pkg.procurement_category = 'works' THEN pkg.estimated_amount ELSE 0 END), 0) AS total_works_amount,
            COALESCE(SUM(CASE WHEN pkg.procurement_category = 'goods' THEN pkg.estimated_amount ELSE 0 END), 0) AS total_goods_amount,
            COALESCE(SUM(CASE WHEN pkg.procurement_category IN ('consulting_firms', 'individual_consultants') THEN pkg.estimated_amount ELSE 0 END), 0) AS total_consultants_amount
       FROM procurement_packages pkg
       JOIN procurement_plans pp ON pp.id = pkg.plan_id
      WHERE pkg.org_id = ? ${filter}`,
    params
  );

  return row || {
    total_packages: 0,
    total_estimated_amount: 0,
    total_contract_amount: 0,
    count_planned: 0,
    count_launched: 0,
    count_evaluated: 0,
    count_awarded: 0,
    count_signed: 0,
    count_prior_review: 0,
    total_works_amount: 0,
    total_goods_amount: 0,
    total_consultants_amount: 0,
  };
}
