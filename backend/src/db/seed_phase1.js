import { pool, query, queryOne } from './pool.js';
import * as bankService from '../services/bank-reconciliation.service.js';
import * as withholdingService from '../services/withholding-tax.service.js';

export async function seedPhase1(orgId = 1) {
  console.log(`[seed_phase1] Seeding Phase 1 Demo Data for org ${orgId}...`);

  // 1. Ensure sequence for withholding_certificate
  await query(
    `INSERT INTO sequences (org_id, name, prefix, next_value, padding, reset_yearly, include_year)
     VALUES (?, 'withholding_certificate', 'ATT-', 1, 5, 1, 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [orgId]
  );

  const adminUser = await queryOne(
    `SELECT id FROM users WHERE org_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1`,
    [orgId]
  ) || { id: 1 };

  // 2. Bank statement for Afriland
  const bankAcct = await queryOne(
    `SELECT id FROM bank_accounts WHERE org_id = ? AND (code = 'BQ-AFB' OR bank_name LIKE '%Afriland%') LIMIT 1`,
    [orgId]
  ) || await queryOne(`SELECT id FROM bank_accounts WHERE org_id = ? LIMIT 1`, [orgId]);

  if (bankAcct) {
    const existingStmt = await queryOne(
      `SELECT id FROM bank_statements WHERE bank_account_id = ? AND statement_number = 'STMT-AFB-2026-10'`,
      [bankAcct.id]
    );

    if (!existingStmt) {
      const stmtLines = [
        {
          line_date: '2026-10-01',
          value_date: '2026-10-01',
          amount: 125000000,
          reference: 'VIR-REC-001',
          cheque_no: 'CHQ-88910',
          description: 'Virement reçu Ministère des Finances - Dotation trimestrielle',
          partner_name: 'Trésor Public / Minfi',
        },
        {
          line_date: '2026-10-05',
          value_date: '2026-10-05',
          amount: -45000000,
          reference: 'VIR-FOURN-092',
          cheque_no: 'CHQ-44512',
          description: 'Virement émis Siemens Healthineers Cameroun',
          partner_name: 'Siemens Healthineers Cameroun',
        },
        {
          line_date: '2026-10-10',
          value_date: '2026-10-10',
          amount: -18500000,
          reference: 'VIR-FOURN-093',
          cheque_no: 'CHQ-44513',
          description: 'Règlement facture pièces de rechange Scanner',
          partner_name: 'GE HealthCare Africa',
        },
        {
          line_date: '2026-10-12',
          value_date: '2026-10-12',
          amount: 14200000,
          reference: 'REM-CHQ-104',
          cheque_no: 'REM-20261012',
          description: 'Versement espèces et chèques caisse centrale',
          partner_name: 'Caisse Centrale Clinique',
        },
        {
          line_date: '2026-10-15',
          value_date: '2026-10-15',
          amount: -350000,
          reference: 'AGIOS-202610',
          cheque_no: null,
          description: 'Frais de tenue de compte et commissions trimestrielles Afriland',
          partner_name: 'Afriland First Bank',
        },
        {
          line_date: '2026-10-15',
          value_date: '2026-10-15',
          amount: -125000,
          reference: 'COMM-MOUV-10',
          cheque_no: null,
          description: 'Commission sur mouvements débiteurs',
          partner_name: 'Afriland First Bank',
        },
      ];

      const closingBal = 1630000000 + 125000000 - 45000000 - 18500000 + 14200000 - 350000 - 125000;

      await bankService.importStatement(
        orgId,
        bankAcct.id,
        {
          statement_number: 'STMT-AFB-2026-10',
          statement_date: '2026-10-15',
          start_date: '2026-10-01',
          end_date: '2026-10-15',
          opening_balance: 1630000000,
          closing_balance: closingBal,
          source_format: 'excel',
          original_file_name: 'Releve_Afriland_Octobre_2026.xlsx',
          lines: stmtLines,
        },
        adminUser.id
      );
      console.log(`[seed_phase1] Imported demo statement for org ${orgId}`);
    }
  }

  // 3. Withholding certificates
  const existingCerts = await withholdingService.listCertificates(orgId);
  if (existingCerts.length === 0) {
    const sup1 = await queryOne(`SELECT id FROM suppliers WHERE org_id = ? AND code = 'SUP-001'`, [orgId])
      || await queryOne(`SELECT id FROM suppliers WHERE org_id = ? LIMIT 1`, [orgId]);
    const sup2 = await queryOne(`SELECT id FROM suppliers WHERE org_id = ? AND code = 'SUP-008'`, [orgId])
      || sup1;

    if (sup1) {
      await withholdingService.issueCertificate(
        orgId,
        {
          supplier_id: sup1.id,
          certificate_date: '2026-10-10',
          tax_period: '2026-10',
          invoice_ref: 'FAC-SH-2026-0881',
          gross_amount: 25000000,
          has_tva: true,
          tva_rate: 19.25,
          precompte_rate: 2.2,
          tsr_rate: 0.0,
          post_journal_entry: false,
        },
        { id: adminUser.id, permissions: new Set(['journal.post']) }
      );
    }

    if (sup2 && sup2.id !== sup1?.id) {
      await withholdingService.issueCertificate(
        orgId,
        {
          supplier_id: sup2.id,
          certificate_date: '2026-10-15',
          tax_period: '2026-10',
          invoice_ref: 'FAC-2026-0914',
          gross_amount: 10000000,
          has_tva: true,
          tva_rate: 19.25,
          precompte_rate: 2.2,
          tsr_rate: 0.0,
          post_journal_entry: false,
        },
        { id: adminUser.id, permissions: new Set(['journal.post']) }
      );
    }
    console.log(`[seed_phase1] Issued demo withholding certificates for org ${orgId}`);
  }

  console.log(`[seed_phase1] Phase 1 seed completed for org ${orgId}`);
}

if (process.argv[1]?.endsWith('seed_phase1.js')) {
  seedPhase1(1)
    .then(() => pool.end())
    .catch((err) => {
      console.error('Seed error:', err);
      pool.end();
      process.exit(1);
    });
}
