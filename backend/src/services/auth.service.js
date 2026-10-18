import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { unauthorized, forbidden, badRequest } from '../utils/errors.js';

/**
 * Authentication and the logged action history.
 *
 * The SRS treats access security as a baseline control rather than a module of
 * its own: authenticated login, role-based permissions, and an audit trail.
 * Brute-force protection is handled by a rate limit on the login route instead
 * of per-account lockout state, which keeps the user record free of
 * security bookkeeping.
 */

/** Permission codes granted by the user's role. */
export async function loadPermissions(roleId) {
  const rows = await query(
    `SELECT p.code
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.code`,
    [roleId]
  );
  return rows.map((r) => r.code);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, org: user.org_id, role: user.role_id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    throw unauthorized(
      err.name === 'TokenExpiredError' ? 'Your session has expired. Please sign in again.' : 'Invalid session token.'
    );
  }
}

const SESSION_FIELDS = `
  u.id, u.org_id, u.email, u.full_name, u.job_title, u.phone, u.role_id,
  u.cost_center_id, u.locale, u.is_technician, u.is_active, u.must_change_pw,
  u.last_login_at,
  r.code AS role_code, r.name AS role_name,
  cc.code AS cost_center_code, cc.name AS cost_center_name,
  o.code AS org_code, o.name AS org_name, o.country_code,
  o.functional_currency, o.presentation_currency, o.reporting_tier, o.frameworks`;

/** Loads the session payload the UI needs: identity, org context, permissions. */
export async function loadSession(userId) {
  const user = await queryOne(
    `SELECT ${SESSION_FIELDS}
       FROM users u
       JOIN roles r         ON r.id = u.role_id
       JOIN organizations o ON o.id = u.org_id
       LEFT JOIN cost_centers cc ON cc.id = u.cost_center_id
      WHERE u.id = ?`,
    [userId]
  );
  if (!user) throw unauthorized('This account no longer exists.');
  if (!user.is_active) throw forbidden('This account has been deactivated. Contact your administrator.');

  return {
    ...user,
    is_technician: Boolean(user.is_technician),
    must_change_pw: Boolean(user.must_change_pw),
    frameworks: String(user.frameworks || '').split(',').filter(Boolean),
    permissions: await loadPermissions(user.role_id),
  };
}

/**
 * Verifies credentials. The same message is returned whether the address is
 * unknown or the password is wrong, so the endpoint cannot be used to discover
 * which email addresses have accounts.
 */
export async function authenticate(email, password, context = {}) {
  if (!email || !password) throw badRequest('Email and password are both required.');

  const row = await queryOne(
    'SELECT id, password_hash, is_active FROM users WHERE email = ?',
    [String(email).trim().toLowerCase()]
  );

  const ok = row && (await bcrypt.compare(password, row.password_hash));

  if (!ok) {
    if (row) {
      await writeAudit({
        userId: row.id, action: 'login_failed', entity: 'user', entityId: row.id,
        summary: 'Echec de connexion : mot de passe incorrect', context,
      });
    }
    throw unauthorized('Email address or password is incorrect.');
  }

  const session = await loadSession(row.id);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);
  await writeAudit({
    orgId: session.org_id, userId: session.id, action: 'login', entity: 'user',
    entityId: session.id, summary: `Connexion de ${session.full_name} (${session.role_name})`, context,
  });

  return { user: session, token: signToken({ id: session.id, org_id: session.org_id, role_id: session.role_id }) };
}

export async function changePassword(userId, currentPassword, newPassword, context = {}) {
  if (!newPassword || newPassword.length < 10) {
    throw badRequest('The new password must be at least 10 characters long.');
  }
  if (newPassword === currentPassword) {
    throw badRequest('The new password must be different from the current one.');
  }
  const user = await queryOne('SELECT id, org_id, password_hash FROM users WHERE id = ?', [userId]);
  if (!user) throw unauthorized();
  if (!(await bcrypt.compare(currentPassword || '', user.password_hash))) {
    throw badRequest('The current password is incorrect.');
  }
  await query(
    'UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?',
    [await bcrypt.hash(newPassword, 10), userId]
  );
  await writeAudit({
    orgId: user.org_id, userId, action: 'password_changed', entity: 'user', entityId: userId,
    summary: 'Mot de passe modifie par l utilisateur', context,
  });
}

/**
 * Appends to the action history. An audit write must never break the operation
 * it is recording, so failures are reported to the console and swallowed.
 * Pass `db` to enlist the write in an open transaction.
 */
export async function writeAudit({
  orgId = null, userId = null, userEmail = null, action, entity, entityId = null,
  summary = null, before = null, after = null, context = {}, db = null,
}) {
  const run = db ? db.query : query;
  try {
    await run(
      `INSERT INTO audit_log
         (org_id, user_id, user_email, action, entity_type, entity_id, summary,
          before_json, after_json, ip_address, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orgId, userId, userEmail ?? context.userEmail ?? null, action, entity,
        entityId === null ? null : String(entityId),
        summary ? String(summary).slice(0, 400) : null,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        context.ip ?? null,
        context.userAgent ? String(context.userAgent).slice(0, 300) : null,
      ]
    );
  } catch (err) {
    console.error('[audit] could not record %s on %s: %s', action, entity, err.message);
  }
}
