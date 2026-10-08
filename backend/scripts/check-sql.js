/**
 * Static check that every INSERT ... VALUES (...) in the codebase lists as many
 * value expressions as columns. Getting this wrong only surfaces at runtime as
 * "Column count doesn't match value count", which is slow to chase down.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'src');

/** Reads a parenthesised group starting at `open`, honouring nesting and quotes. */
function group(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return { body: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Splits on commas that sit at nesting depth zero and outside quotes. */
function topLevelSplit(body) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}

let problems = 0;
let checked = 0;

for (const file of files(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /INSERT\s+(?:IGNORE\s+)?INTO\s+([`\w]+)\s*\(/gi;
  let m;
  while ((m = re.exec(text))) {
    const cols = group(text, m.index + m[0].length - 1);
    if (!cols) continue;
    const after = text.slice(cols.end + 1);
    const vm = /^[\s\r\n]*VALUES[\s\r\n]*\(/i.exec(after);
    if (!vm) continue; // bulk/`VALUES ?` form, nothing to compare
    const vals = group(after, vm[0].length - 1);
    if (!vals) continue;
    const nCols = topLevelSplit(cols.body).length;
    const nVals = topLevelSplit(vals.body).length;
    checked += 1;
    if (nCols !== nVals) {
      const line = text.slice(0, m.index).split('\n').length;
      console.log(
        `${path.relative(ROOT, file)}:${line}  ${m[1].replace(/`/g, '')}  ` +
        `${nCols} columns vs ${nVals} values  (${nVals > nCols ? '+' : ''}${nVals - nCols})`
      );
      problems += 1;
    }
  }
}

console.log(`\n${checked} INSERT statements checked, ${problems} mismatched.`);
process.exit(problems ? 1 : 0);
