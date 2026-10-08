/**
 * Posts the exact payload the journal capture form builds, so the write path
 * behind the form is exercised even where the Quasar account picker cannot be
 * driven from automation.
 */
import { readFileSync } from 'node:fs';

const token = readFileSync(new URL('../tok.txt', import.meta.url), 'utf8').trim();
const api = async (method, path, body) => {
  const res = await fetch(`http://127.0.0.1:4700/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const payload = {
  journalCode: 'OD',
  date: '2026-09-27',
  description: 'Facture ENEO - electricite septembre 2026',
  narration: 'Consommation du site principal, releve du 25 septembre.',
  reference: 'ENEO-2026-09-4471',
  framework: 'both',
  autoPost: true,
  lines: [
    { accountId: 373, description: 'Electricite septembre', costCenterId: null, debit: 4200000, credit: 0 },
    { accountId: 158, description: 'ENEO', costCenterId: null, debit: 0, credit: 4200000 },
  ],
};

const unbalanced = await api('POST', '/entries', {
  ...payload,
  lines: [payload.lines[0], { ...payload.lines[1], credit: 4100000 }],
});
console.log(`out-of-balance entry refused: ${unbalanced.status === 422 ? 'yes' : 'NO'} — ${unbalanced.body?.error?.message}`);

const created = await api('POST', '/entries', payload);
const entry = created.body?.entry;
console.log(`created: ${created.status} ${entry?.entry_no} ${entry?.status} ${entry?.total_debit}/${entry?.total_credit}`);

const fetched = await api('GET', `/entries/${entry?.id}`);
console.log(`read back: ${fetched.body?.entry?.entry_no} with ${fetched.body?.lines?.length} lines, framework ${fetched.body?.entry?.framework}`);

const tb = await api('GET', '/reports/trial-balance?from=2026-01-01&to=2026-12-31');
const t = tb.body?.totals ?? {};
console.log(`trial balance after posting: debit ${t.debit} credit ${t.credit} balanced ${t.debit === t.credit}`);

const recon = await api('GET', '/reports/register-reconciliation?asOf=2026-12-31');
console.log(`register still ties: ${recon.body?.totals?.reconciled}`);

const reversal = await api('POST', `/entries/${entry?.id}/reverse`, {
  date: '2026-09-27',
  reason: 'Reversal of a duplicate invoice posting.',
});
console.log(`reversed: ${reversal.status} ${reversal.body?.entry?.entry_no ?? JSON.stringify(reversal.body?.error?.message)}`);
