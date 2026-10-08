/**
 * Apply FR-PL / FR-DE posting-level configuration to an existing organisation:
 * lock the 4-character parameter, remap heading movements onto 4-character
 * children, reclassify the chart, seed templates and the suspense account.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, queryOne, transaction } from '../src/db/pool.js';
import { POSTING_TEMPLATES } from '../src/db/seed/data/posting-templates.js';
import {
  DEFAULT_POSTING_LENGTH, flagCollectiveAccounts,
  remapHeadingMovements, reclassifyByLength,
} from '../src/services/posting-level.service.js';

async function upsertSetting(tx, orgId, key, value, dataType, description) {
  await tx.query(
    `INSERT INTO settings (org_id, setting_key, value_text, data_type, category, description)
     VALUES (?,?,?,?, 'accounting', ?)
     ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), description = VALUES(description)`,
    [orgId, key, String(value), dataType, description]
  );
}

async function ensureSuspense(tx, orgId) {
  const existing = await tx.queryOne(
    'SELECT * FROM accounts WHERE org_id = ? AND code = ?',
    [orgId, '4718']
  );
  if (existing) {
    await tx.query('UPDATE accounts SET is_postable = 1, is_active = 1 WHERE id = ?', [existing.id]);
    return tx.queryOne('SELECT * FROM accounts WHERE id = ?', [existing.id]);
  }
  const parent = await tx.queryOne(
    'SELECT * FROM accounts WHERE org_id = ? AND code IN (?, ?) ORDER BY CHAR_LENGTH(code) DESC LIMIT 1',
    [orgId, '471', '47']
  );
  if (!parent) return null;
  const ins = await tx.query(
    `INSERT INTO accounts
       (org_id, code, name, name_en, account_class, account_type, normal_side, parent_id, level,
        is_postable, requires_cost_center, requires_asset, is_reconcilable, is_active,
        in_tier_normal, in_tier_allege, in_tier_smt)
     VALUES (?,?,?,?,?,?,?,?,?,1,0,0,0,1,1,1,0)`,
    [
      orgId, '4718',
      'Compte d\'attente — à classer',
      'Suspense account — awaiting classification',
      parent.account_class, parent.account_type, parent.normal_side,
      parent.id, Number(parent.level || 1) + 1,
    ]
  );
  await tx.query('UPDATE accounts SET is_postable = 0 WHERE id = ?', [parent.id]);
  return tx.queryOne('SELECT * FROM accounts WHERE id = ?', [ins.insertId]);
}

async function seedTemplates(tx, orgId) {
  for (const [i, tpl] of POSTING_TEMPLATES.entries()) {
    const existing = await tx.queryOne(
      'SELECT id FROM posting_templates WHERE org_id = ? AND code = ?',
      [orgId, tpl.code]
    );
    let id = existing?.id;
    if (!id) {
      const ins = await tx.query(
        `INSERT INTO posting_templates (org_id, code, name, name_en, transaction_type, journal_code, is_active, sort_order)
         VALUES (?,?,?,?,?,?,1,?)`,
        [orgId, tpl.code, tpl.name, tpl.name_en, tpl.transaction_type, tpl.journal_code, i + 1]
      );
      id = ins.insertId;
    }
    await tx.query('DELETE FROM posting_template_lines WHERE template_id = ?', [id]);
    for (const [n, line] of tpl.lines.entries()) {
      await tx.query(
        `INSERT INTO posting_template_lines
           (template_id, line_no, side, account_rule, amount_formula, third_party_rule, is_proposed, note)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, n + 1, line.side, line.account_rule, line.amount_formula, line.third_party_rule, line.is_proposed, line.note]
      );
    }
  }
}

export async function applyPostingLevel(tx, orgId) {
  await upsertSetting(tx, orgId, 'accounting.posting_length', DEFAULT_POSTING_LENGTH, 'int', 'FR-PL-001 posting length');
  await upsertSetting(tx, orgId, 'accounting.posting_length_locked', 'true', 'bool', 'FR-PL-001 locked once movements exist');
  await upsertSetting(tx, orgId, 'accounting.history_suggestions', 'true', 'bool', 'FR-DE-009 history suggestions');
  const remapped = await remapHeadingMovements(tx, orgId, DEFAULT_POSTING_LENGTH);
  await reclassifyByLength(tx, orgId, DEFAULT_POSTING_LENGTH);
  await flagCollectiveAccounts(tx, orgId);
  const suspense = await ensureSuspense(tx, orgId);
  if (suspense) {
    await upsertSetting(tx, orgId, 'accounting.suspense_account', suspense.code, 'string', 'FR-DE-010 suspense account');
  }
  await seedTemplates(tx, orgId);
  const postable = await tx.queryOne(
    'SELECT SUM(is_postable = 1) AS n FROM accounts WHERE org_id = ?',
    [orgId]
  );
  return { remapped, postable: Number(postable.n), suspense: suspense?.code || null };
}

async function main() {
  const orgs = await query('SELECT id, code, name FROM organizations');
  for (const org of orgs) {
    const result = await transaction((tx) => applyPostingLevel(tx, org.id));
    console.log(`[posting] ${org.code}: remapped ${result.remapped} heading lines, ${result.postable} postable accounts, suspense ${result.suspense}`);
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[posting] failed:', err.message);
    process.exit(1);
  });
}
