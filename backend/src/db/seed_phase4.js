import { pool } from './pool.js';
import * as payrollService from '../services/payroll.service.js';
import * as dfeService from '../services/dfe.service.js';
import * as interbranchService from '../services/interbranch.service.js';

export async function seedPhase4() {
  console.log('[seed_phase4] Seeding CEMAC Payroll, DFE Invoices, and Inter-Branch Establishments...');
  const orgId = 1;

  // 1. Seed Hospital Employees
  const employees = [
    {
      registration_number: 'EMP-SHI-001',
      first_name: 'Emmanuel',
      last_name: 'Tanyi',
      email: 'e.tanyi@shisong.health',
      phone: '+237 677 12 34 56',
      niu: 'M019200045612T',
      cnps_number: '123456-A',
      department: 'Cardiologie',
      job_title: 'Médecin Chef Cardiologue',
      contract_type: 'CDI',
      hire_date: '2020-03-01',
      base_salary: 1800000,
      transport_allowance: 50000,
      housing_allowance: 250000,
      representation_allowance: 100000,
      children_count: 3,
      bank_name: 'Afriland First Bank',
      bank_account_rib: '10005-00012-00123456789-45',
    },
    {
      registration_number: 'EMP-SHI-002',
      first_name: 'Florence',
      last_name: 'Bih',
      email: 'f.bih@shisong.health',
      phone: '+237 699 23 45 67',
      niu: 'M019200089123T',
      cnps_number: '123457-B',
      department: 'Chirurgie',
      job_title: 'Chirurgien Cardiovasculaire',
      contract_type: 'CDI',
      hire_date: '2021-06-15',
      base_salary: 1600000,
      transport_allowance: 50000,
      housing_allowance: 200000,
      representation_allowance: 50000,
      children_count: 2,
      bank_name: 'Société Générale Cameroun',
      bank_account_rib: '10003-00045-00987654321-12',
    },
    {
      registration_number: 'EMP-SHI-003',
      first_name: 'Mary-Grace',
      last_name: 'Lukong',
      email: 'mg.lukong@shisong.health',
      phone: '+237 675 34 56 78',
      niu: 'M019200023456T',
      cnps_number: '123458-C',
      department: 'Soins Intensifs',
      job_title: 'Infirmière Major Réanimation',
      contract_type: 'CDI',
      hire_date: '2019-01-10',
      base_salary: 480000,
      transport_allowance: 35000,
      housing_allowance: 40000,
      children_count: 1,
      bank_name: 'BICEC Cameroun',
      bank_account_rib: '10001-00089-00456789123-88',
    },
    {
      registration_number: 'EMP-SHI-004',
      first_name: 'Christian',
      last_name: 'Forgwei',
      email: 'c.forgwei@shisong.health',
      phone: '+237 671 45 67 89',
      niu: 'M019200078901T',
      cnps_number: '123459-D',
      department: 'Maintenance Biomédicale',
      job_title: 'Ingénieur Biomédical Principal',
      contract_type: 'CDI',
      hire_date: '2022-09-01',
      base_salary: 550000,
      transport_allowance: 35000,
      housing_allowance: 50000,
      children_count: 2,
      bank_name: 'Afriland First Bank',
      bank_account_rib: '10005-00012-00567891234-77',
    },
    {
      registration_number: 'EMP-SHI-005',
      first_name: 'Judith',
      last_name: 'Ngu',
      email: 'j.ngu@shisong.health',
      phone: '+237 694 56 78 90',
      niu: 'M019200034567T',
      cnps_number: '123460-E',
      department: 'Pharmacie Centrale',
      job_title: 'Pharmacienne Hospitalière',
      contract_type: 'CDI',
      hire_date: '2023-02-01',
      base_salary: 650000,
      transport_allowance: 35000,
      housing_allowance: 60000,
      children_count: 0,
      bank_name: 'UBA Cameroun',
      bank_account_rib: '10033-00078-00678912345-33',
    },
    {
      registration_number: 'EMP-SHI-006',
      first_name: 'Kenneth',
      last_name: 'Che',
      email: 'k.che@shisong.health',
      phone: '+237 678 67 89 01',
      niu: 'M019200056789T',
      cnps_number: '123461-F',
      department: 'Finance & Comptabilité',
      job_title: 'Comptable Trésorier',
      contract_type: 'CDI',
      hire_date: '2021-11-01',
      base_salary: 420000,
      transport_allowance: 35000,
      housing_allowance: 30000,
      children_count: 1,
      bank_name: 'Afriland First Bank',
      bank_account_rib: '10005-00012-00789123456-99',
    },
  ];

  for (const emp of employees) {
    const existing = await pool.query(
      `SELECT id FROM employees WHERE org_id = ? AND registration_number = ?`,
      [orgId, emp.registration_number]
    );
    if (!existing[0].length) {
      await payrollService.createEmployee(orgId, emp);
      console.log(`[seed_phase4] Created employee: ${emp.registration_number} - ${emp.last_name} ${emp.first_name}`);
    }
  }

  // 2. Generate and Post January 2026 Payroll Run
  const existingRun = await pool.query(
    `SELECT id, status FROM payroll_runs WHERE org_id = ? AND period_code = '2026-01'`,
    [orgId]
  );
  let runId;
  if (!existingRun[0].length) {
    const gen = await payrollService.generatePayrollRun(orgId, {
      periodCode: '2026-01',
      periodName: 'Paie Mensuelle Janvier 2026',
      runDate: '2026-01-28',
      createdBy: 'Sr. Appolonia (Directrice Administrative)',
    });
    runId = gen.runId;
    console.log(`[seed_phase4] Generated payroll run 2026-01: Run ID ${runId}, Total Gross: ${gen.totalGross} XAF`);

    // Post to ledger
    const postRes = await payrollService.postPayrollRunToLedger(orgId, runId, 'Kenneth Che (Comptable)');
    console.log(`[seed_phase4] Posted payroll run to ledger: Entry ${postRes.entryNumber}, Balanced: ${postRes.totalDebits} XAF`);
  } else {
    runId = existingRun[0][0].id;
  }

  // 3. Seed Hospital Network Establishments
  const branches = [
    { code: 'SHISONG-HQ', name: 'Hôpital Général & Centre Cardiaque de Shisong', city: 'Kumbo', branch_type: 'headquarters', liaison_account_code: '1851' },
    { code: 'KUMBO-TOWN', name: 'Clinique Médicale Urbaine de Kumbo', city: 'Kumbo', branch_type: 'clinic', liaison_account_code: '1852' },
    { code: 'BAMENDA-SAT', name: 'Centre Médical Satellite de Bamenda', city: 'Bamenda', branch_type: 'clinic', liaison_account_code: '1852' },
    { code: 'YAOUNDE-LIAISON', name: 'Bureau Médical & Coordination de Yaoundé', city: 'Yaoundé', branch_type: 'clinic', liaison_account_code: '1852' },
  ];

  for (const b of branches) {
    const ex = await pool.query(`SELECT id FROM branch_establishments WHERE org_id = ? AND code = ?`, [orgId, b.code]);
    if (!ex[0].length) {
      await interbranchService.createBranch(orgId, b);
      console.log(`[seed_phase4] Created branch establishment: ${b.code} - ${b.name}`);
    }
  }

  // 4. Seed Initial Inter-Branch Transfers
  const [bRows] = await pool.query(`SELECT id, code FROM branch_establishments WHERE org_id = ?`, [orgId]);
  const bMap = Object.fromEntries(bRows.map(r => [r.code, r.id]));

  const transfers = [
    {
      transfer_number: 'TR-2026-001',
      source_branch_id: bMap['SHISONG-HQ'],
      dest_branch_id: bMap['KUMBO-TOWN'],
      transfer_date: '2026-01-15',
      amount: 1500000,
      description: 'Dotation initiale pharmacie et fonds de roulement Kumbo Town',
    },
    {
      transfer_number: 'TR-2026-002',
      source_branch_id: bMap['SHISONG-HQ'],
      dest_branch_id: bMap['BAMENDA-SAT'],
      transfer_date: '2026-01-20',
      amount: 2500000,
      description: 'Avance trésorerie opérationnelle et consommables laboratoire Bamenda',
    },
  ];

  for (const tr of transfers) {
    const exTr = await pool.query(`SELECT id FROM interbranch_transfers WHERE org_id = ? AND transfer_number = ?`, [orgId, tr.transfer_number]);
    if (!exTr[0].length) {
      await interbranchService.createInterbranchTransfer(orgId, tr, 'Trésorier Central');
      console.log(`[seed_phase4] Created inter-branch transfer: ${tr.transfer_number} - ${tr.amount} XAF`);
    }
  }

  // 5. Seed Certified DFE Electronic Invoices
  const dfeInvoices = [
    {
      invoice_number: 'DFE-2026-0001',
      customer_name: 'Clinique Médico-Chirurgicale Saint-Luc Bafoussam',
      customer_niu: 'M028500098765A',
      customer_email: 'direction@clinique-stluc.cm',
      invoice_date: '2026-01-22',
      total_ht: 4500000,
      tva_rate: 19.25,
      fiscal_stamp_duty: 1000.0,
      currency: 'XAF',
    },
    {
      invoice_number: 'DFE-2026-0002',
      customer_name: 'Assurance ASCOMA Santé Cameroun (Prise en charge)',
      customer_niu: 'M018000012345B',
      customer_email: 'sante@ascoma-cm.com',
      invoice_date: '2026-01-25',
      total_ht: 8200000,
      tva_rate: 19.25,
      fiscal_stamp_duty: 1000.0,
      currency: 'XAF',
    },
  ];

  for (const inv of dfeInvoices) {
    const exInv = await pool.query(`SELECT id FROM dfe_invoices WHERE org_id = ? AND invoice_number = ?`, [orgId, inv.invoice_number]);
    if (!exInv[0].length) {
      const created = await dfeService.issueDfeInvoice(orgId, inv, 'Service Facturation');
      console.log(`[seed_phase4] Issued DFE Electronic Invoice: ${created.invoice_number} - TTC: ${created.total_ttc} XAF`);
    }
  }

  console.log('[seed_phase4] Finished seeding Phase 4 successfully.');
}

// Standalone runner
if (process.argv[1]?.endsWith('seed_phase4.js')) {
  seedPhase4()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[seed_phase4] Error:', err);
      pool.end();
      process.exit(1);
    });
}
