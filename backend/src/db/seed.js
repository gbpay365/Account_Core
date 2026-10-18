import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, queryOne, transaction } from './pool.js';
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
          'UPDATE users SET password_hash = ?, is_active = 1, role_id = COALESCE(role_id, ?), org_id = COALESCE(org_id, ?) WHERE id = ?',
          [hash, rId, orgId, existing.id]
        );
      }
    }
    console.log('[seed] Demonstration users verified and active.');
  });

  // Ensure organization data (chart of accounts, fiscal calendar, demo assets) is present for all organizations
  const orgs = await query('SELECT DISTINCT id AS org_id FROM organizations');
  for (const { org_id } of orgs) {
    await ensureOrganizationData(org_id, { silent: false }).catch((err) =>
      console.warn(`[seed] Failed to ensure data for org ${org_id}:`, err.message)
    );
  }
}

export async function ensureFiscalYearForOrg(orgId) {
  let year = await queryOne(
    "SELECT * FROM fiscal_years WHERE org_id = ? AND status <> 'closed' ORDER BY start_date DESC LIMIT 1",
    [orgId]
  );
  if (year) return year;

  // Check if any fiscal year exists
  const existing = await queryOne(
    "SELECT * FROM fiscal_years WHERE org_id = ? ORDER BY start_date DESC LIMIT 1",
    [orgId]
  );
  if (existing) {
    await query("UPDATE fiscal_years SET status = 'open' WHERE id = ?", [existing.id]);
    return await queryOne("SELECT * FROM fiscal_years WHERE id = ?", [existing.id]);
  }

  // Insert FY2026
  await query(
    `INSERT INTO fiscal_years (org_id, code, name, start_date, end_date, status)
     VALUES (?, 'FY2026', 'Fiscal year 2026', '2026-01-01', '2026-12-31', 'open')
     ON DUPLICATE KEY UPDATE status = 'open'`,
    [orgId]
  );
  const fy = await queryOne("SELECT * FROM fiscal_years WHERE org_id = ? AND code = 'FY2026'", [orgId]);

  // Insert FY2025 (locked) for comparative reporting
  await query(
    `INSERT INTO fiscal_years (org_id, code, name, start_date, end_date, status)
     VALUES (?, 'FY2025', 'Fiscal year 2025', '2025-01-01', '2025-12-31', 'locked')
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [orgId]
  );

  // Seed periods for 2026
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const pCode = `2026-${mm}`;
    const pStatus = (m === 9) ? 'open' : (m < 9 ? 'closed' : 'locked');
    await query(
      `INSERT INTO accounting_periods (org_id, fiscal_year_id, period_no, code, name, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE fiscal_year_id = VALUES(fiscal_year_id), status = VALUES(status)`,
      [orgId, fy.id, m, pCode, `${names[m - 1]} 2026`, `2026-${mm}-01`, `2026-${mm}-28`, pStatus]
    );
  }

  return fy;
}

export async function ensureOpenPeriodForOrg(orgId) {
  let period = await queryOne(
    `SELECT p.*, y.code AS fiscal_year FROM accounting_periods p
       JOIN fiscal_years y ON y.id = p.fiscal_year_id
      WHERE p.org_id = ? AND p.status = 'open' AND p.is_adjustment = 0
      ORDER BY p.start_date LIMIT 1`,
    [orgId]
  );
  if (period) return period;

  const year = await ensureFiscalYearForOrg(orgId);
  await query("UPDATE accounting_periods SET status = 'open' WHERE org_id = ? AND code = '2026-09'", [orgId]);
  period = await queryOne(
    `SELECT p.*, y.code AS fiscal_year FROM accounting_periods p
       JOIN fiscal_years y ON y.id = p.fiscal_year_id
      WHERE p.org_id = ? AND p.status = 'open'
      ORDER BY p.start_date LIMIT 1`,
    [orgId]
  );
  if (!period) {
    await query("UPDATE accounting_periods SET status = 'open' WHERE org_id = ? AND fiscal_year_id = ? LIMIT 1", [orgId, year.id]);
    period = await queryOne(
      `SELECT p.*, y.code AS fiscal_year FROM accounting_periods p
         JOIN fiscal_years y ON y.id = p.fiscal_year_id
        WHERE p.org_id = ? AND p.status = 'open'
        ORDER BY p.start_date LIMIT 1`,
      [orgId]
    );
  }
  return period;
}

export async function ensureOrganizationData(orgId, { skipDemo = false, silent = false } = {}) {
  const step = (label) => { if (!silent) console.log(`  - ${label}`); };

  // Always ensure fiscal calendar first (independent of demo data)
  await ensureFiscalYearForOrg(orgId);
  await ensureOpenPeriodForOrg(orgId);

  return transaction(async (tx) => {
    // 1. Roles & permissions
    const roleCount = await tx.queryOne('SELECT COUNT(*) AS n FROM roles');
    if (Number(roleCount?.n || 0) === 0) {
      await seedReference(tx, step);
    }

    // 2. Chart of accounts
    let accountId = new Map();
    const acctCount = await tx.queryOne('SELECT COUNT(*) AS n FROM accounts WHERE org_id = ?', [orgId]);
    if (Number(acctCount?.n || 0) === 0) {
      step(`Seeding chart of accounts for org ${orgId}...`);
      const res = await seedOrgReference(tx, orgId, step);
      accountId = res.accountId;
    } else {
      const rows = await tx.query('SELECT code, id FROM accounts WHERE org_id = ?', [orgId]);
      accountId = new Map(rows.map((r) => [r.code, r.id]));
    }

    // 3. Asset categories
    let catId = new Map();
    const catCount = await tx.queryOne('SELECT COUNT(*) AS n FROM asset_categories WHERE org_id = ?', [orgId]);
    if (Number(catCount?.n || 0) === 0) {
      step(`Seeding asset categories for org ${orgId}...`);
      catId = await seedAssetCategories(tx, orgId, accountId, step);
    } else {
      const rows = await tx.query('SELECT code, id FROM asset_categories WHERE org_id = ?', [orgId]);
      catId = new Map(rows.map((r) => [r.code, r.id]));
    }

    // 4. Fiscal calendar & periods
    let periodId = new Map();
    const existingP = await tx.query('SELECT code, id FROM accounting_periods WHERE org_id = ?', [orgId]);
    if (existingP.length === 0) {
      step(`Seeding fiscal calendar & periods for org ${orgId}...`);
      periodId = await seedFiscalCalendar(
        tx,
        orgId,
        [{ year: 2025, status: 'locked' }, { year: 2026, status: 'open' }],
        step
      );
    } else {
      periodId = new Map(existingP.map((r) => [r.code, r.id]));
    }

    // Always ensure FY2026 is open and active
    await tx.query("UPDATE fiscal_years SET status = 'open' WHERE org_id = ? AND code = 'FY2026'", [orgId]);
    // Ensure Jan-Aug 2026 open initially if not set, and ensure at least one period is open
    const openPeriod = await tx.queryOne("SELECT id FROM accounting_periods WHERE org_id = ? AND status = 'open' LIMIT 1", [orgId]);
    if (!openPeriod) {
      await tx.query(
        "UPDATE accounting_periods SET status = 'open' WHERE org_id = ? AND code = '2026-09'",
        [orgId]
      );
      const stillNone = await tx.queryOne("SELECT id FROM accounting_periods WHERE org_id = ? AND status = 'open' LIMIT 1", [orgId]);
      if (!stillNone) {
        await tx.query(
          "UPDATE accounting_periods SET status = 'open' WHERE org_id = ? AND code LIKE '2026-%' LIMIT 1",
          [orgId]
        );
      }
    }

    // 5. Demo assets & operations
    const assetCount = await tx.queryOne('SELECT COUNT(*) AS n FROM assets WHERE org_id = ?', [orgId]);
    if (Number(assetCount?.n || 0) === 0 && !skipDemo) {
      step(`Seeding demo assets & transactions for org ${orgId}...`);
      await seedDemo(tx, { orgId, accountId, catId, periodId }, step);

      // Close Jan-Aug 2026, keep Sep 2026 open
      for (let m = 1; m <= 8; m += 1) {
        const pId = periodId.get(`2026-${String(m).padStart(2, '0')}`);
        if (pId) {
          await tx.query("UPDATE accounting_periods SET status = 'closed', closed_at = NOW() WHERE id = ?", [pId]);
          const checklistId = await seedCloseChecklist(tx, orgId, pId);
          await tx.query("UPDATE close_checklists SET status = 'signed_off', started_at = NOW(), completed_at = NOW(), signed_off_at = NOW() WHERE id = ?", [checklistId]);
          await tx.query("UPDATE close_checklist_items SET status = 'done', completed_at = NOW() WHERE checklist_id = ?", [checklistId]);
        }
      }
      const p9 = periodId.get('2026-09');
      if (p9) {
        await tx.query("UPDATE accounting_periods SET status = 'open' WHERE id = ?", [p9]);
        await seedCloseChecklist(tx, orgId, p9);
      }
      const posting = await applyPostingLevel(tx, orgId);
      step(`posting level 4 applied (${posting.remapped} heading lines remapped, suspense ${posting.suspense})`);
    }

    return { accountId, catId, periodId };
  });
}

export async function runSeed({ skipDemo = false, silent = false } = {}) {
  const step = (label) => { if (!silent) console.log(`  - ${label}`); };
  const t0 = Date.now();
  if (!silent) console.log('[seed] LedgerCore reference data + demo hospital');

  let org = await queryOne('SELECT id FROM organizations LIMIT 1');
  if (!org) {
    const orgRes = await query(
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
    org = { id: orgRes.insertId };
    step('organisation created: TSSF Shisong SOA (OHADA / Cameroun, XAF, Systeme Normal)');
  }

  await ensureOrganizationData(org.id, { skipDemo, silent });

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
