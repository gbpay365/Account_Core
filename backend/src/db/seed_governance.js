import { pool, query, queryOne } from './pool.js';

export async function seedGovernance(orgId = 1) {
  console.log(`[seed_governance] Seeding Analytical Programs & Activities for org ${orgId}...`);

  const existingProg = await queryOne('SELECT id FROM funding_programs WHERE org_id = ? LIMIT 1', [orgId]);
  if (!existingProg) {
    await query(
      `INSERT INTO funding_programs (org_id, code, name, donor_name, budget_amount, start_date, end_date)
       VALUES
       (?, 'PROPRES', 'Fonds Propres & Recouvrement Hospitalier', 'Hôpital Général', 350000000.00, '2026-01-01', '2026-12-31'),
       (?, 'FM-PALU', 'Fonds Mondial - Programme National Paludisme', 'The Global Fund', 85000000.00, '2026-01-01', '2026-12-31'),
       (?, 'PEPFAR-VIH', 'PEPFAR - Prévention et Traitement VIH/Sida', 'USAID / CDC', 65000000.00, '2026-01-01', '2026-12-31'),
       (?, 'SUBV-ETAT', 'Subvention d Exploitation Ministère de la Santé', 'Ministère de la Santé Publique', 120000000.00, '2026-01-01', '2026-12-31')
       ON DUPLICATE KEY UPDATE budget_amount=VALUES(budget_amount)`,
      [orgId, orgId, orgId, orgId]
    );

    const pRows = await query('SELECT id, code FROM funding_programs WHERE org_id = ?', [orgId]);
    const pMap = Object.fromEntries(pRows.map((r) => [r.code, r.id]));

    if (pMap['PROPRES']) {
      await query(
        `INSERT IGNORE INTO analytical_activities (org_id, program_id, code, name)
         VALUES
         (?, ?, 'ACT-CONSULT', 'Consultations Externes & Ambulatoires'),
         (?, ?, 'ACT-BLOC', 'Interventions Chirurgicales & Urgences'),
         (?, ?, 'ACT-DIST-MII', 'Distribution Moustiquaires Imprégnées & TDR'),
         (?, ?, 'ACT-ARV', 'Distribution ARV & Suivi Charge Virale'),
         (?, ?, 'ACT-MAINT-PARC', 'Maintenance Préventive Parc Imagerie & Stérilisation')`,
        [
          orgId, pMap['PROPRES'],
          orgId, pMap['PROPRES'],
          orgId, pMap['FM-PALU'] || pMap['PROPRES'],
          orgId, pMap['PEPFAR-VIH'] || pMap['PROPRES'],
          orgId, pMap['SUBV-ETAT'] || pMap['PROPRES'],
        ]
      );
    }
    console.log(`[seed_governance] Seeded funding programs & analytical activities for org ${orgId}`);
  }
}

if (process.argv[1]?.endsWith('seed_governance.js')) {
  seedGovernance(1)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}
