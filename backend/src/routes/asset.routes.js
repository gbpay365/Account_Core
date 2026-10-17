import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { handler, requirePermission, validate, requestContext } from '../middleware/index.js';
import { writeAudit } from '../services/auth.service.js';
import {
  registerAsset, capitalizeAsset, commissionAsset, moveAsset,
  refreshComplianceFlags, requestDisposal, decideDisposal, completeDisposal,
  assetQrDataUrl, assetQrSvg, getAssetComponentRollup,
} from '../services/asset.service.js';
import { notFound, badRequest, unprocessable } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { today } from '../utils/dates.js';
import { actorOf, isoDate, optionalId, boolish, pagination, paged } from './helpers.js';

export const assetRoutes = Router();

const ASSET_LIST_FIELDS = `
  a.id, a.asset_tag, a.name, a.serial_number, a.manufacturer, a.model, a.status,
  a.asset_condition, a.criticality, a.is_mobile, a.is_capitalized, a.use_restricted,
  a.restriction_reason, a.acquisition_date, a.in_service_date, a.currency,
  a.ohada_cost, a.ohada_accum_depr, a.ohada_nbv,
  a.ifrs_cost, a.ifrs_accum_depr, a.ifrs_accum_impairment, a.ifrs_nbv,
  a.total_maintenance_cost, a.total_parts_cost,
  a.next_pm_date, a.next_calibration_date, a.next_safety_test_date,
  a.warranty_end, a.has_rfid,
  c.code AS category_code, c.name AS category_name, c.name_en AS category_name_en, c.domain,
  cc.code AS cost_center_code, cc.name AS cost_center_name,
  l.code AS location_code, l.name AS location_name,
  u.full_name AS custodian_name`;

const ASSET_LIST_JOINS = `
  FROM assets a
  JOIN asset_categories c ON c.id = a.category_id
  LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
  LEFT JOIN asset_locations l ON l.id = a.location_id
  LEFT JOIN users u ON u.id = a.custodian_user_id`;

// --- asset register (FR-AM-001) --------------------------------------------

assetRoutes.get(
  '/assets',
  requirePermission('asset.view'),
  validate({
    query: pagination.extend({
      search: z.string().trim().optional(),
      domain: z.enum(['biomedical', 'facility', 'fleet', 'it_office']).optional(),
      categoryId: optionalId,
      costCenterId: optionalId,
      locationId: optionalId,
      custodianUserId: optionalId,
      status: z.string().trim().optional(),
      criticality: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      restrictedOnly: boolish.optional(),
      dueOnly: boolish.optional(),
      uncapitalizedOnly: boolish.optional(),
      sort: z.enum(['asset_tag', 'name', 'ohada_nbv', 'next_calibration_date', 'next_pm_date']).default('asset_tag'),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query;
    const params = [req.orgId];
    let filter = '';
    const add = (sql, value) => { filter += sql; if (value !== undefined) params.push(value); };

    if (q.domain) add(' AND c.domain = ?', q.domain);
    if (q.categoryId) add(' AND a.category_id = ?', q.categoryId);
    if (q.costCenterId) add(' AND a.cost_center_id = ?', q.costCenterId);
    if (q.locationId) add(' AND a.location_id = ?', q.locationId);
    if (q.custodianUserId) add(' AND a.custodian_user_id = ?', q.custodianUserId);
    if (q.criticality) add(' AND a.criticality = ?', q.criticality);
    if (q.restrictedOnly) add(' AND a.use_restricted = 1');
    if (q.uncapitalizedOnly) add(" AND a.is_capitalized = 0 AND a.status <> 'disposed'");
    if (q.status) {
      const list = q.status.split(',').map((s) => s.trim()).filter(Boolean);
      filter += ` AND a.status IN (${list.map(() => '?').join(',')})`;
      params.push(...list);
    }
    if (q.dueOnly) {
      // Anything with a compliance or maintenance date already behind us.
      filter += ` AND a.status <> 'disposed' AND (a.next_calibration_date < ? OR a.next_safety_test_date < ? OR a.next_pm_date < ?)`;
      const now = today();
      params.push(now, now, now);
    }
    if (q.search) {
      filter += ' AND (a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial_number LIKE ? OR a.model LIKE ? OR a.manufacturer LIKE ?)';
      const like = `%${q.search}%`;
      params.push(like, like, like, like, like);
    }

    const { n: total } = await queryOne(`SELECT COUNT(*) AS n ${ASSET_LIST_JOINS} WHERE a.org_id = ?${filter}`, params);
    const rows = await query(
      `SELECT ${ASSET_LIST_FIELDS} ${ASSET_LIST_JOINS}
        WHERE a.org_id = ?${filter}
        ORDER BY ${q.sort === 'ohada_nbv' ? 'a.ohada_nbv DESC' : `a.${q.sort}`}
        LIMIT ? OFFSET ?`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize]
    );

    const summary = await queryOne(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(a.ohada_cost), 0) AS ohada_cost,
              COALESCE(SUM(a.ohada_nbv), 0) AS ohada_nbv,
              COALESCE(SUM(a.ifrs_cost), 0) AS ifrs_cost,
              COALESCE(SUM(a.ifrs_nbv), 0) AS ifrs_nbv,
              COALESCE(SUM(a.total_maintenance_cost), 0) AS maintenance_cost
         ${ASSET_LIST_JOINS} WHERE a.org_id = ?${filter}`,
      params
    );

    res.json({ ...paged(rows, Number(total), q), summary });
  })
);

/** Lookup by scanned barcode / QR / RFID tag (FR-AM-002). */
assetRoutes.get(
  '/assets/scan/:code',
  requirePermission('asset.view'),
  handler(async (req, res) => {
    // A scanned QR carries the full payload URL, so match its tail as well.
    const code = String(req.params.code).trim();
    const tail = code.split('/').filter(Boolean).pop();
    const asset = await queryOne(
      `SELECT ${ASSET_LIST_FIELDS} ${ASSET_LIST_JOINS}
        WHERE a.org_id = ? AND (a.asset_tag = ? OR a.barcode_value = ? OR a.rfid_tag = ? OR a.qr_payload = ? OR a.asset_tag = ?)
        LIMIT 1`,
      [req.orgId, code, code, code, code, tail]
    );
    if (!asset) throw notFound(`No asset matches the scanned code "${code}".`);
    res.json({ asset });
  })
);

assetRoutes.get(
  '/assets/:id',
  requirePermission('asset.view'),
  handler(async (req, res) => {
    const asset = await queryOne(
      `SELECT a.*, c.code AS category_code, c.name AS category_name, c.name_en AS category_name_en, c.domain,
              c.requires_calibration, c.requires_safety_test, c.safety_test_standard,
              c.taxonomy_system, c.taxonomy_code, c.capitalization_threshold,
              cc.code AS cost_center_code, cc.name AS cost_center_name,
              l.code AS location_code, l.name AS location_name, l.location_type, l.address,
              u.full_name AS custodian_name, s.name AS supplier_name,
              p.asset_tag AS parent_asset_tag
         FROM assets a
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
         LEFT JOIN asset_locations l ON l.id = a.location_id
         LEFT JOIN users u ON u.id = a.custodian_user_id
         LEFT JOIN suppliers s ON s.id = a.supplier_id
         LEFT JOIN assets p ON p.id = a.parent_asset_id
        WHERE a.id = ? AND a.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!asset) throw notFound('Asset not found.');

    const [movements, plans, workOrders, calibrations, safetyTests, contracts, depreciation, components, disposal] =
      await Promise.all([
        query(
          `SELECT m.*, fl.name AS from_location, tl.name AS to_location,
                  fc.name AS from_cost_center, tc.name AS to_cost_center,
                  fu.full_name AS from_custodian, tu.full_name AS to_custodian,
                  r.full_name AS recorded_by_name
             FROM asset_movements m
             LEFT JOIN asset_locations fl ON fl.id = m.from_location_id
             LEFT JOIN asset_locations tl ON tl.id = m.to_location_id
             LEFT JOIN cost_centers fc ON fc.id = m.from_cost_center_id
             LEFT JOIN cost_centers tc ON tc.id = m.to_cost_center_id
             LEFT JOIN users fu ON fu.id = m.from_custodian_id
             LEFT JOIN users tu ON tu.id = m.to_custodian_id
             LEFT JOIN users r ON r.id = m.recorded_by
            WHERE m.asset_id = ? ORDER BY m.movement_date DESC, m.id DESC`,
          [req.params.id]
        ),
        query('SELECT * FROM maintenance_plans WHERE asset_id = ? AND is_active = 1 ORDER BY plan_type', [req.params.id]),
        query(
          `SELECT w.id, w.wo_no, w.wo_type, w.priority, w.status, w.title, w.scheduled_date,
                  w.completed_at, w.total_cost, w.downtime_hours, u.full_name AS assigned_to_name
             FROM work_orders w LEFT JOIN users u ON u.id = w.assigned_to
            WHERE w.asset_id = ? ORDER BY w.id DESC LIMIT 50`,
          [req.params.id]
        ),
        query('SELECT * FROM calibrations WHERE asset_id = ? ORDER BY calibration_date DESC LIMIT 20', [req.params.id]),
        query('SELECT * FROM safety_tests WHERE asset_id = ? ORDER BY test_date DESC LIMIT 20', [req.params.id]),
        query(
          `SELECT sc.*, sca.annual_cost AS asset_annual_cost FROM service_contract_assets sca
             JOIN service_contracts sc ON sc.id = sca.contract_id
            WHERE sca.asset_id = ?`,
          [req.params.id]
        ),
        query(
          `SELECT dl.*, p.code AS period_code FROM depreciation_lines dl
             JOIN accounting_periods p ON p.id = dl.period_id
             JOIN depreciation_runs r ON r.id = dl.run_id
            WHERE dl.asset_id = ? AND r.status = 'posted'
            ORDER BY p.start_date DESC, dl.basis LIMIT 48`,
          [req.params.id]
        ),
        query('SELECT id, asset_tag, name, ohada_nbv FROM assets WHERE parent_asset_id = ?', [req.params.id]),
        queryOne(
          `SELECT d.*, ru.full_name AS requested_by_name, au.full_name AS approved_by_name
             FROM asset_disposals d
             LEFT JOIN users ru ON ru.id = d.requested_by
             LEFT JOIN users au ON au.id = d.approved_by
            WHERE d.asset_id = ? ORDER BY d.id DESC LIMIT 1`,
          [req.params.id]
        ),
      ]);

    // FR-AM-032: total cost of ownership drives replacement decisions.
    const tco = money(
      Number(asset.ohada_cost) + Number(asset.total_maintenance_cost) + Number(asset.total_parts_cost)
    );

    res.json({
      asset: { ...asset, total_cost_of_ownership: tco },
      movements, plans, work_orders: workOrders, calibrations, safety_tests: safetyTests,
      service_contracts: contracts, depreciation, components, disposal,
    });
  })
);

// --- registration (FR-AM-001 / FR-AM-002) ----------------------------------

const registerBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().nullable(),
  categoryId: z.coerce.number().int().positive(),
  assetTag: z.string().trim().max(40).optional(),
  manufacturer: z.string().trim().max(120).optional().nullable(),
  model: z.string().trim().max(120).optional().nullable(),
  serialNumber: z.string().trim().max(120).optional().nullable(),
  yearOfManufacture: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  costCenterId: optionalId.nullable(),
  locationId: optionalId.nullable(),
  custodianUserId: optionalId.nullable(),
  isMobile: boolish.default(true),
  status: z.enum(['draft', 'in_stock', 'installing', 'in_service', 'under_maintenance', 'quarantined', 'out_of_service']).optional(),
  condition: z.enum(['new', 'good', 'fair', 'poor', 'unserviceable']).optional(),
  criticality: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  acquisitionDate: isoDate.optional().nullable(),
  capitalizationDate: isoDate.optional().nullable(),
  inServiceDate: isoDate.optional().nullable(),
  fundingSource: z.enum(['purchase', 'donation', 'grant', 'lease', 'transfer', 'own_construction']).default('purchase'),
  fundingReference: z.string().trim().max(80).optional().nullable(),
  donorName: z.string().trim().max(200).optional().nullable(),
  supplierId: optionalId.nullable(),
  purchaseOrderId: optionalId.nullable(),
  supplierInvoiceId: optionalId.nullable(),
  currency: z.string().trim().length(3).optional(),
  acquisitionCost: z.coerce.number().min(0).default(0),
  incidentalCosts: z.coerce.number().min(0).default(0),
  ohadaUsefulLifeMonths: z.coerce.number().int().positive().optional(),
  ohadaMethod: z.enum(['straight_line', 'declining_balance', 'units_of_production', 'none']).optional(),
  ifrsUsefulLifeMonths: z.coerce.number().int().positive().optional(),
  ifrsMethod: z.enum(['straight_line', 'declining_balance', 'units_of_production', 'none']).optional(),
  parentAssetId: optionalId.nullable(),
  warrantyStart: isoDate.optional().nullable(),
  warrantyEnd: isoDate.optional().nullable(),
  warrantyTerms: z.string().trim().max(500).optional().nullable(),
  calibrationIntervalMonths: z.coerce.number().int().positive().optional().nullable(),
  hasRfid: boolish.default(false),
  rfidTag: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

assetRoutes.post(
  '/assets',
  requirePermission('asset.create'),
  validate({ body: registerBody }),
  handler(async (req, res) => {
    // registerAsset also derives the maintenance, calibration and safety
    // schedules from the category, so registration is a single step.
    const created = await transaction((tx) => registerAsset(tx, req.orgId, req.body, actorOf(req)));

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'asset', entityId: created.id,
      summary: `Immobilisation ${created.asset_tag} - ${req.body.name} enregistree`,
      after: created, context: requestContext(req),
    });
    res.status(201).json({ asset: created });
  })
);

assetRoutes.patch(
  '/assets/:id',
  requirePermission('asset.edit'),
  validate({
    body: registerBody.partial().omit({ categoryId: true, acquisitionCost: true, incidentalCosts: true }),
  }),
  handler(async (req, res) => {
    const before = await queryOne('SELECT * FROM assets WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!before) throw notFound('Asset not found.');

    const COLUMN = {
      name: 'name', description: 'description', manufacturer: 'manufacturer', model: 'model',
      serialNumber: 'serial_number', yearOfManufacture: 'year_of_manufacture',
      costCenterId: 'cost_center_id', locationId: 'location_id', custodianUserId: 'custodian_user_id',
      isMobile: 'is_mobile', condition: 'asset_condition', criticality: 'criticality',
      warrantyStart: 'warranty_start', warrantyEnd: 'warranty_end', warrantyTerms: 'warranty_terms',
      calibrationIntervalMonths: 'calibration_interval_months', hasRfid: 'has_rfid', rfidTag: 'rfid_tag',
      notes: 'notes', supplierId: 'supplier_id',
    };
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(req.body)) {
      if (value === undefined || !COLUMN[key]) continue;
      sets.push(`${COLUMN[key]} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
    if (sets.length === 0) return res.json({ asset: before });

    await query(`UPDATE assets SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, [...params, before.id, req.orgId]);
    const after = await queryOne('SELECT * FROM assets WHERE id = ?', [before.id]);

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'update', entity: 'asset', entityId: before.id,
      summary: `Immobilisation ${before.asset_tag} modifiee`, before, after, context: requestContext(req),
    });
    res.json({ asset: after });
  })
);

/** Printable tag: QR as SVG for print, data URL for on-screen (FR-AM-002). */
assetRoutes.get(
  '/assets/:id/tag',
  requirePermission('asset.tag', 'asset.view'),
  validate({ query: z.object({ format: z.enum(['svg', 'png']).default('png') }) }),
  handler(async (req, res) => {
    const asset = await queryOne(
      `SELECT a.asset_tag, a.name, a.qr_payload, a.barcode_value, a.serial_number, a.rfid_tag,
              c.name AS category_name, cc.name AS cost_center_name, l.name AS location_name
         FROM assets a
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
         LEFT JOIN asset_locations l ON l.id = a.location_id
        WHERE a.id = ? AND a.org_id = ?`,
      [req.params.id, req.orgId]
    );
    if (!asset) throw notFound('Asset not found.');

    if (req.query.format === 'svg') {
      res.type('image/svg+xml').send(await assetQrSvg(asset.qr_payload));
      return;
    }
    res.json({ ...asset, qr_data_url: await assetQrDataUrl(asset.qr_payload) });
  })
);

// --- acquisition to capitalization (FR-AM-010 / FR-AM-011) -----------------

assetRoutes.post(
  '/assets/:id/capitalize',
  requirePermission('asset.capitalize'),
  validate({
    body: z.object({
      date: isoDate.optional(),
      recoverableVat: z.coerce.number().min(0).default(0),
      creditAccountCode: z.string().trim().max(20).optional(),
      capitalizeFromWip: boolish.optional(),
      wipAccountId: optionalId.optional(),
      overrideReason: z.string().trim().max(500).optional().nullable(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const entry = await transaction((tx) =>
      capitalizeAsset(tx, req.orgId, Number(req.params.id), { ...req.body, actor: actorOf(req) })
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'capitalize', entity: 'asset', entityId: req.params.id,
      summary: `Immobilisation comptabilisee, ecriture ${entry.entry_no}`,
      after: entry, context: requestContext(req),
    });
    res.json({ entry });
  })
);

assetRoutes.get(
  '/assets/:id/components-rollup',
  requirePermission('asset.view'),
  handler(async (req, res) => {
    const rollup = await getAssetComponentRollup({ query, queryOne }, req.orgId, Number(req.params.id));
    res.json(rollup);
  })
);

assetRoutes.post(
  '/assets/:id/commission',
  requirePermission('asset.commission'),
  validate({
    body: z.object({
      inServiceDate: isoDate.optional(),
      commissioningDate: isoDate.optional(),
      initialCalibrationDone: boolish.default(false),
      safetyCheckDone: boolish.default(false),
      notes: z.string().trim().max(1000).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction(async (tx) => {
      const out = await commissionAsset(tx, req.orgId, Number(req.params.id), req.body, actorOf(req));
      await refreshComplianceFlags(tx, req.orgId, Number(req.params.id));
      return out;
    });
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'commission', entity: 'asset', entityId: req.params.id,
      summary: `Installation et mise en service validees au ${result.in_service_date}`,
      context: requestContext(req),
    });
    res.json(result);
  })
);

// --- location and custody (FR-AM-040) --------------------------------------

assetRoutes.post(
  '/assets/:id/move',
  requirePermission('asset.move'),
  validate({
    body: z.object({
      movementType: z.enum(['transfer', 'loan', 'return', 'status_change', 'stocktake']).default('transfer'),
      movementDate: isoDate.optional(),
      toLocationId: optionalId.nullable(),
      toCostCenterId: optionalId.nullable(),
      toCustodianUserId: optionalId.nullable(),
      expectedReturnDate: isoDate.optional().nullable(),
      reason: z.string().trim().max(300).optional().nullable(),
      scanned: boolish.default(false),
    }).refine(
      (b) => b.toLocationId || b.toCostCenterId || b.toCustodianUserId,
      { message: 'Give a destination: location, cost centre or custodian.' }
    ),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      moveAsset(tx, req.orgId, Number(req.params.id), req.body, actorOf(req))
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'move', entity: 'asset', entityId: req.params.id,
      summary: `Mouvement ${req.body.movementType}${req.body.reason ? ` : ${req.body.reason}` : ''}`,
      context: requestContext(req),
    });
    res.json(result);
  })
);

// --- disposal and decommissioning (FR-AM-042) ------------------------------

assetRoutes.get(
  '/disposals',
  requirePermission('asset.view'),
  validate({ query: pagination.extend({ status: z.string().trim().optional() }) }),
  handler(async (req, res) => {
    const params = [req.orgId];
    let filter = '';
    if (req.query.status) {
      const list = req.query.status.split(',').map((s) => s.trim());
      filter = ` AND d.status IN (${list.map(() => '?').join(',')})`;
      params.push(...list);
    }
    const { n: total } = await queryOne(`SELECT COUNT(*) AS n FROM asset_disposals d WHERE d.org_id = ?${filter}`, params);
    const rows = await query(
      `SELECT d.*, a.asset_tag, a.name AS asset_name, c.domain,
              ru.full_name AS requested_by_name, au.full_name AS approved_by_name
         FROM asset_disposals d
         JOIN assets a ON a.id = d.asset_id
         JOIN asset_categories c ON c.id = a.category_id
         LEFT JOIN users ru ON ru.id = d.requested_by
         LEFT JOIN users au ON au.id = d.approved_by
        WHERE d.org_id = ?${filter}
        ORDER BY d.id DESC LIMIT ? OFFSET ?`,
      [...params, req.query.pageSize, (req.query.page - 1) * req.query.pageSize]
    );
    res.json(paged(rows, Number(total), req.query));
  })
);

assetRoutes.post(
  '/assets/:id/disposal',
  requirePermission('asset.dispose_request'),
  validate({
    body: z.object({
      method: z.enum(['sale', 'donation', 'scrap', 'biomedical_waste', 'trade_in', 'write_off', 'theft_loss']),
      reason: z.string().trim().min(5).max(500),
      requestDate: isoDate.optional(),
      disposalDate: isoDate.optional().nullable(),
      proceeds: z.coerce.number().min(0).default(0),
      disposalCosts: z.coerce.number().min(0).default(0),
      buyerName: z.string().trim().max(200).optional().nullable(),
      recipientName: z.string().trim().max(200).optional().nullable(),
      wasteHandler: z.string().trim().max(200).optional().nullable(),
      decontaminationDone: boolish.default(false),
      dataWiped: boolish.default(false),
      certificateNo: z.string().trim().max(80).optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const asset = await queryOne('SELECT * FROM assets WHERE id = ? AND org_id = ?', [req.params.id, req.orgId]);
    if (!asset) throw notFound('Asset not found.');

    // Infection control and data protection are the two things that must not
    // be skipped when hospital equipment leaves the building.
    const category = await queryOne('SELECT domain FROM asset_categories WHERE id = ?', [asset.category_id]);
    if (category.domain === 'biomedical' && !req.body.decontaminationDone) {
      throw badRequest('Biomedical equipment must be recorded as decontaminated before disposal.');
    }
    if (category.domain === 'it_office' && !req.body.dataWiped) {
      throw badRequest('IT equipment must be recorded as data-wiped before disposal.');
    }

    const result = await transaction((tx) =>
      requestDisposal(tx, req.orgId, Number(req.params.id), req.body, actorOf(req))
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'disposal_request', entity: 'asset_disposal',
      entityId: result.id,
      summary: `Sortie ${result.disposal_no} demandee pour ${asset.asset_tag} (${req.body.method}) : ${req.body.reason}`,
      context: requestContext(req),
    });
    res.status(201).json({ disposal: result });
  })
);

assetRoutes.post(
  '/disposals/:id/decide',
  requirePermission('asset.dispose_approve'),
  validate({
    body: z.object({
      approve: boolish,
      reason: z.string().trim().max(500).optional().nullable(),
    }),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      decideDisposal(tx, req.orgId, Number(req.params.id), {
        approve: req.body.approve, reason: req.body.reason, actor: actorOf(req),
      })
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: `disposal_${result.status}`, entity: 'asset_disposal',
      entityId: result.id, summary: `Demande de sortie ${result.status}${req.body.reason ? ` : ${req.body.reason}` : ''}`,
      context: requestContext(req),
    });
    res.json({ disposal: result });
  })
);

assetRoutes.post(
  '/disposals/:id/complete',
  requirePermission('asset.dispose_approve'),
  validate({
    body: z.object({
      date: isoDate.optional(),
      overrideReason: z.string().trim().max(500).optional().nullable(),
    }).default({}),
  }),
  handler(async (req, res) => {
    const result = await transaction((tx) =>
      completeDisposal(tx, req.orgId, Number(req.params.id), { ...req.body, actor: actorOf(req) })
    );
    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'disposal_complete', entity: 'asset_disposal',
      entityId: req.params.id,
      summary: `Sortie comptabilisee, resultat de cession ${money(result.ohada_gain_loss ?? 0)}`,
      after: result, context: requestContext(req),
    });
    res.json(result);
  })
);

// --- supporting reference data ---------------------------------------------

assetRoutes.get(
  '/asset-categories',
  requirePermission('asset.view'),
  validate({ query: z.object({ domain: z.string().trim().optional() }) }),
  handler(async (req, res) => {
    const params = [req.orgId];
    let filter = '';
    if (req.query.domain) { filter = ' AND c.domain = ?'; params.push(req.query.domain); }
    const rows = await query(
      `SELECT c.*, p.code AS parent_code,
              ga.code AS asset_account_code, aa.code AS accum_account_code, ea.code AS expense_account_code,
              COUNT(a.id) AS asset_count
         FROM asset_categories c
         LEFT JOIN asset_categories p ON p.id = c.parent_id
         LEFT JOIN accounts ga ON ga.id = c.asset_account_id
         LEFT JOIN accounts aa ON aa.id = c.accum_depr_account_id
         LEFT JOIN accounts ea ON ea.id = c.depr_expense_account_id
         LEFT JOIN assets a ON a.category_id = c.id AND a.status <> 'disposed'
        WHERE c.org_id = ?${filter}
        GROUP BY c.id ORDER BY c.code`,
      params
    );
    res.json({ rows, total: rows.length });
  })
);

const emptyToNull = (schema) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema);

const accountCode = emptyToNull(z.union([z.null(), z.string().trim().max(20)]));
const optionalMonths = emptyToNull(
  z.union([z.null(), z.coerce.number().int().positive().max(120)])
);
const optionalPositiveInt = emptyToNull(
  z.union([z.null(), z.coerce.number().int().positive()])
);

const categoryBody = z.object({
  code: z.string().trim().min(2).max(30)
    .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, 'Use letters, numbers and hyphens, e.g. BIO-IMG-PET.'),
  name: z.string().trim().min(1).max(200),
  nameEn: emptyToNull(z.union([z.null(), z.string().trim().max(200)])),
  domain: z.enum(['biomedical', 'facility', 'fleet', 'it_office']),
  parentId: emptyToNull(z.union([z.null(), z.coerce.number().int().positive()])),
  taxonomySystem: z.enum(['umdns', 'gmdn', 'internal', 'none']).optional(),
  taxonomyCode: emptyToNull(z.union([z.null(), z.string().trim().max(30)])),
  assetAccount: accountCode,
  accumDeprAccount: accountCode,
  deprExpenseAccount: accountCode,
  disposalGainAccount: accountCode,
  disposalLossAccount: accountCode,
  maintenanceAccount: accountCode,
  revaluationSurplusAccount: accountCode,
  impairmentAccount: accountCode,
  ohadaUsefulLifeMonths: z.coerce.number().int().positive().max(600).default(60),
  ohadaMethod: z.enum(['straight_line', 'declining_balance']).default('straight_line'),
  ohadaDecliningFactor: z.coerce.number().min(0).max(10).default(1),
  ohadaSalvagePct: z.coerce.number().min(0).max(100).default(0),
  ifrsUsefulLifeMonths: z.coerce.number().int().positive().max(600).default(60),
  ifrsMethod: z.enum(['straight_line', 'declining_balance', 'units_of_production']).default('straight_line'),
  ifrsDecliningFactor: z.coerce.number().min(0).max(10).default(1),
  ifrsResidualPct: z.coerce.number().min(0).max(100).default(0),
  ifrsMeasurementModel: z.enum(['cost', 'revaluation']).default('cost'),
  allowComponentDepr: boolish.default(false),
  requiresCalibration: boolish.default(false),
  calibrationIntervalMonths: optionalMonths,
  requiresSafetyTest: boolish.default(false),
  safetyTestStandard: emptyToNull(z.union([z.null(), z.string().trim().max(40)])),
  safetyIntervalMonths: optionalMonths,
  pmIntervalMonths: optionalMonths,
  pmIntervalHours: optionalPositiveInt,
  pmIntervalKm: optionalPositiveInt,
  capitalizationThreshold: z.coerce.number().min(0).default(0),
  defaultCriticality: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

async function resolveAccountCode(db, orgId, code, label) {
  if (!code) return null;
  const row = await db.queryOne(
    'SELECT id, code, is_postable FROM accounts WHERE org_id = ? AND code = ?',
    [orgId, String(code).trim()]
  );
  if (!row) throw unprocessable(`${label} ${code} is not on the chart of accounts.`);
  if (!row.is_postable) {
    throw unprocessable(`${label} ${code} is a heading account and cannot take postings.`);
  }
  return row.id;
}

async function loadCategory(db, orgId, id) {
  return db.queryOne(
    `SELECT c.*, p.code AS parent_code,
            ga.code AS asset_account_code, aa.code AS accum_account_code, ea.code AS expense_account_code,
            dg.code AS disposal_gain_account_code, dl.code AS disposal_loss_account_code,
            ma.code AS maintenance_account_code, rs.code AS revaluation_surplus_account_code,
            ia.code AS impairment_account_code,
            (SELECT COUNT(*) FROM assets a WHERE a.category_id = c.id AND a.status <> 'disposed') AS asset_count
       FROM asset_categories c
       LEFT JOIN asset_categories p ON p.id = c.parent_id
       LEFT JOIN accounts ga ON ga.id = c.asset_account_id
       LEFT JOIN accounts aa ON aa.id = c.accum_depr_account_id
       LEFT JOIN accounts ea ON ea.id = c.depr_expense_account_id
       LEFT JOIN accounts dg ON dg.id = c.disposal_gain_account_id
       LEFT JOIN accounts dl ON dl.id = c.disposal_loss_account_id
       LEFT JOIN accounts ma ON ma.id = c.maintenance_account_id
       LEFT JOIN accounts rs ON rs.id = c.revaluation_surplus_account_id
       LEFT JOIN accounts ia ON ia.id = c.impairment_account_id
      WHERE c.id = ? AND c.org_id = ?`,
    [id, orgId]
  );
}

async function resolveCategoryAccounts(db, orgId, body, parent) {
  const pick = async (field, column, label) => {
    if (body[field]) return resolveAccountCode(db, orgId, body[field], label);
    return parent?.[column] ?? null;
  };
  const assetAccountId = await pick('assetAccount', 'asset_account_id', 'Asset account');
  const accumDeprAccountId = await pick('accumDeprAccount', 'accum_depr_account_id', 'Accumulated depreciation account');
  const deprExpenseAccountId = await pick('deprExpenseAccount', 'depr_expense_account_id', 'Depreciation expense account');
  if (!assetAccountId || !accumDeprAccountId || !deprExpenseAccountId) {
    throw unprocessable(
      'Set the asset, accumulated depreciation and depreciation expense accounts, or pick a parent that already has them.'
    );
  }
  const fallback = async (code) => {
    const row = await db.queryOne('SELECT id FROM accounts WHERE org_id = ? AND code = ? AND is_postable = 1', [orgId, code]);
    return row?.id ?? null;
  };
  return {
    assetAccountId,
    accumDeprAccountId,
    deprExpenseAccountId,
    disposalGainAccountId: await pick('disposalGainAccount', 'disposal_gain_account_id', 'Disposal gain account')
      ?? await fallback('822'),
    disposalLossAccountId: await pick('disposalLossAccount', 'disposal_loss_account_id', 'Disposal loss account')
      ?? await fallback('812'),
    maintenanceAccountId: await pick('maintenanceAccount', 'maintenance_account_id', 'Maintenance account'),
    revaluationSurplusAccountId: await pick('revaluationSurplusAccount', 'revaluation_surplus_account_id', 'Revaluation surplus account')
      ?? await fallback('106'),
    impairmentAccountId: await pick('impairmentAccount', 'impairment_account_id', 'Impairment account')
      ?? await fallback('6941'),
  };
}

assetRoutes.post(
  '/asset-categories',
  requirePermission('category.manage'),
  validate({ body: categoryBody }),
  handler(async (req, res) => {
    const b = req.body;
    const code = b.code.toUpperCase();
    const clash = await queryOne('SELECT id FROM asset_categories WHERE org_id = ? AND code = ?', [req.orgId, code]);
    if (clash) throw unprocessable(`Category ${code} already exists.`);

    const created = await transaction(async (tx) => {
      let parent = null;
      if (b.parentId) {
        parent = await tx.queryOne(
          'SELECT * FROM asset_categories WHERE id = ? AND org_id = ?',
          [b.parentId, req.orgId]
        );
        if (!parent) throw unprocessable('The parent category does not exist.');
        if (parent.domain !== b.domain) {
          throw unprocessable(`A child of ${parent.code} must stay in the ${parent.domain} domain.`);
        }
      }
      const accounts = await resolveCategoryAccounts(tx, req.orgId, b, parent);
      const ins = await tx.query(
        `INSERT INTO asset_categories
          (org_id, code, name, name_en, domain, parent_id, taxonomy_system, taxonomy_code,
           asset_account_id, accum_depr_account_id, depr_expense_account_id,
           disposal_gain_account_id, disposal_loss_account_id, maintenance_account_id,
           revaluation_surplus_account_id, impairment_account_id,
           ohada_useful_life_months, ohada_method, ohada_declining_factor, ohada_salvage_pct,
           ifrs_useful_life_months, ifrs_method, ifrs_declining_factor, ifrs_residual_pct,
           ifrs_measurement_model, allow_component_depr,
           requires_calibration, calibration_interval_months,
           requires_safety_test, safety_test_standard, safety_interval_months,
           pm_interval_months, pm_interval_hours, pm_interval_km,
           capitalization_threshold, default_criticality)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.orgId, code, b.name, b.nameEn ?? null, b.domain, b.parentId ?? null,
          b.taxonomySystem || parent?.taxonomy_system || 'internal', b.taxonomyCode ?? null,
          accounts.assetAccountId, accounts.accumDeprAccountId, accounts.deprExpenseAccountId,
          accounts.disposalGainAccountId, accounts.disposalLossAccountId, accounts.maintenanceAccountId,
          accounts.revaluationSurplusAccountId, accounts.impairmentAccountId,
          b.ohadaUsefulLifeMonths, b.ohadaMethod, b.ohadaDecliningFactor, b.ohadaSalvagePct,
          b.ifrsUsefulLifeMonths, b.ifrsMethod, b.ifrsDecliningFactor, b.ifrsResidualPct,
          b.ifrsMeasurementModel, b.allowComponentDepr ? 1 : 0,
          b.requiresCalibration ? 1 : 0, b.calibrationIntervalMonths ?? null,
          b.requiresSafetyTest ? 1 : 0, b.safetyTestStandard ?? null, b.safetyIntervalMonths ?? null,
          b.pmIntervalMonths ?? null, b.pmIntervalHours ?? null, b.pmIntervalKm ?? null,
          b.capitalizationThreshold, b.defaultCriticality,
        ]
      );
      return loadCategory(tx, req.orgId, ins.insertId);
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'create', entity: 'asset_category',
      entityId: created.id, summary: `Categorie ${created.code} - ${created.name} creee`,
      after: created, context: requestContext(req),
    });
    res.status(201).json({ category: created });
  })
);

assetRoutes.patch(
  '/asset-categories/:id',
  requirePermission('category.manage'),
  validate({
    body: categoryBody.partial().omit({ code: true }).extend({
      isActive: boolish.optional(),
    }),
  }),
  handler(async (req, res) => {
    const before = await queryOne(
      'SELECT * FROM asset_categories WHERE id = ? AND org_id = ?',
      [req.params.id, req.orgId]
    );
    if (!before) throw notFound('Category not found.');

    const b = req.body;
    const updated = await transaction(async (tx) => {
      let parent = null;
      const parentId = b.parentId !== undefined ? b.parentId : before.parent_id;
      const domain = b.domain || before.domain;
      if (parentId) {
        if (Number(parentId) === Number(before.id)) {
          throw unprocessable('A category cannot be its own parent.');
        }
        parent = await tx.queryOne(
          'SELECT * FROM asset_categories WHERE id = ? AND org_id = ?',
          [parentId, req.orgId]
        );
        if (!parent) throw unprocessable('The parent category does not exist.');
        if (Number(parent.parent_id) === Number(before.id)) {
          throw unprocessable('That parent would create a circular category tree.');
        }
        if (parent.domain !== domain) {
          throw unprocessable(`A child of ${parent.code} must stay in the ${parent.domain} domain.`);
        }
      }

      const accountFields = [
        'assetAccount', 'accumDeprAccount', 'deprExpenseAccount', 'disposalGainAccount',
        'disposalLossAccount', 'maintenanceAccount', 'revaluationSurplusAccount', 'impairmentAccount',
      ];
      let accounts = null;
      if (accountFields.some((field) => b[field] !== undefined) || b.parentId !== undefined) {
        accounts = await resolveCategoryAccounts(tx, req.orgId, {
          assetAccount: b.assetAccount ?? undefined,
          accumDeprAccount: b.accumDeprAccount ?? undefined,
          deprExpenseAccount: b.deprExpenseAccount ?? undefined,
          disposalGainAccount: b.disposalGainAccount ?? undefined,
          disposalLossAccount: b.disposalLossAccount ?? undefined,
          maintenanceAccount: b.maintenanceAccount ?? undefined,
          revaluationSurplusAccount: b.revaluationSurplusAccount ?? undefined,
          impairmentAccount: b.impairmentAccount ?? undefined,
        }, {
          asset_account_id: before.asset_account_id,
          accum_depr_account_id: before.accum_depr_account_id,
          depr_expense_account_id: before.depr_expense_account_id,
          disposal_gain_account_id: before.disposal_gain_account_id,
          disposal_loss_account_id: before.disposal_loss_account_id,
          maintenance_account_id: before.maintenance_account_id,
          revaluation_surplus_account_id: before.revaluation_surplus_account_id,
          impairment_account_id: before.impairment_account_id,
        });
      }

      const sets = [];
      const params = [];
      const add = (column, value) => { sets.push(`${column} = ?`); params.push(value); };

      if (b.name !== undefined) add('name', b.name);
      if (b.nameEn !== undefined) add('name_en', b.nameEn);
      if (b.domain !== undefined) add('domain', b.domain);
      if (b.parentId !== undefined) add('parent_id', b.parentId);
      if (b.taxonomySystem !== undefined) add('taxonomy_system', b.taxonomySystem);
      if (b.taxonomyCode !== undefined) add('taxonomy_code', b.taxonomyCode);
      if (accounts) {
        add('asset_account_id', accounts.assetAccountId);
        add('accum_depr_account_id', accounts.accumDeprAccountId);
        add('depr_expense_account_id', accounts.deprExpenseAccountId);
        add('disposal_gain_account_id', accounts.disposalGainAccountId);
        add('disposal_loss_account_id', accounts.disposalLossAccountId);
        add('maintenance_account_id', accounts.maintenanceAccountId);
        add('revaluation_surplus_account_id', accounts.revaluationSurplusAccountId);
        add('impairment_account_id', accounts.impairmentAccountId);
      }
      if (b.ohadaUsefulLifeMonths !== undefined) add('ohada_useful_life_months', b.ohadaUsefulLifeMonths);
      if (b.ohadaMethod !== undefined) add('ohada_method', b.ohadaMethod);
      if (b.ohadaDecliningFactor !== undefined) add('ohada_declining_factor', b.ohadaDecliningFactor);
      if (b.ohadaSalvagePct !== undefined) add('ohada_salvage_pct', b.ohadaSalvagePct);
      if (b.ifrsUsefulLifeMonths !== undefined) add('ifrs_useful_life_months', b.ifrsUsefulLifeMonths);
      if (b.ifrsMethod !== undefined) add('ifrs_method', b.ifrsMethod);
      if (b.ifrsDecliningFactor !== undefined) add('ifrs_declining_factor', b.ifrsDecliningFactor);
      if (b.ifrsResidualPct !== undefined) add('ifrs_residual_pct', b.ifrsResidualPct);
      if (b.ifrsMeasurementModel !== undefined) add('ifrs_measurement_model', b.ifrsMeasurementModel);
      if (b.allowComponentDepr !== undefined) add('allow_component_depr', b.allowComponentDepr ? 1 : 0);
      if (b.requiresCalibration !== undefined) add('requires_calibration', b.requiresCalibration ? 1 : 0);
      if (b.calibrationIntervalMonths !== undefined) add('calibration_interval_months', b.calibrationIntervalMonths);
      if (b.requiresSafetyTest !== undefined) add('requires_safety_test', b.requiresSafetyTest ? 1 : 0);
      if (b.safetyTestStandard !== undefined) add('safety_test_standard', b.safetyTestStandard);
      if (b.safetyIntervalMonths !== undefined) add('safety_interval_months', b.safetyIntervalMonths);
      if (b.pmIntervalMonths !== undefined) add('pm_interval_months', b.pmIntervalMonths);
      if (b.pmIntervalHours !== undefined) add('pm_interval_hours', b.pmIntervalHours);
      if (b.pmIntervalKm !== undefined) add('pm_interval_km', b.pmIntervalKm);
      if (b.capitalizationThreshold !== undefined) add('capitalization_threshold', b.capitalizationThreshold);
      if (b.defaultCriticality !== undefined) add('default_criticality', b.defaultCriticality);
      if (b.isActive !== undefined) add('is_active', b.isActive ? 1 : 0);

      if (sets.length) {
        params.push(before.id, req.orgId);
        await tx.query(
          `UPDATE asset_categories SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`,
          params
        );
      }
      return loadCategory(tx, req.orgId, before.id);
    });

    await writeAudit({
      orgId: req.orgId, userId: req.user.id, action: 'update', entity: 'asset_category',
      entityId: before.id, summary: `Categorie ${before.code} modifiee`,
      before, after: updated, context: requestContext(req),
    });
    res.json({ category: updated });
  })
);

assetRoutes.get(
  '/asset-locations',
  requirePermission('asset.view'),
  handler(async (req, res) => {
    const rows = await query(
      `SELECT l.*, cc.name AS cost_center_name,
              COUNT(a.id) AS asset_count
         FROM asset_locations l
         LEFT JOIN cost_centers cc ON cc.id = l.cost_center_id
         LEFT JOIN assets a ON a.location_id = l.id AND a.status <> 'disposed'
        WHERE l.org_id = ? AND l.is_active = 1
        GROUP BY l.id ORDER BY l.code`,
      [req.orgId]
    );
    res.json({ rows, total: rows.length });
  })
);

/** Recomputes compliance flags and TCO; the nightly sweep calls the same path. */
assetRoutes.post(
  '/assets/refresh-compliance',
  requirePermission('asset.edit', 'calibration.record'),
  handler(async (req, res) => {
    const result = await transaction(async (tx) => {
      const flagged = await refreshComplianceFlags(tx, req.orgId, null);
      // Set-based roll-up: the per-asset helper is for single-asset callers.
      const rolled = await tx.query(
        `UPDATE assets a
            SET a.total_maintenance_cost = (
                  SELECT COALESCE(SUM(w.total_cost), 0) FROM work_orders w
                   WHERE w.asset_id = a.id AND w.status IN ('completed','verified')
                ) + (
                  SELECT COALESCE(SUM(cl.cost), 0) FROM calibrations cl WHERE cl.asset_id = a.id
                ),
                a.total_parts_cost = (
                  SELECT COALESCE(SUM(w.parts_cost), 0) FROM work_orders w
                   WHERE w.asset_id = a.id AND w.status IN ('completed','verified')
                )
          WHERE a.org_id = ?`,
        [req.orgId]
      );
      return { flagged, assets_rolled_up: rolled.affectedRows ?? 0 };
    });
    res.json(result);
  })
);
