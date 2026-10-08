/**
 * Translate live journal narratives (and period names used in those
 * narratives) from French to English without resetting the ledger.
 */
import { query, queryOne } from '../src/db/pool.js';
import { pool } from '../src/db/pool.js';

const REPLACEMENTS = [
  ['Facturation des prestations hospitalieres -', 'Hospital service billing —'],
  ['Facturation des prestations hospitalières -', 'Hospital service billing —'],
  ['Facturation des prestations -', 'Billing for services —'],
  ["Dotation de fonctionnement de l'Etat -", 'State operating grant —'],
  ["Dotation de fonctionnement de l'État -", 'State operating grant —'],
  ['Encaissement de la dotation de fonctionnement -', 'Receipt of the operating grant —'],
  ['Encaissements des prestations et conventions -', 'Collections for services and conventions —'],
  ['Paie du personnel -', 'Staff payroll —'],
  ['Charges d exploitation et achats du mois -', "Operating expenses and purchases for the month —"],
  ["Charges d'exploitation et achats du mois -", 'Operating expenses and purchases for the month —'],
  ['Reglements fournisseurs et salaires -', 'Supplier and salary payments —'],
  ['Règlements fournisseurs et salaires -', 'Supplier and salary payments —'],
  ['Determination de la TVA de la periode -', 'VAT determination for the period —'],
  ['Détermination de la TVA de la période -', 'VAT determination for the period —'],
  ["Quote-part de subventions d'investissement virees au resultat (janvier a aout 2026)", 'Share of capital grants released to income (January to August 2026)'],
  ["Quote-part de subventions d'investissement virées au résultat (janvier a aout 2026)", 'Share of capital grants released to income (January to August 2026)'],
  ['Reevaluation du compte en devise EUR au cours de cloture (IAS 21)', 'Revaluation of the EUR currency account at the closing rate (IAS 21)'],
  ['Réévaluation du compte en devise EUR au cours de clôture (IAS 21)', 'Revaluation of the EUR currency account at the closing rate (IAS 21)'],
  ['Balance d ouverture au 31/12/2025 - reprise du systeme anterieur', 'Opening trial balance at 31/12/2025 — prior-system cutover'],
  ["Balance d ouverture - ecart d'amortissement cumule IFRS vs SYSCOHADA", 'Opening balance — IFRS vs SYSCOHADA accumulated-depreciation difference'],
  ["Balance d'ouverture - ecart d'amortissement cumule IFRS vs SYSCOHADA", 'Opening balance — IFRS vs SYSCOHADA accumulated-depreciation difference'],
  ['Dotation aux amortissements -', 'Depreciation charge —'],
  ["Ecart d'amortissement IFRS vs OHADA -", 'Depreciation difference IFRS vs OHADA —'],
  ["Ecart d'amortissement OHADA vs IFRS -", 'Depreciation difference OHADA vs IFRS —'],
  ['Contre-passation de la facture saisie en double.', 'Reversal of a duplicate invoice posting.'],
  ['contre-passation de la facture saisie en double.', 'reversal of a duplicate invoice posting.'],
  ['EXTOURNE ', 'REVERSAL '],
  ['Immobilisation ', 'Capitalisation of '],
  ['Valeur brute des immobilisations reprise a l ouverture', 'Gross carrying amount of fixed assets brought forward at opening'],
  ['Amortissements cumules repris a l ouverture', 'Accumulated depreciation brought forward at opening'],
  ['Solde de tresorerie repris a l ouverture', 'Cash and bank balances brought forward at opening'],
  ['Creances reprises a l ouverture', 'Receivables brought forward at opening'],
  ['Stock de produits pharmaceutiques et consommables medicaux', 'Inventory of pharmaceuticals and medical consumables'],
  ['Stock de pieces de rechange biomedicales', 'Inventory of biomedical spare parts'],
  ['Dotation de l Etat (capital par dotation)', 'State endowment (capital by endowment)'],
  ["Subventions d'equipement recues des bailleurs", 'Equipment grants received from donors'],
  ['Reserve legale', 'Legal reserve'],
  ["Emprunt d'equipement aupres d'un etablissement de credit", 'Equipment loan from a credit institution'],
  ["Dettes fournisseurs d'exploitation reprises", 'Trade payables brought forward'],
  ["Dettes fournisseurs d'investissement reprises", 'Capital-expenditure payables brought forward'],
  ['Remunerations dues au personnel', 'Staff remuneration payable'],
  ['Cotisations sociales dues', 'Social-security contributions payable'],
  ['TVA due reprise a l ouverture', 'VAT payable brought forward at opening'],
  ['Report a nouveau - reprise des soldes du systeme anterieur', 'Retained earnings — balances brought forward from the prior system'],
  ['Report a nouveau debiteur - reprise des soldes du systeme anterieur', 'Accumulated deficit — balances brought forward from the prior system'],
  ["Complement d'amortissement cumule sur base IFRS a l'ouverture", 'Additional IFRS accumulated depreciation at opening'],
  ["Reduction d'amortissement cumule sur base IFRS a l'ouverture", 'Reduction of IFRS accumulated depreciation at opening'],
  ['Report a nouveau - impact IFRS de la difference de duree d utilite', 'Retained earnings — IFRS useful-life difference'],
  ['Etat, dotation de fonctionnement a recevoir', 'State — operating grant receivable'],
  ["Subvention d'exploitation - Etat", 'Operating subsidy — State'],
  ['Virement du Tresor Public', 'Public Treasury transfer'],
  ['Etat, dotation de fonctionnement encaissee', 'State — operating grant received'],
  ['TVA recuperable sur achats et services', 'Recoverable VAT on purchases and services'],
  ['Fournisseurs d exploitation -', 'Trade suppliers —'],
  ["Fournisseurs d'exploitation -", 'Trade suppliers —'],
  ['Remunerations du personnel -', 'Staff remuneration —'],
  ['Charges sociales patronales', 'Employer social-security charges'],
  ['Remunerations nettes dues -', 'Net remuneration payable —'],
  ['Impots retenus a la source sur salaires', 'Payroll tax withheld at source'],
  ['Cotisations sociales a payer (part patronale et salariale, CNPS)', 'Social-security contributions payable (employer and employee shares, CNPS)'],
  ['Encaissements par virement et convention', 'Receipts by bank transfer and convention'],
  ['Encaissements en especes au guichet', 'Cash receipts at the cashier'],
  ['Encaissements par mobile money', 'Mobile-money receipts'],
  ['Reglement des conventions publiques', 'Settlement of public conventions'],
  ['Reglement des assureurs et mutuelles', 'Settlement by insurers and mutual funds'],
  ['Reglement des patients payants', 'Settlement by self-paying patients'],
  ['Reglement des fournisseurs d exploitation', 'Payment of trade suppliers'],
  ["Reglement des fournisseurs d'exploitation", 'Payment of trade suppliers'],
  ['Virement des salaires nets', 'Transfer of net salaries'],
  ['Reglement des cotisations sociales', 'Payment of social-security contributions'],
  ['Interets sur emprunt d equipement', 'Interest on the equipment loan'],
  ["Interets sur emprunt d'equipement", 'Interest on the equipment loan'],
  ['Frais et commissions bancaires', 'Bank charges and commissions'],
  ["Remboursement du principal de l'emprunt", 'Repayment of loan principal'],
  ['Debits sur compte principal -', 'Debits on the main bank account —'],
  ['TVA due de la periode', 'VAT payable for the period'],
  ['Imputation de la TVA recuperable', 'Allocation of recoverable VAT'],
  ["Subventions d'investissement inscrites au compte de resultat", 'Capital grants transferred to the income statement'],
  ["Reprise de subventions d'investissement", 'Release of capital grants'],
  ['Ajustement du solde EUR au cours de cloture', 'Adjustment of the EUR balance at the closing rate'],
  ['Gain de change latent sur compte en devise', 'Unrealised foreign-exchange gain on the currency account'],
  ['Consultations et actes des urgences', 'Emergency consultations and procedures'],
  ['Consultations de medecine interne', 'Internal-medicine consultations'],
  ['Hospitalisation et hebergement - medecine', 'Inpatient care and accommodation — medicine'],
  ['Hospitalisation et hebergement - pediatrie', 'Inpatient care and accommodation — paediatrics'],
  ['Actes chirurgicaux et bloc operatoire', 'Surgical procedures and operating theatre'],
  ['Examens de laboratoire', 'Laboratory tests'],
  ['Imagerie et radiologie', 'Imaging and radiology'],
  ['Seances de dialyse', 'Dialysis sessions'],
  ['Accouchements et suivi neonatal', 'Deliveries and neonatal follow-up'],
  ['Produits pharmaceutiques et consommables medicaux', 'Pharmaceuticals and medical consumables'],
  ['Reactifs et consommables de laboratoire', 'Laboratory reagents and consumables'],
  ['Produits d entretien et d hygiene hospitaliere', 'Hospital cleaning and hygiene supplies'],
  ["Produits d'entretien et d hygiene hospitaliere", 'Hospital cleaning and hygiene supplies'],
  ['Electricite - ENEO', 'Electricity — ENEO'],
  ['Eau - CAMWATER', 'Water — CAMWATER'],
  ['Carburant et lubrifiants du parc sanitaire', 'Fuel and lubricants for the hospital fleet'],
  ['Maintenance du materiel biomedical', 'Biomedical-equipment maintenance'],
  ['Maintenance des installations techniques', 'Technical-installation maintenance'],
  ['Maintenance du parc automobile', 'Vehicle-fleet maintenance'],
  ['Etalonnage et verification metrologique', 'Calibration and metrological verification'],
  ['Assurance responsabilite civile medicale', 'Medical professional-liability insurance'],
  ['Frais de telecommunications et liaison internet', 'Telecommunications and internet charges'],
  ['TVA recuperable sur immobilisation', 'Recoverable VAT on fixed asset'],
  ['Reprise amortissements ', 'Reversal of accumulated depreciation '],
  ['VNC sortie ', 'NBV written off '],
  ['Produit de cession ', 'Disposal proceeds '],
  ['Frais de cession / elimination ', 'Disposal / elimination costs '],
  ['Frais de cession ', 'Disposal costs '],
  ['Ajustement IFRS sur cession ', 'IFRS adjustment on disposal of '],
  ['Reprise amortissement cumule IFRS excedentaire', 'Reversal of excess IFRS accumulated depreciation'],
  ['Reduction de la VNC sur base IFRS', 'Reduction of NBV on the IFRS basis'],
  ['Augmentation de la VNC sur base IFRS', 'Increase of NBV on the IFRS basis'],
  ['Complement amortissement cumule IFRS', 'Additional IFRS accumulated depreciation'],
  ['Perte de valeur IAS 36 -', 'IAS 36 impairment loss -'],
  ['Reprise de perte de valeur IAS 36 -', 'Reversal of IAS 36 impairment loss -'],
  ['Reprise de depreciation ', 'Reversal of impairment '],
  ['Reevaluation IAS 16 -', 'IAS 16 revaluation -'],
  ['Ecart de reevaluation ', 'Revaluation surplus '],
  ["Reprise d'ecart de reevaluation ", 'Reversal of revaluation surplus '],
  ['Reevaluation negative ', 'Downward revaluation '],
  ['Amelioration ', 'Improvement '],
  ['Complement de dotation ', 'Additional depreciation charge '],
  ["Complement d'amortissement cumule ", 'Additional accumulated depreciation '],
  ["Reduction d'amortissement cumule ", 'Reduction of accumulated depreciation '],
  ['Reduction de dotation ', 'Reduction of depreciation charge '],
  ['Amortissements cumules ', 'Accumulated depreciation '],
  ['Dotation aux amortissements ', 'Depreciation charge '],
  ['immobilisation(s)', 'asset(s)'],
  ['Les durees d utilite et les valeurs residuelles retenues par la politique du groupe (IAS 16) diffèrent des durees statutaires SYSCOHADA. Seul l ecart est comptabilise, avec un marquage IFRS, de sorte que les deux jeux d etats proviennent du meme grand livre.',
    'Useful lives and residual values adopted in the group policy (IAS 16) differ from the statutory SYSCOHADA lives. Only the difference is posted, tagged IFRS, so both sets of statements come from the same general ledger.'],
  ['Consommation du site principal, releve du 25 septembre.',
    'Main-site consumption, reading of 25 September.'],
  ['Reprise des soldes de la balance generale arretee au 31/12/2025, y compris les valeurs brutes et les amortissements cumules du registre des immobilisations apres inventaire physique contradictoire (critere d acceptation SRS section 10).',
    'Balances brought forward from the general ledger closed at 31/12/2025, including gross carrying amounts and accumulated depreciation of the fixed-asset register after a contradictory physical inventory (SRS section 10 acceptance criterion).'],
  ['Saisie des donnees de demonstration sur periodes cloturees lors de la mise en place du systeme.',
    'Demonstration data posted to closed periods during system go-live.'],
  ['Comptabilisation des dotations sur periodes cloturees lors de la mise en place du systeme.',
    'Depreciation charges posted to closed periods during system go-live.'],
  ['Regularisation des subventions sur periodes cloturees lors de la mise en place.',
    'Grant regularisation posted to closed periods during go-live.'],
  ['Reevaluation de change sur periode cloturee lors de la mise en place.',
    'Foreign-currency revaluation posted to a closed period during go-live.'],
  ['Reprise de balance d ouverture a la migration - periode verrouillee par construction.',
    'Opening-balance cutover at migration — period locked by construction.'],
  ['Reprise de balance d ouverture IFRS a la migration.',
    'IFRS opening-balance cutover at migration.'],
  ['Janvier ', 'January '],
  ['Fevrier ', 'February '],
  ['Février ', 'February '],
  ['Mars ', 'March '],
  ['Avril ', 'April '],
  ['Mai ', 'May '],
  ['Juin ', 'June '],
  ['Juillet ', 'July '],
  ['Aout ', 'August '],
  ['Août ', 'August '],
  ['Septembre ', 'September '],
  ['Octobre ', 'October '],
  ['Novembre ', 'November '],
  ['Decembre ', 'December '],
  ['Décembre ', 'December '],
  [' (base ', ' (basis '],
  ['Sortie ', 'Disposal of '],
  ['Cession ', 'Disposal by sale '],
];

const PERIOD_MONTHS = [
  ['Janvier', 'January'],
  ['Fevrier', 'February'],
  ['Février', 'February'],
  ['Mars', 'March'],
  ['Avril', 'April'],
  ['Mai', 'May'],
  ['Juin', 'June'],
  ['Juillet', 'July'],
  ['Aout', 'August'],
  ['Août', 'August'],
  ['Septembre', 'September'],
  ['Octobre', 'October'],
  ['Novembre', 'November'],
  ['Decembre', 'December'],
  ['Décembre', 'December'],
];

function applyMap(text, pairs) {
  if (!text) return text;
  let next = text;
  for (const [from, to] of pairs) {
    if (next.includes(from)) next = next.split(from).join(to);
  }
  return next;
}

async function rewriteColumn(table, column, pairs) {
  const rows = await query(`SELECT id, \`${column}\` AS value FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''`);
  let changed = 0;
  for (const row of rows) {
    const updated = applyMap(row.value, pairs);
    if (updated !== row.value) {
      await query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ?`, [updated, row.id]);
      changed += 1;
    }
  }
  return { table, column, scanned: rows.length, changed };
}

async function main() {
  const pairs = [...REPLACEMENTS].sort((a, b) => b[0].length - a[0].length);
  const results = [];
  results.push(await rewriteColumn('journal_entries', 'description', pairs));
  results.push(await rewriteColumn('journal_entries', 'narration', pairs));
  results.push(await rewriteColumn('journal_entries', 'override_reason', pairs));
  results.push(await rewriteColumn('journal_lines', 'description', pairs));

  const periods = await query('SELECT id, name FROM accounting_periods');
  let periodChanged = 0;
  for (const p of periods) {
    const updated = applyMap(p.name, PERIOD_MONTHS);
    if (updated !== p.name) {
      await query('UPDATE accounting_periods SET name = ? WHERE id = ?', [updated, p.id]);
      periodChanged += 1;
    }
  }
  results.push({ table: 'accounting_periods', column: 'name', scanned: periods.length, changed: periodChanged });

  const fy = await query("UPDATE fiscal_years SET name = REPLACE(name, 'Exercice ', 'Fiscal year ') WHERE name LIKE 'Exercice %'");
  results.push({ table: 'fiscal_years', column: 'name', changed: fy.affectedRows ?? 0 });

  try {
    const tpl = await query('UPDATE posting_templates SET name = name_en WHERE name_en IS NOT NULL AND name_en <> "" AND name <> name_en');
    results.push({ table: 'posting_templates', column: 'name', changed: tpl.affectedRows ?? 0 });
  } catch (err) {
    results.push({ table: 'posting_templates', skipped: err.message });
  }

  const leftover = await query(
    `SELECT description, COUNT(*) AS n
       FROM journal_entries
      WHERE description REGEXP 'Facturation|Dotation|Encaissement|Paie du|Charges d|Reglement|Determination|Reevaluation|Quote-part|EXTOURNE|Immobilisation|amortissement|TVA recuperable|Fournisseurs d|Remuneration|Cotisation|Subvention|Balance d|Report a|Janvier|Fevrier|Juillet|Septembre|Octobre|Novembre|Decembre|Aout|Avril'
      GROUP BY description
      ORDER BY n DESC`
  );
  const leftoverLines = await query(
    `SELECT description, COUNT(*) AS n
       FROM journal_lines
      WHERE description REGEXP 'Facturation|Dotation|Encaissement|Paie du|Charges d|Reglement|Determination|Reevaluation|Quote-part|EXTOURNE|Immobilisation|amortissement|TVA recuperable|Fournisseurs d|Remuneration|Cotisation|Subvention|Balance d|Report a|Consultations|Hospitalisation|Reactifs|Electricite|Carburant|Etalonnage|Assurance responsabilite'
      GROUP BY description
      ORDER BY n DESC
      LIMIT 40`
  );

  const sample = await query(
    'SELECT entry_no, description FROM journal_entries ORDER BY id DESC LIMIT 12'
  );
  const total = await queryOne('SELECT COUNT(*) AS n FROM journal_entries');

  console.log(JSON.stringify({ results, leftover, leftoverLines, sample, total }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
