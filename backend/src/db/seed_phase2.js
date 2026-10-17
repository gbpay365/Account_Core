import { pool, query, queryOne } from './pool.js';
import * as inventoryService from '../services/asset-inventory.service.js';
import * as fiscalDeprService from '../services/fiscal-depreciation.service.js';
import * as dsfService from '../services/dsf.service.js';

async function seedPhase2() {
  console.log('Seeding Phase 2 Demo Data...');

  const orgId = 1;

  // 1. Fiscal Year
  const fy = await queryOne(`SELECT id, code FROM fiscal_years WHERE org_id = ? AND status != 'closed' LIMIT 1`, [orgId]);
  if (!fy) {
    console.error('No open fiscal year found.');
    process.exit(1);
  }

  // 2. Physical Inventory Campaign
  const existingCamp = await queryOne(`SELECT id FROM asset_inventory_campaigns WHERE org_id = ? AND name LIKE 'Campagne d%Inventaire Physique 2026%' LIMIT 1`, [orgId]);

  if (!existingCamp) {
    const campaign = await inventoryService.createCampaign(orgId, {
      name: 'Campagne d’Inventaire Physique 2026 - Audit Annuel du Patrimoine',
      fiscal_year_id: fy.id,
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      notes: 'Inventaire physique annuel contradictoire des équipements biomédicaux et installations techniques.',
    }, 1);

    console.log('Created inventory campaign:', campaign);

    // Fetch sample assets and locations
    const assets = await query(`SELECT * FROM assets WHERE org_id = ? LIMIT 20`, [orgId]);
    const locations = await query(`SELECT * FROM asset_locations WHERE org_id = ? LIMIT 10`, [orgId]);

    if (assets.length > 0 && locations.length > 0) {
      // 1. Scans: Verified
      for (let i = 0; i < Math.min(12, assets.length); i++) {
        const a = assets[i];
        await inventoryService.recordScan(orgId, campaign.id, {
          scanned_tag: a.asset_tag,
          location_id: a.location_id || locations[0].id,
          scanned_condition: a.asset_condition || 'good',
          scanned_operational_status: a.status || 'in_service',
          notes: 'Vérifié conforme lors du passage de l’équipe d’audit.',
        }, 1);
      }

      // 2. Scan: Relocated
      if (assets.length > 13 && locations.length > 1) {
        const aRelocated = assets[13];
        const newLoc = locations.find(l => l.id !== aRelocated.location_id) || locations[1];
        await inventoryService.recordScan(orgId, campaign.id, {
          scanned_tag: aRelocated.asset_tag,
          location_id: newLoc.id,
          scanned_condition: 'good',
          scanned_operational_status: 'in_service',
          notes: 'Matériel déplacé sans fiche de mouvement préalable.',
        }, 1);
      }

      // 3. Scan: Damaged
      if (assets.length > 14) {
        const aDamaged = assets[14];
        await inventoryService.recordScan(orgId, campaign.id, {
          scanned_tag: aDamaged.asset_tag,
          location_id: aDamaged.location_id,
          scanned_condition: 'poor',
          scanned_operational_status: 'under_maintenance',
          notes: 'Équipement hors service présentant une usure anormale.',
        }, 1);
      }

      // 4. Scan: Unregistered item found on site
      await inventoryService.recordScan(orgId, campaign.id, {
        scanned_tag: 'TAG-UNKNOWN-99120',
        location_id: locations[0].id,
        scanned_condition: 'good',
        scanned_operational_status: 'in_service',
        notes: 'Moniteur patient multiparamétrique trouvé en Réanimation, sans étiquette d’inventaire.',
      }, 1);
    }
  }

  // 3. DSF Tax Adjustments (Tableau 28/29)
  const existingAdj = await query(`SELECT id FROM dsf_tax_adjustments WHERE org_id = ? AND fiscal_year_id = ?`, [orgId, fy.id]);
  if (existingAdj.length === 0) {
    const adjustments = [
      {
        fiscal_year_id: fy.id,
        adjustment_type: 'reintegration',
        line_code: 'WD',
        description: 'Amendes, confiscations et pénalités fiscales (Art. 8 CGI)',
        amount: 1500000,
        notes: 'Pénalités de retard sur déclarations antérieures',
      },
      {
        fiscal_year_id: fy.id,
        adjustment_type: 'reintegration',
        line_code: 'WE',
        description: 'Dons et libéralités excédant le plafond légal de 0.5% du CA (Art. 7 CGI)',
        amount: 2800000,
        notes: 'Dons associatifs excédentaires',
      },
      {
        fiscal_year_id: fy.id,
        adjustment_type: 'reintegration',
        line_code: 'WF',
        description: 'Amortissements excédentaires sur véhicules de tourisme plafonnés (Art. 7 CGI)',
        amount: 4200000,
        notes: 'Véhicules de direction',
      },
      {
        fiscal_year_id: fy.id,
        adjustment_type: 'deduction',
        line_code: 'WI',
        description: 'Plus-values de cession d’actifs immobilisés à réinvestir (Art. 9 CGI)',
        amount: 3500000,
        notes: 'Engagement formel de réinvestissement sous 3 ans',
      },
    ];

    for (const adj of adjustments) {
      await dsfService.addTaxAdjustment(orgId, adj);
    }
    console.log('Seeded 4 statutory DSF tax adjustments for Tableau 28/29.');
  }

  // 4. Fiscal Depreciation Simulation / Check
  const fiscalSim = await fiscalDeprService.simulateFiscalDepreciation(orgId, 2026);
  console.log(`Fiscal Depreciation for 2026: Economic=${fiscalSim.total_economic_depreciation}, Fiscal=${fiscalSim.total_fiscal_depreciation}, Net Derogatory=${fiscalSim.net_derogatory}`);

  console.log('Phase 2 seed completed successfully.');
  process.exit(0);
}

seedPhase2().catch(err => {
  console.error('Seed Phase 2 error:', err);
  process.exit(1);
});
