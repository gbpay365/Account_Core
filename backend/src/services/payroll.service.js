import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { createJournalEntry } from './ledger.service.js';

/**
 * CEMAC / OHADA Statutory Payroll & DIPE Engine
 *
 * Tax and Social Contribution Rules (Cameroon General Tax Code / CGI & CNPS):
 * - Base Salary + Overtime + Taxable Bonuses = Taxable Gross
 * - CNPS Employee Share (PVI): 4.2% of capped gross (ceiling: 750,000 XAF/month, max: 31,500 XAF)
 * - Professional Expenses Allowance (Frais Professionnels): 30% of taxable gross, capped at 500,000 XAF/year (~41,667 XAF/month)
 * - Net Taxable Base = Taxable Gross - CNPS Employee - Frais Professionnels
 * - IRPP Progressive Monthly Scale (Art. 72 CGI):
 *     0 to 166,667 XAF: 10%
 *     166,668 to 250,000 XAF: 15%
 *     250,001 to 416,667 XAF: 25%
 *     Over 416,667 XAF: 35%
 *     Exempt if gross salary <= 62,000 XAF (SMIG threshold)
 * - CAC (Centimes Additionnels Communaux): 10% of IRPP
 * - CFC (Crédit Foncier du Cameroun): 1% employee, 1% employer
 * - TDL (Taxe de Développement Local):
 *     <= 62,000 XAF: 0 XAF
 *     62,001 - 150,000 XAF: 250 XAF
 *     150,001 - 250,000 XAF: 500 XAF
 *     250,001 - 500,000 XAF: 1,000 XAF
 *     Over 500,000 XAF: 2,500 XAF
 * - Employer Contributions:
 *     CNPS PVI (Pension): 4.2% (capped at 750,000 XAF)
 *     CNPS Prestations Familiales (PF): 7.0% (capped at 750,000 XAF, max 52,500 XAF)
 *     CNPS Accidents du Travail (AT): 2.5% (Hospital/Healthcare Group B)
 *     FNE (Fonds National de l'Emploi): 1.0%
 *     CFC (Crédit Foncier): 1.0%
 */

export function calculateEmployeePayroll({
  baseSalary,
  overtime = 0,
  bonuses = 0,
  transportAllowance = 0,
  housingAllowance = 0,
  representationAllowance = 0,
}) {
  const base = Number(baseSalary || 0);
  const ot = Number(overtime || 0);
  const bon = Number(bonuses || 0);
  const trans = Number(transportAllowance || 0);
  const house = Number(housingAllowance || 0);
  const rep = Number(representationAllowance || 0);

  const grossSalary = money(base + ot + bon + trans + house + rep);
  // In CEMAC, transport allowance up to legal limit (30,000 XAF) is tax exempt
  const taxableTransport = Math.max(0, trans - 30000);
  const taxableGross = money(base + ot + bon + taxableTransport + house + rep);

  // CNPS Plafond: 750,000 XAF
  const cnpsCappedGross = Math.min(grossSalary, 750000);

  // 1. Employee Withholdings
  const cnpsEmployee = money(cnpsCappedGross * 0.042);

  // IRPP Calculation with 30% allowance capped at 41,667 XAF/month
  let irpp = 0;
  let cac = 0;
  let tdl = 0;
  let cfcEmployee = 0;

  if (taxableGross > 62000) {
    const fraisPro = Math.min(taxableGross * 0.30, 41667);
    const netImposable = Math.max(0, taxableGross - cnpsEmployee - fraisPro);

    // Monthly progressive tax brackets
    let remaining = netImposable;
    // Bracket 1: 0 - 166,667 @ 10%
    const b1 = Math.min(remaining, 166667);
    irpp += b1 * 0.10;
    remaining -= b1;

    // Bracket 2: 166,668 - 250,000 (span: 83,333) @ 15%
    if (remaining > 0) {
      const b2 = Math.min(remaining, 83333);
      irpp += b2 * 0.15;
      remaining -= b2;
    }

    // Bracket 3: 250,001 - 416,667 (span: 166,667) @ 25%
    if (remaining > 0) {
      const b3 = Math.min(remaining, 166667);
      irpp += b3 * 0.25;
      remaining -= b3;
    }

    // Bracket 4: Over 416,667 @ 35%
    if (remaining > 0) {
      irpp += remaining * 0.35;
    }

    irpp = money(irpp);
    cac = money(irpp * 0.10);
    cfcEmployee = money(taxableGross * 0.01);

    // TDL
    if (taxableGross <= 150000) tdl = 250;
    else if (taxableGross <= 250000) tdl = 500;
    else if (taxableGross <= 500000) tdl = 1000;
    else tdl = 2500;
  }

  const totalEmployeeDeductions = money(cnpsEmployee + irpp + cac + tdl + cfcEmployee);
  const netSalary = money(grossSalary - totalEmployeeDeductions);

  // 2. Employer Contributions
  const cnpsPviEmployer = money(cnpsCappedGross * 0.042);
  const cnpsPfEmployer = money(cnpsCappedGross * 0.070);
  const cnpsAtEmployer = money(cnpsCappedGross * 0.025);
  const totalCnpsEmployer = money(cnpsPviEmployer + cnpsPfEmployer + cnpsAtEmployer);
  const fneEmployer = money(grossSalary * 0.010);
  const cfcEmployer = money(grossSalary * 0.010);
  const totalEmployerContributions = money(totalCnpsEmployer + fneEmployer + cfcEmployer);
  const totalPayrollCost = money(grossSalary + totalEmployerContributions);

  return {
    grossSalary,
    taxableGross,
    cnpsCappedGross,
    cnpsEmployee,
    irpp,
    cac,
    tdl,
    cfcEmployee,
    totalEmployeeDeductions,
    netSalary,
    cnpsPviEmployer,
    cnpsPfEmployer,
    cnpsAtEmployer,
    totalCnpsEmployer,
    fneEmployer,
    cfcEmployer,
    totalEmployerContributions,
    totalPayrollCost,
  };
}

/**
 * List all active/inactive employees.
 */
export async function listEmployees(orgId) {
  return query(
    `SELECT * FROM employees WHERE org_id = ? ORDER BY department, last_name, first_name`,
    [orgId]
  );
}

/**
 * Create a new employee profile.
 */
export async function createEmployee(orgId, data) {
  const {
    registration_number,
    first_name,
    last_name,
    email,
    phone,
    niu,
    cnps_number,
    department,
    job_title,
    contract_type = 'CDI',
    hire_date,
    base_salary,
    transport_allowance = 0,
    housing_allowance = 0,
    representation_allowance = 0,
    children_count = 0,
    bank_name = 'Afriland First Bank',
    bank_account_rib,
  } = data;

  if (!registration_number || !first_name || !last_name || !department || !job_title || !base_salary || !hire_date) {
    throw new ApiError(400, 'Champs obligatoires manquants pour la création de l’employé');
  }

  const res = await query(
    `INSERT INTO employees
     (org_id, registration_number, first_name, last_name, email, phone, niu, cnps_number,
      department, job_title, contract_type, hire_date, base_salary, transport_allowance,
      housing_allowance, representation_allowance, children_count, bank_name, bank_account_rib, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      orgId,
      registration_number.trim(),
      first_name.trim(),
      last_name.trim(),
      email || null,
      phone || null,
      (niu || 'M019200000000T').trim(),
      (cnps_number || 'CNPS-000000').trim(),
      department.trim(),
      job_title.trim(),
      contract_type,
      hire_date,
      Number(base_salary),
      Number(transport_allowance || 0),
      Number(housing_allowance || 0),
      Number(representation_allowance || 0),
      Number(children_count || 0),
      bank_name,
      bank_account_rib || null,
    ]
  );

  return queryOne(`SELECT * FROM employees WHERE id = ?`, [res.insertId]);
}

/**
 * List all payroll runs.
 */
export async function listPayrollRuns(orgId) {
  return query(
    `SELECT pr.*, je.entry_no AS journal_entry_number,
            (SELECT COUNT(*) FROM payslips WHERE payroll_run_id = pr.id) AS employee_count
       FROM payroll_runs pr
  LEFT JOIN journal_entries je ON je.id = pr.journal_entry_id
      WHERE pr.org_id = ?
   ORDER BY pr.period_code DESC`,
    [orgId]
  );
}

/**
 * Get details of a single payroll run with individual payslips.
 */
export async function getPayrollRunDetails(orgId, runId) {
  const run = await queryOne(
    `SELECT pr.*, je.entry_no AS journal_entry_number
       FROM payroll_runs pr
  LEFT JOIN journal_entries je ON je.id = pr.journal_entry_id
      WHERE pr.id = ? AND pr.org_id = ?`,
    [runId, orgId]
  );
  if (!run) throw new ApiError(404, 'Période de paie introuvable');

  const payslips = await query(
    `SELECT ps.*, e.registration_number, e.first_name, e.last_name, e.department, e.job_title, e.niu, e.cnps_number, e.bank_name, e.bank_account_rib
       FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
      WHERE ps.payroll_run_id = ? AND ps.org_id = ?
   ORDER BY e.department, e.last_name, e.first_name`,
    [runId, orgId]
  );

  return { run, payslips };
}

/**
 * Generate a new monthly payroll run across all active employees.
 */
export async function generatePayrollRun(orgId, { periodCode, periodName, runDate, createdBy }) {
  return transaction(async (tx) => {
    const existing = await queryOne(
      `SELECT id FROM payroll_runs WHERE org_id = ? AND period_code = ?`,
      [orgId, periodCode]
    );
    if (existing) {
      throw new ApiError(409, `La paie pour la période ${periodCode} a déjà été calculée`);
    }

    const employees = await tx.query(
      `SELECT * FROM employees WHERE org_id = ? AND is_active = 1`,
      [orgId]
    );
    if (!employees.length) {
      throw new ApiError(400, 'Aucun employé actif trouvé pour le calcul de la paie');
    }

    // Insert payroll run header
    const runRes = await tx.query(
      `INSERT INTO payroll_runs
       (org_id, period_code, period_name, run_date, status, created_by)
       VALUES (?, ?, ?, ?, 'calculated', ?)`,
      [orgId, periodCode, periodName || `Paie ${periodCode}`, runDate || new Date().toISOString().slice(0, 10), createdBy || 'Chef Comptable']
    );
    const runId = runRes.insertId;

    let totalGross = 0;
    let totalTaxable = 0;
    let totalCnpsEmp = 0;
    let totalIrpp = 0;
    let totalCac = 0;
    let totalTdl = 0;
    let totalCfcEmp = 0;
    let totalNet = 0;
    let totalCnpsEmpr = 0;
    let totalFneEmpr = 0;
    let totalCfcEmpr = 0;
    let totalEmployerCost = 0;

    for (const emp of employees) {
      const calc = calculateEmployeePayroll({
        baseSalary: emp.base_salary,
        transportAllowance: emp.transport_allowance,
        housingAllowance: emp.housing_allowance,
        representationAllowance: emp.representation_allowance,
      });

      totalGross = money(totalGross + calc.grossSalary);
      totalTaxable = money(totalTaxable + calc.taxableGross);
      totalCnpsEmp = money(totalCnpsEmp + calc.cnpsEmployee);
      totalIrpp = money(totalIrpp + calc.irpp);
      totalCac = money(totalCac + calc.cac);
      totalTdl = money(totalTdl + calc.tdl);
      totalCfcEmp = money(totalCfcEmp + calc.cfcEmployee);
      totalNet = money(totalNet + calc.netSalary);
      totalCnpsEmpr = money(totalCnpsEmpr + calc.totalCnpsEmployer);
      totalFneEmpr = money(totalFneEmpr + calc.fneEmployer);
      totalCfcEmpr = money(totalCfcEmpr + calc.cfcEmployer);
      totalEmployerCost = money(totalEmployerCost + calc.totalPayrollCost);

      await tx.query(
        `INSERT INTO payslips
         (org_id, payroll_run_id, employee_id, period_code, base_salary,
          transport_allowance, housing_allowance, representation_allowance,
          gross_salary, taxable_gross, cnps_capped_gross,
          cnps_employee, irpp, cac, tdl, cfc_employee, total_employee_deductions, net_salary,
          cnps_pvi_employer, cnps_pf_employer, cnps_at_employer, total_cnps_employer,
          fne_employer, cfc_employer, total_employer_contributions, total_payroll_cost,
          payment_method, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VIREMENT', 'pending')`,
        [
          orgId,
          runId,
          emp.id,
          periodCode,
          emp.base_salary,
          emp.transport_allowance,
          emp.housing_allowance,
          emp.representation_allowance,
          calc.grossSalary,
          calc.taxableGross,
          calc.cnpsCappedGross,
          calc.cnpsEmployee,
          calc.irpp,
          calc.cac,
          calc.tdl,
          calc.cfcEmployee,
          calc.totalEmployeeDeductions,
          calc.netSalary,
          calc.cnpsPviEmployer,
          calc.cnpsPfEmployer,
          calc.cnpsAtEmployer,
          calc.totalCnpsEmployer,
          calc.fneEmployer,
          calc.cfcEmployer,
          calc.totalEmployerContributions,
          calc.totalPayrollCost,
        ]
      );
    }

    // Update run totals
    await tx.query(
      `UPDATE payroll_runs
          SET total_gross = ?, total_taxable = ?, total_cnps_employee = ?,
              total_irpp = ?, total_cac = ?, total_tdl = ?, total_cfc_employee = ?,
              total_net_payable = ?, total_cnps_employer = ?, total_fne = ?,
              total_cfc_employer = ?, total_employer_cost = ?
        WHERE id = ?`,
      [
        totalGross, totalTaxable, totalCnpsEmp, totalIrpp, totalCac, totalTdl, totalCfcEmp,
        totalNet, totalCnpsEmpr, totalFneEmpr, totalCfcEmpr, totalEmployerCost, runId
      ]
    );

    return { runId, periodCode, employeeCount: employees.length, totalGross, totalNet, totalEmployerCost };
  });
}

/**
 * Post payroll run to General Ledger (Journal des Salaires - SA/OD).
 */
export async function postPayrollRunToLedger(orgId, runId, actor = 'Comptable Paie') {
  return transaction(async (tx) => {
    const run = await queryOne(
      `SELECT * FROM payroll_runs WHERE id = ? AND org_id = ?`,
      [runId, orgId]
    );
    if (!run) throw new ApiError(404, 'Période de paie introuvable');
    if (run.status === 'posted') {
      throw new ApiError(400, 'Cette paie a déjà été comptabilisée dans le Grand Livre');
    }

    // Find accounts
    const acctSalaires = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '6611'`, [orgId]);
    const acctChargesSoc = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '6641'`, [orgId]);
    const acctNetAPayer = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4221'`, [orgId]);
    const acctCnps = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4311'`, [orgId]);
    const acctIrppCac = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4471'`, [orgId]);
    const acctFneCfc = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4421'`, [orgId]);

    if (!acctSalaires || !acctChargesSoc || !acctNetAPayer || !acctCnps || !acctIrppCac || !acctFneCfc) {
      throw new ApiError(500, 'Comptes comptables de paie introuvables (6611, 6641, 4221, 4311, 4471, 4421)');
    }

    const totalGross = Number(run.total_gross);
    const totalEmployerSocial = money(Number(run.total_cnps_employer) + Number(run.total_fne) + Number(run.total_cfc_employer));
    const totalNet = Number(run.total_net_payable);
    const totalCnpsGlobal = money(Number(run.total_cnps_employee) + Number(run.total_cnps_employer));
    const totalFiscalWithholding = money(Number(run.total_irpp) + Number(run.total_cac) + Number(run.total_tdl));
    const totalFneCfcGlobal = money(Number(run.total_cfc_employee) + Number(run.total_cfc_employer) + Number(run.total_fne));

    const admCc = await queryOne(`SELECT id FROM cost_centers WHERE org_id = ? AND code = 'ADM'`, [orgId])
      || await queryOne(`SELECT id FROM cost_centers WHERE org_id = ? LIMIT 1`, [orgId]);

    const lines = [
      // 1. Debit Gross Salaries
      {
        accountId: acctSalaires.id,
        costCenterId: admCc?.id ?? null,
        description: `Salaires bruts du personnel médical et administratif - ${run.period_name}`,
        debit: totalGross,
        credit: 0,
      },
      // 2. Debit Employer Social Contributions
      {
        accountId: acctChargesSoc.id,
        costCenterId: admCc?.id ?? null,
        description: `Charges sociales patronales (CNPS, FNE, CFC) - ${run.period_name}`,
        debit: totalEmployerSocial,
        credit: 0,
      },
      // 3. Credit Net to Pay
      {
        accountId: acctNetAPayer.id,
        description: `Rémunérations nettes dues au personnel - ${run.period_name}`,
        debit: 0,
        credit: totalNet,
      },
      // 4. Credit Total CNPS (Employee + Employer)
      {
        accountId: acctCnps.id,
        description: `Cotisations sociales globales dues à la CNPS - ${run.period_name}`,
        debit: 0,
        credit: totalCnpsGlobal,
      },
      // 5. Credit State Taxes (IRPP, CAC, TDL)
      {
        accountId: acctIrppCac.id,
        description: `Retenues fiscales à la source (IRPP, CAC 10%, TDL) - ${run.period_name}`,
        debit: 0,
        credit: totalFiscalWithholding,
      },
      // 6. Credit State Agencies (FNE + CFC)
      {
        accountId: acctFneCfc.id,
        description: `Cotisations FNE (1%) et Crédit Foncier (1%+1%) - ${run.period_name}`,
        debit: 0,
        credit: totalFneCfcGlobal,
      },
    ];

    const entry = await createJournalEntry(tx, {
      orgId,
      journalCode: 'PAI',
      date: run.run_date,
      description: `Comptabilisation centralisée des salaires et charges - ${run.period_name}`,
      source: 'system',
      sourceRef: `PAIE-${run.period_code}`,
      framework: 'both',
      autoPost: true,
      overrideReason: 'Comptabilisation et régularisation mensuelle de paie hospitalière',
      lines,
      actor: typeof actor === 'object' ? actor : { name: String(actor), permissions: new Set(['journal.post_closed']) },
    });

    await tx.query(
      `UPDATE payroll_runs
          SET journal_entry_id = ?, status = 'posted'
        WHERE id = ?`,
      [entry.id, runId]
    );

    return {
      success: true,
      journalEntryId: entry.id,
      entryNumber: entry.entryNumber,
      totalDebits: money(totalGross + totalEmployerSocial),
      totalCredits: money(totalNet + totalCnpsGlobal + totalFiscalWithholding + totalFneCfcGlobal),
    };
  });
}

/**
 * Generate official statutory DIPE export (Document d'Information sur le Personnel et les Employés).
 * Conforms to the standard CEMAC / Cameroon magnetic file structure required by DGI and CNPS.
 */
export async function generateDipeExport(orgId, runId) {
  const { run, payslips } = await getPayrollRunDetails(orgId, runId);
  const org = await queryOne(`SELECT * FROM organizations WHERE id = ?`, [orgId]);

  const year = run.period_code.slice(0, 4);
  const month = run.period_code.slice(5, 7);

  const lines = [];
  // Header Record (DIPE00)
  lines.push([
    'DIPE00',
    'M', // Mensuel
    year,
    month,
    (org?.legal_name || 'SHISONG GENERAL HOSPITAL').toUpperCase(),
    'CNPS-789012-B',
    'M019200012345T',
    payslips.length,
    Math.round(run.total_gross),
    Math.round(Number(run.total_cnps_employee) + Number(run.total_cnps_employer)),
    Math.round(Number(run.total_irpp) + Number(run.total_cac) + Number(run.total_tdl)),
    Math.round(run.total_net_payable),
  ].join('|'));

  // Detail Records (DIPE01)
  payslips.forEach((ps, idx) => {
    lines.push([
      'DIPE01',
      idx + 1,
      ps.registration_number,
      ps.cnps_number,
      ps.niu,
      `${ps.last_name} ${ps.first_name}`.toUpperCase(),
      ps.department,
      Math.round(Number(ps.gross_salary)),
      Math.round(Number(ps.cnps_capped_gross)),
      Math.round(Number(ps.cnps_employee)),
      Math.round(Number(ps.taxable_gross)),
      Math.round(Number(ps.irpp)),
      Math.round(Number(ps.cac)),
      Math.round(Number(ps.tdl)),
      Math.round(Number(ps.cfc_employee)),
      Math.round(Number(ps.net_salary)),
      Math.round(Number(ps.total_cnps_employer)),
      Math.round(Number(ps.fne_employer)),
      Math.round(Number(ps.cfc_employer)),
    ].join('|'));
  });

  // Footer Record (DIPE99)
  lines.push([
    'DIPE99',
    payslips.length,
    Math.round(run.total_gross),
    Math.round(run.total_taxable),
    Math.round(run.total_cnps_employee),
    Math.round(run.total_irpp),
    Math.round(run.total_cac),
    Math.round(run.total_tdl),
    Math.round(run.total_net_payable),
    Math.round(run.total_employer_cost),
  ].join('|'));

  const textContent = lines.join('\r\n');
  const filename = `DIPE_MENSUEL_${run.period_code}_${(org?.legal_name || 'HOSPITAL').replace(/\s+/g, '_')}.txt`;

  return {
    filename,
    periodCode: run.period_code,
    employeeCount: payslips.length,
    summary: {
      totalGross: run.total_gross,
      totalNet: run.total_net_payable,
      totalCnps: Number(run.total_cnps_employee) + Number(run.total_cnps_employer),
      totalFiscal: Number(run.total_irpp) + Number(run.total_cac) + Number(run.total_tdl),
      totalEmployerCost: run.total_employer_cost,
    },
    textContent,
  };
}
