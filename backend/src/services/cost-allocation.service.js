import { money } from '../utils/money.js';

// -----------------------------------------------------------------------------
// 1. Budget Derivation Rules (FMDERIVE / Dimension Pyramids)
// -----------------------------------------------------------------------------

export async function listDerivationRules({ query }, orgId, { dimensionType = null, isActive = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (dimensionType) {
    filter += ' AND bdr.dimension_type = ?';
    params.push(dimensionType);
  }
  if (isActive !== null && isActive !== undefined) {
    filter += ' AND bdr.is_active = ?';
    params.push(Number(isActive));
  }

  return query(
    `SELECT bdr.*,
            tgt_ac.code AS target_account_code,
            tgt_ac.name AS target_account_name,
            tgt_ac.name_en AS target_account_name_en,
            tgt_cc.code AS target_cost_center_code,
            tgt_cc.name AS target_cost_center_name
       FROM budget_derivation_rules bdr
       LEFT JOIN accounts tgt_ac ON tgt_ac.id = bdr.target_account_id
       LEFT JOIN cost_centers tgt_cc ON tgt_cc.id = bdr.target_cost_center_id
      WHERE bdr.org_id = ? ${filter}
      ORDER BY bdr.priority ASC, bdr.created_at DESC`,
    params
  );
}

export async function createDerivationRule({ query, queryOne }, orgId, payload) {
  const {
    ruleCode,
    ruleName,
    dimensionType = 'account',
    sourcePattern,
    targetAccountId = null,
    targetCostCenterId = null,
    priority = 10,
    notes = null,
  } = payload;

  if (!ruleCode || !ruleName || !sourcePattern) {
    throw new Error('Rule code, rule name, and source pattern are required.');
  }

  if (dimensionType === 'account' && !targetAccountId) {
    throw new Error('Target account is required for account derivation rules.');
  }
  if (dimensionType === 'cost_center' && !targetCostCenterId) {
    throw new Error('Target cost center is required for cost center derivation rules.');
  }

  const ins = await query(
    `INSERT INTO budget_derivation_rules
     (org_id, rule_code, rule_name, dimension_type, source_pattern, target_account_id, target_cost_center_id, priority, is_active, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      orgId,
      ruleCode.trim().toUpperCase(),
      ruleName.trim(),
      dimensionType,
      sourcePattern.trim(),
      targetAccountId || null,
      targetCostCenterId || null,
      Number(priority) || 10,
      notes ? notes.trim() : null,
    ]
  );

  return { id: ins.insertId, ruleCode: ruleCode.trim().toUpperCase(), status: 'active' };
}

export async function deleteDerivationRule({ query }, orgId, ruleId) {
  await query(`DELETE FROM budget_derivation_rules WHERE org_id = ? AND id = ?`, [orgId, ruleId]);
  return { ok: true, deleted: ruleId };
}

export async function matchDerivationRule({ queryOne }, orgId, { accountCode = null, costCenterCode = null }) {
  if (accountCode) {
    const matched = await queryOne(
      `SELECT bdr.*, ac.id AS derived_account_id, ac.code AS derived_account_code, ac.name AS derived_account_name
         FROM budget_derivation_rules bdr
         JOIN accounts ac ON ac.id = bdr.target_account_id
        WHERE bdr.org_id = ? AND bdr.dimension_type = 'account' AND bdr.is_active = 1
          AND ? LIKE REPLACE(bdr.source_pattern, '*', '%')
        ORDER BY bdr.priority ASC LIMIT 1`,
      [orgId, accountCode]
    );
    if (matched) return matched;
  }

  if (costCenterCode) {
    const matched = await queryOne(
      `SELECT bdr.*, cc.id AS derived_cost_center_id, cc.code AS derived_cost_center_code, cc.name AS derived_cost_center_name
         FROM budget_derivation_rules bdr
         JOIN cost_centers cc ON cc.id = bdr.target_cost_center_id
        WHERE bdr.org_id = ? AND bdr.dimension_type = 'cost_center' AND bdr.is_active = 1
          AND ? LIKE REPLACE(bdr.source_pattern, '*', '%')
        ORDER BY bdr.priority ASC LIMIT 1`,
      [orgId, costCenterCode]
    );
    if (matched) return matched;
  }

  return null;
}

// -----------------------------------------------------------------------------
// 2. Secondary Cost Allocation Cycles (Cycles de Répartition Analytique)
// -----------------------------------------------------------------------------

export async function listAllocationCycles({ query }, orgId) {
  return query(
    `SELECT cac.*,
            (SELECT COUNT(*) FROM cost_allocation_segments WHERE cycle_id = cac.id) AS segments_count,
            (SELECT COUNT(*) FROM cost_allocation_runs WHERE cycle_id = cac.id AND status = 'posted') AS runs_count,
            (SELECT MAX(run_date) FROM cost_allocation_runs WHERE cycle_id = cac.id AND status = 'posted') AS last_run_date
       FROM cost_allocation_cycles cac
      WHERE cac.org_id = ?
      ORDER BY cac.created_at DESC`,
    [orgId]
  );
}

export async function getAllocationCycleById({ query, queryOne }, orgId, cycleId) {
  const cycle = await queryOne(
    `SELECT * FROM cost_allocation_cycles WHERE org_id = ? AND id = ?`,
    [orgId, cycleId]
  );
  if (!cycle) {
    throw new Error('Allocation cycle not found.');
  }

  const segments = await query(
    `SELECT cas.*,
            s_cc.code AS sender_cost_center_code,
            s_cc.name AS sender_cost_center_name,
            s_cc.name_en AS sender_cost_center_name_en,
            s_ac.code AS sender_account_code,
            s_ac.name AS sender_account_name
       FROM cost_allocation_segments cas
       JOIN cost_centers s_cc ON s_cc.id = cas.sender_cost_center_id
       LEFT JOIN accounts s_ac ON s_ac.id = cas.sender_account_id
      WHERE cas.cycle_id = ?
      ORDER BY cas.id ASC`,
    [cycleId]
  );

  for (const seg of segments) {
    const targets = await query(
      `SELECT cat.*,
              r_cc.code AS receiver_cost_center_code,
              r_cc.name AS receiver_cost_center_name,
              r_cc.name_en AS receiver_cost_center_name_en
         FROM cost_allocation_targets cat
         JOIN cost_centers r_cc ON r_cc.id = cat.receiver_cost_center_id
        WHERE cat.segment_id = ?
        ORDER BY cat.id ASC`,
      [seg.id]
    );
    seg.targets = targets;
  }

  cycle.segments = segments;
  return cycle;
}

export async function createAllocationCycle({ query }, orgId, payload) {
  const { code, name, cycleType = 'assessment', description = null, segments = [] } = payload;

  if (!code || !name) {
    throw new Error('Cycle code and name are required.');
  }
  if (!segments || segments.length === 0) {
    throw new Error('At least one allocation segment with sender and receiver cost centers is required.');
  }

  const ins = await query(
    `INSERT INTO cost_allocation_cycles (org_id, code, name, cycle_type, description, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [orgId, code.trim().toUpperCase(), name.trim(), cycleType, description]
  );
  const cycleId = ins.insertId;

  for (const seg of segments) {
    if (!seg.senderCostCenterId) {
      throw new Error('Sender cost center is required for each segment.');
    }
    const segIns = await query(
      `INSERT INTO cost_allocation_segments (cycle_id, segment_name, sender_cost_center_id, sender_account_id, method, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        cycleId,
        seg.segmentName || `Segment ${seg.senderCostCenterId}`,
        seg.senderCostCenterId,
        seg.senderAccountId || null,
        seg.method || 'percentage',
        seg.notes || null,
      ]
    );
    const segmentId = segIns.insertId;

    if (seg.targets && seg.targets.length > 0) {
      for (const tgt of seg.targets) {
        if (!tgt.receiverCostCenterId) continue;
        await query(
          `INSERT INTO cost_allocation_targets (segment_id, receiver_cost_center_id, weight_pct, fixed_amount)
           VALUES (?, ?, ?, ?)`,
          [segmentId, tgt.receiverCostCenterId, Number(tgt.weightPct || 0), Number(tgt.fixedAmount || 0)]
        );
      }
    }
  }

  return { id: cycleId, code: code.trim().toUpperCase(), status: 'active' };
}

export async function deleteAllocationCycle({ query }, orgId, cycleId) {
  await query(`DELETE FROM cost_allocation_cycles WHERE org_id = ? AND id = ?`, [orgId, cycleId]);
  return { ok: true, deleted: cycleId };
}

// -----------------------------------------------------------------------------
// 3. Allocation Simulation & Execution Engine
// -----------------------------------------------------------------------------

export async function simulateAllocationRun(
  { query, queryOne },
  orgId,
  { cycleId, fiscalYearId, periodId = null, poolAmountOverride = null }
) {
  const cycle = await queryOne(
    `SELECT * FROM cost_allocation_cycles WHERE org_id = ? AND id = ?`,
    [orgId, cycleId]
  );
  if (!cycle) {
    throw new Error('Allocation cycle not found.');
  }

  const segments = await query(
    `SELECT cas.*,
            s_cc.code AS sender_cost_center_code,
            s_cc.name AS sender_cost_center_name,
            s_cc.name_en AS sender_cost_center_name_en
       FROM cost_allocation_segments cas
       JOIN cost_centers s_cc ON s_cc.id = cas.sender_cost_center_id
      WHERE cas.cycle_id = ?`,
    [cycleId]
  );

  if (segments.length === 0) {
    throw new Error('Allocation cycle has no configured segments.');
  }

  const results = [];
  let grandTotal = 0;

  for (const seg of segments) {
    // 1. Determine Sender Pool
    let pool = 0;
    if (poolAmountOverride && Number(poolAmountOverride) > 0) {
      pool = Number(poolAmountOverride);
    } else {
      // Query posted expenses for this sender cost center in the period / fiscal year
      const pParams = [orgId, seg.sender_cost_center_id];
      let pFilter = '';
      if (periodId) {
        pFilter += ' AND je.period_id = ?';
        pParams.push(periodId);
      } else if (fiscalYearId) {
        pFilter += ' AND ap.fiscal_year_id = ?';
        pParams.push(fiscalYearId);
      }

      if (seg.sender_account_id) {
        pFilter += ' AND jl.account_id = ?';
        pParams.push(seg.sender_account_id);
      } else {
        // Class 6 operating charges
        pFilter += " AND ac.account_class = 6";
      }

      const expRow = await queryOne(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS total_spent
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.entry_id
           JOIN accounting_periods ap ON ap.id = je.period_id
           JOIN accounts ac ON ac.id = jl.account_id
          WHERE je.org_id = ? AND jl.cost_center_id = ? AND je.status = 'posted' ${pFilter}`,
        pParams
      );

      pool = Number(expRow?.total_spent || 0);

      // If no actual spend yet in database, fall back to sender budget amount for simulation
      if (pool <= 0) {
        const bgRow = await queryOne(
          `SELECT COALESCE(SUM(bl.amount), 0) AS budget_allocation
             FROM budget_lines bl
             JOIN budgets b ON b.id = bl.budget_id
            WHERE b.org_id = ? AND bl.cost_center_id = ? AND b.fiscal_year_id = ?`,
          [orgId, seg.sender_cost_center_id, fiscalYearId]
        );
        pool = Number(bgRow?.budget_allocation || 0);
      }

      // If still 0, provide default simulation basis (e.g. 5,000,000 XAF)
      if (pool <= 0) {
        pool = 5000000;
      }
    }

    // 2. Query targets
    const targets = await query(
      `SELECT cat.*,
              r_cc.code AS receiver_cost_center_code,
              r_cc.name AS receiver_cost_center_name,
              r_cc.name_en AS receiver_cost_center_name_en
         FROM cost_allocation_targets cat
         JOIN cost_centers r_cc ON r_cc.id = cat.receiver_cost_center_id
        WHERE cat.segment_id = ?`,
      [seg.id]
    );

    if (targets.length === 0) {
      continue;
    }

    const totalWeight = targets.reduce((sum, t) => sum + Number(t.weight_pct || 0), 0);
    const weightBase = totalWeight > 0 ? totalWeight : 100.0;

    let segmentSum = 0;
    const targetLines = [];

    for (let i = 0; i < targets.length; i++) {
      const tgt = targets[i];
      const pct = Number(tgt.weight_pct || 0);
      const isLast = i === targets.length - 1;
      let allocAmt = 0;

      if (seg.method === 'fixed_amount' && Number(tgt.fixed_amount) > 0) {
        allocAmt = Number(tgt.fixed_amount);
      } else {
        allocAmt = Math.round(pool * (pct / weightBase));
      }

      segmentSum += allocAmt;

      targetLines.push({
        targetId: tgt.id,
        receiverCostCenterId: tgt.receiver_cost_center_id,
        receiverCostCenterCode: tgt.receiver_cost_center_code,
        receiverCostCenterName: tgt.receiver_cost_center_name,
        receiverCostCenterNameEn: tgt.receiver_cost_center_name_en,
        weightPct: pct,
        allocatedAmount: allocAmt,
        formattedAllocatedAmount: money(allocAmt),
      });
    }

    // Adjust any rounding delta onto the largest receiver
    if (seg.method !== 'fixed_amount' && segmentSum !== pool && targetLines.length > 0) {
      const diff = pool - segmentSum;
      targetLines[0].allocatedAmount += diff;
      targetLines[0].formattedAllocatedAmount = money(targetLines[0].allocatedAmount);
      segmentSum += diff;
    }

    grandTotal += segmentSum;

    results.push({
      segmentId: seg.id,
      segmentName: seg.segment_name,
      senderCostCenterId: seg.sender_cost_center_id,
      senderCostCenterCode: seg.sender_cost_center_code,
      senderCostCenterName: seg.sender_cost_center_name,
      senderCostCenterNameEn: seg.sender_cost_center_name_en,
      senderPool: pool,
      formattedSenderPool: money(pool),
      method: seg.method,
      targets: targetLines,
      segmentTotalAllocated: segmentSum,
      formattedSegmentTotal: money(segmentSum),
    });
  }

  return {
    cycleId: cycle.id,
    cycleCode: cycle.code,
    cycleName: cycle.name,
    cycleType: cycle.cycle_type,
    fiscalYearId,
    periodId,
    grandTotalAllocated: grandTotal,
    formattedGrandTotal: money(grandTotal),
    segments: results,
  };
}

export async function executeAllocationRun(
  { query, queryOne },
  orgId,
  userId,
  payload
) {
  const { cycleId, fiscalYearId, periodId = null, runDate = null, notes = null, poolAmountOverride = null } = payload;

  // 1. Run simulation to get breakdown
  const sim = await simulateAllocationRun({ query, queryOne }, orgId, {
    cycleId,
    fiscalYearId,
    periodId,
    poolAmountOverride,
  });

  if (sim.grandTotalAllocated <= 0) {
    throw new Error('Total allocated amount is zero. Check cycle segment sender pools and receiver weights.');
  }

  // 2. Determine target accounting period matching effectiveDate
  const effectiveDate = runDate || new Date().toISOString().slice(0, 10);
  const periodForDate = await queryOne(
    `SELECT id FROM accounting_periods WHERE org_id = ? AND ? BETWEEN start_date AND end_date LIMIT 1`,
    [orgId, effectiveDate]
  );
  let effectivePeriodId = periodForDate?.id || periodId;
  if (!effectivePeriodId) {
    const period = await queryOne(
      `SELECT id FROM accounting_periods WHERE org_id = ? AND fiscal_year_id = ? AND is_closed = 0 ORDER BY start_date ASC LIMIT 1`,
      [orgId, fiscalYearId]
    );
    effectivePeriodId = period?.id;
  }
  if (!effectivePeriodId) {
    throw new Error('No open accounting period found for the allocation date.');
  }

  // 3. Generate sequential run number
  const yr = new Date(effectiveDate).getFullYear();
  const countRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM cost_allocation_runs WHERE org_id = ? AND run_number LIKE ?`,
    [orgId, `CYCLE-${yr}-%`]
  );
  const seq = (countRow?.cnt || 0) + 1;
  const runNumber = `CYCLE-${yr}-${String(seq).padStart(4, '0')}`;

  // 4. Retrieve or ensure postable OHADA allocation accounts:
  // Sender Credit: 7811 (Transferts de charges d'exploitation, postable)
  // Receiver Debit: 6581 (Charges diverses de gestion courante, postable)
  const creditAcct = await queryOne(
    `SELECT id, code, name FROM accounts WHERE org_id = ? AND code = '7811' AND is_postable = 1 LIMIT 1`,
    [orgId]
  ) || await queryOne(
    `SELECT id, code, name FROM accounts WHERE org_id = ? AND code LIKE '78%' AND is_postable = 1 LIMIT 1`,
    [orgId]
  );

  const debitAcct = await queryOne(
    `SELECT id, code, name FROM accounts WHERE org_id = ? AND code = '6581' AND is_postable = 1 LIMIT 1`,
    [orgId]
  ) || await queryOne(
    `SELECT id, code, name FROM accounts WHERE org_id = ? AND code LIKE '65%' AND is_postable = 1 LIMIT 1`,
    [orgId]
  );

  // Journal OD (Operations Diverses)
  const odJournal = await queryOne(
    `SELECT id FROM journals WHERE org_id = ? AND code = 'OD' LIMIT 1`,
    [orgId]
  ) || await queryOne(`SELECT id FROM journals WHERE org_id = ? LIMIT 1`, [orgId]);

  let journalEntryId = null;

  // 5. Create balanced Journal Entry for Secondary Cost Repartition
  if (odJournal && creditAcct && debitAcct) {
    const totalAmount = sim.grandTotalAllocated;
    const jeIns = await query(
      `INSERT INTO journal_entries
       (org_id, journal_id, entry_no, entry_date, period_id, reference, description, narration,
        source, source_ref, framework, currency, fx_rate, total_debit, total_credit, status,
        created_by, posted_by, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'system', ?, 'ohada', 'XAF', 1, ?, ?, 'posted', ?, ?, NOW())`,
      [
        orgId,
        odJournal.id,
        runNumber,
        effectiveDate,
        effectivePeriodId,
        sim.cycleCode,
        `Répartition Analytique Secondaire: ${sim.cycleName} (${sim.cycleCode})`,
        notes || `Cycle de déversement et répartition analytique secondaire - ${sim.cycleName}`,
        runNumber,
        totalAmount,
        totalAmount,
        userId,
        userId,
      ]
    );
    journalEntryId = jeIns.insertId;

    let lineSeq = 1;
    // For each segment:
    for (const seg of sim.segments) {
      // Credit sender cost center (Transfer of charges)
      await query(
        `INSERT INTO journal_lines
         (org_id, entry_id, line_no, account_id, cost_center_id, description, debit, credit, currency, fx_rate, debit_func, credit_func)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'XAF', 1, 0, ?)`,
        [
          orgId,
          journalEntryId,
          lineSeq++,
          creditAcct.id,
          seg.senderCostCenterId,
          `Déversement analytique - ${seg.segmentName}`,
          seg.segmentTotalAllocated,
          seg.segmentTotalAllocated,
        ]
      );

      // Debit receiver cost centers
      for (const tgt of seg.targets) {
        await query(
          `INSERT INTO journal_lines
           (org_id, entry_id, line_no, account_id, cost_center_id, description, debit, credit, currency, fx_rate, debit_func, credit_func)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'XAF', 1, ?, 0)`,
          [
            orgId,
            journalEntryId,
            lineSeq++,
            debitAcct.id,
            tgt.receiverCostCenterId,
            `Quote-part charges indirectes reçues de ${seg.senderCostCenterCode} (${tgt.weightPct}%)`,
            tgt.allocatedAmount,
            tgt.allocatedAmount,
          ]
        );
      }
    }
  }

  // 6. Record Run record
  const runIns = await query(
    `INSERT INTO cost_allocation_runs
     (org_id, cycle_id, fiscal_year_id, period_id, run_number, run_date, total_allocated_amount, status, journal_entry_id, executed_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?)`,
    [
      orgId,
      cycleId,
      fiscalYearId,
      effectivePeriodId,
      runNumber,
      effectiveDate,
      sim.grandTotalAllocated,
      journalEntryId,
      userId,
      notes || `Exécution du cycle ${sim.cycleCode} (${sim.cycleName})`,
    ]
  );
  const runId = runIns.insertId;

  // 7. Record Run Lines
  for (const seg of sim.segments) {
    for (const tgt of seg.targets) {
      await query(
        `INSERT INTO cost_allocation_run_lines
         (run_id, segment_id, sender_cost_center_id, receiver_cost_center_id, allocated_amount, weight_pct, calculation_basis)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          seg.segmentId,
          seg.senderCostCenterId,
          tgt.receiverCostCenterId,
          tgt.allocatedAmount,
          tgt.weightPct,
          seg.senderPool,
        ]
      );
    }
  }

  return {
    runId,
    runNumber,
    cycleCode: sim.cycleCode,
    cycleName: sim.cycleName,
    runDate: effectiveDate,
    totalAllocatedAmount: sim.grandTotalAllocated,
    formattedTotal: money(sim.grandTotalAllocated),
    journalEntryId,
    status: 'posted',
    segmentsCount: sim.segments.length,
    receiversCount: sim.segments.reduce((acc, s) => acc + s.targets.length, 0),
  };
}

export async function listAllocationRuns({ query }, orgId, { cycleId = null, fiscalYearId = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (cycleId) {
    filter += ' AND car.cycle_id = ?';
    params.push(cycleId);
  }
  if (fiscalYearId) {
    filter += ' AND car.fiscal_year_id = ?';
    params.push(fiscalYearId);
  }

  return query(
    `SELECT car.*,
            cac.code AS cycle_code,
            cac.name AS cycle_name,
            cac.cycle_type,
            fy.code AS fiscal_year_code,
            u.full_name AS executed_by_name,
            je.entry_no AS journal_entry_number
       FROM cost_allocation_runs car
       JOIN cost_allocation_cycles cac ON cac.id = car.cycle_id
       JOIN fiscal_years fy ON fy.id = car.fiscal_year_id
       LEFT JOIN users u ON u.id = car.executed_by
       LEFT JOIN journal_entries je ON je.id = car.journal_entry_id
      WHERE car.org_id = ? ${filter}
      ORDER BY car.run_date DESC, car.created_at DESC`,
    params
  );
}
