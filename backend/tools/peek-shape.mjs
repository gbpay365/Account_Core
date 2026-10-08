import { readFileSync } from 'node:fs';

const token = readFileSync(new URL('../tok.txt', import.meta.url), 'utf8').trim();
const auth = { Authorization: `Bearer ${token}` };
const get = async (p) => (await fetch(`http://127.0.0.1:4700/api${p}`, { headers: auth })).json();

const tco = await get('/reports/cost-of-ownership?from=2026-01-01&to=2026-12-31');
console.log('TCO top-level:', Object.keys(tco));
for (const [k, v] of Object.entries(tco)) {
  if (Array.isArray(v) && v.length) console.log(`  ${k}[0]:`, Object.keys(v[0]).join(', '));
}

const { rows } = await get('/assets?pageSize=200');
for (const a of rows) {
  const d = await get(`/assets/${a.id}`);
  const cal = d.calibrations?.length ?? 0;
  const saf = d.safety_tests?.length ?? 0;
  const rev = d.revaluations?.length ?? 0;
  if (cal || saf || rev) {
    console.log(`asset ${a.id} ${a.asset_tag}: ${cal} calibrations, ${saf} safety tests, ${rev} revaluations`);
    if (cal) console.log('  calibration keys:', Object.keys(d.calibrations[0]).join(', '));
    if (saf) console.log('  safety test keys:', Object.keys(d.safety_tests[0]).join(', '));
  }
}
