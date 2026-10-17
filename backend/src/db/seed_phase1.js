import { pool, query, queryOne } from './pool.js';
import * as bankService from '../services/bank-reconciliation.service.js';
import * as withholdingService from '../services/withholding-tax.service.js';

async function seedPhase1() {
  console.log('Seeding Phase 1 Demo Data...');

  // 1. Ensure sequence for withholding_certificate
  await query(
    `INSERT IGNORE INTO sequences (org_id, name, prefix, next_value, padding, reset_yearly, include_year)
     VALUES (1, 'withholding_certificate', 'ATT-', 1, 5, 1, 1)`
  );

  // 2. Check if bank statement already exists for Afriland
  const existingStmt = await queryOne(
    `SELECT id FROM bank_statements WHERE bank_account_id = 1 AND statement_number = 'STMT-AFB-2026-10'`
  );

  if (!existingStmt) {
    // Fetch some real ledger transactions on account 194 / 948 to create exact matches
    const ledgerLines = await bankService.getUnreconciledLedgerLines(1, 1);
    console.log(`Found ${ledgerLines.length} unreconciled ledger lines`);

    const stmtLines = [];

    // Line 1: Opening balance transfer / deposit
    stmtLines.push({
      line_date: '2026-10-01',
      value_date: '2026-10-01',
      amount: 125000000,
      reference: 'VIR-REC-001',
      cheque_no: 'CHQ-88910',
      description: 'Virement reçu Ministère des Finances - Dotation trimestrielle',
      partner_name: 'Trésor Public / Minfi',
    });

    // Line 2: Supplier disbursement
    stmtLines.push({
      line_date: '2026-10-05',
      value_date: '2026-10-05',
      amount: -45000000,
      reference: 'VIR-FOURN-092',
      cheque_no: 'CHQ-44512',
      description: 'Virement émis Siemens Healthineers Cameroun',
      partner_name: 'Siemens Healthineers Cameroun',
    });

    // Line 3: Urgent spare parts
    stmtLines.push({
      line_date: '2026-10-10',
      value_date: '2026-10-10',
      amount: -18500000,
      reference: 'VIR-FOURN-093',
      cheque_no: 'CHQ-44513',
      description: 'Règlement facture pièces de rechange Scanner',
      partner_name: 'GE HealthCare Africa',
    });

    // Line 4: Patient cash collections deposit
    stmtLines.push({
      line_date: '2026-10-12',
      value_date: '2026-10-12',
      amount: 14200000,
      reference: 'REM-CHQ-104',
      cheque_no: 'REM-20261012',
      description: 'Versement espèces et chèques caisse centrale',
      partner_name: 'Caisse Centrale Clinique',
    });

    // Line 5: Unrecorded bank fees (Frais de tenue de compte et agios)
    stmtLines.push({
      line_date: '2026-10-15',
      value_date: '2026-10-15',
      amount: -350000,
      reference: 'AGIOS-202610',
      cheque_no: null,
      description: 'Frais de tenue de compte et commissions trimestrielles Afriland',
      partner_name: 'Afriland First Bank',
    });

    // Line 6: Commission de mouvement
    stmtLines.push({
      line_date: '2026-10-15',
      value_date: '2026-10-15',
      amount: -125000,
      reference: 'COMM-MOUV-10',
      cheque_no: null,
      description: 'Commission sur mouvements débiteurs',
      partner_name: 'Afriland First Bank',
    });

    const closingBal = 1630000000 + 125000000 - 45000000 - 18500000 + 14200000 - 350000 - 125000;

    const imported = await bankService.importStatement(1, 1, {
      statement_number: 'STMT-AFB-2026-10',
      statement_date: '2026-10-15',
      start_date: '2026-10-01',
      end_date: '2026-10-15',
      opening_balance: 1630000000,
      closing_balance: closingBal,
      source_format: 'excel',
      original_file_name: 'Releve_Afriland_Octobre_2026.xlsx',
      lines: stmtLines,
    }, 1);

    console.log('Imported demo statement:', imported);
  }

  // 3. Check if withholding certificate exists
  const existingCerts = await withholdingService.listCertificates(1);
  if (existingCerts.length === 0) {
    const cert = await withholdingService.issueCertificate(1, {
      supplier_id: 1, // Siemens Healthineers
      certificate_date: '2026-10-10',
      tax_period: '2026-10',
      invoice_ref: 'FAC-SH-2026-0881',
      gross_amount: 25000000,
      has_tva: true,
      tva_rate: 19.25,
      precompte_rate: 2.2,
      tsr_rate: 0.0,
      post_journal_entry: false,
    }, { id: 1, permissions: new Set(['journal.post']) });

    console.log('Issued demo withholding certificate:', cert);
  }

  console.log('Phase 1 seed completed successfully.');
  process.exit(0);
}

seedPhase1().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
