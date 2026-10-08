/**
 * Cross-checks the JSON bodies the NiceGUI pages send against the Zod schemas
 * the Express routes validate, so a field the route would silently strip shows
 * up here instead of as a value that never saved.
 *
 * Usage: node tools/body-audit.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROUTES = path.resolve('src', 'routes');
const PAGES = path.resolve('..', 'frontend', 'app', 'pages');

/** '/assets/${asset.value}/revaluations' and '/assets/:id/revaluations' both become '/assets/*\/revaluations'. */
function normalise(route) {
  return route
    .replace(/\$?\{[^}]*\}/g, '*')
    .replace(/:[A-Za-z_]\w*/g, '*')
    .replace(/^\/api/, '')
    .replace(/\/+$/, '');
}

/** Returns the text of the brace-balanced block starting at `open`. */
function readBraces(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

// --- what the routes accept ------------------------------------------------

const accepted = new Map(); // normalised path -> Set of accepted body keys
for (const file of (await readdir(ROUTES)).filter((f) => f.endsWith('.js'))) {
  const source = await readFile(path.join(ROUTES, file), 'utf8');
  const calls = source.matchAll(
    /\.(post|patch|put)\(\s*'([^']+)'([\s\S]*?)(?=\n\w*Routes\.|$)/g
  );
  for (const [, , route, tail] of calls) {
    const keys = new Set();
    const bodyStart = tail.match(/body:\s*z\s*\.?\s*(?:object|intersection|union)?\s*\(?\s*\{/);
    if (bodyStart) {
      const open = tail.indexOf('{', bodyStart.index);
      const block = readBraces(tail, open);
      for (const m of block.matchAll(/(?:^|[{,]\s*)\s*([A-Za-z_]\w*)\s*:/gm)) keys.add(m[1]);
    }
    const key = normalise(route);
    accepted.set(key, new Set([...(accepted.get(key) ?? []), ...keys]));
  }
}

const withSchema = [...accepted.values()].filter((s) => s.size).length;
console.log(`${accepted.size} write routes parsed, ${withSchema} with a body schema.\n`);

// --- what the pages send ---------------------------------------------------

let problems = 0;
let checked = 0;
for (const file of (await readdir(PAGES)).filter((f) => f.endsWith('.py'))) {
  const source = await readFile(path.join(PAGES, file), 'utf8');
  // The path is an f-string, so quotes can appear inside its {...} placeholders.
  const calls = source.matchAll(
    /api\.(?:post|patch)\(\s*f?(['"])((?:\{[^}]*\}|(?!\1)[^\r\n])+)\1\s*,\s*\{/g
  );
  for (const call of calls) {
    const route = call[2];
    const body = readBraces(source, call.index + call[0].length - 1);
    // Only the dict's own keys, not those of any dict nested inside a value.
    const sent = [...body.matchAll(/(?:^\s*|[{,]\s*)'([A-Za-z_]\w*)'\s*:/gm)].map((m) => m[1]);
    if (!sent.length) continue;

    const key = normalise(route);
    const schema = accepted.get(key);
    if (!schema) {
      console.log(`${file}: no route matches ${route} (looked for ${key})`);
      problems += 1;
      continue;
    }
    if (!schema.size) continue; // route takes a free-form or absent body
    checked += 1;
    const unknown = sent.filter((f) => !schema.has(f));
    if (unknown.length) {
      console.log(`${file}: ${route} does not accept ${unknown.join(', ')}`);
      problems += unknown.length;
    }
  }
}
console.log(problems
  ? `\n${problems} body field(s) to check across ${checked} call(s).`
  : `\nEvery field the pages send is accepted by its route (${checked} calls checked).`);
