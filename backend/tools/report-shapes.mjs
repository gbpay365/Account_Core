/**
 * Dumps the shape of every reporting endpoint the statement viewer calls, so the
 * page can be written against what the API returns rather than what it looks like
 * it should return.
 *
 * Usage: node tools/report-shapes.mjs
 */
const API = process.env.API_BASE ?? 'http://127.0.0.1:4700/api';
const RANGE = 'from=2026-01-01&to=2026-12-31';

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@ledgercore.health', password: 'Ledger@2026' }),
}).then((r) => r.json());
const auth = { Authorization: `Bearer ${login.token}` };

const URLS = [
  `/reports/ohada/bilan?${RANGE}`,
  `/reports/ohada/resultat?${RANGE}`,
  `/reports/ohada/tafire?${RANGE}`,
  `/reports/ifrs/sofp?${RANGE}`,
  `/reports/ifrs/profit-or-loss?${RANGE}`,
  `/reports/ifrs/cash-flow?${RANGE}`,
  `/reports/ifrs/equity?${RANGE}`,
  `/reports/ifrs/ppe-note?${RANGE}`,
  `/reports/dual-standard-bridge?${RANGE}`,
  `/reports/asset-register?groupBy=category`,
  `/reports/register-reconciliation?asOf=2026-12-31`,
  `/reports/depreciation?${RANGE}`,
  `/reports/compliance?asOf=2026-12-31`,
  `/reports/cost-of-ownership?${RANGE}`,
];

for (const url of URLS) {
  const res = await fetch(API + url, { headers: auth });
  if (!res.ok) {
    console.log(`\n${url}\n  -> ${res.status} ${(await res.text()).slice(0, 160)}`);
    continue;
  }
  const body = await res.json();
  console.log(`\n${url}`);
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      const keys = value.length && typeof value[0] === 'object' ? Object.keys(value[0]).join(', ') : '';
      console.log(`  ${key}[${value.length}]${keys ? `: ${keys}` : ''}`);
    } else if (value && typeof value === 'object') {
      console.log(`  ${key}{}: ${Object.keys(value).join(', ')}`);
    } else {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
}
