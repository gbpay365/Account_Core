import fs from 'node:fs/promises';
import { query } from './pool.js';

async function initLeases() {
  const sql = await fs.readFile('./sql/014_ifrs16_leases.sql', 'utf8');
  await query(sql);
  console.log('lease_contracts table verified.');

  const existing = await query('SELECT COUNT(*) as count FROM lease_contracts');
  if (existing[0].count === 0) {
    const calcPv = (pmt, rAnnual, n) => {
      const r = rAnnual / 12;
      return Math.round(pmt * (1 - Math.pow(1 + r, -n)) / r);
    };

    const pv1 = calcPv(2500000, 0.065, 60);
    const pv2 = calcPv(1200000, 0.060, 48);
    const pv3 = calcPv(850000, 0.070, 36);

    await query(
      `INSERT INTO lease_contracts
        (org_id, contract_ref, asset_name, lessor_name, start_date, term_months, monthly_payment, discount_rate_pct, initial_liability, initial_rou_asset, carrying_liability, carrying_rou_asset, status, notes)
      VALUES
        (1, 'IFRS16-2025-001', 'IRM 3T Magnetom Vida — Imagerie Medicale', 'Siemens Healthineers Central Africa', '2025-01-01', 60, 2500000, 6.500, ?, ?, ?, ?, 'active', 'Location d equipement d imagerie IFRS 16'),
        (1, 'IFRS16-2025-002', 'Table de Radiologie Numerique et Mammographe Senographe', 'GE Healthcare Cameroun', '2025-03-01', 48, 1200000, 6.000, ?, ?, ?, ?, 'active', 'Contrat de location longue duree equipement radiologique'),
        (1, 'IFRS16-2025-003', 'Flotte Ambulances d Urgence Medicalisees (2 Vehicules)', 'CFAO Motors Cameroun', '2025-06-01', 36, 850000, 7.000, ?, ?, ?, ?, 'active', 'Location longue duree avec option d achat medicalise')`,
      [pv1, pv1, pv1, pv1, pv2, pv2, pv2, pv2, pv3, pv3, pv3, pv3]
    );
    console.log('Seeded 3 IFRS 16 lease contracts successfully.');
  }
}

initLeases().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
