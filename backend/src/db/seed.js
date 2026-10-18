import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './pool.js';
import { seedReference, seedOrgReference, seedAssetCategories, seedFiscalCalendar, seedCloseChecklist } from './seed/reference.js';
import { seedDemo } from './seed/demo.js';
import { applyPostingLevel } from '../../scripts/apply-posting-level.js';

import bcrypt from 'bcryptjs';
import { DEMO_USERS } from './seed/data/demo-assets.js';

export async function ensureDemoUsers() {
  const org = await pool.queryOne('SELECT id FROM organizations LIMIT 1');
  if (!org) {
    return runSeed({ silent: false });
  }
  const orgId = org.id;
  const hash = await bcrypt.hash('Ledger@2026', 10);

  const roleRows = await pool.query('SELECT id, code FROM roles');
  const roleId = new Map(roleRows.map((r) => [r.code, r.id]));

  for (const [email, fullName, role, jobTitle, _cc, isTech, rate] of DEMO_USERS) {
    const rId = roleId.get(role);
    if (!rId) continue;
    const existing = await pool.queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (!existing) {
      await pool.query(
        `INSERT INTO users (org_id, email, password_hash, full_name, job_title, role_id, locale, is_technician, hourly_rate, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 'fr', ?, ?, 1)`,
        [orgId, email, hash, fullName, jobTitle, rId, isTech ? 1 : 0, rate]
      );
    } else {
      await pool.query(
        'UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?',
        [hash, existing.id]
      );
    }
  }
  console.log('[seed] Demonstration users verified and active.');
}

export async function runSeed({ skipDemo = false, silent = false } = {}) {
  const step = (label) => { if (!silent) console.log(`  - ${label}`); };
  const t0 = Date.now();
  if (!silent) console.log('[seed] LedgerCore reference data + demo hospital');

  const existing = await transaction(async (tx) => tx.queryOne('SELECT COUNT(*) AS n FROM organizations'));
  if (Number(existing.n) > 0) {
    if (!silent) console.log('[seed] Database already contains an organisation.');
    return false;
  }


  await transaction(async (tx) => {
    await seedReference(tx, step);

    const org = await tx.query(
      `INSERT INTO organizations
         (code, name, legal_name, org_type, country_code, functional_currency, presentation_currency,
          reporting_tier, frameworks, tax_id, vat_number, address, city, phone, email, retention_years)
       VALUES ('TSSF', ?, ?, 'hospital', 'CM', 'XAF', 'XAF', 'normal', 'ohada,ifrs', ?, ?, ?, 'Shisong', ?, ?, 10)`,
      [
        'TSSF Shisong SOA',
        'TSSF Shisong SOA — Tertiary Sisters of St. Francis',
        'M019800012345P', 'CM-TVA-019800012345',
        'Catholic Hospital Shisong, Kumbo, Northwest Region, BP 08 Kumbo',
        '+237 677 76 43 21', 'direction@tssf-shisong.cm',
      ]
    );
    const orgId = org.insertId;
    step(`organisation created: TSSF Shisong SOA (OHADA / Cameroun, XAF, Systeme Normal)`);

    const { accountId } = await seedOrgReference(tx, orgId, step);
    const catId = await seedAssetCategories(tx, orgId, accountId, step);
    const periodId = await seedFiscalCalendar(
      tx,
      orgId,
      [{ year: 2025, status: 'locked' }, { year: 2026, status: 'open' }],
      step
    );

    // FY2026: January to August closed, September onwards open, which mirrors
    // a hospital that has closed its last month and is working the current one.
    for (let m = 1; m <= 8; m += 1) {
      await tx.query("UPDATE accounting_periods SET status = 'open' WHERE id = ?", [periodId.get(`2026-${String(m).padStart(2, '0')}`)]);
    }

    if (!skipDemo) {
      await seedDemo(tx, { orgId, accountId, catId, periodId }, step);
    }

    // Close the months that the demo data has already been posted into, and
    // leave September open with a fresh checklist for the user to work through.
    for (let m = 1; m <= 8; m += 1) {
      await tx.query(
        "UPDATE accounting_periods SET status = 'closed', closed_at = NOW() WHERE id = ?",
        [periodId.get(`2026-${String(m).padStart(2, '0')}`)]
      );
      const checklistId = await seedCloseChecklist(tx, orgId, periodId.get(`2026-${String(m).padStart(2, '0')}`));
      await tx.query(
        "UPDATE close_checklists SET status = 'signed_off', started_at = NOW(), completed_at = NOW(), signed_off_at = NOW() WHERE id = ?",
        [checklistId]
      );
      await tx.query("UPDATE close_checklist_items SET status = 'done', completed_at = NOW() WHERE checklist_id = ?", [checklistId]);
    }
    await seedCloseChecklist(tx, orgId, periodId.get('2026-09'));
    step('FY2026: January-August closed and signed off, September open with a fresh close checklist');
    const posting = await applyPostingLevel(tx, orgId);
    step(`posting level 4 applied (${posting.remapped} heading lines remapped, suspense ${posting.suspense})`);
  });

  const counts = await transaction(async (tx) =>
    tx.query(`
      SELECT 'accounts' AS entity, COUNT(*) AS n FROM accounts
      UNION ALL SELECT 'account_mappings', COUNT(*) FROM account_mappings
      UNION ALL SELECT 'assets', COUNT(*) FROM assets
      UNION ALL SELECT 'asset_categories', COUNT(*) FROM asset_categories
      UNION ALL SELECT 'maintenance_plans', COUNT(*) FROM maintenance_plans
      UNION ALL SELECT 'work_orders', COUNT(*) FROM work_orders
      UNION ALL SELECT 'errands', COUNT(*) FROM errands
      UNION ALL SELECT 'shopping_lists', COUNT(*) FROM shopping_lists
      UNION ALL SELECT 'calibrations', COUNT(*) FROM calibrations
      UNION ALL SELECT 'journal_entries', COUNT(*) FROM journal_entries
      UNION ALL SELECT 'journal_lines', COUNT(*) FROM journal_lines
      UNION ALL SELECT 'depreciation_runs', COUNT(*) FROM depreciation_runs
      UNION ALL SELECT 'depreciation_lines', COUNT(*) FROM depreciation_lines
      UNION ALL SELECT 'budget_lines', COUNT(*) FROM budget_lines
      UNION ALL SELECT 'users', COUNT(*) FROM users
    `)
  );
  if (!silent) {
    console.log('\n[seed] row counts');
    for (const r of counts) console.log(`  ${String(r.n).padStart(7)}  ${r.entity}`);
    console.log(`\n[seed] completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log('[seed] sign in with  admin@ledgercore.health  /  Ledger@2026');
  }
  return true;
}

const isDirectCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectCli) {
  const skipDemo = process.argv.includes('--no-demo');
  runSeed({ skipDemo })
    .then(async () => {
      await pool.end();
    })
    .catch(async (err) => {
      console.error('\n[seed] FAILED:', err.message);
      if (err.stack) console.error(err.stack.split('\n').slice(1, 6).join('\n'));
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
