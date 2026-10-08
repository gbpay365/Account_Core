import { readFileSync } from 'node:fs';

const token = readFileSync(new URL('../tok.txt', import.meta.url), 'utf8').trim();
const res = await fetch('http://127.0.0.1:4700/api/accounts?postableOnly=true&activeOnly=true', {
  headers: { Authorization: `Bearer ${token}` },
});
const { rows } = await res.json();
console.log(`${rows.length} postable accounts`);
for (const a of rows) {
  if (/^(6052|401|521|6181)/.test(a.code)) console.log(`  ${a.id}  ${a.code}  ${a.name}`);
}
