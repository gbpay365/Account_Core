import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(here, '../../sql');

const drop = process.argv.includes('--drop');

/**
 * Splits a SQL file on statement boundaries. Only handles the subset of SQL we
 * author here (no stored procedures, no DELIMITER blocks), but it is comment
 * and string aware so `;` inside a label or default value is safe.
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!quote && ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      buf += '\n';
      continue;
    }
    if (!quote && ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === '\\') {
        buf += next ?? '';
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export async function runMigrations({ drop = false, silent = false } = {}) {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      ssl: config.db.ssl,
    });
  } catch (err) {
    if (err.code === 'ER_BAD_DB_ERROR') {
      const root = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        ssl: config.db.ssl,
      });
      await root.query(
        `CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` ` +
          'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
      );
      await root.changeUser({ database: config.db.name });
      conn = root;
    } else {
      throw err;
    }
  }

  if (drop) {
    if (!silent) console.log(`[migrate] dropping database \`${config.db.name}\``);
    await conn.query(`DROP DATABASE IF EXISTS \`${config.db.name}\``);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` ` +
        'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    await conn.changeUser({ database: config.db.name });
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(120) NOT NULL PRIMARY KEY,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      statements INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [applied] = await conn.query('SELECT filename FROM schema_migrations');
  const done = new Set(applied.map((r) => r.filename));

  const files = (await fs.readdir(sqlDir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) {
      if (!silent) console.log(`[migrate] skip    ${file} (already applied)`);
      continue;
    }
    const sql = await fs.readFile(path.join(sqlDir, file), 'utf8');
    const statements = splitStatements(sql);
    if (!silent) process.stdout.write(`[migrate] apply   ${file} (${statements.length} statements) ... `);
    for (const [idx, stmt] of statements.entries()) {
      try {
        await conn.query(stmt);
      } catch (err) {
        // Idempotent schema operations (e.g. duplicate column/key or table already exists) are safe to ignore
        if (err.errno === 1060 || err.errno === 1061 || err.errno === 1050 || err.errno === 1068 || err.errno === 1091) {
          if (!silent) process.stdout.write(`[note: ${err.code || err.sqlState}] `);
          continue;
        }
        if (!silent) console.log('FAILED');
        console.error(`\nStatement #${idx + 1} in ${file}:\n${stmt.slice(0, 600)}\n`);
        throw err;
      }
    }
    await conn.query('INSERT INTO schema_migrations (filename, statements) VALUES (?, ?)', [
      file,
      statements.length,
    ]);
    if (!silent) console.log('ok');
  }

  const [tables] = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?',
    [config.db.name]
  );
  if (!silent) console.log(`[migrate] done. ${tables[0].n} tables in \`${config.db.name}\`.`);
  await conn.end();
  return Number(tables[0]?.n || 0);
}

const isDirectCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectCli) {
  runMigrations({ drop }).catch((err) => {
    console.error('[migrate] error:', err.message);
    process.exit(1);
  });
}

