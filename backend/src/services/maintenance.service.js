import { money } from '../utils/money.js';
import { toISO, addDays, addMonths, today, diffDays } from '../utils/dates.js';
import { ApiError } from '../utils/errors.js';
import { createJournalEntry, nextSequence } from './ledger.service.js';
import { refreshComplianceFlags, rollUpMaintenanceCost } from './asset.service.js';

/**
 * Preventive maintenance, work orders and compliance testing (SRS 5.9).
 *
 * The scheduler turns maintenance plans into work orders; closing a work order
 * or filing a certificate is what advances the schedule and lifts or applies a
 * use restriction. Cost flows through ledger.service so the total cost of
 * ownership on the asset and the maintenance charge in the ledger agree.
 */

const TEAM_BY_DOMAIN = { biomedical: 'biomedical', facility: 'facilities', fleet: 'fleet', it_office: 'it' };

const WO_TYPE_BY_PLAN = {
  preventive: 'preventive',
  calibration: 'calibration',
  safety_test: 'safety_test',
  inspection: 'inspection',
  statutory: 'inspection',
  vehicle_service: 'vehicle_service',
};

const OPEN_STATUSES = ['requested', 'approved', 'assigned', 'in_progress', 'on_hold', 'awaiting_parts'];

/**
 * FR-AM-020 :: generate the work orders that fall due inside the horizon.
 *
 * Re-runnable: a plan that already has an open work order is skipped, so the
 * nightly job and a manual run cannot produce duplicates.
 */
export async function runScheduler(tx, orgId, { horizonDays = 30, asOf = null, actor = null } = {}) {
  const from = toISO(asOf || today());
  const until = addDays(from, horizonDays);

  const due = await tx.query(
    `SELECT p.*, a.name AS asset_name, a.asset_tag, a.cost_center_id, a.location_id,
            a.status AS asset_status, a.usage_hours, c.domain, c.safety_test_standard
       FROM maintenance_plans p
       JOIN assets a ON a.id = p.asset_id
       JOIN asset_categories c ON c.id = a.category_id
      WHERE p.org_id = ? AND p.is_active = 1
        AND a.status NOT IN ('disposed','pending_disposal','draft')
        AND p.next_due_date IS NOT NULL AND p.next_due_date <= ?
        AND NOT EXISTS (
          SELECT 1 FROM work_orders w
           WHERE w.plan_id = p.id AND w.status IN (${OPEN_STATUSES.map(() => '?').join(',')})
        )
      ORDER BY p.next_due_date, p.priority DESC`,
    [orgId, until, ...OPEN_STATUSES]
  );

  const created = [];
  for (const plan of due) {
    const scheduled = toISO(plan.next_due_date);
    const wo = await createWorkOrder(
      tx, orgId,
      {
        assetId: plan.asset_id,
        planId: plan.id,
        type: WO_TYPE_BY_PLAN[plan.plan_type] || 'preventive',
        priority: plan.priority,
        title: `${plan.name} - ${plan.asset_tag}`,
        problemDescription: `Intervention planifiee par le plan ${plan.code} (echeance ${scheduled}).`,
        taskChecklist: plan.task_checklist,
        costCenterId: plan.cost_center_id,
        locationId: plan.location_id,
        scheduledDate: scheduled,
        dueDate: addDays(scheduled, plan.lead_time_days || 7),
        assignedTo: plan.default_technician_id,
        team: plan.assigned_team,
        serviceProviderId: plan.service_provider_id,
        // A planned visit is already authorised by the plan itself.
        autoApprove: true,
      },
      actor
    );
    await tx.query('UPDATE maintenance_plans SET last_generated_date = ? WHERE id = ?', [from, plan.id]);
    created.push({ ...wo, plan_code: plan.code, asset_tag: plan.asset_tag, scheduled_date: scheduled });
  }

  return { generated: created.length, horizon_to: until, work_orders: created };
}

/** FR-AM-021 :: a work order, whether planned or raised by ward staff. */
export async function createWorkOrder(tx, orgId, data, actor = null) {
  const asset = await tx.queryOne(
    `SELECT a.*, c.domain FROM assets a JOIN asset_categories c ON c.id = a.category_id
      WHERE a.id = ? AND a.org_id = ?`,
    [data.assetId, orgId]
  );
  if (!asset) throw new ApiError(404, 'Asset not found.');
  if (asset.status === 'disposed') throw new ApiError(409, 'A disposed asset cannot have work orders raised against it.');

  const woNo = await nextSequence(tx, orgId, 'work_order');
  const approved = Boolean(data.autoApprove);
  const status = approved ? (data.assignedTo ? 'assigned' : 'approved') : 'requested';

  const res = await tx.query(
    `INSERT INTO work_orders
       (org_id, wo_no, asset_id, plan_id, wo_type, priority, status, title, problem_description,
        task_checklist, cost_center_id, location_id, requested_by, approved_by, approved_at,
        assigned_to, assigned_team, service_provider_id, service_contract_id, assigned_at,
        scheduled_date, due_date, asset_took_offline, is_capitalizable, offline_sync_ref)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId, woNo, asset.id, data.planId ?? null,
      data.type || 'corrective', data.priority || 'normal', status,
      data.title, data.problemDescription ?? null, data.taskChecklist ?? null,
      data.costCenterId ?? asset.cost_center_id, data.locationId ?? asset.location_id,
      actor?.id ?? null,
      approved ? (actor?.id ?? null) : null, approved ? new Date() : null,
      data.assignedTo ?? null,
      data.team || TEAM_BY_DOMAIN[asset.domain] || 'biomedical',
      data.serviceProviderId ?? null, data.serviceContractId ?? null,
      data.assignedTo ? new Date() : null,
      data.scheduledDate ? toISO(data.scheduledDate) : null,
      data.dueDate ? toISO(data.dueDate) : null,
      data.takeOffline ? 1 : 0, data.isCapitalizable ? 1 : 0,
      data.offlineSyncRef ?? null,
    ]
  );

  // A failed device pulled from the ward has to stop being available for use.
  if (data.takeOffline) {
    await tx.query(
      `UPDATE assets SET status = 'out_of_service', use_restricted = 1,
              restriction_reason = ? WHERE id = ?`,
      [`Hors service sur intervention ${woNo}`, asset.id]
    );
  }

  return { id: res.insertId, wo_no: woNo, status, asset_id: asset.id };
}

/**
 * The status machine. Each action states which statuses it may be applied to,
 * so an out-of-order request is refused with a message naming the real state.
 */
const TRANSITIONS = {
  approve: { from: ['requested'], to: 'approved', permission: 'wo.approve' },
  reject: { from: ['requested'], to: 'rejected', permission: 'wo.approve' },
  assign: { from: ['requested', 'approved', 'on_hold', 'awaiting_parts'], to: 'assigned', permission: 'wo.assign' },
  start: { from: ['approved', 'assigned', 'on_hold', 'awaiting_parts'], to: 'in_progress', permission: 'wo.execute' },
  hold: { from: ['assigned', 'in_progress'], to: 'on_hold', permission: 'wo.execute' },
  await_parts: { from: ['assigned', 'in_progress'], to: 'awaiting_parts', permission: 'wo.execute' },
  complete: { from: ['in_progress', 'assigned'], to: 'completed', permission: 'wo.execute' },
  verify: { from: ['completed'], to: 'verified', permission: 'wo.verify' },
  cancel: { from: [...OPEN_STATUSES], to: 'cancelled', permission: 'wo.approve' },
};

export const workOrderActions = Object.keys(TRANSITIONS);

export async function transitionWorkOrder(tx, orgId, woId, action, data = {}, actor = null) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new ApiError(400, `"${action}" is not a work order action.`);

  const wo = await tx.queryOne('SELECT * FROM work_orders WHERE id = ? AND org_id = ?', [woId, orgId]);
  if (!wo) throw new ApiError(404, 'Work order not found.');
  if (!rule.from.includes(wo.status)) {
    throw new ApiError(409, `Work order ${wo.wo_no} is ${wo.status} and cannot be ${action}ed from there.`);
  }

  const sets = ["status = ?"];
  const params = [rule.to];
  const set = (sql, value) => { sets.push(sql); params.push(value); };

  if (action === 'approve') { set('approved_by = ?', actor?.id ?? null); sets.push('approved_at = NOW()'); }
  if (action === 'reject') {
    set('closure_notes = ?', data.reason ?? null);
    set('approved_by = ?', actor?.id ?? null);
    sets.push('approved_at = NOW()');
  }
  if (action === 'assign') {
    if (!data.assignedTo && !data.serviceProviderId) {
      throw new ApiError(422, 'Assign the work order to a technician or an external service provider.');
    }
    set('assigned_to = ?', data.assignedTo ?? null);
    set('service_provider_id = ?', data.serviceProviderId ?? null);
    if (data.team) set('assigned_team = ?', data.team);
    if (data.scheduledDate) set('scheduled_date = ?', toISO(data.scheduledDate));
    if (data.dueDate) set('due_date = ?', toISO(data.dueDate));
    sets.push('assigned_at = NOW()');
  }
  if (action === 'start') {
    sets.push('started_at = COALESCE(started_at, NOW())');
    if (data.takeOffline) set('asset_took_offline = ?', 1);
  }
  if (action === 'hold' || action === 'await_parts') set('closure_notes = ?', data.reason ?? null);
  if (action === 'cancel') set('closure_notes = ?', data.reason ?? null);

  if (action === 'complete') {
    if (!data.workPerformed || String(data.workPerformed).trim().length < 10) {
      throw new ApiError(422, 'Describe the work performed before closing the work order.');
    }
    sets.push('completed_at = NOW()');
    sets.push('started_at = COALESCE(started_at, NOW())');
    set('work_performed = ?', data.workPerformed);
    set('root_cause = ?', data.rootCause ?? null);
    set('closure_notes = ?', data.closureNotes ?? null);
    set('downtime_hours = ?', money(data.downtimeHours ?? wo.downtime_hours));
    set('external_cost = ?', money(data.externalCost ?? wo.external_cost));
    set('covered_by_warranty = ?', data.coveredByWarranty ? 1 : 0);
    set('covered_by_contract = ?', data.coveredByContract ? 1 : 0);
    if (data.isCapitalizable !== undefined) set('is_capitalizable = ?', data.isCapitalizable ? 1 : 0);
  }
  if (action === 'verify') {
    set('verified_by = ?', actor?.id ?? null);
    sets.push('verified_at = NOW()');
    if (data.closureNotes) set('closure_notes = ?', data.closureNotes);
  }

  await tx.query(`UPDATE work_orders SET ${sets.join(', ')} WHERE id = ?`, [...params, woId]);

  if (action === 'complete') await onWorkOrderCompleted(tx, orgId, woId, data, actor);
  if (action === 'cancel' || action === 'reject') await releaseAssetIfOffline(tx, wo);

  const after = await tx.queryOne('SELECT * FROM work_orders WHERE id = ?', [woId]);
  return after;
}

/**
 * Closing the work order is what advances the maintenance schedule, returns
 * the device to the ward and refreshes the cost of ownership.
 */
async function onWorkOrderCompleted(tx, orgId, woId, data, actor) {
  const wo = await tx.queryOne('SELECT * FROM work_orders WHERE id = ?', [woId]);
  await recalcWorkOrderCost(tx, woId);

  const completedOn = toISO(wo.completed_at || today());

  if (wo.plan_id) {
    const plan = await tx.queryOne('SELECT * FROM maintenance_plans WHERE id = ?', [wo.plan_id]);
    if (plan?.interval_months) {
      await tx.query('UPDATE maintenance_plans SET next_due_date = ? WHERE id = ?', [
        addMonths(completedOn, plan.interval_months),
        plan.id,
      ]);
    }
  }

  if (['preventive', 'vehicle_service', 'inspection'].includes(wo.wo_type)) {
    const category = await tx.queryOne(
      `SELECT c.pm_interval_months FROM assets a
         JOIN asset_categories c ON c.id = a.category_id WHERE a.id = ?`,
      [wo.asset_id]
    );
    await tx.query(
      'UPDATE assets SET last_pm_date = ?, next_pm_date = ? WHERE id = ?',
      [
        completedOn,
        category?.pm_interval_months ? addMonths(completedOn, category.pm_interval_months) : null,
        wo.asset_id,
      ]
    );
  }

  // Subsequent expenditure that extends the asset's life is capitalised under
  // IAS 16.13; routine servicing is an expense of the period. Either way the
  // posting is skipped when nothing was bought from outside the hospital, and
  // capitalisation is left to the accountant when the closer cannot post.
  const canPost = Boolean(actor?.permissions?.has('journal.post'));
  const external = await postableAmount(tx, woId);
  if (data.postCost !== false && external > 0 && (canPost || !wo.is_capitalizable)) {
    await postWorkOrderCost(tx, orgId, woId, {
      date: completedOn, actor, autoPost: canPost, overrideReason: data.overrideReason,
    });
  }

  await releaseAssetIfOffline(tx, wo, data.returnToService !== false);
  await rollUpMaintenanceCost(tx, orgId, wo.asset_id);
  await refreshComplianceFlags(tx, orgId, wo.asset_id);
}

async function releaseAssetIfOffline(tx, wo, returnToService = true) {
  if (!wo.asset_took_offline || !returnToService) return;
  await tx.query(
    `UPDATE assets
        SET status = CASE WHEN status IN ('out_of_service','under_maintenance','awaiting_parts')
                          THEN 'in_service' ELSE status END,
            use_restricted = 0, restriction_reason = NULL
      WHERE id = ?`,
    [wo.asset_id]
  );
}

/** Parts and labour are captured as they are used; cost is always derived. */
export async function addWorkOrderPart(tx, orgId, woId, data) {
  const wo = await requireOpenWorkOrder(tx, orgId, woId);
  const total = money(Number(data.quantity) * Number(data.unitCost));
  const res = await tx.query(
    `INSERT INTO work_order_parts
       (work_order_id, part_name, part_number, quantity, unit_cost, total_cost, supplier_id, is_consumed, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      wo.id, data.partName, data.partNumber ?? null, data.quantity, money(data.unitCost), total,
      data.supplierId ?? null, data.isConsumed === false ? 0 : 1, data.notes ?? null,
    ]
  );
  const totals = await recalcWorkOrderCost(tx, wo.id);
  return { id: res.insertId, total_cost: total, work_order: totals };
}

export async function addWorkOrderLabor(tx, orgId, woId, data) {
  const wo = await requireOpenWorkOrder(tx, orgId, woId);
  const cost = money(Number(data.hours) * Number(data.hourlyRate || 0));
  const res = await tx.query(
    `INSERT INTO work_order_labor
       (work_order_id, technician_id, technician_name, work_date, hours, hourly_rate, cost, is_external, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      wo.id, data.technicianId ?? null, data.technicianName ?? null,
      toISO(data.workDate || today()), data.hours, money(data.hourlyRate || 0), cost,
      data.isExternal ? 1 : 0, data.notes ?? null,
    ]
  );
  const totals = await recalcWorkOrderCost(tx, wo.id);
  return { id: res.insertId, cost, work_order: totals };
}

async function requireOpenWorkOrder(tx, orgId, woId) {
  const wo = await tx.queryOne('SELECT * FROM work_orders WHERE id = ? AND org_id = ?', [woId, orgId]);
  if (!wo) throw new ApiError(404, 'Work order not found.');
  if (!OPEN_STATUSES.includes(wo.status)) {
    throw new ApiError(409, `Work order ${wo.wo_no} is ${wo.status}; its costs can no longer be changed.`);
  }
  return wo;
}

export async function recalcWorkOrderCost(tx, woId) {
  const t = await tx.queryOne(
    `SELECT (SELECT COALESCE(SUM(hours), 0) FROM work_order_labor WHERE work_order_id = ?) AS hours,
            (SELECT COALESCE(SUM(cost), 0)  FROM work_order_labor WHERE work_order_id = ?) AS labor,
            (SELECT COALESCE(SUM(total_cost), 0) FROM work_order_parts WHERE work_order_id = ?) AS parts,
            external_cost
       FROM work_orders WHERE id = ?`,
    [woId, woId, woId, woId]
  );
  const total = money(Number(t.labor) + Number(t.parts) + Number(t.external_cost));
  await tx.query(
    'UPDATE work_orders SET labor_hours = ?, labor_cost = ?, parts_cost = ?, total_cost = ? WHERE id = ?',
    [money(t.hours), money(t.labor), money(t.parts), total, woId]
  );
  return {
    labor_hours: money(t.hours), labor_cost: money(t.labor), parts_cost: money(t.parts),
    external_cost: money(t.external_cost), total_cost: total,
  };
}

/**
 * The share of a work order that represents money spent outside the hospital:
 * parts, the external invoice, and contractor hours. The hours of the
 * hospital's own technicians are already carried in payroll, so charging them
 * to the maintenance account as well would count the same cost twice. They
 * still feed the cost-of-ownership roll-up, which is a management figure.
 */
async function postableAmount(tx, woId) {
  const t = await tx.queryOne(
    `SELECT w.parts_cost, w.external_cost,
            (SELECT COALESCE(SUM(cost), 0) FROM work_order_labor
              WHERE work_order_id = w.id AND is_external = 1) AS external_labor
       FROM work_orders w WHERE w.id = ?`,
    [woId]
  );
  return money(Number(t.parts_cost) + Number(t.external_cost) + Number(t.external_labor));
}

/**
 * Posts the cost of a closed work order: an expense on the category's
 * maintenance account, or an addition to the asset's cost when the work is
 * capitalisable subsequent expenditure (IAS 16.13, and the same treatment
 * under OHADA, so the entry carries the `both` framework).
 */
export async function postWorkOrderCost(tx, orgId, woId, opts = {}) {
  const wo = await tx.queryOne('SELECT * FROM work_orders WHERE id = ? AND org_id = ?', [woId, orgId]);
  if (!wo) throw new ApiError(404, 'Work order not found.');
  if (wo.entry_id) {
    const existing = await tx.queryOne('SELECT entry_no, status FROM journal_entries WHERE id = ?', [wo.entry_id]);
    throw new ApiError(
      409,
      `The cost of work order ${wo.wo_no} is already on entry ${existing.entry_no} (${existing.status}).`
    );
  }

  const amount = await postableAmount(tx, woId);
  if (amount <= 0) {
    throw new ApiError(
      422,
      `Work order ${wo.wo_no} has no external cost to post; in-house labour is already carried in payroll.`
    );
  }

  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ?', [wo.asset_id]);
  const category = await tx.queryOne('SELECT * FROM asset_categories WHERE id = ?', [asset.category_id]);

  const capitalize = Boolean(wo.is_capitalizable);
  const debitAccountId = capitalize ? category.asset_account_id : category.maintenance_account_id;
  if (!debitAccountId) {
    throw new ApiError(
      422,
      `Category ${category.code} has no ${capitalize ? 'fixed-asset' : 'maintenance'} account configured.`
    );
  }

  const date = toISO(opts.date || wo.completed_at || today());
  const creditCode = opts.creditAccountCode || '401';
  // A technician closing a work order records the cost but does not commit it
  // to the ledger; the entry waits as a draft for someone who may post.
  const autoPost = opts.autoPost ?? Boolean(opts.actor?.permissions?.has('journal.post'));
  if (capitalize && !autoPost) {
    // Raising the asset's cost against an unposted entry would put the
    // register ahead of the ledger, so capitalisation needs a poster.
    throw new ApiError(403, 'Capitalising an improvement requires the journal.post permission.');
  }

  const entry = await createJournalEntry(tx, {
    orgId,
    journalCode: capitalize ? 'IMM' : 'ACH',
    date,
    description: `${capitalize ? 'Improvement' : 'Maintenance'} ${asset.asset_tag} - ${wo.wo_no}`,
    reference: wo.wo_no,
    source: 'work_order',
    sourceRef: wo.wo_no,
    framework: 'both',
    currency: asset.currency,
    autoPost,
    actor: opts.actor,
    overrideReason: opts.overrideReason,
    lines: [
      {
        accountId: debitAccountId,
        assetId: asset.id,
        costCenterId: wo.cost_center_id ?? asset.cost_center_id,
        description: wo.title,
        debit: amount,
        credit: 0,
      },
      {
        accountCode: creditCode,
        description: `${wo.wo_no} - ${asset.asset_tag}`,
        debit: 0,
        credit: amount,
        partnerType: wo.service_provider_id ? 'supplier' : 'none',
        partnerId: wo.service_provider_id,
      },
    ],
  });

  await tx.query('UPDATE work_orders SET entry_id = ? WHERE id = ?', [entry.id, woId]);

  if (capitalize) {
    // The improvement is depreciated over the remaining life on both bases.
    await tx.query(
      `UPDATE assets
          SET ohada_cost = ohada_cost + ?, ohada_nbv = ohada_nbv + ?,
              ifrs_cost  = ifrs_cost  + ?, ifrs_nbv  = ifrs_nbv  + ?
        WHERE id = ?`,
      [amount, amount, amount, amount, asset.id]
    );
  }

  return {
    entry,
    capitalized: capitalize,
    amount,
    in_house_labour_excluded: money(Number(wo.total_cost) - amount),
  };
}

/** FR-AM-022 :: file a calibration certificate and reset the schedule. */
export async function recordCalibration(tx, orgId, assetId, data, actor = null) {
  const asset = await tx.queryOne(
    `SELECT a.*, c.name AS category_name, c.requires_calibration,
            c.calibration_interval_months AS category_interval_months
       FROM assets a JOIN asset_categories c ON c.id = a.category_id
      WHERE a.id = ? AND a.org_id = ?`,
    [assetId, orgId]
  );
  if (!asset) throw new ApiError(404, 'Asset not found.');
  if (asset.status === 'disposed') throw new ApiError(409, 'A disposed asset cannot be calibrated.');

  const date = toISO(data.calibrationDate || today());
  const interval = data.intervalMonths || asset.calibration_interval_months || asset.category_interval_months || 12;
  // A failed calibration must come back sooner than the routine interval, and
  // the device cannot be used in the meantime.
  const failed = data.result === 'fail' || data.result === 'indeterminate';
  const nextDue = failed ? addDays(date, 30) : addMonths(date, interval);

  const res = await tx.query(
    `INSERT INTO calibrations
       (org_id, asset_id, work_order_id, calibration_date, performed_by_type, performed_by_user_id,
        provider_name, standard_reference, reference_equipment, parameter_tested, measured_value,
        nominal_value, deviation, tolerance, result, adjustment_made, interval_months, next_due_date,
        certificate_no, cost, notes, recorded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId, assetId, data.workOrderId ?? null, date,
      data.performedByType || 'internal', data.performedByUserId ?? null,
      data.providerName ?? null, data.standardReference ?? null, data.referenceEquipment ?? null,
      data.parameterTested ?? null, data.measuredValue ?? null, data.nominalValue ?? null,
      data.deviation ?? null, data.tolerance ?? null, data.result,
      data.adjustmentMade ? 1 : 0, interval, nextDue,
      data.certificateNo ?? null, money(data.cost || 0), data.notes ?? null, actor?.id ?? null,
    ]
  );

  await tx.query(
    'UPDATE assets SET last_calibration_date = ?, next_calibration_date = ? WHERE id = ?',
    [date, nextDue, assetId]
  );

  if (failed) {
    await tx.query(
      `UPDATE assets SET use_restricted = 1, restriction_reason = ?,
              status = CASE WHEN status = 'in_service' THEN 'quarantined' ELSE status END
        WHERE id = ?`,
      [`Etalonnage non conforme du ${date} - appareil consigne`, assetId]
    );
  } else {
    await clearComplianceQuarantine(tx, orgId, assetId);
  }
  await rollUpMaintenanceCost(tx, orgId, assetId);

  return { id: res.insertId, next_due_date: nextDue, interval_months: interval, restricted: failed };
}

/** FR-AM-022 :: electrical safety test (IEC 60601) with the same schedule reset. */
export async function recordSafetyTest(tx, orgId, assetId, data, actor = null) {
  const asset = await tx.queryOne(
    `SELECT a.*, c.safety_test_standard, c.safety_interval_months
       FROM assets a JOIN asset_categories c ON c.id = a.category_id
      WHERE a.id = ? AND a.org_id = ?`,
    [assetId, orgId]
  );
  if (!asset) throw new ApiError(404, 'Asset not found.');
  if (asset.status === 'disposed') throw new ApiError(409, 'A disposed asset cannot be safety tested.');

  const date = toISO(data.testDate || today());
  const interval = data.intervalMonths || asset.safety_interval_months || 12;
  const failed = data.result === 'fail';
  const nextDue = failed ? addDays(date, 30) : addMonths(date, interval);

  const res = await tx.query(
    `INSERT INTO safety_tests
       (org_id, asset_id, work_order_id, test_date, test_standard, applied_part_type,
        earth_continuity_ohm, insulation_resistance_mohm, earth_leakage_ua, enclosure_leakage_ua,
        patient_leakage_ua, visual_inspection_ok, functional_test_ok, result, defects_found,
        tested_by, tester_name, test_equipment, certificate_no, interval_months, next_due_date, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId, assetId, data.workOrderId ?? null, date,
      data.testStandard || asset.safety_test_standard || 'IEC 60601',
      data.appliedPartType || 'none',
      data.earthContinuityOhm ?? null, data.insulationResistanceMohm ?? null,
      data.earthLeakageUa ?? null, data.enclosureLeakageUa ?? null, data.patientLeakageUa ?? null,
      data.visualInspectionOk === false ? 0 : 1, data.functionalTestOk === false ? 0 : 1,
      data.result, data.defectsFound ?? null,
      actor?.id ?? null, data.testerName ?? actor?.name ?? null, data.testEquipment ?? null,
      data.certificateNo ?? null, interval, nextDue, data.notes ?? null,
    ]
  );

  await tx.query(
    'UPDATE assets SET last_safety_test_date = ?, next_safety_test_date = ? WHERE id = ?',
    [date, nextDue, assetId]
  );

  if (failed) {
    await tx.query(
      `UPDATE assets SET use_restricted = 1, restriction_reason = ?,
              status = CASE WHEN status = 'in_service' THEN 'out_of_service' ELSE status END
        WHERE id = ?`,
      [`Controle de securite electrique non conforme du ${date} - appareil consigne`, assetId]
    );
  } else {
    await clearComplianceQuarantine(tx, orgId, assetId);
  }

  return { id: res.insertId, next_due_date: nextDue, interval_months: interval, restricted: failed };
}

/**
 * A device consigned by a failed test comes back only when nothing else is
 * outstanding: the sweep decides whether the restriction stands, and the
 * quarantine status is lifted only if it agrees.
 */
async function clearComplianceQuarantine(tx, orgId, assetId) {
  // A device still stripped down on an open repair stays out of service even
  // though its certificate is now in order.
  const blocking = await tx.queryOne(
    `SELECT wo_no FROM work_orders
      WHERE asset_id = ? AND asset_took_offline = 1
        AND status IN (${OPEN_STATUSES.map(() => '?').join(',')}) LIMIT 1`,
    [assetId, ...OPEN_STATUSES]
  );
  if (!blocking) {
    await tx.query(
      `UPDATE assets
          SET status = CASE WHEN status IN ('quarantined','calibration_overdue','out_of_service')
                            THEN 'in_service' ELSE status END,
              use_restricted = 0, restriction_reason = NULL
        WHERE id = ? AND org_id = ?`,
      [assetId, orgId]
    );
  }
  // The sweep has the last word: another overdue certificate re-applies the
  // restriction straight away.
  await refreshComplianceFlags(tx, orgId, assetId);
}

/**
 * FR-AM-023 :: move contracts through expiring / expired so the renewal alert
 * is driven by data rather than by someone remembering to look.
 */
export async function refreshContractStatus(tx, orgId, asOf = null) {
  const now = toISO(asOf || today());
  const rows = await tx.query(
    `SELECT id, contract_no, end_date, alert_days_before, status FROM service_contracts
      WHERE org_id = ? AND status IN ('active','expiring','expired')`,
    [orgId]
  );

  let changed = 0;
  for (const c of rows) {
    const days = diffDays(now, c.end_date);
    const next = days < 0 ? 'expired' : days <= (c.alert_days_before || 60) ? 'expiring' : 'active';
    if (next !== c.status) {
      await tx.query('UPDATE service_contracts SET status = ? WHERE id = ?', [next, c.id]);
      changed += 1;
    }
  }
  return { reviewed: rows.length, changed };
}

/**
 * The compliance and maintenance picture the dashboard and the technician's
 * worklist are both built from.
 */
export async function maintenanceOverview(db, orgId, { asOf = null, horizonDays = 30 } = {}) {
  const now = toISO(asOf || today());
  const soon = addDays(now, horizonDays);

  const [counts, workload, dueSoon, overdue, contracts] = await Promise.all([
    db.queryOne(
      `SELECT
         SUM(status IN ('requested')) AS awaiting_approval,
         SUM(status IN ('approved','assigned')) AS scheduled,
         SUM(status = 'in_progress') AS in_progress,
         SUM(status IN ('on_hold','awaiting_parts')) AS blocked,
         SUM(status = 'completed') AS awaiting_verification,
         SUM(status IN (${OPEN_STATUSES.map(() => '?').join(',')}) AND due_date < ?) AS past_due,
         COALESCE(SUM(CASE WHEN status IN ('completed','verified') THEN total_cost END), 0) AS closed_cost
       FROM work_orders WHERE org_id = ?`,
      [...OPEN_STATUSES, now, orgId]
    ),
    db.query(
      `SELECT u.id, u.full_name, COUNT(w.id) AS open_work_orders,
              SUM(w.priority = 'emergency') AS emergencies,
              SUM(w.due_date < ?) AS past_due
         FROM work_orders w JOIN users u ON u.id = w.assigned_to
        WHERE w.org_id = ? AND w.status IN (${OPEN_STATUSES.map(() => '?').join(',')})
        GROUP BY u.id ORDER BY open_work_orders DESC`,
      [now, orgId, ...OPEN_STATUSES]
    ),
    db.query(
      `SELECT a.id, a.asset_tag, a.name, a.next_pm_date, a.next_calibration_date, a.next_safety_test_date,
              c.domain, l.name AS location_name
         FROM assets a
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN asset_locations l ON l.id = a.location_id
        WHERE a.org_id = ? AND a.status NOT IN ('disposed','pending_disposal')
          AND (a.next_pm_date BETWEEN ? AND ? OR a.next_calibration_date BETWEEN ? AND ?
               OR a.next_safety_test_date BETWEEN ? AND ?)
        ORDER BY LEAST(COALESCE(a.next_pm_date, '9999-12-31'),
                       COALESCE(a.next_calibration_date, '9999-12-31'),
                       COALESCE(a.next_safety_test_date, '9999-12-31'))`,
      [orgId, now, soon, now, soon, now, soon]
    ),
    db.query(
      `SELECT a.id, a.asset_tag, a.name, a.status, a.use_restricted, a.restriction_reason,
              a.next_calibration_date, a.next_safety_test_date, a.next_pm_date, c.domain
         FROM assets a JOIN asset_categories c ON c.id = a.category_id
        WHERE a.org_id = ? AND a.status NOT IN ('disposed','pending_disposal')
          AND (a.next_pm_date < ? OR a.next_calibration_date < ? OR a.next_safety_test_date < ?)
        ORDER BY a.use_restricted DESC, a.asset_tag`,
      [orgId, now, now, now]
    ),
    db.query(
      `SELECT sc.id, sc.contract_no, sc.title, sc.end_date, sc.status, sc.annual_value,
              s.name AS supplier_name, COUNT(sca.asset_id) AS asset_count,
              DATEDIFF(sc.end_date, ?) AS days_to_expiry
         FROM service_contracts sc
         JOIN suppliers s ON s.id = sc.supplier_id
         LEFT JOIN service_contract_assets sca ON sca.contract_id = sc.id
        WHERE sc.org_id = ? AND sc.status IN ('active','expiring','expired')
        GROUP BY sc.id ORDER BY sc.end_date`,
      [now, orgId]
    ),
  ]);

  return {
    as_of: now,
    horizon_to: soon,
    work_orders: {
      awaiting_approval: Number(counts.awaiting_approval || 0),
      scheduled: Number(counts.scheduled || 0),
      in_progress: Number(counts.in_progress || 0),
      blocked: Number(counts.blocked || 0),
      awaiting_verification: Number(counts.awaiting_verification || 0),
      past_due: Number(counts.past_due || 0),
      closed_cost: money(counts.closed_cost || 0),
    },
    technician_workload: workload,
    due_soon: dueSoon,
    overdue,
    restricted: overdue.filter((a) => Number(a.use_restricted) === 1).length,
    contracts,
  };
}

/** FR-AM-021 :: uptime and mean time between failures, per asset. */
export async function reliabilityByAsset(db, orgId, { from, to, domain = null } = {}) {
  const rows = await db.query(
    `SELECT a.id, a.asset_tag, a.name, c.domain, a.criticality,
            cc.name AS cost_center_name,
            a.ohada_cost, a.total_maintenance_cost,
            COUNT(w.id) AS work_orders,
            SUM(w.wo_type = 'corrective') AS failures,
            COALESCE(SUM(w.downtime_hours), 0) AS downtime_hours,
            COALESCE(SUM(w.total_cost), 0) AS period_cost
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
       LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
       LEFT JOIN work_orders w ON w.asset_id = a.id
            AND COALESCE(DATE(w.completed_at), w.scheduled_date, DATE(w.requested_at)) BETWEEN ? AND ?
      WHERE a.org_id = ? AND a.status <> 'disposed'
        ${domain ? 'AND c.domain = ?' : ''}
      GROUP BY a.id
      HAVING work_orders > 0
      ORDER BY downtime_hours DESC, failures DESC`,
    domain ? [from, to, orgId, domain] : [from, to, orgId]
  );

  const hoursInPeriod = (diffDays(from, to) + 1) * 24;
  return rows.map((r) => {
    const downtime = Number(r.downtime_hours);
    const failures = Number(r.failures);
    return {
      ...r,
      availability_pct: money(Math.max(0, ((hoursInPeriod - downtime) / hoursInPeriod) * 100)),
      // Mean time between failures over the observed uptime.
      mtbf_hours: failures > 0 ? money((hoursInPeriod - downtime) / failures) : null,
      mttr_hours: failures > 0 ? money(downtime / failures) : null,
      // A device whose repairs approach its value is a replacement candidate.
      maintenance_to_cost_pct: Number(r.ohada_cost) > 0
        ? money((Number(r.total_maintenance_cost) / Number(r.ohada_cost)) * 100)
        : null,
    };
  });
}

export const openWorkOrderStatuses = OPEN_STATUSES;
