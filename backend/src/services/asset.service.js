import QRCode from 'qrcode';
import { money } from '../utils/money.js';
import { toISO, addMonths, nextOccurrence, today, compare } from '../utils/dates.js';
import { ApiError } from '../utils/errors.js';
import { createJournalEntry, nextSequence } from './ledger.service.js';
import { accumulatedAsOf } from './depreciation.service.js';

/**
 * Hospital asset lifecycle: acquire -> tag & commission -> maintain ->
 * calibrate -> depreciate -> dispose (SRS 5.8).
 *
 * Every step that changes value posts through ledger.service so the
 * fixed-asset ledger and the asset register can never drift apart, which is
 * the go-live acceptance criterion in SRS section 10.
 */

const setting = async (tx, orgId, key, fallback) => {
  const row = await tx.queryOne('SELECT value_text FROM settings WHERE org_id = ? AND setting_key = ?', [orgId, key]);
  return row?.value_text ?? fallback;
};

export async function generateAssetTag(tx, orgId) {
  return nextSequence(tx, orgId, 'asset_tag');
}

export async function assetQrDataUrl(payload) {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}

export async function assetQrSvg(payload) {
  return QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
}

/**
 * FR-AM-001 / FR-AM-002 :: register an asset and mint its identification tag.
 * Category defaults supply both measurement bases and the compliance intervals,
 * so a technician never has to know the accounting policy.
 */
export async function registerAsset(tx, orgId, data, actor = null) {
  const category = await tx.queryOne(
    'SELECT * FROM asset_categories WHERE id = ? AND org_id = ?',
    [data.categoryId, orgId]
  );
  if (!category) throw new ApiError(422, 'Asset category not found.');

  const tag = data.assetTag || (await generateAssetTag(tx, orgId));
  const existing = await tx.queryOne('SELECT id FROM assets WHERE org_id = ? AND asset_tag = ?', [orgId, tag]);
  if (existing) throw new ApiError(409, `Asset tag ${tag} is already in use.`);

  if (data.serialNumber) {
    const dupe = await tx.queryOne(
      'SELECT id, asset_tag FROM assets WHERE org_id = ? AND serial_number = ? AND status <> "disposed"',
      [orgId, data.serialNumber]
    );
    if (dupe) {
      throw new ApiError(409, `Serial number ${data.serialNumber} is already registered as ${dupe.asset_tag}.`);
    }
  }

  const acquisitionCost = money(data.acquisitionCost || 0);
  const incidental = money(data.incidentalCosts || 0);
  const cost = money(acquisitionCost + incidental);

  // OHADA uses historical cost with statutory life tables; IFRS may apply a
  // different life, residual and model on the very same asset (IAS 16).
  const ohadaSalvage = money((cost * Number(category.ohada_salvage_pct)) / 100);
  const ifrsResidual = money((cost * Number(category.ifrs_residual_pct)) / 100);

  const baseUrl = await setting(tx, orgId, 'asset.qr_base_url', 'https://ledgercore.local/a/');
  const qrPayload = `${baseUrl}${tag}`;

  const inServiceDate = data.inServiceDate ? toISO(data.inServiceDate) : null;
  const calibrationInterval = data.calibrationIntervalMonths ?? category.calibration_interval_months;

  const res = await tx.query(
    `INSERT INTO assets
      (org_id, asset_tag, name, description, category_id, manufacturer, model, serial_number,
       year_of_manufacture, cost_center_id, location_id, custodian_user_id, is_mobile,
       status, asset_condition, criticality,
       acquisition_date, capitalization_date, in_service_date, depr_start_date,
       funding_source, funding_reference, donor_name, supplier_id, purchase_order_id, supplier_invoice_id,
       currency, acquisition_cost, incidental_costs,
       ohada_cost, ohada_salvage, ohada_useful_life_months, ohada_method, ohada_declining_factor, ohada_nbv,
       ifrs_cost, ifrs_residual, ifrs_useful_life_months, ifrs_method, ifrs_declining_factor,
       ifrs_measurement_model, ifrs_nbv,
       parent_asset_id, is_component, warranty_start, warranty_end, warranty_terms,
       calibration_interval_months, next_calibration_date, next_safety_test_date, next_pm_date,
       qr_payload, barcode_value, has_rfid, rfid_tag, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId, tag, data.name, data.description ?? null, category.id,
      data.manufacturer ?? null, data.model ?? null, data.serialNumber ?? null,
      data.yearOfManufacture ?? null, data.costCenterId ?? null, data.locationId ?? null,
      data.custodianUserId ?? null, data.isMobile ?? 1,
      data.status || (inServiceDate ? 'in_service' : 'in_stock'),
      data.condition || 'new', data.criticality || category.default_criticality,
      data.acquisitionDate ? toISO(data.acquisitionDate) : null,
      data.capitalizationDate ? toISO(data.capitalizationDate) : null,
      inServiceDate, inServiceDate || (data.capitalizationDate ? toISO(data.capitalizationDate) : null),
      data.fundingSource || 'purchase', data.fundingReference ?? null, data.donorName ?? null,
      data.supplierId ?? null, data.purchaseOrderId ?? null, data.supplierInvoiceId ?? null,
      data.currency || 'XAF', acquisitionCost, incidental,
      cost, ohadaSalvage, data.ohadaUsefulLifeMonths ?? category.ohada_useful_life_months,
      data.ohadaMethod || category.ohada_method, category.ohada_declining_factor, cost,
      cost, ifrsResidual, data.ifrsUsefulLifeMonths ?? category.ifrs_useful_life_months,
      data.ifrsMethod || category.ifrs_method, category.ifrs_declining_factor,
      category.ifrs_measurement_model, cost,
      data.parentAssetId ?? null, data.parentAssetId ? 1 : 0,
      data.warrantyStart ? toISO(data.warrantyStart) : null,
      data.warrantyEnd ? toISO(data.warrantyEnd) : null, data.warrantyTerms ?? null,
      calibrationInterval,
      category.requires_calibration && inServiceDate ? nextOccurrence(inServiceDate, calibrationInterval || 12) : null,
      category.requires_safety_test && inServiceDate ? nextOccurrence(inServiceDate, category.safety_interval_months || 12) : null,
      category.pm_interval_months && inServiceDate ? nextOccurrence(inServiceDate, category.pm_interval_months) : null,
      qrPayload, tag, data.hasRfid ?? 0, data.rfidTag ?? null, data.notes ?? null,
      actor?.id ?? null,
    ]
  );
  const assetId = res.insertId;

  await tx.query(
    `INSERT INTO asset_movements
       (org_id, asset_id, movement_type, movement_date, to_location_id, to_cost_center_id,
        to_custodian_id, to_status, reason, recorded_by)
     VALUES (?,?,'registration',?,?,?,?,?,?,?)`,
    [
      orgId, assetId, toISO(data.acquisitionDate || today()),
      data.locationId ?? null, data.costCenterId ?? null, data.custodianUserId ?? null,
      data.status || (inServiceDate ? 'in_service' : 'in_stock'),
      'Enregistrement initial au registre des immobilisations', actor?.id ?? null,
    ]
  );

  await createPlansForAsset(tx, orgId, assetId, category, inServiceDate);
  return { id: assetId, asset_tag: tag, qr_payload: qrPayload };
}

/** FR-AM-020 / FR-AM-022 :: derive the schedules from the category defaults. */
export async function createPlansForAsset(tx, orgId, assetId, category, startDate) {
  const start = startDate ? toISO(startDate) : today();
  const plans = [];

  if (category.pm_interval_months || category.pm_interval_hours || category.pm_interval_km) {
    plans.push({
      type: 'preventive',
      name: `Maintenance preventive - ${category.name}`,
      trigger: category.pm_interval_km ? 'time_or_usage' : category.pm_interval_hours ? 'time_or_usage' : 'time',
      months: category.pm_interval_months,
      hours: category.pm_interval_hours,
      km: category.pm_interval_km,
      checklist: defaultChecklist(category.domain, 'preventive'),
    });
  }
  if (category.requires_calibration) {
    plans.push({
      type: 'calibration',
      name: `Etalonnage et verification - ${category.name}`,
      trigger: 'time',
      months: category.calibration_interval_months || 12,
      checklist: defaultChecklist(category.domain, 'calibration'),
    });
  }
  if (category.requires_safety_test) {
    plans.push({
      type: 'safety_test',
      name: `Controle de securite electrique (${category.safety_test_standard || 'IEC 60601'})`,
      trigger: 'time',
      months: category.safety_interval_months || 12,
      checklist: defaultChecklist(category.domain, 'safety_test'),
    });
  }

  const team = { biomedical: 'biomedical', facility: 'facilities', fleet: 'fleet', it_office: 'it' }[category.domain] || 'biomedical';

  for (const p of plans) {
    const code = await nextSequence(tx, orgId, 'maintenance_plan');
    await tx.query(
      `INSERT INTO maintenance_plans
         (org_id, code, name, asset_id, category_id, plan_type, trigger_type,
          interval_months, interval_hours, interval_km, interval_source, task_checklist,
          assigned_team, start_date, next_due_date, priority)
       VALUES (?,?,?,?,?,?,?,?,?,?,'manufacturer',?,?,?,?,?)`,
      [
        orgId, code, p.name, assetId, category.id, p.type, p.trigger,
        p.months ?? null, p.hours ?? null, p.km ?? null, p.checklist,
        team, start, nextOccurrence(start, p.months || 12),
        category.default_criticality === 'critical' ? 'high' : 'normal',
      ]
    );
  }
  return plans.length;
}

function defaultChecklist(domain, type) {
  const lists = {
    'biomedical:preventive': [
      'Inspection visuelle du chassis, des cables et des accessoires',
      'Nettoyage et decontamination externe',
      'Verification des alarmes sonores et visuelles',
      'Controle des batteries et de l autonomie de secours',
      'Test fonctionnel selon le manuel du fabricant',
      'Remplacement des filtres et consommables de maintenance',
      'Mise a jour du journal de maintenance de l appareil',
    ],
    'biomedical:calibration': [
      'Mise en chauffe de l appareil selon la specification fabricant',
      'Raccordement de l etalon de reference (tracabilite documentee)',
      'Mesure aux points de controle bas, moyen et haut de la plage',
      'Calcul de l ecart et comparaison a la tolerance admissible',
      'Ajustement si necessaire puis remesure',
      'Emission du certificat d etalonnage et archivage',
      'Mise a jour de l etiquette d etalonnage sur l appareil',
    ],
    'biomedical:safety_test': [
      'Continuite de la terre de protection (< 0,2 ohm)',
      'Resistance d isolement',
      'Courant de fuite a la terre',
      'Courant de fuite de l enveloppe',
      'Courant de fuite patient selon la partie appliquee (B / BF / CF)',
      'Inspection des cordons, fiches et dispositifs de protection',
      'Test fonctionnel final et etiquetage de conformite',
    ],
    'facility:preventive': [
      'Inspection generale de l installation et de son local',
      'Controle des niveaux, pressions et temperatures de service',
      'Nettoyage ou remplacement des filtres',
      'Verification des securites et des dispositifs d arret d urgence',
      'Essai de fonctionnement en charge',
      'Releve des compteurs et des heures de service',
    ],
    'fleet:preventive': [
      'Vidange moteur et remplacement du filtre a huile',
      'Controle des filtres a air et a carburant',
      'Controle des freins, pneumatiques et suspension',
      'Controle des niveaux et de la batterie',
      'Verification de l eclairage, du gyrophare et de la sirene',
      'Controle du materiel medical embarque et de l oxygene',
      'Releve du kilometrage et mise a jour du carnet d entretien',
    ],
    'it_office:preventive': [
      'Nettoyage et depoussierage',
      'Controle des ventilateurs et de la temperature',
      'Mise a jour des correctifs et du micrologiciel',
      'Verification des sauvegardes et de l onduleur',
      'Controle de l espace disque et des journaux d erreur',
    ],
  };
  return (lists[`${domain}:${type}`] || lists[`${domain}:preventive`] || []).join('\n');
}

/**
 * FR-AM-010 :: capitalise the asset and post the fixed-asset journal entry.
 * The credit side follows the funding source, which is what distinguishes a
 * purchased ventilator from a donated or grant-funded one.
 */
export async function capitalizeAsset(tx, orgId, assetId, opts = {}) {
  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ? AND org_id = ?', [assetId, orgId]);
  if (!asset) throw new ApiError(404, 'Asset not found.');
  if (asset.is_capitalized) throw new ApiError(409, `Asset ${asset.asset_tag} is already capitalised.`);
  if (money(asset.ohada_cost) <= 0) throw new ApiError(422, 'Asset cost is zero; nothing to capitalise.');

  const category = await tx.queryOne('SELECT * FROM asset_categories WHERE id = ?', [asset.category_id]);
  const assetAccount = await tx.queryOne('SELECT * FROM accounts WHERE id = ?', [category.asset_account_id]);
  if (!assetAccount) {
    throw new ApiError(422, `Category ${category.code} has no fixed-asset account configured.`);
  }

  const date = toISO(opts.date || asset.capitalization_date || asset.acquisition_date || today());
  const cost = money(asset.ohada_cost);
  const vat = money(opts.recoverableVat || 0);

  const creditByFunding = {
    purchase: '481',          // Fournisseurs d'investissement
    donation: '845',          // Dons et liberalites obtenus (H.A.O. income)
    grant: '143',             // Subventions d'equipement - bailleurs
    lease: '173',             // Emprunt equivalent de credit-bail mobilier
    transfer: '185',          // Comptes de liaison des etablissements
    own_construction: '722',  // Production immobilisee
  };
  const creditCode = opts.creditAccountCode || creditByFunding[asset.funding_source] || '481';

  const lines = [
    {
      accountId: assetAccount.id,
      assetId,
      costCenterId: asset.cost_center_id,
      description: `${asset.asset_tag} - ${asset.name}`,
      debit: cost,
      credit: 0,
    },
  ];
  if (vat > 0) {
    lines.push({
      accountCode: '4451',
      description: `Recoverable VAT on fixed asset ${asset.asset_tag}`,
      debit: vat,
      credit: 0,
    });
  }
  lines.push({
    accountCode: creditCode,
    description: `${asset.asset_tag} - ${asset.name}`,
    debit: 0,
    credit: money(cost + vat),
    partnerType: asset.supplier_id ? 'supplier' : 'none',
    partnerId: asset.supplier_id,
  });

  const entry = await createJournalEntry(tx, {
    orgId,
    journalCode: 'IMM',
    date,
    description: `Capitalisation of ${asset.asset_tag} - ${asset.name}`,
    reference: asset.asset_tag,
    source: 'asset_acquisition',
    sourceRef: asset.asset_tag,
    framework: 'both',
    currency: asset.currency,
    autoPost: true,
    actor: opts.actor,
    overrideReason: opts.overrideReason,
    lines,
  });

  await tx.query(
    `UPDATE assets
        SET is_capitalized = 1, capitalization_date = ?, acquisition_entry_id = ?,
            status = CASE WHEN status = 'draft' THEN 'in_stock' ELSE status END
      WHERE id = ?`,
    [date, entry.id, assetId]
  );

  return entry;
}

/** FR-AM-011 :: installation & commissioning before the asset goes in service. */
export async function commissionAsset(tx, orgId, assetId, data, actor = null) {
  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ? AND org_id = ?', [assetId, orgId]);
  if (!asset) throw new ApiError(404, 'Asset not found.');
  const category = await tx.queryOne('SELECT * FROM asset_categories WHERE id = ?', [asset.category_id]);

  if (category.requires_calibration && !data.initialCalibrationDone) {
    throw new ApiError(
      422,
      `${category.name} requires an initial calibration certificate before it can be marked in service.`
    );
  }
  if (category.requires_safety_test && !data.safetyCheckDone) {
    throw new ApiError(
      422,
      `${category.name} requires an electrical safety check (${category.safety_test_standard}) before commissioning.`
    );
  }

  const inService = toISO(data.inServiceDate || today());
  await tx.query(
    `UPDATE assets
        SET commissioning_done = 1, commissioning_date = ?, commissioning_notes = ?,
            in_service_date = ?, depr_start_date = COALESCE(depr_start_date, ?),
            status = 'in_service',
            next_pm_date = COALESCE(next_pm_date, ?),
            next_calibration_date = COALESCE(next_calibration_date, ?),
            next_safety_test_date = COALESCE(next_safety_test_date, ?)
      WHERE id = ?`,
    [
      toISO(data.commissioningDate || inService), data.notes ?? null, inService, inService,
      category.pm_interval_months ? addMonths(inService, category.pm_interval_months) : null,
      category.requires_calibration ? addMonths(inService, asset.calibration_interval_months || category.calibration_interval_months || 12) : null,
      category.requires_safety_test ? addMonths(inService, category.safety_interval_months || 12) : null,
      assetId,
    ]
  );

  await tx.query(
    `INSERT INTO asset_movements (org_id, asset_id, movement_type, movement_date, from_status, to_status, reason, recorded_by)
     VALUES (?,?,'status_change',?,?, 'in_service', ?, ?)`,
    [orgId, assetId, inService, asset.status, 'Installation et mise en service validees', actor?.id ?? null]
  );
  return { id: assetId, in_service_date: inService };
}

/** FR-AM-040 :: location & custody tracking with full movement history. */
export async function moveAsset(tx, orgId, assetId, data, actor = null) {
  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ? AND org_id = ?', [assetId, orgId]);
  if (!asset) throw new ApiError(404, 'Asset not found.');
  if (asset.status === 'disposed') throw new ApiError(409, 'A disposed asset cannot be moved.');

  const date = toISO(data.movementDate || today());
  await tx.query(
    `INSERT INTO asset_movements
       (org_id, asset_id, movement_type, movement_date,
        from_location_id, to_location_id, from_cost_center_id, to_cost_center_id,
        from_custodian_id, to_custodian_id, expected_return_date, reason, approved_by, recorded_by, scanned_tag)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId, assetId, data.movementType || 'transfer', date,
      asset.location_id, data.toLocationId ?? asset.location_id,
      asset.cost_center_id, data.toCostCenterId ?? asset.cost_center_id,
      asset.custodian_user_id, data.toCustodianUserId ?? asset.custodian_user_id,
      data.expectedReturnDate ? toISO(data.expectedReturnDate) : null,
      data.reason ?? null, data.approvedBy ?? null, actor?.id ?? null, data.scanned ? 1 : 0,
    ]
  );

  await tx.query(
    'UPDATE assets SET location_id = ?, cost_center_id = ?, custodian_user_id = ? WHERE id = ?',
    [
      data.toLocationId ?? asset.location_id,
      data.toCostCenterId ?? asset.cost_center_id,
      data.toCustodianUserId ?? asset.custodian_user_id,
      assetId,
    ]
  );
  return { id: assetId };
}

/**
 * FR-AM-022 :: flag or restrict equipment overdue for calibration.
 * Called after every calibration record and by the nightly compliance sweep.
 */
export async function refreshComplianceFlags(tx, orgId, assetId = null) {
  const blockOverdue = (await setting(tx, orgId, 'asset.block_use_when_calibration_overdue', 'true')) === 'true';
  const params = [orgId];
  let scope = '';
  if (assetId) {
    scope = ' AND a.id = ?';
    params.push(assetId);
  }

  const rows = await tx.query(
    `SELECT a.id, a.status, a.next_calibration_date, a.next_safety_test_date, a.use_restricted,
            c.requires_calibration, c.requires_safety_test
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
      WHERE a.org_id = ? AND a.status NOT IN ('disposed','pending_disposal')${scope}`,
    params
  );

  const now = today();
  let flagged = 0;
  for (const a of rows) {
    const calibrationOverdue = a.requires_calibration && a.next_calibration_date && compare(a.next_calibration_date, now) < 0;
    const safetyOverdue = a.requires_safety_test && a.next_safety_test_date && compare(a.next_safety_test_date, now) < 0;
    const shouldRestrict = blockOverdue && (calibrationOverdue || safetyOverdue);

    const reasons = [];
    if (calibrationOverdue) reasons.push(`Etalonnage echu depuis le ${a.next_calibration_date}`);
    if (safetyOverdue) reasons.push(`Controle de securite electrique echu depuis le ${a.next_safety_test_date}`);

    const nextStatus = calibrationOverdue || safetyOverdue
      ? (a.status === 'in_service' ? 'calibration_overdue' : a.status)
      : (a.status === 'calibration_overdue' ? 'in_service' : a.status);

    if (shouldRestrict !== Boolean(a.use_restricted) || nextStatus !== a.status) {
      await tx.query(
        'UPDATE assets SET use_restricted = ?, restriction_reason = ?, status = ? WHERE id = ?',
        [shouldRestrict ? 1 : 0, reasons.join(' ; ') || null, nextStatus, a.id]
      );
      flagged += 1;
    }
  }
  return flagged;
}

/** FR-AM-032 :: total cost of ownership roll-up for replacement decisions. */
export async function rollUpMaintenanceCost(tx, orgId, assetId) {
  const totals = await tx.queryOne(
    `SELECT COALESCE(SUM(total_cost),0) AS total,
            COALESCE(SUM(parts_cost),0)  AS parts
       FROM work_orders
      WHERE org_id = ? AND asset_id = ? AND status IN ('completed','verified')`,
    [orgId, assetId]
  );
  const calib = await tx.queryOne(
    'SELECT COALESCE(SUM(cost),0) AS total FROM calibrations WHERE org_id = ? AND asset_id = ?',
    [orgId, assetId]
  );
  await tx.query(
    'UPDATE assets SET total_maintenance_cost = ?, total_parts_cost = ? WHERE id = ?',
    [money(Number(totals.total) + Number(calib.total)), money(totals.parts), assetId]
  );
  return { maintenance: money(Number(totals.total) + Number(calib.total)), parts: money(totals.parts) };
}

/** Opening accumulated depreciation for assets migrated from the legacy system. */
export function openingAccumulated(asset, asOf) {
  const start = asset.depr_start_date || asset.in_service_date || asset.capitalization_date;
  if (!start) return { ohada: 0, ifrs: 0, ohadaMonths: 0, ifrsMonths: 0 };
  const ohada = accumulatedAsOf({
    cost: asset.ohada_cost,
    residual: asset.ohada_salvage,
    usefulLifeMonths: asset.ohada_useful_life_months,
    method: asset.ohada_method,
    decliningFactor: asset.ohada_declining_factor,
    startDate: start,
    asOf,
  });
  const ifrs = accumulatedAsOf({
    cost: asset.ifrs_cost,
    residual: asset.ifrs_residual,
    usefulLifeMonths: asset.ifrs_useful_life_months,
    method: asset.ifrs_method,
    decliningFactor: asset.ifrs_declining_factor,
    startDate: start,
    asOf,
  });
  return {
    ohada: ohada.accumDepr,
    ifrs: ifrs.accumDepr,
    ohadaMonths: ohada.monthsCharged,
    ifrsMonths: ifrs.monthsCharged,
  };
}

/**
 * FR-AM-042 :: controlled disposal / decommissioning.
 * Carrying amounts are snapshotted on both bases at request time so the
 * gain / loss the approver sees is the one that gets posted.
 */
export async function requestDisposal(tx, orgId, assetId, data, actor = null) {
  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ? AND org_id = ?', [assetId, orgId]);
  if (!asset) throw new ApiError(404, 'Asset not found.');
  if (asset.status === 'disposed') throw new ApiError(409, 'Asset is already disposed.');

  const open = await tx.queryOne(
    "SELECT id, disposal_no FROM asset_disposals WHERE asset_id = ? AND status NOT IN ('rejected','completed')",
    [assetId]
  );
  if (open) throw new ApiError(409, `Disposal ${open.disposal_no} is already in progress for this asset.`);

  const ohadaCarrying = money(asset.ohada_cost - asset.ohada_accum_depr);
  const ifrsCarrying = money(asset.ifrs_cost - asset.ifrs_accum_depr - asset.ifrs_accum_impairment + asset.ifrs_revaluation_surplus);
  const proceeds = money(data.proceeds || 0);
  const costs = money(data.disposalCosts || 0);

  const disposalNo = await nextSequence(tx, orgId, 'disposal', data.requestDate);
  const res = await tx.query(
    `INSERT INTO asset_disposals
       (org_id, disposal_no, asset_id, request_date, disposal_date, method, reason,
        proceeds, disposal_costs, buyer_name, recipient_name, waste_handler,
        decontamination_done, data_wiped, certificate_no,
        ohada_cost, ohada_accum_depr, ohada_carrying_amount, ohada_gain_loss,
        ifrs_cost, ifrs_accum_depr, ifrs_carrying_amount, ifrs_gain_loss,
        status, requested_by, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_approval',?,?)`,
    [
      orgId, disposalNo, assetId, toISO(data.requestDate || today()),
      data.disposalDate ? toISO(data.disposalDate) : null,
      data.method, data.reason, proceeds, costs,
      data.buyerName ?? null, data.recipientName ?? null, data.wasteHandler ?? null,
      data.decontaminationDone ? 1 : 0, data.dataWiped ? 1 : 0, data.certificateNo ?? null,
      asset.ohada_cost, asset.ohada_accum_depr, ohadaCarrying, money(proceeds - costs - ohadaCarrying),
      asset.ifrs_cost, asset.ifrs_accum_depr, ifrsCarrying, money(proceeds - costs - ifrsCarrying),
      actor?.id ?? null, data.notes ?? null,
    ]
  );

  await tx.query("UPDATE assets SET status = 'pending_disposal', disposal_id = ? WHERE id = ?", [res.insertId, assetId]);
  return { id: res.insertId, disposal_no: disposalNo, ohada_gain_loss: money(proceeds - costs - ohadaCarrying) };
}

export async function decideDisposal(tx, orgId, disposalId, { approve, reason, actor }) {
  const d = await tx.queryOne('SELECT * FROM asset_disposals WHERE id = ? AND org_id = ?', [disposalId, orgId]);
  if (!d) throw new ApiError(404, 'Disposal request not found.');
  if (d.status !== 'pending_approval') throw new ApiError(409, `Disposal ${d.disposal_no} is ${d.status}.`);

  if (!approve) {
    await tx.query(
      "UPDATE asset_disposals SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = NOW() WHERE id = ?",
      [reason ?? null, actor?.id ?? null, disposalId]
    );
    await tx.query(
      "UPDATE assets SET status = CASE WHEN status = 'pending_disposal' THEN 'in_service' ELSE status END, disposal_id = NULL WHERE id = ?",
      [d.asset_id]
    );
    return { id: disposalId, status: 'rejected' };
  }

  await tx.query(
    "UPDATE asset_disposals SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?",
    [actor?.id ?? null, disposalId]
  );
  return { id: disposalId, status: 'approved' };
}

/**
 * Posts the disposal on both bases and removes the asset from the fixed-asset
 * ledger. The OHADA entry is the book of record; a framework-tagged delta entry
 * clears the IFRS-only accumulated depreciation so the IFRS gain / loss is right.
 */
export async function completeDisposal(tx, orgId, disposalId, opts = {}) {
  const d = await tx.queryOne('SELECT * FROM asset_disposals WHERE id = ? AND org_id = ?', [disposalId, orgId]);
  if (!d) throw new ApiError(404, 'Disposal request not found.');
  if (d.status !== 'approved') throw new ApiError(409, `Disposal ${d.disposal_no} must be approved first.`);

  const asset = await tx.queryOne('SELECT * FROM assets WHERE id = ?', [d.asset_id]);
  const category = await tx.queryOne('SELECT * FROM asset_categories WHERE id = ?', [asset.category_id]);
  const assetAccount = await tx.queryOne('SELECT id, code FROM accounts WHERE id = ?', [category.asset_account_id]);
  const accumAccount = await tx.queryOne('SELECT id, code FROM accounts WHERE id = ?', [category.accum_depr_account_id]);

  const date = toISO(opts.date || d.disposal_date || today());
  const cost = money(d.ohada_cost);
  const accum = money(d.ohada_accum_depr);
  const carrying = money(cost - accum);
  const proceeds = money(d.proceeds);
  const costs = money(d.disposal_costs);

  // 1. Retire the asset on the OHADA basis: reverse accumulated depreciation,
  //    expense the remaining carrying amount to 812, credit the gross cost.
  const retireLines = [];
  if (accum > 0) {
    retireLines.push({ accountId: accumAccount.id, assetId: asset.id, description: `Reversal of accumulated depreciation ${asset.asset_tag}`, debit: accum, credit: 0 });
  }
  if (carrying > 0) {
    retireLines.push({ accountCode: '812', assetId: asset.id, description: `NBV written off ${asset.asset_tag}`, debit: carrying, credit: 0 });
  }
  retireLines.push({ accountId: assetAccount.id, assetId: asset.id, description: `Disposal of ${asset.asset_tag} - ${asset.name}`, debit: 0, credit: cost });

  if (proceeds > 0) {
    const cashCode = opts.proceedsAccountCode || '485';
    retireLines.push({ accountCode: cashCode, description: `Disposal proceeds ${asset.asset_tag}`, debit: proceeds, credit: 0 });
    retireLines.push({ accountCode: '822', assetId: asset.id, description: `Disposal proceeds ${asset.asset_tag}`, debit: 0, credit: proceeds });
  }
  if (costs > 0) {
    retireLines.push({ accountCode: '831', description: `Disposal / elimination costs ${asset.asset_tag}`, debit: costs, credit: 0 });
    retireLines.push({ accountCode: '4882', description: `Disposal costs ${asset.asset_tag}`, debit: 0, credit: costs });
  }

  const ohadaEntry = await createJournalEntry(tx, {
    orgId,
    journalCode: 'IMM',
    date,
    description: `${labelForMethod(d.method)} ${asset.asset_tag} - ${asset.name}`,
    reference: d.disposal_no,
    source: 'disposal',
    sourceRef: d.disposal_no,
    framework: 'both',
    currency: asset.currency,
    autoPost: true,
    actor: opts.actor,
    overrideReason: opts.overrideReason,
    lines: retireLines,
  });

  // 2. Clear the IFRS-only accumulated depreciation difference.
  const delta = money(d.ifrs_accum_depr - d.ohada_accum_depr);
  let ifrsEntry = null;
  if (delta !== 0) {
    ifrsEntry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'IMM',
      date,
      description: `IFRS adjustment on disposal of ${asset.asset_tag} (accumulated-depreciation difference)`,
      reference: d.disposal_no,
      source: 'disposal',
      sourceRef: d.disposal_no,
      framework: 'ifrs',
      currency: asset.currency,
      autoPost: true,
      actor: opts.actor,
      overrideReason: opts.overrideReason,
      lines: delta > 0
        ? [
            { accountId: accumAccount.id, assetId: asset.id, description: 'Reversal of excess IFRS accumulated depreciation', debit: delta, credit: 0 },
            { accountCode: '812', assetId: asset.id, description: 'Reduction of NBV on the IFRS basis', debit: 0, credit: delta },
          ]
        : [
            { accountCode: '812', assetId: asset.id, description: 'Increase of NBV on the IFRS basis', debit: -delta, credit: 0 },
            { accountId: accumAccount.id, assetId: asset.id, description: 'Additional IFRS accumulated depreciation', debit: 0, credit: -delta },
          ],
    });
  }

  await tx.query(
    `UPDATE asset_disposals
        SET status = 'completed', disposal_date = ?, ohada_entry_id = ?, ifrs_entry_id = ?
      WHERE id = ?`,
    [date, ohadaEntry.id, ifrsEntry?.id ?? null, disposalId]
  );

  await tx.query(
    `UPDATE assets
        SET status = 'disposed', use_restricted = 0, restriction_reason = NULL,
            ohada_nbv = 0, ifrs_nbv = 0, next_pm_date = NULL,
            next_calibration_date = NULL, next_safety_test_date = NULL
      WHERE id = ?`,
    [asset.id]
  );
  await tx.query('UPDATE maintenance_plans SET is_active = 0 WHERE asset_id = ?', [asset.id]);
  await tx.query(
    `INSERT INTO asset_movements (org_id, asset_id, movement_type, movement_date, from_status, to_status, reason, recorded_by)
     VALUES (?,?,'disposal',?,?, 'disposed', ?, ?)`,
    [orgId, asset.id, date, asset.status, `${labelForMethod(d.method)} - ${d.reason}`, opts.actor?.id ?? null]
  );

  return {
    disposal_no: d.disposal_no,
    ohada_entry: ohadaEntry,
    ifrs_entry: ifrsEntry,
    ohada_gain_loss: money(proceeds - costs - carrying),
    ifrs_gain_loss: money(proceeds - costs - d.ifrs_carrying_amount),
  };
}

function labelForMethod(method) {
  return {
    sale: 'Disposal by sale',
    donation: 'Disposal by donation',
    scrap: 'Scrapping',
    trade_in: 'Trade-in',
    biomedical_waste: 'Disposal as biomedical waste',
    write_off: 'Write-off for destruction',
    theft_loss: 'Write-off for theft or loss',
    return_to_donor: 'Return to donor',
  }[method] || 'Disposal';
}
