import { pool, query, queryOne } from './pool.js';

export async function seedBudget(orgId = 1) {
  console.log(`[seed_budget] Checking budget plan and lines for org ${orgId}...`);

  // 1. Get active fiscal year
  let fy = await queryOne(
    `SELECT id, code, name FROM fiscal_years WHERE org_id = ? AND code LIKE '%2026%' LIMIT 1`,
    [orgId]
  );
  if (!fy) {
    fy = await queryOne(
      `SELECT id, code, name FROM fiscal_years WHERE org_id = ? ORDER BY start_date DESC LIMIT 1`,
      [orgId]
    );
  }
  if (!fy) {
    console.log('[seed_budget] No fiscal year found, skipping budget seed.');
    return;
  }

  // 2. Check if a budget already exists for this FY
  let budget = await queryOne(
    `SELECT id, code, name, status FROM budgets WHERE org_id = ? AND fiscal_year_id = ? LIMIT 1`,
    [orgId, fy.id]
  );

  if (!budget) {
    const adminUser = await queryOne(
      `SELECT id FROM users WHERE org_id = ? LIMIT 1`,
      [orgId]
    );
    const adminId = adminUser?.id || 1;

    const res = await query(
      `INSERT INTO budgets (org_id, fiscal_year_id, code, name, version, status, approved_by, approved_at, notes)
       VALUES (?, ?, 'BUD-2026', 'Budget Prévisionnel 2026 — Exploitation & Investissements', 1, 'approved', ?, NOW(), 'Budget voté et approuvé par la Direction Générale et le Conseil.')`,
      [orgId, fy.id, adminId]
    );
    budget = { id: res.insertId, code: 'BUD-2026', name: 'Budget Prévisionnel 2026' };
    console.log(`[seed_budget] Created approved budget BUD-2026 (id ${budget.id})`);
  }

  // 3. Seed Budget Lines if empty
  const lineCountRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM budget_lines WHERE budget_id = ?`,
    [budget.id]
  );

  if (Number(lineCountRow?.cnt || 0) === 0) {
    // Find cost centers
    const ccRows = await query('SELECT id, code FROM cost_centers WHERE org_id = ?', [orgId]);
    const ccMap = Object.fromEntries(ccRows.map((c) => [c.code, c.id]));
    const defaultCc = ccRows[0]?.id || null;

    // Find accounts
    const acctRows = await query(
      `SELECT id, code FROM accounts WHERE org_id = ? AND code IN ('6011', '6041', '6051', '6111', '6241', '6611', '2181', '2411', '2441', '7061', '7011')`,
      [orgId]
    );
    const acctMap = Object.fromEntries(acctRows.map((a) => [a.code, a.id]));

    // Fallback accounts by class if specific 4-digit codes not found
    async function getOrFallback(code, accountClass) {
      if (acctMap[code]) return acctMap[code];
      const fb = await queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND account_class = ? LIMIT 1`,
        [orgId, accountClass]
      );
      return fb?.id || null;
    }

    const acct60 = await getOrFallback('6011', 6);
    const acct605 = await getOrFallback('6051', 6);
    const acct62 = await getOrFallback('6241', 6);
    const acct66 = await getOrFallback('6611', 6);
    const acct21 = await getOrFallback('2181', 2);
    const acct24 = await getOrFallback('2441', 2);
    const acct70 = await getOrFallback('7061', 7);

    // Initial allocations in XAF
    const linesToInsert = [
      { acctId: acct60, type: 'opex', ccId: ccMap['EXPL'] || defaultCc, amt: 45000000, desc: 'Achats consommables & réactifs' },
      { acctId: acct605, type: 'maintenance', ccId: ccMap['TECH'] || defaultCc, amt: 18000000, desc: 'Fournitures de maintenance & pièces détachées' },
      { acctId: acct62, type: 'maintenance', ccId: ccMap['TECH'] || defaultCc, amt: 22000000, desc: 'Contrats d entretien & prestations techniques' },
      { acctId: acct66, type: 'opex', ccId: ccMap['ADM'] || defaultCc, amt: 110000000, desc: 'Masse salariale & charges sociales' },
      { acctId: acct21, type: 'capex', ccId: ccMap['TECH'] || defaultCc, amt: 65000000, desc: 'Acquisition matériel technique & biomédical' },
      { acctId: acct24, type: 'capex', ccId: ccMap['ADM'] || defaultCc, amt: 28000000, desc: 'Rénovation parc informatique & serveurs' },
      { acctId: acct70, type: 'revenue', ccId: defaultCc, amt: 320000000, desc: 'Recettes d exploitation & facturations' },
    ];

    for (const l of linesToInsert) {
      if (!l.acctId) continue;
      await query(
        `INSERT INTO budget_lines (budget_id, account_id, cost_center_id, budget_type, initial_amount, amount, control_mode, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'strict_block', ?)`,
        [budget.id, l.acctId, l.ccId, l.type, l.amt, l.amt, l.desc]
      );
    }
    console.log(`[seed_budget] Seeded ${linesToInsert.length} budget lines for budget ${budget.id}`);
  }

  // 4. Seed sample Commitments if empty
  const commCountRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM budget_commitments WHERE org_id = ?`,
    [orgId]
  );

  if (Number(commCountRow?.cnt || 0) === 0) {
    const lines = await query(
      `SELECT id, budget_type, amount FROM budget_lines WHERE budget_id = ?`,
      [budget.id]
    );
    const capexLine = lines.find((l) => l.budget_type === 'capex');
    const maintLine = lines.find((l) => l.budget_type === 'maintenance');
    const opexLine = lines.find((l) => l.budget_type === 'opex');

    // Find vendor and asset
    const vendor = await queryOne('SELECT id FROM suppliers WHERE org_id = ? LIMIT 1', [orgId]);
    const asset = await queryOne('SELECT id FROM assets WHERE org_id = ? LIMIT 1', [orgId]);
    const user = await queryOne('SELECT id FROM users WHERE org_id = ? LIMIT 1', [orgId]);

    const adminId = user?.id || 1;
    const vendorId = vendor?.id || null;
    const assetId = asset?.id || null;

    if (capexLine) {
      await query(
        `INSERT INTO budget_commitments
         (org_id, budget_id, budget_line_id, commitment_number, description, vendor_id, asset_id, amount, committed_date, status, approved_by, approved_at, notes)
         VALUES (?, ?, ?, 'ENG-2026-0001', 'Acquisition moniteur multiparamétrique haute résolution', ?, ?, 8500000.00, '2026-02-15', 'approved', ?, NOW(), 'Bon de commande signé - livraison en attente.')`,
        [orgId, budget.id, capexLine.id, vendorId, assetId, adminId]
      );
      if (assetId) {
        await query('UPDATE assets SET budget_line_id = ? WHERE id = ?', [capexLine.id, assetId]);
      }
    }

    if (maintLine) {
      await query(
        `INSERT INTO budget_commitments
         (org_id, budget_id, budget_line_id, commitment_number, description, vendor_id, amount, committed_date, status, approved_by, approved_at, notes)
         VALUES (?, ?, ?, 'ENG-2026-0002', 'Contrat de maintenance préventive semestrielle groupe électrogène', ?, 3200000.00, '2026-03-01', 'approved', ?, NOW(), 'Maintenance contractuelle obligatoire.')`,
        [orgId, budget.id, maintLine.id, vendorId, adminId]
      );
    }

    if (opexLine) {
      await query(
        `INSERT INTO budget_commitments
         (org_id, budget_id, budget_line_id, commitment_number, description, vendor_id, amount, committed_date, status, notes)
         VALUES (?, ?, ?, 'ENG-2026-0003', 'Commande trimestrielle de consommables généraux', ?, 6400000.00, '2026-03-10', 'draft', 'En attente de validation comptable.')`,
        [orgId, budget.id, opexLine.id, vendorId]
      );
    }

    console.log(`[seed_budget] Seeded sample commitments for org ${orgId}`);
  }

  // 5. Seed sample credit transfer (virement de crédits) if empty
  const transCountRow = await queryOne(
    `SELECT COUNT(*) AS cnt FROM budget_transfers WHERE org_id = ?`,
    [orgId]
  );

  if (Number(transCountRow?.cnt || 0) === 0) {
    const lines = await query(
      `SELECT id FROM budget_lines WHERE budget_id = ? ORDER BY id ASC LIMIT 2`,
      [budget.id]
    );
    if (lines.length >= 2) {
      const user = await queryOne('SELECT id FROM users WHERE org_id = ? LIMIT 1', [orgId]);
      await query(
        `INSERT INTO budget_transfers
         (org_id, budget_id, transfer_number, source_line_id, target_line_id, amount, reason, status, authorized_by, authorized_at)
         VALUES (?, ?, 'VIR-2026-0001', ?, ?, 2000000.00, 'Renforcement de la ligne maintenance préventive suite à audit technique', 'approved', ?, NOW())`,
        [orgId, budget.id, lines[0].id, lines[1].id, user?.id || 1]
      );
      // Execute amount movement
      await query(`UPDATE budget_lines SET amount = amount - 2000000 WHERE id = ?`, [lines[0].id]);
      await query(`UPDATE budget_lines SET amount = amount + 2000000 WHERE id = ?`, [lines[1].id]);
      console.log(`[seed_budget] Seeded approved transfer VIR-2026-0001 for org ${orgId}`);
    }
  }
}

if (process.argv[1]?.endsWith('seed_budget.js')) {
  seedBudget(1)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}
