import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  runScheduler, createWorkOrder, transitionWorkOrder, workOrderActions,
  addWorkOrderPart, addWorkOrderLabor, postWorkOrderCost,
  recordCalibration, recordSafetyTest, refreshContractStatus,
  maintenanceOverview, reliabilityByAsset, openWorkOrderStatuses,
} from '../services/maintenance.service.js';
import { notFound } from '../utils/errors.js';
import { today } from '../utils/dates.js';
import { actorOf, isoDate, optionalId, boolish, pagination, paged } from './helpers.js';

export const maintenanceRoutes = Router();

// --- preventive maintenance plans (FR-AM-020) ------------------------------

maintenanceRoutes.get(
  '/maintenance-plans',
  requirePermission('maint.plan.view'),
  validate({
    query: pagination.extend({
      assetId: optionalId,
      planType: z.enum(['preventive', 'calibration', 'safety_test', 'inspection', 'statutory', 'vehicle_service']).optional(),
      team: z.enum(['biomedical', 'facilities', 'it', 'fleet', 'external']).optional(),
      dueBefore: isoDate.optional(),
      activeOnly: boolish.default(true),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query;
    const params = [req.orgId];
    let filter = '';
    if (q.activeOnly) filter += ' AND p.is_active = 1';
    if (q.assetId) { filter += ' AND p.asset_id = ?'; params.push(q.assetId); }
    if (q.planType) { filter += ' AND p.plan_type = ?'; params.push(q.planType); }
    if (q.team) { filter += ' AND p.assigned_team = ?'; params.push(q.team); }
    if (q.dueBefore) { filter += ' AND p.next_due_date <= ?'; params.push(q.dueBefore); }

    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM maintenance_plans p WHERE p.org_id = ?${filter}`, params
    );
    const rows = await query(
      `SELECT p.*, a.asset_tag, a.name AS asset_name, a.status AS asset_status,
              c.domain, u.full_name AS default_technician_name, s.name AS service_provider_name,
              (SELECT COUNT(*) FROM work_orders w
                WHERE w.plan_id = p.id
                  AND w.status IN (${openWorkOrderStatuses.map(() => '?').join(',')})) AS open_work_orders
         FROM maintenance_plans p
         JOIN assets a ON a.id = p.asset_id
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN users u ON u.id = p.default_technician_id
         LEFT JOIN suppliers s ON s.id = p.service_provider_id
        WHERE p.org_id = ?${filter}
        ORDER BY p.next_due_date IS NULL, p.next_due_date
        LIMIT ? OFFSET ?`,
      [...openWorkOrderStatuses, ...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json(paged(rows, Number(total), q));
  })
);

maintenanceRoutes.patch(
  '/maintenance-plans/:id',
  requirePermission('maint.plan.manage'),
  validate({
    body: z.object({
      name: z.string().trim().min(1).max(200).optional(),
      intervalMonths: z.coerce.number().int().min(1).max(600).optional().nullable(),
      intervalHours: z.coerce.number().int().min(1).optional().nullable(),
      intervalKm: z.coerce.number().int().min(1).optional().nullable(),
      intervalSource: z.enum(['manufacturer', 'local_regulation', 'internal', 'who_guideline']).optional(),
      taskChecklist: z.string().trim().max(4000).optional().nullable(),
      estimatedHours: z.coerce.number().min(0).optional(),
      requiredSkill: z.string().trim().max(100).optional().nullable(),
      defaultTechnicianId: optionalId.nullable(),
      assignedTeam: z.enum(['biomedical', 'facilities', 'it', 'fleet', 'external']).optional(),
      serviceProviderId: optionalId.nullable(),
      leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
      priority: z.enum(['low', 'normal', 'high', 'emergency']).optional(),
      nextDueDate: isoDate.optional().nullable(),
      isActive: boolish.optional(),
    }),
  }),
  handler(async (req, res) => {
    const before = await queryOne('SELECT * FROM maintenance_plans WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!before) throw notFound('Maintenance plan not found.');

    const COLUMN = {
      name: 'name', intervalMonths: 'interval_months', intervalHours: 'interval_hours',
      intervalKm: 'interval_km', intervalSource: 'interval_source', taskChecklist: 'task_checklist',
      estimatedHours: 'estimated_hours', requiredSkill: 'required_skill',
      defaultTechnicianId: 'default_technician_id', assignedTeam: 'assigned_team',
      serviceProviderId: 'service_provider_id', leadTimeDays: 'lead_time_days',
      priority: 'priority', nextDueDate: 'next_due_date', isActive: 'is_active',
    };
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(req.body)) {
      if (value === undefined) continue;
      sets.push(`${COLUMN[key]} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
    if (sets.length === 0) return res.json({ plan: before });

    await query(`UPDATE maintenance_plans SET ${sets.join(', ')} WHERE id = ?`, [...params, before.id]);
    const after = await queryOne('SELECT * FROM maintenance_plans WHERE id = ?', [before.id]);

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'update', entity: 'maintenance_plan', entityId: before.id,
      summary: `Plan ${before.code} modifie`, before, after, context: requestContext(req),
    });
    res.json({ plan: after });
  })
);

/** The scheduler: turns plans that fall due into work orders (FR-AM-020). */
maintenanceRoutes.post(
  '/maintenance-plans/run-scheduler',
  requirePermission('maint.plan.manage'),
  validate({
    body: z.object({
      horizonDays: z.coerce.number().int().min(0).max(365).default(30),
      asOf: isoDate.optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      runScheduler(tx, req.orgId, { ...req.body, actor: actorOf(req) })
    );
    if (result.generated > 0) {
      await writeAudit({
        orgId: req.orgId, userId: req.user.id, action: 'schedule', entity: 'work_order', entityId: null,
        summary: `${result.generated} ordre(s) de travail genere(s) par le planificateur jusqu au ${result.horizon_to}`,
        after: result.work_orders, context: requestContext(req),
      });
    }
    res.json(result);
  })
);

// --- work orders (FR-AM-021) ----------------------------------------------

maintenanceRoutes.get(
  '/work-orders',
  requirePermission('wo.view'),
  validate({
    query: pagination.extend({
      search: z.string().trim().optional(),
      assetId: optionalId,
      assignedTo: optionalId,
      status: z.string().trim().optional(),
      openOnly: boolish.optional(),
      pastDueOnly: boolish.optional(),
      type: z.string().trim().optional(),
      priority: z.enum(['low', 'normal', 'high', 'emergency']).optional(),
      team: z.enum(['biomedical', 'facilities', 'it', 'fleet', 'external']).optional(),
      mine: boolish.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query;
    const params = [req.orgId];
    let filter = '';
    const list = (column, csv) => {
      const values = csv.split(',').map((s) => s.trim()).filter(Boolean);
      filter += ` AND ${column} IN (${values.map(() => '?').join(',')})`;
      params.push(...values);
    };

    if (q.assetId) { filter += ' AND w.asset_id = ?'; params.push(q.assetId); }
    if (q.mine) { filter += ' AND w.assigned_to = ?'; params.push(req.user.id); }
    else if (q.assignedTo) { filter += ' AND w.assigned_to = ?'; params.push(q.assignedTo); }
    if (q.priority) { filter += ' AND w.priority = ?'; params.push(q.priority); }
    if (q.team) { filter += ' AND w.assigned_team = ?'; params.push(q.team); }
    if (q.type) list('w.wo_type', q.type);
    if (q.status) list('w.status', q.status);
    if (q.openOnly) list('w.status', openWorkOrderStatuses.join(','));
    if (q.pastDueOnly) { filter += ' AND w.due_date < ?'; params.push(today()); }
    if (q.from) { filter += ' AND COALESCE(DATE(w.completed_at), w.scheduled_date, DATE(w.requested_at)) >= ?'; params.push(q.from); }
    if (q.to) { filter += ' AND COALESCE(DATE(w.completed_at), w.scheduled_date, DATE(w.requested_at)) <= ?'; params.push(q.to); }
    if (q.search) {
      filter += ' AND (w.wo_no LIKE ? OR w.title LIKE ? OR a.asset_tag LIKE ? OR a.name LIKE ?)';
      const like = `%${q.search}%`;
      params.push(like, like, like, like);
    }

    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM work_orders w JOIN assets a ON a.id = w.asset_id WHERE w.org_id = ?${filter}`,
      params
    );
    const rows = await query(
      `SELECT w.id, w.wo_no, w.wo_type, w.priority, w.status, w.title, w.scheduled_date, w.due_date,
              w.requested_at, w.started_at, w.completed_at, w.verified_at, w.assigned_team,
              w.labor_hours, w.labor_cost, w.parts_cost, w.external_cost, w.total_cost,
              w.downtime_hours, w.asset_took_offline, w.is_capitalizable, w.entry_id,
              w.covered_by_warranty, w.covered_by_contract,
              a.asset_tag, a.name AS asset_name, c.domain,
              cc.name AS cost_center_name, l.name AS location_name,
              ru.full_name AS requested_by_name, au.full_name AS assigned_to_name,
              s.name AS service_provider_name, e.entry_no,
              (w.due_date IS NOT NULL AND w.due_date < ?
               AND w.status IN (${openWorkOrderStatuses.map(() => '?').join(',')})) AS is_past_due
         FROM work_orders w
         JOIN assets a ON a.id = w.asset_id
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN cost_centers cc ON cc.id = w.cost_center_id
         LEFT JOIN asset_locations l ON l.id = w.location_id
         LEFT JOIN users ru ON ru.id = w.requested_by
         LEFT JOIN users au ON au.id = w.assigned_to
         LEFT JOIN suppliers s ON s.id = w.service_provider_id
         LEFT JOIN journal_entries e ON e.id = w.entry_id
        WHERE w.org_id = ?${filter}
        ORDER BY FIELD(w.priority, 'emergency', 'high', 'normal', 'low'),
                 w.due_date IS NULL, w.due_date, w.id DESC
        LIMIT ? OFFSET ?`,
      [today(), ...openWorkOrderStatuses, ...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json(paged(rows, Number(total), q));
  })
);

maintenanceRoutes.get(
  '/work-orders/:id',
  requirePermission('wo.view'),
  handler(async (req, res) => {
    const wo = await queryOne(
      `SELECT w.*, a.asset_tag, a.name AS asset_name, a.serial_number, a.status AS asset_status,
              a.manufacturer, a.model, a.criticality, c.domain, c.safety_test_standard,
              cc.name AS cost_center_name, l.name AS location_name,
              ru.full_name AS requested_by_name, ap.full_name AS approved_by_name,
              au.full_name AS assigned_to_name, vu.full_name AS verified_by_name,
              s.name AS service_provider_name, sc.contract_no, e.entry_no, p.code AS plan_code
         FROM work_orders w
         JOIN assets a ON a.id = w.asset_id
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN cost_centers cc ON cc.id = w.cost_center_id
         LEFT JOIN asset_locations l ON l.id = w.location_id
         LEFT JOIN users ru ON ru.id = w.requested_by
         LEFT JOIN users ap ON ap.id = w.approved_by
         LEFT JOIN users au ON au.id = w.assigned_to
         LEFT JOIN users vu ON vu.id = w.verified_by
         LEFT JOIN suppliers s ON s.id = w.service_provider_id
         LEFT JOIN service_contracts sc ON sc.id = w.service_contract_id
         LEFT JOIN journal_entries e ON e.id = w.entry_id
         LEFT JOIN maintenance_plans p ON p.id = w.plan_id
        WHERE w.id = ? AND w.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!wo) throw notFound('Work order not found.');

    const [parts, labor, calibrations, safetyTests] = await Promise.all([
      query(
        `SELECT wp.*, s.name AS supplier_name FROM work_order_parts wp
           LEFT JOIN suppliers s ON s.id = wp.supplier_id
          WHERE wp.work_order_id = ? ORDER BY wp.id`,
        [wo.id]
      ),
      query(
        `SELECT wl.*, u.full_name AS technician_full_name FROM work_order_labor wl
           LEFT JOIN users u ON u.id = wl.technician_id
          WHERE wl.work_order_id = ? ORDER BY wl.work_date, wl.id`,
        [wo.id]
      ),
      query('SELECT * FROM calibrations WHERE work_order_id = ?', [wo.id]),
      query('SELECT * FROM safety_tests WHERE work_order_id = ?', [wo.id]),
    ]);

    res.json({ work_order: wo, parts, labor, calibrations, safety_tests: safetyTests });
  })
);

maintenanceRoutes.post(
  '/work-orders',
  requirePermission('wo.request'),
  validate({
    body: z.object({
      assetId: z.coerce.number().int().positive(),
      type: z.enum(['preventive', 'corrective', 'calibration', 'safety_test', 'inspection', 'installation', 'vehicle_service']).default('corrective'),
      priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
      title: z.string().trim().min(5).max(200),
      problemDescription: z.string().trim().max(2000).optional().nullable(),
      taskChecklist: z.string().trim().max(4000).optional().nullable(),
      costCenterId: optionalId.nullable(),
      locationId: optionalId.nullable(),
      scheduledDate: isoDate.optional().nullable(),
      dueDate: isoDate.optional().nullable(),
      assignedTo: optionalId.nullable(),
      team: z.enum(['biomedical', 'facilities', 'it', 'fleet', 'external']).optional(),
      serviceProviderId: optionalId.nullable(),
      serviceContractId: optionalId.nullable(),
      takeOffline: boolish.default(false),
      isCapitalizable: boolish.default(false),
      offlineSyncRef: z.string().trim().max(60).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    // Ward staff raise a request; only someone who can approve may open a work
    // order that is already authorised or already assigned.
    const canApprove = req.user.permissions.includes('wo.approve');
    const canAssign = req.user.permissions.includes('wo.assign');
    const body = {
      ...req.body,
      autoApprove: canApprove,
      assignedTo: canAssign ? req.body.assignedTo : null,
    };

    const created = await transaction((tx) => createWorkOrder(tx, req.orgId, body, actorOf(req)));
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'work_order', entityId: created.id,
      summary: `Ordre de travail ${created.wo_no} (${req.body.priority}) : ${req.body.title}`,
      after: created, context: requestContext(req),
    });
    res.status(201).json({ work_order: created });
  })
);

const ACTION_PERMISSION = {
  approve: 'wo.approve', reject: 'wo.approve', cancel: 'wo.approve',
  assign: 'wo.assign',
  start: 'wo.execute', hold: 'wo.execute', await_parts: 'wo.execute', complete: 'wo.execute',
  verify: 'wo.verify',
};

const actionBody = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  assignedTo: optionalId.nullable(),
  serviceProviderId: optionalId.nullable(),
  team: z.enum(['biomedical', 'facilities', 'it', 'fleet', 'external']).optional(),
  scheduledDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  takeOffline: boolish.optional(),
  workPerformed: z.string().trim().max(4000).optional(),
  rootCause: z.string().trim().max(500).optional().nullable(),
  closureNotes: z.string().trim().max(2000).optional().nullable(),
  downtimeHours: z.coerce.number().min(0).max(100000).optional(),
  externalCost: z.coerce.number().min(0).optional(),
  coveredByWarranty: boolish.optional(),
  coveredByContract: boolish.optional(),
  isCapitalizable: boolish.optional(),
  returnToService: boolish.optional(),
  postCost: boolish.optional(),
  overrideReason: z.string().trim().max(500).optional(),
}).default({});

for (const action of workOrderActions) {
  maintenanceRoutes.post(
    `/work-orders/:id/${action}`,
    requirePermission(ACTION_PERMISSION[action]),
    validate({ body: actionBody }),
    handler(async (req, res) => {
      const after = await transaction((tx) =>
        transitionWorkOrder(tx, req.orgId, Number(req.params.id), action, req.body, actorOf(req))
      );
      await writeAudit({
        orgId: req.orgId, userId: req.user.id, action: `wo_${action}`, entity: 'work_order',
        entityId: after.id,
        summary: `Ordre de travail ${after.wo_no} -> ${after.status}`
          + (req.body.reason ? ` : ${req.body.reason}` : ''),
        after, context: requestContext(req),
      });
      res.json({ work_order: after });
    })
  );
}

maintenanceRoutes.post(
  '/work-orders/:id/parts',
  requirePermission('wo.execute'),
  validate({
    body: z.object({
      partName: z.string().trim().min(1).max(200),
      partNumber: z.string().trim().max(80).optional().nullable(),
      quantity: z.coerce.number().positive(),
      unitCost: z.coerce.number().min(0),
      supplierId: optionalId.nullable(),
      isConsumed: boolish.default(true),
      notes: z.string().trim().max(300).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) => addWorkOrderPart(tx, req.orgId, Number(req.params.id), req.body));
    res.status(201).json(result);
  })
);

maintenanceRoutes.post(
  '/work-orders/:id/labor',
  requirePermission('wo.execute'),
  validate({
    body: z.object({
      technicianId: optionalId.nullable(),
      technicianName: z.string().trim().max(150).optional().nullable(),
      workDate: isoDate.optional(),
      hours: z.coerce.number().positive().max(1000),
      hourlyRate: z.coerce.number().min(0).default(0),
      isExternal: boolish.default(false),
      notes: z.string().trim().max(300).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const body = { ...req.body, technicianId: req.body.technicianId ?? req.user.id };
    const result = await transaction((tx) => addWorkOrderLabor(tx, req.orgId, Number(req.params.id), body));
    res.status(201).json(result);
  })
);

/** Posts a closed work order's external cost when it was held back at closure. */
maintenanceRoutes.post(
  '/work-orders/:id/post-cost',
  requirePermission('journal.post'),
  validate({
    body: z.object({
      date: isoDate.optional(),
      creditAccountCode: z.string().trim().max(20).optional(),
      overrideReason: z.string().trim().max(500).optional(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      postWorkOrderCost(tx, req.orgId, Number(req.params.id), { ...req.body, actor: actorOf(req) })
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'wo_post_cost', entity: 'work_order',
      entityId: req.params.id,
      summary: `${result.capitalized ? 'Amelioration immobilisee' : 'Charge de maintenance'} ${result.amount}`
        + `, ecriture ${result.entry.entry_no}`,
      after: result, context: requestContext(req),
    });
    res.json(result);
  })
);

// --- calibration and electrical safety (FR-AM-022) -------------------------

maintenanceRoutes.get(
  '/calibrations',
  requirePermission('calibration.view'),
  validate({
    query: pagination.extend({
      assetId: optionalId,
      result: z.enum(['pass', 'pass_with_adjustment', 'fail', 'indeterminate']).optional(),
      dueBefore: isoDate.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query;
    const params = [req.orgId];
    let filter = '';
    if (q.assetId) { filter += ' AND cal.asset_id = ?'; params.push(q.assetId); }
    if (q.result) { filter += ' AND cal.result = ?'; params.push(q.result); }
    if (q.dueBefore) { filter += ' AND cal.next_due_date <= ?'; params.push(q.dueBefore); }
    if (q.from) { filter += ' AND cal.calibration_date >= ?'; params.push(q.from); }
    if (q.to) { filter += ' AND cal.calibration_date <= ?'; params.push(q.to); }

    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM calibrations cal WHERE cal.org_id = ?${filter}`, params
    );
    const rows = await query(
      `SELECT cal.*, a.asset_tag, a.name AS asset_name, a.use_restricted, c.domain,
              u.full_name AS recorded_by_name, w.wo_no
         FROM calibrations cal
         JOIN assets a ON a.id = cal.asset_id
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN users u ON u.id = cal.recorded_by
         LEFT JOIN work_orders w ON w.id = cal.work_order_id
        WHERE cal.org_id = ?${filter}
        ORDER BY cal.calibration_date DESC, cal.id DESC
        LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json(paged(rows, Number(total), q));
  })
);

maintenanceRoutes.post(
  '/assets/:id/calibrations',
  requirePermission('calibration.record'),
  validate({
    body: z.object({
      calibrationDate: isoDate.optional(),
      workOrderId: optionalId.nullable(),
      performedByType: z.enum(['internal', 'manufacturer', 'third_party', 'accredited_lab']).default('internal'),
      performedByUserId: optionalId.nullable(),
      providerName: z.string().trim().max(200).optional().nullable(),
      standardReference: z.string().trim().max(120).optional().nullable(),
      referenceEquipment: z.string().trim().max(200).optional().nullable(),
      parameterTested: z.string().trim().max(200).optional().nullable(),
      measuredValue: z.string().trim().max(100).optional().nullable(),
      nominalValue: z.string().trim().max(100).optional().nullable(),
      deviation: z.coerce.number().optional().nullable(),
      tolerance: z.string().trim().max(80).optional().nullable(),
      result: z.enum(['pass', 'pass_with_adjustment', 'fail', 'indeterminate']),
      adjustmentMade: boolish.default(false),
      intervalMonths: z.coerce.number().int().min(1).max(120).optional(),
      certificateNo: z.string().trim().max(80).optional().nullable(),
      cost: z.coerce.number().min(0).default(0),
      notes: z.string().trim().max(600).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      recordCalibration(tx, req.orgId, Number(req.params.id), req.body, actorOf(req))
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'calibration', entity: 'asset', entityId: req.params.id,
      summary: `Etalonnage ${req.body.result}, prochaine echeance ${result.next_due_date}`
        + (result.restricted ? ' - appareil consigne' : ''),
      after: result, context: requestContext(req),
    });
    res.status(201).json(result);
  })
);

maintenanceRoutes.get(
  '/safety-tests',
  requirePermission('calibration.view'),
  validate({
    query: pagination.extend({
      assetId: optionalId,
      result: z.enum(['pass', 'fail', 'conditional']).optional(),
      dueBefore: isoDate.optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query;
    const params = [req.orgId];
    let filter = '';
    if (q.assetId) { filter += ' AND st.asset_id = ?'; params.push(q.assetId); }
    if (q.result) { filter += ' AND st.result = ?'; params.push(q.result); }
    if (q.dueBefore) { filter += ' AND st.next_due_date <= ?'; params.push(q.dueBefore); }

    const { n: total } = await queryOne(
      `SELECT COUNT(*) AS n FROM safety_tests st WHERE st.org_id = ?${filter}`, params
    );
    const rows = await query(
      `SELECT st.*, a.asset_tag, a.name AS asset_name, a.use_restricted, u.full_name AS tested_by_name
         FROM safety_tests st
         JOIN assets a ON a.id = st.asset_id
         LEFT JOIN users u ON u.id = st.tested_by
        WHERE st.org_id = ?${filter}
        ORDER BY st.test_date DESC, st.id DESC
        LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );
    res.json(paged(rows, Number(total), q));
  })
);

maintenanceRoutes.post(
  '/assets/:id/safety-tests',
  requirePermission('safety.record'),
  validate({
    body: z.object({
      testDate: isoDate.optional(),
      workOrderId: optionalId.nullable(),
      testStandard: z.string().trim().max(60).optional(),
      appliedPartType: z.enum(['B', 'BF', 'CF', 'none']).default('none'),
      earthContinuityOhm: z.coerce.number().min(0).optional().nullable(),
      insulationResistanceMohm: z.coerce.number().min(0).optional().nullable(),
      earthLeakageUa: z.coerce.number().min(0).optional().nullable(),
      enclosureLeakageUa: z.coerce.number().min(0).optional().nullable(),
      patientLeakageUa: z.coerce.number().min(0).optional().nullable(),
      visualInspectionOk: boolish.default(true),
      functionalTestOk: boolish.default(true),
      result: z.enum(['pass', 'fail', 'conditional']),
      defectsFound: z.string().trim().max(600).optional().nullable(),
      testerName: z.string().trim().max(150).optional().nullable(),
      testEquipment: z.string().trim().max(200).optional().nullable(),
      certificateNo: z.string().trim().max(80).optional().nullable(),
      intervalMonths: z.coerce.number().int().min(1).max(120).optional(),
      notes: z.string().trim().max(600).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      recordSafetyTest(tx, req.orgId, Number(req.params.id), req.body, actorOf(req))
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'safety_test', entity: 'asset', entityId: req.params.id,
      summary: `Controle de securite electrique ${req.body.result}, prochaine echeance ${result.next_due_date}`
        + (result.restricted ? ' - appareil consigne' : ''),
      after: result, context: requestContext(req),
    });
    res.status(201).json(result);
  })
);

// --- service contracts and warranties (FR-AM-023) --------------------------

maintenanceRoutes.get(
  '/service-contracts',
  requirePermission('contract.view'),
  validate({ query: z.object({ status: z.string().trim().optional(), expiringWithinDays: z.coerce.number().int().min(0).optional() }) }),
  handler(async (req, res) => {
    const params = [today(), req.orgId];
    let filter = '';
    if (req.query.status) {
      const list = req.query.status.split(',').map((s) => s.trim());
      filter += ` AND sc.status IN (${list.map(() => '?').join(',')})`;
      params.push(...list);
    }
    if (req.query.expiringWithinDays !== undefined) {
      filter += ' AND sc.end_date <= DATE_ADD(?, INTERVAL ? DAY)';
      params.push(today(), req.query.expiringWithinDays);
    }
    const rows = await query(
      `SELECT sc.*, s.name AS supplier_name, DATEDIFF(sc.end_date, ?) AS days_to_expiry,
              COUNT(sca.asset_id) AS asset_count, COALESCE(SUM(sca.annual_cost), 0) AS allocated_cost
         FROM service_contracts sc
         JOIN suppliers s ON s.id = sc.supplier_id
         LEFT JOIN service_contract_assets sca ON sca.contract_id = sc.id
        WHERE sc.org_id = ?${filter}
        GROUP BY sc.id ORDER BY sc.end_date`,
      params
    );
    res.json({ rows, total: rows.length });
  })
);

maintenanceRoutes.post(
  '/service-contracts/refresh-status',
  requirePermission('contract.manage'),
  handler(async (req, res) => {
    const result = await transaction((tx) => refreshContractStatus(tx, req.orgId));
    res.json(result);
  })
);

// --- dashboards and reliability reporting ---------------------------------

maintenanceRoutes.get(
  '/maintenance/overview',
  requirePermission('wo.view'),
  validate({
    query: z.object({
      asOf: isoDate.optional(),
      horizonDays: z.coerce.number().int().min(1).max(365).default(30),
    }),
  }),
  handler(async (req, res) => {
    res.json(await maintenanceOverview({ query, queryOne }, req.orgId, req.query));
  })
);

maintenanceRoutes.get(
  '/maintenance/reliability',
  requirePermission('report.asset'),
  validate({
    query: z.object({
      from: isoDate,
      to: isoDate,
      domain: z.enum(['biomedical', 'facility', 'fleet', 'it_office']).optional(),
    }),
  }),
  handler(async (req, res) => {
    const rows = await reliabilityByAsset({ query, queryOne }, req.orgId, req.query);
    res.json({ ...req.query, rows, total: rows.length });
  })
);
