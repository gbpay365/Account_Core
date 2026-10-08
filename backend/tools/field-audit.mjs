/**
 * Cross-checks the column names the NiceGUI pages ask for against the keys the
 * API actually returns, so a renamed field shows up here instead of as a blank
 * column on screen.
 *
 * Usage: node tools/field-audit.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const API = process.env.API_BASE ?? 'http://127.0.0.1:4700/api';
const FRONTEND = path.resolve('..', 'frontend', 'app', 'pages');

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@ledgercore.health', password: 'Ledger@2026' }),
}).then((r) => r.json());
const auth = { Authorization: `Bearer ${login.token}` };

/** Every key that appears anywhere in a response, so nested row shapes count too. */
function collectKeys(value, out = new Set(), depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 3)) collectKeys(item, out, depth + 1);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    out.add(key);
    collectKeys(child, out, depth + 1);
  }
  return out;
}

/**
 * Ids move whenever the database is reseeded, so the samples are resolved from
 * live data. The detail page renders nested rows that only exist on some
 * assets, hence one asset carrying safety tests and one carrying depreciation.
 */
const pick = async (url, choose) => {
  const res = await fetch(API + url, { headers: auth });
  return res.ok ? choose(await res.json()) : null;
};
const assetIds = (await pick('/assets?pageSize=200', (b) => b.rows.map((a) => a.id))) ?? [];
const oldestAsset = Math.min(...assetIds);

// The detail page renders calibration and safety-test rows, so the sample has
// to be an asset that actually has both or those columns go unchecked.
let compliantAsset = oldestAsset;
for (const id of assetIds) {
  const detail = await pick(`/assets/${id}`, (b) => b);
  if (detail?.calibrations?.length && detail?.safety_tests?.length) {
    compliantAsset = id;
    break;
  }
}
const runId = await pick('/depreciation-runs?pageSize=1', (b) => b.rows[0]?.id);
const woId = await pick('/work-orders?pageSize=1', (b) => b.rows[0]?.id);

const ENDPOINTS = {
  accounts: '/accounts?pageSize=5',
  journal: '/entries?pageSize=5',
  ledger: '/reports/trial-balance?from=2026-01-01&to=2026-12-31',
  periods: '/periods',
  assets: '/assets?pageSize=5',
  'assets-detail': `/assets/${compliantAsset}`,
  'assets-detail-depreciated': `/assets/${oldestAsset}`,
  'ledger-trial-balance': '/ledger/trial-balance?from=2026-01-01&to=2026-12-31',
  maintenance: '/work-orders?pageSize=5',
  plans: '/maintenance-plans?pageSize=5',
  calibrations: '/calibrations?pageSize=5',
  'safety-tests': '/safety-tests?pageSize=5',
  'depreciation-runs': '/depreciation-runs?pageSize=5',
  impairments: '/impairments?pageSize=5',
  revaluations: '/revaluations?pageSize=5',
  audit: '/audit-log?pageSize=5',
  'report-register': '/reports/asset-register?groupBy=category',
  'report-recon': '/reports/register-reconciliation?asOf=2026-12-31',
  'ledger-account': '/ledger/account/405?from=2026-01-01&to=2026-12-31',
  'depr-run': `/depreciation-runs/${runId}`,
  'work-order': `/work-orders/${woId}`,
  bridge: '/reports/dual-standard-bridge?from=2026-01-01&to=2026-12-31',
  'ohada-bilan': '/reports/ohada/bilan?from=2026-01-01&to=2026-12-31',
  'ifrs-sofp': '/reports/ifrs/sofp?from=2026-01-01&to=2026-12-31',
  'ifrs-ppe': '/reports/ifrs/ppe-note?from=2026-01-01&to=2026-12-31',
  'maintenance-overview': '/maintenance/overview',
  'depr-schedule': `/assets/${oldestAsset}/depreciation-schedule?basis=ohada`,
  'report-depr': '/reports/depreciation?from=2026-01-01&to=2026-12-31',
  'report-compliance': '/reports/compliance?asOf=2026-12-31',
  'report-tco': '/reports/cost-of-ownership?from=2026-01-01&to=2026-12-31',
};

/** Keys per endpoint path, so a page is only checked against what it calls. */
const keysByPath = new Map();
const empty = [];
for (const [name, url] of Object.entries(ENDPOINTS)) {
  const res = await fetch(API + url, { headers: auth });
  if (!res.ok) {
    console.log(`  ! ${name} ${url} -> ${res.status}`);
    continue;
  }
  const body = await res.json();
  const keys = collectKeys(body);
  keysByPath.set(url.split('?')[0], keys);
  // An endpoint with no rows contributes no keys, so any column reading from it
  // goes unchecked. Saying so is more useful than reporting it as a mismatch.
  if (Array.isArray(body?.rows) && body.rows.length === 0) empty.push(`${name} (${url})`);
}

/** '/assets/{asset_id}' and '/assets/13' both reduce to '/assets/*'. */
function shape(pathname) {
  return pathname
    .replace(/\{[^}]*\}/g, '*')
    .replace(/\/\d+(?=\/|$)/g, '/*')
    .replace(/\/+$/, '');
}

const byShape = new Map();
for (const [pathname, keys] of keysByPath) {
  const key = shape(pathname);
  byShape.set(key, new Set([...(byShape.get(key) ?? []), ...keys]));
}

// Fields the pages compute themselves rather than read from the API.
const DERIVED = /^(_|id$)/;

const files = (await readdir(FRONTEND)).filter((f) => f.endsWith('.py'));
let suspects = 0;
for (const file of files) {
  const source = await readFile(path.join(FRONTEND, file), 'utf8');
  const asked = new Set();
  for (const m of source.matchAll(/w\.(?:money_column|date_column|badge_column|column)\(\s*'([^']+)'/g)) {
    asked.add(m[1]);
  }
  // Anything the page builds itself is not an API field: keys it assigns onto a
  // row, and keys of the row dicts it composes from scratch.
  const derived = new Set([
    ...[...source.matchAll(/\w+\['([^']+)'\]\s*=/g)].map((m) => m[1]),
    ...[...source.matchAll(/^\s*'([A-Za-z_]\w*)'\s*:/gm)].map((m) => m[1]),
  ]);
  // Only the endpoints this page actually reads.
  const known = new Set();
  for (const m of source.matchAll(/api\.get\(\s*f?(['"])((?:\{[^}]*\}|(?!\1)[^\r\n])+)\1/g)) {
    for (const key of byShape.get(shape(m[2])) ?? []) known.add(key);
  }
  const missing = [...asked].filter((f) => !known.has(f) && !derived.has(f) && !DERIVED.test(f));
  if (missing.length) {
    suspects += missing.length;
    console.log(`${file}: ${missing.join(', ')}`);
  }
}
console.log(suspects ? `\n${suspects} column name(s) to check.` : '\nEvery column name matches a key the API returns.');
if (empty.length) {
  console.log(`\nNo sample data, so columns reading from these went unchecked:\n  ${empty.join('\n  ')}`);
}
