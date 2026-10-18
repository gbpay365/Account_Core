import mysql from 'mysql2/promise';
import { config } from '../config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  ssl: config.db.ssl,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: ['DATE'],
  timezone: 'local',
  multipleStatements: false,
  // Amounts are DECIMAL in MySQL; without this they arrive as strings and
  // silently break arithmetic across the ledger.
  decimalNumbers: true,
});

pool.on('connection', (connection) => {
  connection.query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))", (err) => {
    if (err) console.warn('[pool] sql_mode setup note:', err.message);
  });
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction. Every posting path in the ledger must use
 * this so a half-written journal entry can never be committed.
 */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn({
      query: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows;
      },
      queryOne: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows[0] ?? null;
      },
      raw: conn,
    });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function healthcheck() {
  const row = await queryOne('SELECT VERSION() AS version, DATABASE() AS db');
  return row;
}
