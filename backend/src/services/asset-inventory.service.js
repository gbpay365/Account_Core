import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';

/**
 * Physical Asset Barcode Inventory & Reconciliation Service (Inventaire Physique des Immobilisations).
 * Supports statutory physical audits, mobile barcode/QR scanning, location tracking,
 * and PV d'Inventaire generation.
 */

/**
 * List all physical inventory campaigns.
 */
export async function listCampaigns(orgId) {
  const campaigns = await query(
    `SELECT aic.*, fy.code AS fiscal_year_code, u.full_name AS supervisor_name
       FROM asset_inventory_campaigns aic
       JOIN fiscal_years fy ON fy.id = aic.fiscal_year_id
  LEFT JOIN users u ON u.id = aic.supervisor_id
      WHERE aic.org_id = ?
   ORDER BY aic.start_date DESC, aic.id DESC`,
    [orgId]
  );

  return campaigns.map(c => {
    const exp = Number(c.total_expected || 0);
    const scn = Number(c.total_scanned || 0);
    const pct = exp > 0 ? Math.min(100, Math.round((scn / exp) * 100)) : 0;
    return {
      ...c,
      total_expected: exp,
      total_scanned: scn,
      progress_percent: pct,
    };
  });
}

/**
 * Create a new physical inventory campaign.
 */
export async function createCampaign(orgId, payload, userId) {
  const { name, fiscal_year_id, start_date, end_date = null, notes = null } = payload;
  if (!name || !fiscal_year_id || !start_date) {
    throw new ApiError(400, 'Missing mandatory campaign parameters.');
  }

  // Count active assets expected to be audited
  const expRes = await queryOne(
    `SELECT COUNT(*) AS total_count
       FROM assets
      WHERE org_id = ?
        AND status IN ('in_service', 'under_maintenance', 'in_stock')`,
    [orgId]
  );
  const totalExpected = Number(expRes?.total_count || 0);

  const res = await query(
    `INSERT INTO asset_inventory_campaigns
     (org_id, name, fiscal_year_id, start_date, end_date, status, supervisor_id, total_expected, notes)
     VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
    [orgId, name, fiscal_year_id, start_date, end_date, userId, totalExpected, notes]
  );

  return {
    id: res.insertId,
    name,
    total_expected: totalExpected,
    status: 'in_progress',
  };
}

/**
 * Get full campaign details including scans and location summaries.
 */
export async function getCampaignDetails(orgId, campaignId) {
  const campaign = await queryOne(
    `SELECT aic.*, fy.code AS fiscal_year_code, u.full_name AS supervisor_name
       FROM asset_inventory_campaigns aic
       JOIN fiscal_years fy ON fy.id = aic.fiscal_year_id
  LEFT JOIN users u ON u.id = aic.supervisor_id
      WHERE aic.id = ? AND aic.org_id = ?`,
    [campaignId, orgId]
  );
  if (!campaign) throw new ApiError(404, 'Campaign not found.');

  // Scans logged
  const scans = await query(
    `SELECT ais.*, a.name AS asset_name, a.asset_tag AS registered_tag, a.location_id AS original_location_id,
            al_scanned.name AS scanned_location_name,
            al_orig.name AS original_location_name,
            u.full_name AS scanned_by_name
       FROM asset_inventory_scans ais
  LEFT JOIN assets a ON a.id = ais.asset_id
  LEFT JOIN asset_locations al_scanned ON al_scanned.id = ais.location_id
  LEFT JOIN asset_locations al_orig ON al_orig.id = a.location_id
  LEFT JOIN users u ON u.id = ais.scanned_by
      WHERE ais.campaign_id = ?
   ORDER BY ais.scanned_at DESC`,
    [campaignId]
  );

  // Breakdown by location
  const locationBreakdown = await query(
    `SELECT al.id, al.code, al.name,
            (SELECT COUNT(*) FROM assets a WHERE a.location_id = al.id AND a.org_id = ? AND a.status IN ('in_service', 'under_maintenance', 'in_stock')) AS expected_count,
            (SELECT COUNT(*) FROM asset_inventory_scans ais WHERE ais.location_id = al.id AND ais.campaign_id = ?) AS scanned_count
       FROM asset_locations al
      WHERE al.org_id = ?
   ORDER BY al.name ASC`,
    [orgId, campaignId, orgId]
  );

  return {
    campaign: {
      ...campaign,
      total_expected: Number(campaign.total_expected),
      total_scanned: Number(campaign.total_scanned),
      total_missing: Number(campaign.total_missing),
      total_relocated: Number(campaign.total_relocated),
    },
    scans,
    locations: locationBreakdown.map(l => ({
      ...l,
      expected_count: Number(l.expected_count),
      scanned_count: Number(l.scanned_count),
    })),
  };
}

/**
 * Record a physical barcode/QR/RFID scan.
 */
export async function recordScan(orgId, campaignId, payload, userId) {
  const {
    scanned_tag,
    location_id = null,
    scanned_condition = 'good',
    scanned_operational_status = 'in_service',
    notes = null,
  } = payload;

  if (!scanned_tag || !String(scanned_tag).trim()) {
    throw new ApiError(400, 'Barcode/Tag value is required.');
  }

  const cleanTag = String(scanned_tag).trim();

  // Find asset matching tag, barcode or serial number
  const asset = await queryOne(
    `SELECT * FROM assets
      WHERE org_id = ?
        AND (asset_tag = ? OR barcode_value = ? OR serial_number = ? OR rfid_tag = ?)
      LIMIT 1`,
    [orgId, cleanTag, cleanTag, cleanTag, cleanTag]
  );

  let auditResult = 'verified';

  if (!asset) {
    auditResult = 'unregistered';
  } else {
    // Check if location matches
    if (location_id && asset.location_id && Number(location_id) !== Number(asset.location_id)) {
      auditResult = 'relocated';
    } else if (scanned_condition === 'poor' || scanned_condition === 'scrap') {
      auditResult = 'damaged';
    }
  }

  return await transaction(async (tx) => {
    const res = await tx.query(
      `INSERT INTO asset_inventory_scans
       (campaign_id, asset_id, scanned_tag, location_id, scanned_condition,
        scanned_operational_status, audit_result, scanned_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        campaignId,
        asset?.id || null,
        cleanTag,
        location_id,
        scanned_condition,
        scanned_operational_status,
        auditResult,
        userId,
        notes,
      ]
    );

    // Update campaign counters
    await tx.query(
      `UPDATE asset_inventory_campaigns
          SET total_scanned = (SELECT COUNT(DISTINCT asset_id) FROM asset_inventory_scans WHERE campaign_id = ? AND asset_id IS NOT NULL),
              total_relocated = (SELECT COUNT(*) FROM asset_inventory_scans WHERE campaign_id = ? AND audit_result = 'relocated'),
              total_missing = GREATEST(0, CAST(total_expected AS SIGNED) - CAST((SELECT COUNT(DISTINCT asset_id) FROM asset_inventory_scans WHERE campaign_id = ? AND asset_id IS NOT NULL) AS SIGNED))
        WHERE id = ?`,
      [campaignId, campaignId, campaignId, campaignId]
    );

    return {
      id: res.insertId,
      asset_id: asset?.id || null,
      asset_name: asset?.name || 'Matériel non répertorié au registre',
      scanned_tag: cleanTag,
      audit_result: auditResult,
    };
  });
}

/**
 * Reconcile physical inventory and generate the official Procès-Verbal (PV).
 */
export async function reconcileCampaign(orgId, campaignId) {
  const campaign = await queryOne(
    `SELECT aic.*, fy.code AS fiscal_year_code, o.name AS org_name
       FROM asset_inventory_campaigns aic
       JOIN fiscal_years fy ON fy.id = aic.fiscal_year_id
       JOIN organizations o ON o.id = aic.org_id
      WHERE aic.id = ? AND aic.org_id = ?`,
    [campaignId, orgId]
  );
  if (!campaign) throw new ApiError(404, 'Campaign not found.');

  // 1. Verified assets
  const verifiedAssets = await query(
    `SELECT a.id, a.asset_tag, a.name, a.acquisition_cost, a.ohada_nbv, al.name AS location_name
       FROM assets a
       JOIN asset_inventory_scans ais ON ais.asset_id = a.id AND ais.campaign_id = ? AND ais.audit_result = 'verified'
  LEFT JOIN asset_locations al ON al.id = a.location_id
      WHERE a.org_id = ?
   GROUP BY a.id`,
    [campaignId, orgId]
  );

  // 2. Relocated assets
  const relocatedAssets = await query(
    `SELECT a.id, a.asset_tag, a.name, a.acquisition_cost,
            al_orig.name AS original_location,
            al_scanned.name AS actual_location
       FROM assets a
       JOIN asset_inventory_scans ais ON ais.asset_id = a.id AND ais.campaign_id = ? AND ais.audit_result = 'relocated'
  LEFT JOIN asset_locations al_orig ON al_orig.id = a.location_id
  LEFT JOIN asset_locations al_scanned ON al_scanned.id = ais.location_id
      WHERE a.org_id = ?
   GROUP BY a.id`,
    [campaignId, orgId]
  );

  // 3. Missing assets (expected in register but not scanned)
  const missingAssets = await query(
    `SELECT a.id, a.asset_tag, a.name, a.acquisition_cost, a.ohada_nbv, al.name AS expected_location
       FROM assets a
  LEFT JOIN asset_locations al ON al.id = a.location_id
      WHERE a.org_id = ?
        AND a.status IN ('in_service', 'under_maintenance', 'in_stock')
        AND a.id NOT IN (SELECT DISTINCT asset_id FROM asset_inventory_scans WHERE campaign_id = ? AND asset_id IS NOT NULL)
   ORDER BY a.asset_tag ASC`,
    [orgId, campaignId]
  );

  // 4. Unregistered assets
  const unregisteredScans = await query(
    `SELECT ais.*, al.name AS location_name
       FROM asset_inventory_scans ais
  LEFT JOIN asset_locations al ON al.id = ais.location_id
      WHERE ais.campaign_id = ? AND ais.audit_result = 'unregistered'`,
    [campaignId]
  );

  // Financial impact
  const totalVerifiedCost = verifiedAssets.reduce((sum, a) => sum + Number(a.acquisition_cost || 0), 0);
  const totalMissingCost = missingAssets.reduce((sum, a) => sum + Number(a.acquisition_cost || 0), 0);
  const totalMissingNBV = missingAssets.reduce((sum, a) => sum + Number(a.ohada_nbv || 0), 0);

  // Mark campaign completed
  await query(`UPDATE asset_inventory_campaigns SET status = 'reconciled' WHERE id = ?`, [campaignId]);

  return {
    campaign,
    verified_assets: verifiedAssets,
    verified_count: verifiedAssets.length,
    total_verified_cost: totalVerifiedCost,
    relocated_assets: relocatedAssets,
    relocated_count: relocatedAssets.length,
    missing_assets: missingAssets,
    missing_count: missingAssets.length,
    total_missing_cost: totalMissingCost,
    total_missing_nbv: totalMissingNBV,
    unregistered_scans: unregisteredScans,
    unregistered_count: unregisteredScans.length,
    pv_date: new Date().toISOString().slice(0, 10),
  };
}
