import { money } from '../utils/money.js';

// -----------------------------------------------------------------------------
// 1. Service Certifications (Procès-Verbaux de Réception / Service Fait)
// -----------------------------------------------------------------------------

export async function listServiceCertifications(db, orgId, { commitmentId = null, status = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (commitmentId) {
    filter += ' AND sc.commitment_id = ?';
    params.push(commitmentId);
  }
  if (status) {
    filter += ' AND sc.status = ?';
    params.push(status);
  }

  return db.query(
    `SELECT sc.*,
            bc.commitment_number,
            bc.stage AS commitment_stage,
            bc.amount AS commitment_amount,
            bc.description AS commitment_description,
            a.code AS account_code,
            a.name AS account_name,
            a.name_en AS account_name_en,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            v.name AS vendor_name,
            u.full_name AS created_by_name
       FROM service_certifications sc
       JOIN budget_commitments bc ON bc.id = sc.commitment_id
       JOIN budget_lines bl ON bl.id = bc.budget_line_id
       JOIN accounts a ON a.id = bl.account_id
       JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN suppliers v ON v.id = bc.vendor_id
       LEFT JOIN users u ON u.id = sc.created_by
      WHERE sc.org_id = ? ${filter}
      ORDER BY sc.certificate_date DESC, sc.id DESC`,
    params
  );
}

export async function getServiceCertificationById(db, orgId, id) {
  const row = await db.queryOne(
    `SELECT sc.*,
            bc.commitment_number,
            bc.stage AS commitment_stage,
            bc.amount AS commitment_amount,
            bc.certified_amount AS commitment_certified_amount,
            bc.description AS commitment_description,
            a.code AS account_code,
            a.name AS account_name,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            v.name AS vendor_name,
            u.full_name AS created_by_name
       FROM service_certifications sc
       JOIN budget_commitments bc ON bc.id = sc.commitment_id
       JOIN budget_lines bl ON bl.id = bc.budget_line_id
       JOIN accounts a ON a.id = bl.account_id
       JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN suppliers v ON v.id = bc.vendor_id
       LEFT JOIN users u ON u.id = sc.created_by
      WHERE sc.org_id = ? AND sc.id = ?`,
    [orgId, id]
  );
  if (!row) throw new Error('Service certification record not found.');
  return row;
}

export async function createServiceCertification(db, orgId, userId, payload) {
  const {
    commitmentId,
    certificateDate,
    inspectorName,
    certifiedAmount,
    conformityRating = 'full_conformity',
    observations = null,
    status = 'certified',
  } = payload;

  const comm = await db.queryOne(
    `SELECT bc.*, bl.budget_id
       FROM budget_commitments bc
       JOIN budget_lines bl ON bl.id = bc.budget_line_id
      WHERE bc.id = ? AND bc.org_id = ?`,
    [commitmentId, orgId]
  );
  if (!comm) throw new Error('Target budget commitment not found.');
  if (comm.status !== 'approved' && comm.status !== 'liquidated') {
    throw new Error('Only approved firm commitments can be certified with a PV de Réception.');
  }

  const certAmt = Number(certifiedAmount || comm.amount);
  if (certAmt <= 0) {
    throw new Error('Certified amount must be strictly positive.');
  }

  const uncertifiedAvailable = Number(comm.amount) - Number(comm.certified_amount || 0);
  if (certAmt > uncertifiedAvailable && Math.abs(certAmt - uncertifiedAvailable) > 0.01) {
    throw new Error(
      `Certified amount (${money(certAmt)}) exceeds remaining uncertified commitment balance (${money(uncertifiedAvailable)}).`
    );
  }

  const certYear = certificateDate ? new Date(certificateDate).getFullYear() : new Date().getFullYear();
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM service_certifications WHERE org_id = ? AND YEAR(certificate_date) = ?`,
    [orgId, certYear]
  );
  const certSeq = String(Number(countRow?.total || 0) + 1).padStart(4, '0');
  const certificateNumber = `PV-${certYear}-${certSeq}`;

  const ins = await db.query(
    `INSERT INTO service_certifications
     (org_id, commitment_id, certificate_number, certificate_date, inspector_name, certified_amount, status, conformity_rating, observations, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      commitmentId,
      certificateNumber,
      certificateDate || new Date().toISOString().slice(0, 10),
      inspectorName.trim(),
      certAmt,
      status,
      conformityRating,
      observations || null,
      userId,
    ]
  );

  const certId = ins.insertId;

  // Update commitment certified amount
  if (status === 'certified' || status === 'liquidated') {
    await db.query(
      `UPDATE budget_commitments
          SET certified_amount = certified_amount + ?
        WHERE id = ?`,
      [certAmt, commitmentId]
    );
  }

  return {
    id: certId,
    certificateNumber,
    commitmentId,
    certifiedAmount: certAmt,
    formattedAmount: money(certAmt),
    status,
    conformityRating,
  };
}

// -----------------------------------------------------------------------------
// 2. Open Commitment Rollover (Year N -> Year N+1)
// -----------------------------------------------------------------------------

export async function listOpenCommitmentsForRollover(db, orgId, sourceFiscalYearId) {
  return db.query(
    `SELECT bc.id AS commitment_id,
            bc.commitment_number,
            bc.committed_date AS commitment_date,
            bc.description,
            bc.amount AS total_commitment_amount,
            bc.certified_amount,
            bc.amount AS open_unliquidated_amount,
            bl.id AS budget_line_id,
            bl.budget_id,
            bl.budget_type,
            a.id AS account_id,
            a.code AS account_code,
            a.name AS account_name,
            cc.id AS cost_center_id,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            v.id AS vendor_id,
            v.name AS vendor_name,
            b.code AS source_budget_code
       FROM budget_commitments bc
       JOIN budget_lines bl ON bl.id = bc.budget_line_id
       JOIN budgets b ON b.id = bl.budget_id
       JOIN accounts a ON a.id = bl.account_id
       JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN suppliers v ON v.id = bc.vendor_id
      WHERE bc.org_id = ?
        AND b.fiscal_year_id = ?
        AND bc.stage = 'firm_commitment'
        AND bc.status IN ('approved')
        AND bc.amount > 0
      ORDER BY bc.committed_date ASC`,
    [orgId, sourceFiscalYearId]
  );
}

export async function executeCommitmentRollover(db, orgId, userId, payload) {
  const {
    sourceFiscalYearId,
    targetFiscalYearId,
    targetBudgetId,
    sourceCommitmentIds,
    notes = null,
  } = payload;

  if (!sourceCommitmentIds || sourceCommitmentIds.length === 0) {
    throw new Error('At least one open commitment must be selected for rollover.');
  }

  const targetBudget = await db.queryOne(
    `SELECT * FROM budgets WHERE id = ? AND org_id = ? AND fiscal_year_id = ?`,
    [targetBudgetId, orgId, targetFiscalYearId]
  );
  if (!targetBudget) {
    throw new Error('Target budget plan not found for the destination fiscal year.');
  }

  const targetFy = await db.queryOne(
    `SELECT * FROM fiscal_years WHERE id = ? AND org_id = ?`,
    [targetFiscalYearId, orgId]
  );
  const targetYearCode = targetFy?.code || String(new Date().getFullYear() + 1);

  const rollYear = new Date().getFullYear();
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM commitment_rollovers WHERE org_id = ?`,
    [orgId]
  );
  let rollSeq = Number(countRow?.total || 0) + 1;

  let totalRolled = 0;
  const createdRollovers = [];

  for (const srcId of sourceCommitmentIds) {
    const src = await db.queryOne(
      `SELECT bc.*,
              bl.account_id,
              bl.cost_center_id,
              bl.budget_type,
              bl.program_id
         FROM budget_commitments bc
         JOIN budget_lines bl ON bl.id = bc.budget_line_id
        WHERE bc.id = ? AND bc.org_id = ?`,
      [srcId, orgId]
    );
    if (!src) continue;

    const openAmt = Number(src.amount);
    if (openAmt <= 0) continue;

    // 1. Find or create matching budget line in target budget
    let targetLine = await db.queryOne(
      `SELECT id, amount
         FROM budget_lines
        WHERE budget_id = ?
          AND account_id = ?
          AND cost_center_id = ?
          AND budget_type = ?`,
      [targetBudgetId, src.account_id, src.cost_center_id, src.budget_type]
    );

    if (!targetLine) {
      const insLine = await db.query(
        `INSERT INTO budget_lines
         (budget_id, account_id, cost_center_id, program_id, budget_type, initial_amount, amount, control_mode, spread_curve)
         VALUES (?, ?, ?, ?, ?, 0.00, 0.00, 'warning', 'equal_quarterly')`,
        [targetBudgetId, src.account_id, src.cost_center_id, src.program_id || null, src.budget_type]
      );
      targetLine = { id: insLine.insertId };
    }

    // 2. Insert carried-over commitment in target budget
    const targetCommNum = `${src.commitment_number}-R${targetYearCode.slice(-2)}`;
    const insComm = await db.query(
      `INSERT INTO budget_commitments
       (org_id, budget_id, budget_line_id, commitment_number, stage, parent_commitment_id, committed_date, vendor_id, asset_id, description, amount, certified_amount, is_carried_over, carried_over_from_id, status, approved_by, approved_at)
       VALUES (?, ?, ?, ?, 'firm_commitment', NULL, CURDATE(), ?, ?, ?, ?, 0.00, 1, ?, 'approved', ?, NOW())`,
      [
        orgId,
        targetBudgetId,
        targetLine.id,
        targetCommNum,
        src.vendor_id || null,
        src.asset_id || null,
        `[Report N-1] ${src.description || ''}`,
        openAmt,
        src.id,
        userId,
      ]
    );
    const targetCommId = insComm.insertId;

    // 3. Insert commitment rollover audit record
    const rolloverNumber = `ROLL-PO-${rollYear}-${String(rollSeq++).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO commitment_rollovers
       (org_id, source_fiscal_year_id, target_fiscal_year_id, source_commitment_id, target_commitment_id, rollover_amount, rollover_number, executed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        sourceFiscalYearId,
        targetFiscalYearId,
        src.id,
        targetCommId,
        openAmt,
        rolloverNumber,
        userId,
        notes || `Report d'engagement ferme non soldé vers ${targetYearCode}`,
      ]
    );

    // 4. Update source commitment status to converted so it is not double counted
    await db.query(
      `UPDATE budget_commitments
          SET status = 'converted'
        WHERE id = ?`,
      [src.id]
    );

    totalRolled += openAmt;
    createdRollovers.push({
      rolloverNumber,
      sourceCommitmentId: src.id,
      sourceCommitmentNumber: src.commitment_number,
      targetCommitmentId: targetCommId,
      targetCommitmentNumber: targetCommNum,
      rolloverAmount: openAmt,
    });
  }

  return {
    success: true,
    targetBudgetId,
    count: createdRollovers.length,
    totalRolledAmount: totalRolled,
    formattedTotal: money(totalRolled),
    rollovers: createdRollovers,
  };
}

export async function listCommitmentRollovers(db, orgId, { fiscalYearId = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (fiscalYearId) {
    filter += ' AND (cr.source_fiscal_year_id = ? OR cr.target_fiscal_year_id = ?)';
    params.push(fiscalYearId, fiscalYearId);
  }

  return db.query(
    `SELECT cr.*,
            sfy.code AS source_fiscal_year_code,
            tfy.code AS target_fiscal_year_code,
            sbc.commitment_number AS source_commitment_number,
            tbc.commitment_number AS target_commitment_number,
            u.full_name AS executed_by_name
       FROM commitment_rollovers cr
       JOIN fiscal_years sfy ON sfy.id = cr.source_fiscal_year_id
       JOIN fiscal_years tfy ON tfy.id = cr.target_fiscal_year_id
       JOIN budget_commitments sbc ON sbc.id = cr.source_commitment_id
       JOIN budget_commitments tbc ON tbc.id = cr.target_commitment_id
       LEFT JOIN users u ON u.id = cr.executed_by
      WHERE cr.org_id = ? ${filter}
      ORDER BY cr.created_at DESC`,
    params
  );
}

// -----------------------------------------------------------------------------
// 3. PTBA Mass Formulation & Excel/CSV Batch Import
// -----------------------------------------------------------------------------

export async function getPtbaTemplateData(db, orgId, budgetId) {
  const budget = await db.queryOne(`SELECT * FROM budgets WHERE id = ? AND org_id = ?`, [budgetId, orgId]);
  if (!budget) throw new Error('Budget not found.');

  const accounts = await db.query(
    `SELECT code, name FROM accounts WHERE org_id = ? AND (code LIKE '6%' OR code LIKE '2%' OR code LIKE '7%') ORDER BY code`,
    [orgId]
  );
  const costCenters = await db.query(
    `SELECT code, name FROM cost_centers WHERE org_id = ? AND is_active = 1 ORDER BY code`,
    [orgId]
  );
  const programs = await db.query(
    `SELECT code, name FROM funding_programs WHERE org_id = ? AND is_active = 1 ORDER BY code`,
    [orgId]
  );

  const existingLines = await db.query(
    `SELECT a.code AS account_code,
            a.name AS account_name,
            cc.code AS cost_center_code,
            cc.name AS cost_center_name,
            p.code AS program_code,
            bl.budget_type,
            bl.initial_amount,
            bl.q1_amount,
            bl.q2_amount,
            bl.q3_amount,
            bl.q4_amount,
            bl.spread_curve,
            bl.notes
       FROM budget_lines bl
       JOIN accounts a ON a.id = bl.account_id
       JOIN cost_centers cc ON cc.id = bl.cost_center_id
       LEFT JOIN funding_programs p ON p.id = bl.program_id
      WHERE bl.budget_id = ?
      ORDER BY a.code`,
    [budgetId]
  );

  return {
    budgetId,
    budgetCode: budget.code,
    budgetName: budget.name,
    headers: [
      'account_code',
      'cost_center_code',
      'program_code',
      'budget_type',
      'initial_amount',
      'q1_amount',
      'q2_amount',
      'q3_amount',
      'q4_amount',
      'spread_curve',
      'notes',
    ],
    existingLines,
    availableAccounts: accounts.slice(0, 50),
    availableCostCenters: costCenters,
    availablePrograms: programs,
  };
}

export async function importPtbaBatch(db, orgId, userId, budgetId, payload) {
  const { lines = [], updateExisting = true, fileName = 'ptba_import.csv' } = payload;
  if (!lines || lines.length === 0) {
    throw new Error('No PTBA line rows provided for import.');
  }

  const budget = await db.queryOne(`SELECT * FROM budgets WHERE id = ? AND org_id = ?`, [budgetId, orgId]);
  if (!budget) throw new Error('Target budget not found.');

  // Pre-load reference maps for fast lookup
  const accountRows = await db.query(`SELECT id, code FROM accounts WHERE org_id = ?`, [orgId]);
  const acctMap = new Map(accountRows.map((a) => [String(a.code).trim(), a.id]));

  const ccRows = await db.query(`SELECT id, code FROM cost_centers WHERE org_id = ?`, [orgId]);
  const ccMap = new Map(ccRows.map((c) => [String(c.code).trim().toUpperCase(), c.id]));

  const progRows = await db.query(`SELECT id, code FROM funding_programs WHERE org_id = ?`, [orgId]);
  const progMap = new Map(progRows.map((p) => [String(p.code).trim().toUpperCase(), p.id]));

  let importedCount = 0;
  let updatedCount = 0;
  let totalImportedAmount = 0;
  const errors = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx];
    const rowNum = idx + 1;
    const acctCode = String(l.account_code || l.accountCode || '').trim();
    const ccCode = String(l.cost_center_code || l.costCenterCode || '').trim().toUpperCase();
    const progCode = String(l.program_code || l.programCode || '').trim().toUpperCase();
    const bType = String(l.budget_type || l.budgetType || 'opex').toLowerCase();
    const initAmt = Number(l.initial_amount ?? l.initialAmount ?? 0);

    if (!acctCode || !acctMap.has(acctCode)) {
      errors.push(`Row ${rowNum}: Unknown account code '${acctCode}'.`);
      continue;
    }
    if (!ccCode || !ccMap.has(ccCode)) {
      errors.push(`Row ${rowNum}: Unknown cost center code '${ccCode}'.`);
      continue;
    }

    const acctId = acctMap.get(acctCode);
    const ccId = ccMap.get(ccCode);
    const progId = progCode && progMap.has(progCode) ? progMap.get(progCode) : null;
    const spreadCurve = l.spread_curve || l.spreadCurve || 'equal_quarterly';

    // Calculate quarterly amounts
    let q1 = Number(l.q1_amount ?? l.q1Amount ?? 0);
    let q2 = Number(l.q2_amount ?? l.q2Amount ?? 0);
    let q3 = Number(l.q3_amount ?? l.q3Amount ?? 0);
    let q4 = Number(l.q4_amount ?? l.q4Amount ?? 0);

    if (q1 + q2 + q3 + q4 === 0 && initAmt > 0) {
      if (spreadCurve === 'front_loaded') {
        q1 = Math.round(initAmt * 0.4);
        q2 = Math.round(initAmt * 0.3);
        q3 = Math.round(initAmt * 0.2);
        q4 = initAmt - (q1 + q2 + q3);
      } else if (spreadCurve === 'back_loaded') {
        q1 = Math.round(initAmt * 0.1);
        q2 = Math.round(initAmt * 0.2);
        q3 = Math.round(initAmt * 0.3);
        q4 = initAmt - (q1 + q2 + q3);
      } else {
        // Equal quarterly
        q1 = Math.round(initAmt * 0.25);
        q2 = Math.round(initAmt * 0.25);
        q3 = Math.round(initAmt * 0.25);
        q4 = initAmt - (q1 + q2 + q3);
      }
    }

    const notes = l.notes ? String(l.notes).trim() : null;

    // Check if line exists
    const existing = await db.queryOne(
      `SELECT id FROM budget_lines
        WHERE budget_id = ? AND account_id = ? AND cost_center_id = ? AND budget_type = ?`,
      [budgetId, acctId, ccId, bType]
    );

    if (existing && updateExisting) {
      await db.query(
        `UPDATE budget_lines
            SET initial_amount = ?,
                amount = ?,
                q1_amount = ?,
                q2_amount = ?,
                q3_amount = ?,
                q4_amount = ?,
                spread_curve = ?,
                program_id = ?,
                notes = COALESCE(?, notes)
          WHERE id = ?`,
        [initAmt, initAmt, q1, q2, q3, q4, spreadCurve, progId, notes, existing.id]
      );
      updatedCount++;
      totalImportedAmount += initAmt;
    } else if (!existing) {
      await db.query(
        `INSERT INTO budget_lines
         (budget_id, account_id, cost_center_id, program_id, budget_type, initial_amount, amount, q1_amount, q2_amount, q3_amount, q4_amount, spread_curve, notes, control_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'strict_block')`,
        [budgetId, acctId, ccId, progId, bType, initAmt, initAmt, q1, q2, q3, q4, spreadCurve, notes]
      );
      importedCount++;
      totalImportedAmount += initAmt;
    }
  }


  // Log in budget_ptba_imports
  const importYear = new Date().getFullYear();
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM budget_ptba_imports WHERE org_id = ?`,
    [orgId]
  );
  const impSeq = String(Number(countRow?.total || 0) + 1).padStart(4, '0');
  const batchNumber = `PTBA-IMP-${importYear}-${impSeq}`;

  await db.query(
    `INSERT INTO budget_ptba_imports
     (org_id, budget_id, batch_number, file_name, lines_imported, lines_updated, total_amount, imported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, budgetId, batchNumber, fileName, importedCount, updatedCount, totalImportedAmount, userId]
  );

  return {
    success: true,
    batchNumber,
    linesImported: importedCount,
    linesUpdated: updatedCount,
    totalAmount: totalImportedAmount,
    formattedTotal: money(totalImportedAmount),
    errors,
  };
}

export async function listPtbaImports(db, orgId, budgetId = null) {
  const params = [orgId];
  let filter = '';
  if (budgetId) {
    filter += ' AND bpi.budget_id = ?';
    params.push(budgetId);
  }

  return db.query(
    `SELECT bpi.*,
            b.code AS budget_code,
            b.name AS budget_name,
            u.full_name AS imported_by_name
       FROM budget_ptba_imports bpi
       JOIN budgets b ON b.id = bpi.budget_id
       LEFT JOIN users u ON u.id = bpi.imported_by
      WHERE bpi.org_id = ? ${filter}
      ORDER BY bpi.created_at DESC`,
    params
  );
}
