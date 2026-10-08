/**
 * Refresh English SYSCOHADA designations on a live ledger without resetting it.
 * Official French statutory names (`accounts.name`) are left untouched.
 */
import { pool } from '../src/db/pool.js';
import { SYSCOHADA_ACCOUNTS } from '../src/db/seed/data/syscohada.js';

const byCode = new Map(SYSCOHADA_ACCOUNTS.map((a) => [a.code, a.name_en]));

const [rows] = await pool.query('SELECT id, code, name_en FROM accounts');
let updated = 0;
let unchanged = 0;
let missing = 0;

for (const row of rows) {
  const next = byCode.get(row.code);
  if (!next) {
    missing += 1;
    continue;
  }
  if ((row.name_en || '') === next) {
    unchanged += 1;
    continue;
  }
  await pool.execute('UPDATE accounts SET name_en = ? WHERE id = ?', [next, row.id]);
  updated += 1;
}

console.log(`[sync-coa-en] ${updated} updated, ${unchanged} already current, ${missing} custom/unmapped`);
await pool.end();
