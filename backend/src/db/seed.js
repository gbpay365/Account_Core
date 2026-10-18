import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './pool.js';
import { seedReference, seedOrgReference, seedAssetCategories, seedFiscalCalendar, seedCloseChecklist } from './seed/reference.js';
import { seedDemo } from './seed/demo.js';
import { applyPostingLevel } from '../../scripts/apply-posting-level.js';

import bcrypt from 'bcryptjs';
import { DEMO_USERS } from './seed/data/demo-assets.js';

export async function ensureDemoUsers() {
  await transaction(async (tx) => {
    // 1. Ensure roles and permissions are present (idempotent)
    const roleCount = await tx.queryOne('SELECT COUNT(*) AS n FROM roles');
    if (Number(roleCount.n) === 0) {
      console.log('[seed] Roles table is empty, seeding reference data...');
      await seedReference(tx, (msg) => console.log(`  - ${msg}`));
    }

    // 2. Ensure at least one organization exists
    let org = await tx.queryOne('SELECT id FROM organizations LIMIT 1');
    if (!org) {
      console.log('[seed] Creating default hospital organization...');
      const orgRes = await tx.query(
        `INSERT INTO organizations
           (code, name, legal_name, org_type, country_code, functional_currency, presentation_currency,
            reporting_tier, frameworks, tax_id, vat_number, address, city, phone, email, retention_years)
         VALUES ('TSSF', 'TSSF Shisong SOA', 'TSSF Shisong SOA — Tertiary Sisters of St. Francis',
                 'hospital', 'CM', 'XAF', 'XAF', 'normal', 'ohada,ifrs',
                 'M019800012345P', 'CM-TVA-019800012345',
                 'Catholic Hospital Shisong, Kumbo, Northwest Region, BP 08 Kumbo',
                 'Shisong', '+237 677 76 43 21', 'direction@tssf-shisong.cm', 10)`
      );
      org = { id: orgRes.insertId };
    }
    const orgId = org.id;

    // 3. Ensure all demo users exist with known password
    const hash = await bcrypt.hash('Ledger@2026', 10);
    const roleRows = await tx.query('SELECT id, code FROM roles');
    const roleId = new Map(roleRows.map((r) => [r.code, r.id]));

    for (const [email, fullName, role, jobTitle, _cc, isTech, rate] of DEMO_USERS) {
      let rId = roleId.get(role);
      if (!rId) {
        rId = roleId.get('system_admin') || roleRows[0]?.id;
      }
      if (!rId) {
        const roleRes = await tx.query(
          `INSERT INTO roles (code, name, name_en, description) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=VALUES(name)`,
          [role, fullName, fullName, 'Demo user role']
        );
        rId = roleRes.insertId || (await tx.queryOne('SELECT id FROM roles WHERE code = ?', [role]))?.id;
      }
      if (!rId) continue;

      const existing = await tx.queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (!existing) {
        await tx.query(
          `INSERT INTO users (org_id, email, password_hash, full_name, job_title, role_id, locale, is_technician, hourly_rate, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 'fr', ?, ?, 1)`,
          [orgId, email, hash, fullName, jobTitle, rId, isTech ? 1 : 0, rate]
        );
      } else {
        await tx.query(
          'UPDATE users SET password_hash = ?, is_active = 1, role_id = COALESCE(role_id, ?) WHERE id = ?',
          [hash, rId, existing.id]
        );
      }
    }
    console.log('[seed] Demonstration users verified and active.');
  });
}

export async function runSeed({ skipDemo = false, silent = false } = {}) {
  const step = (label) => { if (!silent) console.log(`  - ${label}`); };
  const t0 = Date.now();
  if (!silent) console.log('[seed] LedgerCore reference data + demo hospital');

  const { orgCount, roleCount, acctCount } = await transaction(async (tx) => {
    const org = await tx.queryOne('SELECT COUNT(*) AS n FROM organizations');
    const role = await tx.queryOne('SELECT COUNT(*) AS n FROM roles');
    const acct = await tx.queryOne('SELECT COUNT(*) AS n FROM accounts');
    return { orgCount: Number(org?.n || 0), roleCount: Number(role?.n || 0), acctCount: Number(acct?.n || 0) };
  });

  if (orgCount > 0 && roleCount > 0 && acctCount > 0) {
    if (!silent) console.log('[seed] Database already contains organization, roles, and accounts.');
    return false;
  }

  await transaction(async (tx) => {
    if (roleCount === 0) {
      await seedReference(tx, step);
    }

    let orgId;
    const existingOrg = await tx.queryOne('SELECT id FROM organizations LIMIT 1');
    if (!existingOrg) {
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
      orgId = org.insertId;
      step(`organisation created: TSSF Shisong SOA (OHADA / Cameroun, XAF, Systeme Normal)`);
    } else {
      orgId = existingOrg.id;
    }

    if (acctCount === 0) {
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
    }
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
