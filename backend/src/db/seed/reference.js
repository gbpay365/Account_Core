import { ROLES, PERMISSIONS } from './data/rbac.js';
import { SYSCOHADA_ACCOUNTS } from './data/syscohada.js';
import { IFRS_ACCOUNTS, IFRS_MAPPING_RULES } from './data/ifrs.js';
import { OHADA_REPORT_LINES } from './data/reports-ohada.js';
import { ASSET_CATEGORIES } from './data/asset-categories.js';
import { daysInMonth } from '../../utils/dates.js';

const CURRENCIES = [
  ['XAF', 'Franc CFA BEAC', 'FCFA', 0],
  ['XOF', 'Franc CFA BCEAO', 'FCFA', 0],
  ['EUR', 'Euro', 'EUR', 2],
  ['USD', 'US Dollar', '$', 2],
  ['GBP', 'Pound Sterling', 'GBP', 2],
  ['NGN', 'Nigerian Naira', 'NGN', 2],
  ['GHS', 'Ghanaian Cedi', 'GHS', 2],
  ['CNY', 'Chinese Yuan', 'CNY', 2],
];

// FR-STD-003 :: country parameter packs for the 17 OHADA member states, so a
// new jurisdiction is a data change rather than a code change.
const COUNTRIES = [
  ['CM', 'Cameroun', 'XAF', 19.25, 'exempt', 5.5, 'CM-DGI', 'Direction Generale des Impots'],
  ['CF', 'Republique Centrafricaine', 'XAF', 19.0, 'exempt', 3.0, 'CF-DGI', 'Direction Generale des Impots'],
  ['CG', 'Congo', 'XAF', 18.9, 'exempt', 5.0, 'CG-DGI', 'Direction Generale des Impots'],
  ['GA', 'Gabon', 'XAF', 18.0, 'exempt', 9.5, 'GA-DGI', 'Direction Generale des Impots'],
  ['GQ', 'Guinee Equatoriale', 'XAF', 15.0, 'exempt', 6.25, 'GQ-DGI', 'Direccion General de Impuestos'],
  ['TD', 'Tchad', 'XAF', 18.0, 'exempt', 4.0, 'TD-DGI', 'Direction Generale des Impots'],
  ['BJ', 'Benin', 'XOF', 18.0, 'exempt', 5.0, 'BJ-DGI', 'Direction Generale des Impots'],
  ['BF', 'Burkina Faso', 'XOF', 18.0, 'exempt', 5.0, 'BF-DGI', 'Direction Generale des Impots'],
  ['CI', "Cote d'Ivoire", 'XOF', 18.0, 'reduced', 7.5, 'CI-DGI', 'Direction Generale des Impots'],
  ['GW', 'Guinee-Bissau', 'XOF', 19.0, 'exempt', 5.0, 'GW-DGI', 'Direccao Geral das Contribuicoes'],
  ['ML', 'Mali', 'XOF', 18.0, 'exempt', 5.0, 'ML-DGI', 'Direction Generale des Impots'],
  ['NE', 'Niger', 'XOF', 19.0, 'exempt', 5.0, 'NE-DGI', 'Direction Generale des Impots'],
  ['SN', 'Senegal', 'XOF', 18.0, 'exempt', 5.0, 'SN-DGID', 'Direction Generale des Impots et Domaines'],
  ['TG', 'Togo', 'XOF', 18.0, 'exempt', 5.0, 'TG-OTR', 'Office Togolais des Recettes'],
  ['GN', 'Guinee', 'GNF', 18.0, 'exempt', 5.0, 'GN-DNI', 'Direction Nationale des Impots'],
  ['KM', 'Comores', 'KMF', 10.0, 'exempt', 5.0, 'KM-DGI', 'Direction Generale des Impots'],
  ['CD', 'Republique Democratique du Congo', 'CDF', 16.0, 'exempt', 14.0, 'CD-DGI', 'Direction Generale des Impots'],
];

const JOURNALS = [
  ['AN', 'Journal des a-nouveaux', 'Opening balances journal', 'closing', 0],
  ['OD', 'Journal des operations diverses', 'General journal', 'general', 1],
  ['ACH', 'Journal des achats', 'Purchases journal', 'purchase', 1],
  ['VTE', 'Journal des ventes', 'Sales journal', 'sales', 1],
  ['BQ', 'Journal de banque', 'Bank journal', 'bank', 1],
  ['CA', 'Journal de caisse', 'Cash journal', 'cash', 1],
  ['IMM', 'Journal des immobilisations', 'Fixed assets journal', 'asset', 0],
  ['AMO', 'Journal des amortissements', 'Depreciation journal', 'depreciation', 0],
  ['PAI', 'Journal de paie', 'Payroll journal', 'payroll', 1],
  ['CHG', 'Journal des ecarts de change', 'FX differences journal', 'fx', 0],
];

const SEQUENCES = [
  ['journal_entry', 'JE-', 6],
  ['purchase_order', 'PO-', 5],
  ['goods_receipt', 'GRN-', 5],
  ['supplier_invoice', 'FF-', 5],
  ['payment', 'PMT-', 5],
  ['receivable', 'FC-', 5],
  ['asset_tag', 'TSSF-', 5],
  ['work_order', 'OT-', 5],
  ['disposal', 'CES-', 4],
  ['maintenance_plan', 'PM-', 4],
  ['errand', 'ER-', 4],
  ['shopping_list', 'SL-', 4],
];

const CLOSE_TASKS = [
  ['CUT-OFF', 'Arreter la saisie des pieces de la periode', 'Freeze transaction capture for the period', 'review', 1, 1],
  ['AP-ACCRUAL', 'Comptabiliser les charges a payer et factures non parvenues', 'Post accruals and invoices not received', 'accrual', 1, 1],
  ['AR-ACCRUAL', 'Comptabiliser les produits a recevoir', 'Post accrued income', 'accrual', 1, 0],
  ['BANK-RECON', 'Rapprocher tous les comptes bancaires et de caisse', 'Reconcile all bank and cash accounts', 'reconciliation', 1, 1],
  ['SUP-RECON', 'Rapprocher les balances fournisseurs et clients', 'Reconcile supplier and customer balances', 'reconciliation', 1, 1],
  ['FX-REVAL', 'Executer la reevaluation des soldes en devises', 'Run FX revaluation on foreign currency balances', 'fx', 1, 1],
  ['ASSET-ADD', "Capitaliser les acquisitions d'immobilisations de la periode", 'Capitalise the period asset acquisitions', 'asset', 1, 1],
  ['ASSET-DISP', 'Traiter les cessions et mises au rebut approuvees', 'Process approved disposals and write-offs', 'asset', 1, 1],
  ['ASSET-COUNT', 'Verifier la concordance registre des immobilisations / grand livre', 'Reconcile the asset register to the fixed-asset ledger', 'asset', 1, 1],
  ['DEPR-RUN', 'Executer et comptabiliser la dotation aux amortissements', 'Run and post the depreciation charge', 'depreciation', 1, 1],
  ['IMPAIR-TEST', 'Revue des indices de perte de valeur (IAS 36)', 'Review impairment indicators (IAS 36)', 'depreciation', 0, 0],
  ['TAX-VAT', 'Preparer la declaration de TVA de la periode', 'Prepare the period VAT declaration', 'tax', 1, 1],
  ['TB-REVIEW', 'Revue de la balance generale et des comptes d attente', 'Review the trial balance and suspense accounts', 'review', 1, 1],
  ['BUDGET-VAR', 'Analyser les ecarts budgetaires par service', 'Analyse budget variances by department', 'review', 0, 0],
  ['STMT-PREP', 'Produire les etats OHADA et IFRS de la periode', 'Produce the period OHADA and IFRS statements', 'reporting', 1, 1],
  ['SIGN-OFF', 'Validation finale par le chef comptable / DAF', 'Final review and sign-off by the Chief Accountant / CFO', 'review', 1, 1],
];

const SETTINGS = [
  ['asset.tag_prefix', 'TSSF', 'string', 'assets', 'Prefix used when generating asset tags'],
  ['asset.qr_base_url', 'https://ledgercore.local/a/', 'string', 'assets', 'Base URL encoded into asset QR codes'],
  ['asset.capitalization_threshold', '50000', 'decimal', 'assets', 'Minimum cost to capitalise rather than expense'],
  ['asset.block_use_when_calibration_overdue', 'true', 'bool', 'assets', 'FR-AM-022: restrict use of equipment overdue for calibration'],
  ['asset.calibration_alert_days', '30', 'int', 'assets', 'Days before calibration due date to raise an alert'],
  ['asset.warranty_alert_days', '60', 'int', 'assets', 'Days before warranty expiry to raise an alert'],
  ['maintenance.pm_generation_horizon_days', '60', 'int', 'maintenance', 'How far ahead preventive work orders are generated'],
  ['maintenance.default_labour_rate', '5000', 'decimal', 'maintenance', 'Default internal technician hourly rate'],
  ['accounting.allow_closed_period_override', 'true', 'bool', 'accounting', 'FR-GL-003: allow authorised override with logged reason'],
  ['accounting.posting_length', '4', 'int', 'accounting', 'FR-PL-001: characters required to accept a journal line'],
  ['accounting.posting_length_locked', 'false', 'bool', 'accounting', 'FR-PL-001: lock posting length once movements exist'],
  ['accounting.suspense_account', '4718', 'string', 'accounting', 'FR-DE-010: fallback account for unclassified counterparts'],
  ['accounting.history_suggestions', 'true', 'bool', 'accounting', 'FR-DE-009: suggest counterparts from posted history'],
  ['accounting.require_cost_center_on_expense', 'true', 'bool', 'accounting', 'Force analytical coding on expense accounts'],
  ['accounting.depreciation_basis_of_record', 'ohada', 'string', 'accounting', 'Which basis posts to the ledger directly; the other posts as a delta'],
  ['reporting.default_framework', 'ohada', 'string', 'reporting', 'Framework shown first in the statement viewer'],
  ['reporting.retention_years', '10', 'int', 'reporting', 'Statutory retention period for financial records'],
  ['localization.default_locale', 'fr', 'string', 'localization', 'Default UI language'],
];

/** An account is postable only if no other account sits beneath it. */
function markLeaves(rows) {
  const codes = rows.map((r) => r.code).sort();
  const hasChild = new Set();
  for (let i = 0; i < codes.length; i += 1) {
    for (let j = i + 1; j < codes.length && codes[j].startsWith(codes[i]); j += 1) {
      if (codes[j].length > codes[i].length) hasChild.add(codes[i]);
    }
  }
  return rows.map((r) => ({ ...r, is_postable: hasChild.has(r.code) ? 0 : 1 }));
}

/** Parent is the longest strict prefix present in the plan. */
function resolveParent(code, byCode) {
  for (let len = code.length - 1; len >= 1; len -= 1) {
    const candidate = code.slice(0, len);
    if (byCode.has(candidate)) return candidate;
  }
  return null;
}

export async function seedReference(tx, log) {
  // --- currencies & country packs -------------------------------------------
  for (const [code, name, symbol, decimals] of CURRENCIES) {
    await tx.query(
      'INSERT INTO currencies (code, name, symbol, decimals) VALUES (?,?,?,?) ' +
        'ON DUPLICATE KEY UPDATE name=VALUES(name), symbol=VALUES(symbol), decimals=VALUES(decimals)',
      [code, name, symbol, decimals]
    );
  }
  // CDF / GNF / KMF are referenced by the country packs above.
  for (const [code, name, symbol, d] of [['CDF', 'Congolese Franc', 'FC', 2], ['GNF', 'Guinean Franc', 'FG', 0], ['KMF', 'Comorian Franc', 'CF', 0]]) {
    await tx.query('INSERT IGNORE INTO currencies (code, name, symbol, decimals) VALUES (?,?,?,?)', [code, name, symbol, d]);
  }
  for (const [cc, name, cur, vat, medVat, wht, annex, authority] of COUNTRIES) {
    await tx.query(
      `INSERT INTO country_parameters
         (country_code, name, is_ohada_member, currency, vat_standard_rate,
          medical_equipment_vat, withholding_rate, statutory_annex_code, tax_authority_name)
       VALUES (?,?,1,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), vat_standard_rate=VALUES(vat_standard_rate)`,
      [cc, name, cur, vat, medVat, wht, annex, authority]
    );
  }
  log(`currencies + ${COUNTRIES.length} OHADA country parameter packs`);

  // --- roles & permissions ---------------------------------------------------
  for (const [code, module, description] of PERMISSIONS) {
    await tx.query(
      'INSERT INTO permissions (code, module, description) VALUES (?,?,?) ' +
        'ON DUPLICATE KEY UPDATE module=VALUES(module), description=VALUES(description)',
      [code, module, description]
    );
  }
  const permRows = await tx.query('SELECT id, code FROM permissions');
  const permId = new Map(permRows.map((r) => [r.code, r.id]));

  for (const role of ROLES) {
    await tx.query(
      'INSERT INTO roles (code, name, name_en, description) VALUES (?,?,?,?) ' +
        'ON DUPLICATE KEY UPDATE name=VALUES(name), name_en=VALUES(name_en), description=VALUES(description)',
      [role.code, role.name, role.name_en, role.description]
    );
    const { id } = await tx.queryOne('SELECT id FROM roles WHERE code = ?', [role.code]);
    await tx.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    for (const p of role.permissions) {
      if (permId.has(p)) {
        await tx.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?,?)', [id, permId.get(p)]);
      }
    }
  }
  log(`${ROLES.length} roles / ${PERMISSIONS.length} permissions`);
}

export async function seedOrgReference(tx, orgId, log) {
  // --- chart of accounts -----------------------------------------------------
  const rows = markLeaves(SYSCOHADA_ACCOUNTS);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const sorted = [...rows].sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
  const accountId = new Map();

  for (const a of sorted) {
    const parentCode = resolveParent(a.code, byCode);
    const parentId = parentCode ? accountId.get(parentCode) : null;
    const level = parentCode ? (byCode.get(parentCode)._level || 1) + 1 : 1;
    a._level = level;
    const tiers = a.tiers || 'na';
    const res = await tx.query(
      `INSERT INTO accounts
         (org_id, code, name, name_en, account_class, parent_id, level, account_type,
          normal_side, is_postable, is_reconcilable, requires_cost_center, requires_asset,
          is_fixed_asset, in_tier_normal, in_tier_allege, in_tier_smt, is_system)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE name=VALUES(name), is_postable=VALUES(is_postable)`,
      [
        orgId, a.code, a.name, a.name_en, a.account_class, parentId, level,
        a.account_type, a.normal_side, a.is_postable,
        a.is_reconcilable ? 1 : 0, a.requires_cost_center ? 1 : 0,
        a.requires_asset ? 1 : 0, a.is_fixed_asset ? 1 : 0,
        tiers.includes('n') ? 1 : 0, tiers.includes('a') ? 1 : 0, tiers.includes('s') ? 1 : 0,
      ]
    );
    let id = res.insertId;
    if (!id) {
      const existingAcct = await tx.queryOne('SELECT id FROM accounts WHERE org_id = ? AND code = ?', [orgId, a.code]);
      id = existingAcct?.id;
    }
    accountId.set(a.code, id);
  }
  log(`${rows.length} SYSCOHADA accounts (${rows.filter((r) => r.is_postable).length} postable)`);

  // --- IFRS presentation lines ----------------------------------------------
  const ifrsId = new Map();
  for (const [code, en, fr, statement, section, sub, sign, sort, note] of IFRS_ACCOUNTS) {
    const res = await tx.query(
      `INSERT INTO ifrs_accounts (org_id, code, name, name_fr, statement, section, sub_section, sign, sort_order, note_ref)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), name_fr=VALUES(name_fr)`,
      [orgId, code, en, fr, statement, section, sub, sign, sort, note]
    );
    let id = res.insertId;
    if (!id) {
      const existingIfrs = await tx.queryOne('SELECT id FROM ifrs_accounts WHERE org_id = ? AND code = ?', [orgId, code]);
      id = existingIfrs?.id;
    }
    ifrsId.set(code, id);
  }

  // Expand the prefix rules into one explicit mapping row per postable account
  // (longest prefix wins), so any single account can be re-pointed later.
  const rulesByLength = [...IFRS_MAPPING_RULES].sort((a, b) => b[0].length - a[0].length);
  let mapped = 0;
  for (const a of rows) {
    if (!a.is_postable) continue;
    const rule = rulesByLength.find(([prefix]) => a.code.startsWith(prefix));
    if (!rule || !ifrsId.has(rule[1])) continue;
    await tx.query(
      'INSERT IGNORE INTO account_mappings (org_id, account_id, ifrs_account_id, note) VALUES (?,?,?,?)',
      [orgId, accountId.get(a.code), ifrsId.get(rule[1]), `Auto-mapped from prefix ${rule[0]}`]
    );
    mapped += 1;
  }
  log(`${IFRS_ACCOUNTS.length} IFRS presentation lines, ${mapped} account mappings`);

  // --- statutory report templates -------------------------------------------
  for (const line of OHADA_REPORT_LINES) {
    await tx.query(
      `INSERT INTO report_lines
         (org_id, framework, statement_code, line_code, label, label_en, side, line_type,
          sign, gross_formula, depr_formula, formula, is_bold, note_ref, sort_order)
       VALUES (?, 'ohada', ?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE label=VALUES(label), label_en=VALUES(label_en), formula=VALUES(formula)`,
      [
        orgId, line.statement_code, line.line_code, line.label, line.label_en,
        line.side, line.line_type, line.sign ?? 1,
        line.gross_formula ?? null, line.depr_formula ?? null, line.formula ?? null,
        line.is_bold ?? 0, line.note_ref ?? null, line.sort_order,
      ]
    );
  }
  log(`${OHADA_REPORT_LINES.length} OHADA statement template lines`);

  // --- journals --------------------------------------------------------------
  for (const [code, name, nameEn, type, manual] of JOURNALS) {
    await tx.query(
      `INSERT INTO journals (org_id, code, name, name_en, journal_type, allow_manual) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), name_en=VALUES(name_en), journal_type=VALUES(journal_type), allow_manual=VALUES(allow_manual)`,
      [orgId, code, name, nameEn, type, manual]
    );
  }

  // --- document sequences ----------------------------------------------------
  for (const [name, prefix, padding] of SEQUENCES) {
    await tx.query(
      `INSERT INTO sequences (org_id, name, prefix, padding, include_year, reset_yearly) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE prefix=VALUES(prefix), padding=VALUES(padding)`,
      [orgId, name, prefix, padding, name === 'asset_tag' ? 0 : 1, name === 'asset_tag' ? 0 : 1]
    );
  }

  // --- settings --------------------------------------------------------------
  for (const [key, value, type, category, description] of SETTINGS) {
    await tx.query(
      `INSERT INTO settings (org_id, setting_key, value_text, data_type, category, description) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE value_text=VALUES(value_text), data_type=VALUES(data_type), category=VALUES(category), description=VALUES(description)`,
      [orgId, key, value, type, category, description]
    );
  }

  // --- tax codes (FR-TX-001, incl. the medical-equipment exemption) ---------
  const A = (code) => accountId.get(code) ?? null;
  const TAX_CODES = [
    ['TVA-ACH-1925', 'TVA recuperable 19,25% sur achats', 'vat_purchase', 19.25, 1, A('4452'), null, 'goods', null, 'TVA-DED'],
    ['TVA-IMM-1925', 'TVA recuperable 19,25% sur immobilisations', 'vat_purchase', 19.25, 1, A('4451'), null, 'all', null, 'TVA-IMM'],
    ['TVA-SRV-1925', 'TVA recuperable 19,25% sur services', 'vat_purchase', 19.25, 1, A('4454'), null, 'services', null, 'TVA-DED'],
    ['TVA-TRP-1925', 'TVA recuperable 19,25% sur transport', 'vat_purchase', 19.25, 1, A('4453'), null, 'services', null, 'TVA-DED'],
    ['TVA-VTE-1925', 'TVA collectee 19,25% sur prestations', 'vat_sale', 19.25, 0, null, A('4434'), 'services', null, 'TVA-COL'],
    ['TVA-VTE-BIEN', 'TVA collectee 19,25% sur ventes de biens', 'vat_sale', 19.25, 0, null, A('4431'), 'goods', null, 'TVA-COL'],
    ['TVA-EXO-MED', 'Exoneration TVA - materiel et dispositifs medicaux', 'exempt', 0, 0, null, null, 'medical_equipment',
      "Exoneration de TVA sur les equipements et dispositifs medicaux (annexe des biens exoneres, code general des impots). A verifier par juridiction OHADA.", 'TVA-EXO'],
    ['TVA-EXO-PHAR', 'Exoneration TVA - produits pharmaceutiques', 'exempt', 0, 0, null, null, 'pharmaceuticals',
      'Exoneration de TVA sur les medicaments et produits pharmaceutiques.', 'TVA-EXO'],
    ['TVA-EXO-SOIN', 'Exoneration TVA - prestations de soins de sante', 'exempt', 0, 0, null, null, 'services',
      'Les prestations de soins medicaux et hospitaliers sont exonerees de TVA.', 'TVA-EXO'],
    ['TVA-0', 'Hors champ / non soumis a TVA', 'zero_rated', 0, 0, null, null, 'all', null, null],
    ['RAS-055', 'Retenue a la source 5,5% (acompte IR/IS)', 'withholding', 5.5, 0, null, A('447'), 'services', null, 'RAS'],
    ['DD-CUST', 'Droits de douane a l importation', 'customs', 10.0, 0, A('645'), null, 'goods', null, 'DD'],
  ];
  for (const [code, name, type, rate, recoverable, input, output, appliesTo, exemption, box] of TAX_CODES) {
    await tx.query(
      `INSERT INTO tax_codes (org_id, code, name, tax_type, rate, is_recoverable,
         input_account_id, output_account_id, applies_to, exemption_reason, declaration_box)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), rate=VALUES(rate)`,
      [orgId, code, name, type, rate, recoverable, input, output, appliesTo, exemption, box]
    );
  }
  log(`${JOURNALS.length} journals, ${TAX_CODES.length} tax codes, ${SETTINGS.length} settings`);

  return { accountId, ifrsId };
}

/** Asset categories, resolved against the chart of accounts. */
export async function seedAssetCategories(tx, orgId, accountId, log) {
  const A = (code) => (code ? accountId.get(code) ?? null : null);
  const catId = new Map();
  let count = 0;

  const insert = async (c, parentId) => {
    const res = await tx.query(
      `INSERT INTO asset_categories
        (org_id, code, name, name_en, domain, parent_id, taxonomy_system, taxonomy_code,
         asset_account_id, accum_depr_account_id, depr_expense_account_id,
         disposal_gain_account_id, disposal_loss_account_id, maintenance_account_id,
         revaluation_surplus_account_id, impairment_account_id,
         ohada_useful_life_months, ohada_method, ohada_declining_factor, ohada_salvage_pct,
         ifrs_useful_life_months, ifrs_method, ifrs_declining_factor, ifrs_residual_pct,
         ifrs_measurement_model, allow_component_depr,
         requires_calibration, calibration_interval_months,
         requires_safety_test, safety_test_standard, safety_interval_months,
         pm_interval_months, pm_interval_hours, pm_interval_km,
         capitalization_threshold, default_criticality)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         name_en=VALUES(name_en),
         asset_account_id=VALUES(asset_account_id),
         accum_depr_account_id=VALUES(accum_depr_account_id),
         depr_expense_account_id=VALUES(depr_expense_account_id),
         disposal_gain_account_id=VALUES(disposal_gain_account_id),
         disposal_loss_account_id=VALUES(disposal_loss_account_id),
         maintenance_account_id=VALUES(maintenance_account_id)`,
      [
        orgId, c.code, c.name, c.name_en, c.domain, parentId,
        c.taxonomy_system || 'internal', c.taxonomy_code || null,
        A(c.asset_account), A(c.accum_depr_account), A(c.depr_expense_account),
        A(c.disposal_gain_account), A(c.disposal_loss_account), A(c.maintenance_account),
        A(c.revaluation_surplus_account), A(c.impairment_account),
        c.ohada_useful_life_months ?? 60, c.ohada_method || 'straight_line',
        c.ohada_declining_factor ?? 1, c.ohada_salvage_pct ?? 0,
        c.ifrs_useful_life_months ?? 60, c.ifrs_method || 'straight_line',
        c.ifrs_declining_factor ?? 1, c.ifrs_residual_pct ?? 0,
        c.ifrs_measurement_model || 'cost', c.allow_component_depr ?? 0,
        c.requires_calibration ?? 0, c.calibration_interval_months ?? null,
        c.requires_safety_test ?? 0, c.safety_test_standard || null, c.safety_interval_months ?? null,
        c.pm_interval_months ?? null, c.pm_interval_hours ?? null, c.pm_interval_km ?? null,
        c.capitalization_threshold ?? 0, c.default_criticality || 'medium',
      ]
    );
    let id = res.insertId;
    if (!id) {
      const existingCat = await tx.queryOne('SELECT id FROM asset_categories WHERE org_id = ? AND code = ?', [orgId, c.code]);
      id = existingCat?.id;
    }
    catId.set(c.code, id);
    count += 1;
    return id;
  };

  for (const c of ASSET_CATEGORIES) {
    const id = await insert(c, null);
    for (const child of c.children || []) {
      // Children inherit the parent's accounting and compliance defaults.
      const { children, ...parentDefaults } = c;
      await insert({ ...parentDefaults, ...child }, id);
    }
  }
  log(`${count} asset categories across 4 domains`);
  return catId;
}

/** Fiscal years with 12 monthly periods each, plus a close checklist. */
export async function seedFiscalCalendar(tx, orgId, years, log) {
  const periodId = new Map();
  for (const { year, status } of years) {
    const fy = await tx.query(
      `INSERT INTO fiscal_years (org_id, code, name, start_date, end_date, status)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), name = VALUES(name)`,
      [orgId, `FY${year}`, `Fiscal year ${year}`, `${year}-01-01`, `${year}-12-31`, status]
    );
    let fyId = fy.insertId;
    if (!fyId) {
      const existing = await tx.queryOne('SELECT id FROM fiscal_years WHERE org_id = ? AND code = ?', [orgId, `FY${year}`]);
      fyId = existing?.id;
    }
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (let m = 1; m <= 12; m += 1) {
      const mm = String(m).padStart(2, '0');
      const periodCode = `${year}-${mm}`;
      const res = await tx.query(
        `INSERT INTO accounting_periods
           (org_id, fiscal_year_id, period_no, code, name, start_date, end_date, status)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE fiscal_year_id = VALUES(fiscal_year_id), end_date = VALUES(end_date), status = VALUES(status)`,
        [
          orgId, fyId, m, periodCode, `${names[m - 1]} ${year}`,
          `${year}-${mm}-01`, `${year}-${mm}-${String(daysInMonth(year, m)).padStart(2, '0')}`,
          status === 'open' ? 'open' : 'locked',
        ]
      );
      let pId = res.insertId;
      if (!pId) {
        const existingP = await tx.queryOne('SELECT id FROM accounting_periods WHERE org_id = ? AND code = ?', [orgId, periodCode]);
        pId = existingP?.id;
      }
      periodId.set(periodCode, pId);
    }
  }
  log(`${years.length} fiscal years / ${periodId.size} accounting periods`);
  return periodId;
}

export async function seedCloseChecklist(tx, orgId, periodIdValue) {
  const cl = await tx.query(
    "INSERT INTO close_checklists (org_id, period_id, status) VALUES (?,?,'not_started')",
    [orgId, periodIdValue]
  );
  let seq = 10;
  for (const [taskCode, title, , category, mandatory, blocks] of CLOSE_TASKS) {
    await tx.query(
      `INSERT INTO close_checklist_items (checklist_id, seq, task_code, title, category, is_mandatory, blocks_lock)
       VALUES (?,?,?,?,?,?,?)`,
      [cl.insertId, seq, taskCode, title, category, mandatory, blocks]
    );
    seq += 10;
  }
  return cl.insertId;
}

export { CLOSE_TASKS };
