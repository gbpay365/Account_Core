import { z } from 'zod';

/**
 * The shape `ledger.service` expects for permission-sensitive decisions such
 * as overriding a closed period.
 */
export const actorOf = (req) => ({
  id: req.user.id,
  name: req.user.full_name,
  permissions: new Set(req.user.permissions),
});

export const can = (req, code) => req.user.permissions.includes(code);

/** `YYYY-MM-DD`, kept as a string end to end to avoid timezone drift. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');

export const optionalId = z.coerce.number().int().positive().optional();

export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

/** Reporting endpoints all take the same period window and framework. */
export const reportRange = z.object({
  from: isoDate,
  to: isoDate,
  framework: z.enum(['ohada', 'ifrs']).default('ohada'),
  costCenterId: optionalId,
});

export const paged = (rows, total, { page, pageSize }) => ({
  rows,
  page,
  pageSize,
  total,
  pages: Math.max(1, Math.ceil(total / pageSize)),
});

/**
 * Builds a `WHERE` fragment from optional filters, so each route does not
 * repeat the same null-checking around every clause.
 */
export function where(clauses) {
  const parts = [];
  const params = [];
  for (const [sql, value] of clauses) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(sql);
    params.push(value);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
}
