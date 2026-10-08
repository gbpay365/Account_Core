/**
 * Fill English account designations on the official chart and the live ledger.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../src/db/pool.js';
import { OFFICIAL_SYSCOHADA } from '../src/db/seed/data/official/syscohada-official.js';
import { ACCOUNT_NAME_EN } from '../src/db/seed/data/official/account-name-en.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const officialJs = path.resolve(here, '../src/db/seed/data/official/syscohada-official.js');
const namesTs = path.resolve(here, '../src/db/seed/data/official/account-names.ts');

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseEnglishByCode(text) {
  const map = new Map();
  const re = /"(\d+)"\s*:\s*\{\s*fr:\s*"([^"]*)",\s*en:\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(text))) map.set(match[1], match[3]);
  return map;
}

const foldedNames = new Map();
for (const [fr, en] of Object.entries(ACCOUNT_NAME_EN)) {
  foldedNames.set(fold(fr), en);
}

function fromFrenchLabel(label) {
  if (!label) return null;
  return ACCOUNT_NAME_EN[label] || foldedNames.get(fold(label)) || null;
}

function looksEnglish(text) {
  const s = String(text || '');
  if (!s) return false;
  if (/[àâçéèêëîïôùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŸ]/.test(s)) return false;
  return !/\b(fournisseur|client|matiere|recuperat|effet|garantie|acompte|immobilis|amortiss|depreciat|creance|dette|personnel|organisme|subvention|collectivit|retenue|interet|sous-trait|facture|rattache|dotation|tresorerie|emprunt|reserve|resultat|provision|marchandise|impot|cotisation|cession|reprise|ecart|revaluat|etat|avance verse|non parvenu)\b/i.test(s);
}

function resolveEnglish(row, byCode) {
  const coded = byCode.get(row.code);
  if (coded && looksEnglish(coded)) return coded;
  const fromName = fromFrenchLabel(row.name);
  if (fromName) return fromName;
  const fromEn = fromFrenchLabel(row.name_en);
  if (fromEn) return fromEn;
  if (looksEnglish(row.name_en) && row.name_en !== row.name) return row.name_en;
  return row.name_en || row.name;
}

const byCode = parseEnglishByCode(fs.readFileSync(namesTs, 'utf8'));
const updatedOfficial = OFFICIAL_SYSCOHADA.map((row) => ({
  ...row,
  name_en: resolveEnglish(row, byCode),
}));

const body = updatedOfficial.map((a) => JSON.stringify({
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
fs.writeFileSync(
  officialJs,
  `/** Auto-generated official SYSCOHADA révisé (AUDCIF 2017). */\nexport const OFFICIAL_SYSCOHADA = [\n  ${body}\n];\n`
);

const live = await query('SELECT id, code, name, name_en FROM accounts');
let changed = 0;
for (const row of live) {
  const official = updatedOfficial.find((a) => a.code === row.code);
  const next = official
    ? official.name_en
    : resolveEnglish(row, byCode);
  if (next && next !== row.name_en) {
    await query('UPDATE accounts SET name_en = ? WHERE id = ?', [next, row.id]);
    changed += 1;
  }
}

const leftover = await query(
  `SELECT code, name, name_en
     FROM accounts
    WHERE is_postable = 1
      AND (name_en IS NULL OR name_en = '' OR name_en = name)
    ORDER BY code
    LIMIT 30`
);
const sample = await query(
  "SELECT code, name, name_en FROM accounts WHERE code IN ('3723','4011','4012','4013','407','4111','4112','4113','4114','4115')"
);

console.log(JSON.stringify({
  official: updatedOfficial.length,
  liveUpdated: changed,
  leftoverCount: leftover.length,
  leftover,
  sample,
}, null, 2));
await pool.end();
