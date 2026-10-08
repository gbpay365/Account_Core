/**
 * Import the official SYSCOHADA révisé (AUDCIF 2017) chart into the seed and
 * the live ledger without wiping hospital extensions or posted history.
 *
 * Source: annex plan de comptes SYSCOHADA révisé (classes 1–9), with English
 * designations from the published multilingual SYSCOHADA name list.
 *
 * 104 / 105 / 106 follow the official revised numbering:
 *   104 Compte de l'exploitant
 *   105 Primes liées au capital social
 *   106 Écarts de réévaluation
 * Revaluation references that pointed at 105 are moved to 106.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';
import { SYSCOHADA_ACCOUNTS as CURRENT } from '../src/db/seed/data/syscohada.js';
import { englishAccountName } from '../src/db/seed/data/official/account-name-en.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const officialDir = path.resolve(here, '../src/db/seed/data/official');
const phpPath = path.join(officialDir, 'comptes.php');
const namesPath = path.join(officialDir, 'account-names.ts');
const outJs = path.join(officialDir, 'syscohada-official.js');

const REVAL_FROM = '105';
const REVAL_TO = '106';

function sentenceCase(label) {
  const raw = String(label || '').replace(/\s+/g, ' ').trim();
  if (!raw) return raw;
  const keep = raw
    .replace(/É/g, 'é').replace(/È/g, 'è').replace(/Ê/g, 'ê').replace(/À/g, 'à')
    .replace(/Ù/g, 'ù').replace(/Ç/g, 'ç').replace(/Ô/g, 'ô');
  const lower = keep.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function parseOfficialPhp(text) {
  const rows = [];
  const re = /\['([^']+)',\s*'((?:\\'|[^'])*)',\s*(\d+),\s*(\d+),\s*'([^']*)',\s*'([^']+)',\s*'([^']+)'\]/g;
  let m;
  while ((m = re.exec(text))) {
    rows.push({
      code: m[1],
      name: sentenceCase(m[2].replace(/\\'/g, "'")),
      account_class: Number(m[3]),
      nature: m[6],
      sens: m[7],
    });
  }
  return rows;
}

function parseEnglishNames(text) {
  const map = new Map();
  const re = /"(\d+)"\s*:\s*\{\s*fr:\s*"([^"]*)",\s*en:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) map.set(m[1], m[3]);
  return map;
}

function classify(row) {
  const { account_class: klass, nature, sens, code } = row;
  let account_type = 'asset';
  let normal_side = sens === 'credit' ? 'credit' : 'debit';
  if (nature === 'hors-bilan') account_type = 'offbalance';
  else if (nature === 'cage' || klass === 9) account_type = nature === 'hors-bilan' ? 'offbalance' : 'analytic';
  else if (klass === 1) {
    account_type = /^1[0-5]/.test(code) || code === '1' || code === '10' ? 'equity' : 'liability';
  } else if (klass === 6) account_type = 'expense';
  else if (klass === 7) account_type = 'revenue';
  else if (klass === 8) {
    account_type = (sens === 'credit' || /^8[2458]/.test(code)) ? 'revenue' : 'expense';
  } else if (klass === 4) {
    account_type = sens === 'debit' || /^(41|409|45|476|478|49)/.test(code) ? 'asset' : 'liability';
    if (/^(401|403|408|42|43|44|46|47|479)/.test(code) && !/^(409|476|4781)/.test(code)) {
      account_type = 'liability';
    }
    if (/^(411|416|418|409|445|4449)/.test(code)) account_type = 'asset';
  } else if (klass === 5) {
    account_type = sens === 'credit' || /^56/.test(code) ? 'liability' : 'asset';
    if (/^56/.test(code)) account_type = 'liability';
  } else {
    account_type = 'asset';
  }
  if (/^2[89]/.test(code) || /^39/.test(code) || /^59/.test(code) || /^49/.test(code)) {
    normal_side = 'credit';
  }
  return { account_type, normal_side };
}

function flagsFor(code, account_type) {
  const is_reconcilable = /^(401|411|52|53|57|58)/.test(code) ? 1 : 0;
  const requires_cost_center = account_type === 'expense' ? 1 : 0;
  const is_fixed_asset = (
    code.startsWith('2') && !/^2[589]/.test(code) && !/^25/.test(code)
    && !/^26/.test(code) && !/^27/.test(code) && code.length >= 3
  ) ? 1 : 0;
  const requires_asset = is_fixed_asset;
  const tiers = code.startsWith('9') ? 'n' : 'na';
  return { is_reconcilable, requires_cost_center, is_fixed_asset, requires_asset, tiers };
}

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

function buildMerged(official, english, current) {
  const byCode = new Map();
  for (const row of official) {
    const { account_type, normal_side } = classify(row);
    const extra = flagsFor(row.code, account_type);
    byCode.set(row.code, {
      code: row.code,
      name: row.name,
      name_en: english.get(row.code) || englishAccountName(row.name) || row.name,
      account_class: row.account_class,
      account_type,
      normal_side,
      ...extra,
    });
  }
  const hospitalName = /hospital|biomedical|ambulance|medical|pharma|ward|oxygen|sterilis|neonat|imaging|icu/i;
  for (const row of current) {
    const existing = byCode.get(row.code);
    if (!existing) {
      byCode.set(row.code, { ...row });
      continue;
    }
    if (hospitalName.test(`${row.name} ${row.name_en || ''}`)) {
      byCode.set(row.code, { ...existing, name: row.name, name_en: row.name_en });
    }
  }
  return markLeaves([...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true })));
}

function writeOfficialModule(rows) {
  const body = rows.map((a) => JSON.stringify({
    code: a.code,
    name: a.name,
    name_en: a.name_en,
    account_class: a.account_class,
    account_type: a.account_type,
    normal_side: a.normal_side,
    tiers: a.tiers || 'na',
    is_reconcilable: a.is_reconcilable || 0,
    requires_cost_center: a.requires_cost_center || 0,
    is_fixed_asset: a.is_fixed_asset || 0,
    requires_asset: a.requires_asset || 0,
  })).join(',\n  ');
  fs.writeFileSync(outJs, `/** Auto-generated official SYSCOHADA révisé (AUDCIF 2017). */\nexport const OFFICIAL_SYSCOHADA = [\n  ${body}\n];\n`);
}

async function syncLive(rows) {
  const orgs = await pool.query('SELECT id FROM organizations');
  const orgIds = orgs[0].map((r) => r.id);
  const stats = { inserted: 0, updated: 0, unchanged: 0, remapped: 0 };

  for (const orgId of orgIds) {
    const existing = await pool.query(
      'SELECT id, code, name, name_en, parent_id, is_postable FROM accounts WHERE org_id = ?',
      [orgId]
    );
    const byCode = new Map(existing[0].map((r) => [r.code, r]));

    const sorted = [...rows].sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
    const resolveParent = (code) => {
      for (let len = code.length - 1; len >= 1; len -= 1) {
        const candidate = code.slice(0, len);
        if (byCode.has(candidate)) return byCode.get(candidate);
      }
      return null;
    };

    for (const a of sorted) {
      const parent = resolveParent(a.code);
      const level = parent ? (String(parent.code).length === a.code.length ? 1 : (parent.level || parent.code.length === 2 ? 2 : 3)) : 1;
      const parentLevel = parent
        ? Number((await pool.query('SELECT level FROM accounts WHERE id = ?', [parent.id]))[0][0]?.level || 1)
        : 0;
      const nextLevel = parent ? parentLevel + 1 : 1;
      const found = byCode.get(a.code);
      if (!found) {
        const [res] = await pool.execute(
          `INSERT INTO accounts
             (org_id, code, name, name_en, account_class, parent_id, level, account_type,
              normal_side, is_postable, is_reconcilable, requires_cost_center, requires_asset,
              is_fixed_asset, in_tier_normal, in_tier_allege, in_tier_smt, is_system)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
          [
            orgId, a.code, a.name, a.name_en, a.account_class, parent?.id ?? null, nextLevel,
            a.account_type, a.normal_side, a.is_postable,
            a.is_reconcilable ? 1 : 0, a.requires_cost_center ? 1 : 0,
            a.requires_asset ? 1 : 0, a.is_fixed_asset ? 1 : 0,
            (a.tiers || 'na').includes('n') ? 1 : 0,
            (a.tiers || 'na').includes('a') ? 1 : 0,
            (a.tiers || 'na').includes('s') ? 1 : 0,
          ]
        );
        byCode.set(a.code, { id: res.insertId, code: a.code, level: nextLevel });
        stats.inserted += 1;
        continue;
      }
      const same = found.name === a.name && (found.name_en || '') === (a.name_en || '');
      await pool.execute(
        `UPDATE accounts
            SET name = ?, name_en = ?, is_postable = ?, parent_id = ?, level = ?, is_system = 1
          WHERE id = ?`,
        [a.name, a.name_en, a.is_postable, parent?.id ?? null, nextLevel, found.id]
      );
      if (same) stats.unchanged += 1;
      else stats.updated += 1;
    }

    const fromAcc = byCode.get(REVAL_FROM);
    const toAcc = byCode.get(REVAL_TO);
    if (fromAcc && toAcc && fromAcc.id !== toAcc.id) {
      const [moved] = await pool.execute(
        'UPDATE journal_lines SET account_id = ? WHERE account_id = ?',
        [toAcc.id, fromAcc.id]
      );
      const [cats] = await pool.execute(
        'UPDATE asset_categories SET revaluation_surplus_account_id = ? WHERE revaluation_surplus_account_id = ?',
        [toAcc.id, fromAcc.id]
      );
      const [maps] = await pool.execute(
        `UPDATE account_mappings m
            JOIN accounts a ON a.id = m.account_id
            JOIN ifrs_accounts i ON i.id = m.ifrs_account_id
            SET m.ifrs_account_id = (
                  SELECT id FROM ifrs_accounts WHERE org_id = ? AND code = 'SOFP.REVAL_SURPLUS' LIMIT 1
                )
          WHERE a.org_id = ? AND a.code = ?`,
        [orgId, orgId, REVAL_TO]
      );
      const [prem] = await pool.execute(
        `UPDATE account_mappings m
            JOIN accounts a ON a.id = m.account_id
            SET m.ifrs_account_id = (
                  SELECT id FROM ifrs_accounts WHERE org_id = ? AND code = 'SOFP.SHARE_PREMIUM' LIMIT 1
                )
          WHERE a.org_id = ? AND a.code LIKE '105%'`,
        [orgId, orgId]
      );
      stats.remapped += (moved.affectedRows || 0) + (cats.affectedRows || 0);
      void maps;
      void prem;
    }
  }
  return stats;
}

const official = parseOfficialPhp(fs.readFileSync(phpPath, 'utf8'));
const english = parseEnglishNames(fs.readFileSync(namesPath, 'utf8'));
if (official.length < 400) {
  throw new Error(`Official plan parsed only ${official.length} accounts — aborting.`);
}
const merged = buildMerged(official, english, CURRENT);
writeOfficialModule(merged);
const hospital = CURRENT.filter((a) => !official.some((o) => o.code === a.code)).length;
console.log(`[import-syscohada] official ${official.length}, hospital extras ${hospital}, merged ${merged.length}`);

const stats = await syncLive(merged);
console.log(`[import-syscohada] live DB: ${stats.inserted} inserted, ${stats.updated} labels refreshed, ${stats.unchanged} already current, ${stats.remapped} revaluation rows remapped to 106`);
await pool.end();
