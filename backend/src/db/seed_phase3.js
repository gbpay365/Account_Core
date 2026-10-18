import { pool, query, queryOne } from './pool.js';

export async function seedPhase3(orgId = 1) {
  console.log(`[seed_phase3] Seeding Phase 3: Multi-Donor Projects, Mobile Money & Cash Registers for org ${orgId}...`);

  // 1. Resolve and ensure accounts 5711, 5712, 5713
  const parent571 = await queryOne("SELECT id FROM accounts WHERE org_id = ? AND code = '571'", [orgId]);
  if (parent571) {
    await query(
      `INSERT INTO accounts (org_id, code, name, name_en, account_class, parent_id, level, account_type, normal_side, is_postable, in_tier_normal, is_active)
       VALUES (?, '5713', 'Caisse Mobile Money — Orange Money', 'Mobile Money Cash Register — Orange Money', 5, ?, 3, 'asset', 'debit', 1, 1, 1)
       ON DUPLICATE KEY UPDATE is_postable = 1, is_active = 1`,
      [orgId, parent571.id]
    );
  }
  const acct5711 = (await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '5711'`, [orgId])) || parent571;
  const acct5712 = (await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '5712'`, [orgId])) || acct5711;
  const acct5713 = (await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '5713'`, [orgId])) || acct5711;

  if (!acct5711 || !acct5712 || !acct5713) {
    console.warn(`[seed_phase3] Required cash accounts not found for org ${orgId}.`);
    return;
  }

  const bankAcct = await queryOne(`SELECT id FROM bank_accounts WHERE org_id = ? LIMIT 1`, [orgId]);
  const designatedBankId = bankAcct ? bankAcct.id : null;
  const cashier = (await queryOne(`SELECT id FROM users WHERE org_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1`, [orgId])) || { id: 1 };

  // 2. Seed Donor Projects
  const resProj1 = await query(
    `INSERT INTO donor_projects
     (org_id, donor_name, project_code, project_name, agreement_ref, currency, total_budget, financing_rate, designated_bank_account_id, start_date, end_date, status, notes)
     VALUES
     (?, 'Fonds Mondial (The Global Fund)', 'FM-PALU-2026', 'Programme National de Lutte contre le Paludisme - Subvention VIH/Palu Phase 4', 'GF-CMR-MAL-2026-01', 'EUR', 150000000.00, 100.00, ?, '2026-01-01', '2026-12-31', 'active', 'Compte bancaire désigné dédié aux décaissements trimestriels Fonds Mondial.')
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), total_budget=VALUES(total_budget)`,
    [orgId, designatedBankId]
  );
  const proj1Id = resProj1.insertId || (await queryOne(`SELECT id FROM donor_projects WHERE org_id = ? AND project_code = 'FM-PALU-2026'`, [orgId]))?.id;

  await query(
    `INSERT INTO donor_projects
     (org_id, donor_name, project_code, project_name, agreement_ref, currency, total_budget, financing_rate, designated_bank_account_id, start_date, end_date, status, notes)
     VALUES
     (?, 'Banque Mondiale (IDA)', 'IDA-SANTE-02', 'Projet de Renforcement et Modernisation du Plateau Technique Hospitalier (PRPSTH)', 'IDA-CREDIT-7182-CM', 'USD', 250000000.00, 90.00, ?, '2026-01-01', '2027-12-31', 'active', 'Co-financement État du Cameroun à hauteur de 10% (Fonds de contrepartie).')
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), total_budget=VALUES(total_budget)`,
    [orgId, designatedBankId]
  );

  // 3. Seed Donor Expense Categories for Project 1
  if (proj1Id) {
    const categoriesProj1 = [
      { code: 'CAT-01', name: 'Médicaments antipaludiques CTA & Tests TDR', budget: 60000000.00, rate: 100.00 },
      { code: 'CAT-02', name: 'Moustiquaires Imprégnées à Longue Durée (MILDA)', budget: 40000000.00, rate: 100.00 },
      { code: 'CAT-03', name: 'Formations Agents de Santé & Sensibilisation', budget: 30000000.00, rate: 100.00 },
      { code: 'CAT-04', name: 'Supervision Intégrée & Audit de Performance', budget: 20000000.00, rate: 100.00 },
    ];

    const catMap1 = new Map();
    for (const c of categoriesProj1) {
      const res = await query(
        `INSERT INTO donor_expense_categories (project_id, category_code, name, budget_allocated, eligible_rate)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), budget_allocated=VALUES(budget_allocated)`,
        [proj1Id, c.code, c.name, c.budget, c.rate]
      );
      catMap1.set(c.code, res.insertId || (await queryOne(`SELECT id FROM donor_expense_categories WHERE project_id = ? AND category_code = ?`, [proj1Id, c.code]))?.id);
    }

    // 4. Seed DRF (Demande de Retrait de Fonds) & Expenditure Items
    const resDrf = await query(
      `INSERT INTO donor_disbursement_requests
       (project_id, drf_number, request_date, period_start, period_end, initial_advance, total_expenditures_claimed, eligible_amount_claimed, replenishment_requested, designated_account_balance, status, submission_date, notes)
       VALUES
       (?, 'DRF-FM-2026-01', '2026-04-10', '2026-01-01', '2026-03-31', 35000000.00, 28750000.00, 28750000.00, 28750000.00, 6250000.00, 'approved', '2026-04-15', 'Demande de reconstitution du fonds de roulement T1 validée par le Récipiendaire Principal.')
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [proj1Id]
    );
    const drfId = resDrf.insertId || (await queryOne(`SELECT id FROM donor_disbursement_requests WHERE project_id = ? AND drf_number = 'DRF-FM-2026-01'`, [proj1Id]))?.id;

    if (drfId) {
      const items = [
        { cat: 'CAT-01', ref: 'FAC-CENAME-042', date: '2026-01-20', ben: 'CENAME Yaoundé', desc: 'Acquisition 15 000 doses Artéméther-Luméfantrine', amt: 12500000.00 },
        { cat: 'CAT-01', ref: 'FAC-MEDILAB-109', date: '2026-02-05', ben: 'Laboratoires Médicaux réunis', desc: 'Kits 5 000 tests rapides de diagnostic (TDR)', amt: 4250000.00 },
        { cat: 'CAT-02', ref: 'FAC-TEXTIL-88', date: '2026-02-18', ben: 'CICAM Cameroun', desc: 'Conditionnement et distribution 2 500 MILDA', amt: 5500000.00 },
        { cat: 'CAT-03', ref: 'FAC-HOTEL-YAO-03', date: '2026-03-12', ben: 'Centre de Formation Médicale', desc: 'Atelier de renforcement 45 infirmiers chefs de poste', amt: 3800000.00 },
        { cat: 'CAT-04', ref: 'ORD-MIS-091', date: '2026-03-25', ben: 'Équipe Cadre de District', desc: 'Frais de mission supervision clinique dans 12 aires', amt: 2700000.00 },
      ];

      for (const it of items) {
        const catId = catMap1.get(it.cat);
        if (catId) {
          const exItem = await queryOne(`SELECT id FROM donor_expenditure_items WHERE drf_id = ? AND voucher_ref = ?`, [drfId, it.ref]);
          if (!exItem) {
            await query(
              `INSERT INTO donor_expenditure_items
               (drf_id, category_id, voucher_ref, voucher_date, beneficiary_name, description, total_amount, currency, eligible_rate, eligible_amount)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 100.00, ?)`,
              [drfId, catId, it.ref, it.date, it.ben, it.desc, it.amt, it.amt]
            );
          }
        }
      }
    }
  }

  // 5. Seed Cash Registers
  const resCr1 = await query(
    `INSERT INTO cash_registers
     (org_id, code, name, cashier_user_id, cash_account_id, momo_account_id, orange_account_id, is_active)
     VALUES
     (?, 'CAISSE-01', 'Caisse Principale & Bureau des Entrées', ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), name=VALUES(name)`,
    [orgId, cashier.id, acct5711.id, acct5712.id, acct5713.id]
  );
  const cr1Id = resCr1.insertId || (await queryOne(`SELECT id FROM cash_registers WHERE org_id = ? AND code = 'CAISSE-01'`, [orgId]))?.id;

  const resCr2 = await query(
    `INSERT INTO cash_registers
     (org_id, code, name, cashier_user_id, cash_account_id, momo_account_id, orange_account_id, is_active)
     VALUES
     (?, 'CAISSE-URG', 'Caisse des Urgences & Permanence 24/7', ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), name=VALUES(name)`,
    [orgId, cashier.id, acct5711.id, acct5712.id, acct5713.id]
  );
  const cr2Id = resCr2.insertId || (await queryOne(`SELECT id FROM cash_registers WHERE org_id = ? AND code = 'CAISSE-URG'`, [orgId]))?.id;

  // 6. Seed Mobile Money Transactions
  const momoTxs = [
    { crId: cr1Id, prov: 'mtn_momo', ref: 'MOMO-20261016-01', date: '2026-10-16 08:35:10', phone: '+237677112233', name: 'MBALLA Jeanne', file: 'DOS-2026-0891', gross: 25000, fee: 350, net: 24650 },
    { crId: cr1Id, prov: 'orange_money', ref: 'OM-20261016-02', date: '2026-10-16 09:12:44', phone: '+237699445566', name: 'TCHOUA Patrice', file: 'DOS-2026-0892', gross: 45000, fee: 500, net: 44500 },
    { crId: cr1Id, prov: 'mtn_momo', ref: 'MOMO-20261016-03', date: '2026-10-16 10:04:19', phone: '+237675889900', name: 'FOTSO Samuel', file: 'DOS-2026-0893', gross: 18500, fee: 250, net: 18250 },
    { crId: cr1Id, prov: 'orange_money', ref: 'OM-20261016-04', date: '2026-10-16 10:45:00', phone: '+237691223344', name: 'ABENA Claire', file: 'DOS-2026-0894', gross: 60000, fee: 750, net: 59250 },
    { crId: cr1Id, prov: 'mtn_momo', ref: 'MOMO-20261016-05', date: '2026-10-16 11:20:30', phone: '+237670114477', name: 'ONANA Marc', file: 'DOS-2026-0895', gross: 12000, fee: 200, net: 11800 },
    { crId: cr2Id, prov: 'mtn_momo', ref: 'MOMO-20261016-06', date: '2026-10-16 02:15:10', phone: '+237671998877', name: 'ESSOMBA Eric', file: 'URG-2026-0104', gross: 85000, fee: 950, net: 84050 },
    { crId: cr2Id, prov: 'orange_money', ref: 'OM-20261016-07', date: '2026-10-16 04:40:22', phone: '+237694332211', name: 'BEKONO Suzanne', file: 'URG-2026-0105', gross: 35000, fee: 400, net: 34600 },
  ];

  for (const t of momoTxs) {
    if (t.crId) {
      await query(
        `INSERT INTO mobile_money_transactions
         (org_id, cash_register_id, provider, telecom_ref, transaction_date, customer_phone, patient_name, patient_file_no, gross_amount, fee_amount, net_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reconciled')
         ON DUPLICATE KEY UPDATE gross_amount=VALUES(gross_amount)`,
        [orgId, t.crId, t.prov, t.ref, t.date, t.phone, t.name, t.file, t.gross, t.fee, t.net]
      );
    }
  }

  // 7. Seed Daily Cash Close
  if (cr1Id) {
    await query(
      `INSERT INTO daily_cash_closes
       (org_id, cash_register_id, close_date, cashier_id, physical_cash_counted, system_cash_expected, cash_variance, momo_collected, orange_collected, total_collections, bank_deposit_amount, bank_deposit_ref, status, approved_by, notes)
       VALUES
       (?, ?, '2026-10-15', ?, 450000.00, 450000.00, 0.00, 160500.00, 140000.00, 750500.00, 400000.00, 'VERS-BQ-AFB-20261015-01', 'posted', ?, 'Arrêté de caisse journalier conforme. Versement espèces effectué en banque sous bordereau certifié.')
       ON DUPLICATE KEY UPDATE total_collections=VALUES(total_collections)`,
      [orgId, cr1Id, cashier.id, cashier.id]
    );
  }

  console.log(`[seed_phase3] Phase 3 seeded successfully for org ${orgId}!`);
}

if (process.argv[1]?.endsWith('seed_phase3.js')) {
  seedPhase3(1)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}
