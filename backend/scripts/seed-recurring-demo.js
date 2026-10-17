import { pool, query, queryOne } from '../src/db/pool.js';

async function main() {
  const existing = await queryOne("SELECT id FROM posting_templates WHERE code = 'REC-MAINT-BIO'");
  let tId = existing?.id;
  if (!tId) {
    const res = await query(
      `INSERT INTO posting_templates
         (org_id, code, name, transaction_type, journal_code, is_active, is_recurring, frequency, day_of_month, start_date, next_run_date, auto_post)
       VALUES (1, 'REC-MAINT-BIO', 'Contrat maintenance preventive biomédicale', 'maintenance', 'ACH', 1, 1, 'monthly', 1, '2026-09-01', '2026-09-01', 1)`
    );
    tId = res.insertId;
    await query(
      `INSERT INTO posting_template_lines (template_id, line_no, side, account_rule, amount_formula, note)
       VALUES (?, 1, 'debit', '6052', '350000', 'Entretien et reparations materiel biomedical'),
              (?, 2, 'credit', '4011', '350000', 'BioMed Services Afrique')`,
      [tId, tId]
    );
  }
  console.log('Template ready with ID:', tId);
  await pool.end();
}

main().catch(console.error);
