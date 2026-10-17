import bcrypt from 'bcryptjs';
import { query, queryOne, transaction } from '../db/pool.js';
import { writeAudit } from './auth.service.js';
import { notFound, badRequest, conflict } from '../utils/errors.js';

// --- Users Management --------------------------------------------------------

export async function listUsers(orgId, { search, roleId, status } = {}) {
  let sql = `
    SELECT u.id, u.org_id, u.email, u.full_name, u.job_title, u.phone,
           u.role_id, u.cost_center_id, u.locale, u.is_technician, u.hourly_rate,
           u.is_active, u.must_change_pw, u.last_login_at, u.created_at,
           r.code AS role_code, r.name AS role_name, r.name_en AS role_name_en,
           cc.code AS cost_center_code, cc.name AS cost_center_name, cc.name_en AS cost_center_name_en
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN cost_centers cc ON cc.id = u.cost_center_id
     WHERE u.org_id = ?
  `;
  const params = [orgId];

  if (roleId) {
    sql += ' AND u.role_id = ?';
    params.push(roleId);
  }
  if (status === 'active') {
    sql += ' AND u.is_active = 1';
  } else if (status === 'inactive') {
    sql += ' AND u.is_active = 0';
  }
  if (search) {
    sql += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.job_title LIKE ? OR u.phone LIKE ?)';
    const like = `%${search.trim()}%`;
    params.push(like, like, like, like);
  }

  sql += ' ORDER BY u.full_name ASC';

  const rows = await query(sql, params);
  return {
    rows: rows.map(u => ({
      ...u,
      is_technician: Boolean(u.is_technician),
      is_active: Boolean(u.is_active),
      must_change_pw: Boolean(u.must_change_pw),
    })),
    total: rows.length,
    active_count: rows.filter(r => r.is_active).length,
  };
}

export async function getUser(orgId, userId) {
  const user = await queryOne(
    `SELECT u.id, u.org_id, u.email, u.full_name, u.job_title, u.phone,
            u.role_id, u.cost_center_id, u.locale, u.is_technician, u.hourly_rate,
            u.is_active, u.must_change_pw, u.last_login_at, u.created_at,
            r.code AS role_code, r.name AS role_name, r.name_en AS role_name_en,
            cc.code AS cost_center_code, cc.name AS cost_center_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN cost_centers cc ON cc.id = u.cost_center_id
      WHERE u.id = ? AND u.org_id = ?`,
    [userId, orgId]
  );
  if (!user) throw notFound('User not found.');

  const perms = await query(
    `SELECT p.code, p.module, p.description
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.module, p.code`,
    [user.role_id]
  );

  return {
    ...user,
    is_technician: Boolean(user.is_technician),
    is_active: Boolean(user.is_active),
    must_change_pw: Boolean(user.must_change_pw),
    permissions: perms,
  };
}

export async function createUser(orgId, data, currentUserId) {
  const email = data.email;
  const password = data.password;
  const full_name = data.fullName ?? data.full_name ?? '';
  const job_title = data.jobTitle ?? data.job_title;
  const phone = data.phone;
  const role_id = data.roleId ?? data.role_id;
  const cost_center_id = data.costCenterId ?? data.cost_center_id;
  const locale = data.locale || 'en';
  const is_technician = data.isTechnician ?? data.is_technician ?? false;
  const hourly_rate = data.hourlyRate ?? data.hourly_rate ?? 0;
  const is_active = data.isActive ?? data.is_active ?? true;

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) throw conflict(`A user with email ${normalizedEmail} already exists.`);

  const passwordHash = await bcrypt.hash(password, 10);

  const res = await query(
    `INSERT INTO users
      (org_id, email, password_hash, full_name, job_title, phone, role_id,
       cost_center_id, locale, is_technician, hourly_rate, is_active,
       must_change_pw, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
    [
      orgId,
      normalizedEmail,
      passwordHash,
      full_name.trim(),
      job_title ? job_title.trim() : null,
      phone ? phone.trim() : null,
      role_id,
      cost_center_id || null,
      locale,
      is_technician ? 1 : 0,
      hourly_rate || 0,
      is_active ? 1 : 0,
    ]
  );

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: 'create',
    entity: 'user',
    entityId: res.insertId,
    summary: `Created user ${full_name} (${normalizedEmail})`,
  });

  return getUser(orgId, res.insertId);
}

export async function updateUser(orgId, userId, data, currentUserId) {
  const user = await queryOne('SELECT id, email, full_name FROM users WHERE id = ? AND org_id = ?', [userId, orgId]);
  if (!user) throw notFound('User not found.');

  const email = data.email;
  const full_name = data.fullName ?? data.full_name;
  const job_title = data.jobTitle ?? data.job_title;
  const phone = data.phone;
  const role_id = data.roleId ?? data.role_id;
  const cost_center_id = data.costCenterId ?? data.cost_center_id;
  const locale = data.locale;
  const is_technician = data.isTechnician ?? data.is_technician;
  const hourly_rate = data.hourlyRate ?? data.hourly_rate;
  const is_active = data.isActive ?? data.is_active;

  if (email && String(email).trim().toLowerCase() !== user.email) {
    const norm = String(email).trim().toLowerCase();
    const clash = await queryOne('SELECT id FROM users WHERE email = ? AND id <> ?', [norm, userId]);
    if (clash) throw conflict(`Email ${norm} is already in use by another user.`);
  }

  const updates = [];
  const params = [];
  if (email !== undefined) { updates.push('email = ?'); params.push(String(email).trim().toLowerCase()); }
  if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name.trim()); }
  if (job_title !== undefined) { updates.push('job_title = ?'); params.push(job_title ? job_title.trim() : null); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone ? phone.trim() : null); }
  if (role_id !== undefined) { updates.push('role_id = ?'); params.push(role_id); }
  if (cost_center_id !== undefined) { updates.push('cost_center_id = ?'); params.push(cost_center_id || null); }
  if (locale !== undefined) { updates.push('locale = ?'); params.push(locale); }
  if (is_technician !== undefined) { updates.push('is_technician = ?'); params.push(is_technician ? 1 : 0); }
  if (hourly_rate !== undefined) { updates.push('hourly_rate = ?'); params.push(Number(hourly_rate)); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

  if (updates.length > 0) {
    params.push(userId, orgId);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`, params);
  }

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: 'update',
    entity: 'user',
    entityId: userId,
    summary: `Updated profile for user ${full_name || user.full_name}`,
  });

  return getUser(orgId, userId);
}

export async function resetPassword(orgId, userId, newPassword, currentUserId) {
  const user = await queryOne('SELECT id, full_name, email FROM users WHERE id = ? AND org_id = ?', [userId, orgId]);
  if (!user) throw notFound('User not found.');

  if (!newPassword || newPassword.length < 8) {
    throw badRequest('Password must be at least 8 characters long.');
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?', [hash, userId]);

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: 'password_reset',
    entity: 'user',
    entityId: userId,
    summary: `Reset password for user ${user.full_name} (${user.email})`,
  });

  return { ok: true, message: `Password reset successfully for ${user.full_name}.` };
}

export async function toggleUserStatus(orgId, userId, currentUserId) {
  if (Number(userId) === Number(currentUserId)) {
    throw badRequest('You cannot deactivate your own account.');
  }

  const user = await queryOne('SELECT id, full_name, is_active FROM users WHERE id = ? AND org_id = ?', [userId, orgId]);
  if (!user) throw notFound('User not found.');

  const newStatus = user.is_active ? 0 : 1;
  await query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId]);

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: newStatus ? 'activate' : 'deactivate',
    entity: 'user',
    entityId: userId,
    summary: `${newStatus ? 'Activated' : 'Deactivated'} user account ${user.full_name}`,
  });

  return { ok: true, is_active: Boolean(newStatus) };
}

// --- Roles & User Groups Management -----------------------------------------

export async function listRolesAndGroups() {
  const roles = await query(
    `SELECT r.id, r.code, r.name, r.name_en, r.description, r.is_system,
            COUNT(DISTINCT u.id) AS member_count,
            COUNT(DISTINCT rp.permission_id) AS permission_count
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.name ASC`
  );

  return {
    rows: roles.map(r => ({
      ...r,
      is_system: Boolean(r.is_system),
      member_count: Number(r.member_count),
      permission_count: Number(r.permission_count),
    })),
  };
}

export async function getRoleOrGroup(roleId) {
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!role) throw notFound('Role / User group not found.');

  const perms = await query(
    `SELECT p.id, p.code, p.module, p.description
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.module, p.code`,
    [roleId]
  );

  const members = await query(
    `SELECT id, full_name, email, job_title, is_active
       FROM users
      WHERE role_id = ?
      ORDER BY full_name`,
    [roleId]
  );

  return {
    ...role,
    is_system: Boolean(role.is_system),
    permissions: perms,
    members,
  };
}

export async function createRoleOrGroup(orgId, data, currentUserId) {
  const code = data.code;
  const name = data.name;
  const name_en = data.nameEn ?? data.name_en;
  const description = data.description;
  const permission_ids = data.permissionIds ?? data.permission_ids ?? [];

  const existing = await queryOne('SELECT id FROM roles WHERE code = ?', [code.trim()]);
  if (existing) throw conflict(`Role with code ${code} already exists.`);

  let createdRoleId;
  await transaction(async (cx) => {
    const res = await cx.query(
      `INSERT INTO roles (code, name, name_en, description, is_system)
       VALUES (?, ?, ?, ?, 0)`,
      [code.trim(), name.trim(), (name_en || name).trim(), description ? description.trim() : null]
    );
    createdRoleId = res.insertId;

    if (Array.isArray(permission_ids) && permission_ids.length > 0) {
      for (const pId of permission_ids) {
        await cx.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [createdRoleId, pId]);
      }
    }

    await writeAudit({
      orgId,
      userId: currentUserId,
      action: 'create',
      entity: 'role',
      entityId: createdRoleId,
      summary: `Created custom user group / role ${name} (${code}) with ${permission_ids.length} permissions`,
    });
  });

  return getRoleOrGroup(createdRoleId);
}

export async function updateRoleOrGroup(orgId, roleId, data, currentUserId) {
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!role) throw notFound('Role not found.');

  const name = data.name;
  const name_en = data.nameEn ?? data.name_en;
  const description = data.description;
  const permission_ids = data.permissionIds ?? data.permission_ids;

  await transaction(async (cx) => {
    await cx.query(
      `UPDATE roles
          SET name = COALESCE(?, name),
              name_en = COALESCE(?, name_en),
              description = COALESCE(?, description)
        WHERE id = ?`,
      [name ? name.trim() : null, name_en ? name_en.trim() : null, description ? description.trim() : null, roleId]
    );

    if (Array.isArray(permission_ids)) {
      await cx.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      for (const pId of permission_ids) {
        await cx.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pId]);
      }
    }

    await writeAudit({
      orgId,
      userId: currentUserId,
      action: 'update',
      entity: 'role',
      entityId: roleId,
      summary: `Updated role / user group ${name || role.name}`,
    });
  });

  return getRoleOrGroup(roleId);
}

export async function deleteRoleOrGroup(orgId, roleId, currentUserId) {
  const role = await queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!role) throw notFound('Role not found.');
  if (role.is_system) throw badRequest('System default roles cannot be deleted.');

  const members = await queryOne('SELECT COUNT(*) as count FROM users WHERE role_id = ?', [roleId]);
  if (members.count > 0) {
    throw badRequest(`Cannot delete role: ${members.count} active users are currently assigned to this role.`);
  }

  return transaction(async (cx) => {
    await cx.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    await cx.query('DELETE FROM roles WHERE id = ?', [roleId]);

    await writeAudit({
      orgId,
      userId: currentUserId,
      action: 'delete',
      entity: 'role',
      entityId: roleId,
      summary: `Deleted custom user group / role ${role.name} (${role.code})`,
    });

    return { ok: true, message: `Role ${role.name} has been deleted.` };
  });
}

export async function listAllPermissions() {
  const rows = await query('SELECT id, code, module, description FROM permissions ORDER BY module, code');
  const modules = {};
  for (const p of rows) {
    if (!modules[p.module]) modules[p.module] = [];
    modules[p.module].push(p);
  }
  return { rows, modules };
}

// --- Entity / Organization Setup ---------------------------------------------

export async function getOrganizationDetails(orgId) {
  const org = await queryOne(
    `SELECT id, code, name, legal_name, org_type, country_code,
            functional_currency, presentation_currency, reporting_tier,
            frameworks, tax_id, vat_number, address, city, phone, email,
            logo_path, retention_years, is_active, created_at
       FROM organizations WHERE id = ?`,
    [orgId]
  );
  if (!org) throw notFound('Organization not found.');
  return org;
}

export async function updateOrganizationDetails(orgId, data, currentUserId) {
  const name = data.name;
  const legal_name = data.legalName ?? data.legal_name;
  const code = data.code;
  const org_type = data.orgType ?? data.org_type;
  const country_code = data.country ?? data.countryCode ?? data.country_code;
  const functional_currency = data.currency ?? data.functionalCurrency ?? data.functional_currency;
  const presentation_currency = data.presentationCurrency ?? data.presentation_currency;
  const reporting_tier = data.reportingTier ?? data.reporting_tier;
  const frameworks = data.frameworks;
  const tax_id = data.taxId ?? data.tax_id;
  const vat_number = data.vatNumber ?? data.vat_number;
  const address = data.address;
  const city = data.city;
  const phone = data.phone;
  const email = data.email;
  const retention_years = data.retentionYears ?? data.retention_years;

  await query(
    `UPDATE organizations
        SET name = COALESCE(?, name),
            legal_name = COALESCE(?, legal_name),
            code = COALESCE(?, code),
            org_type = COALESCE(?, org_type),
            country_code = COALESCE(?, country_code),
            functional_currency = COALESCE(?, functional_currency),
            presentation_currency = COALESCE(?, presentation_currency),
            reporting_tier = COALESCE(?, reporting_tier),
            frameworks = COALESCE(?, frameworks),
            tax_id = COALESCE(?, tax_id),
            vat_number = COALESCE(?, vat_number),
            address = COALESCE(?, address),
            city = COALESCE(?, city),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            retention_years = COALESCE(?, retention_years)
      WHERE id = ?`,
    [
      name ? name.trim() : null,
      legal_name ? legal_name.trim() : null,
      code ? code.trim() : null,
      org_type || null,
      country_code || null,
      functional_currency || null,
      presentation_currency || null,
      reporting_tier || null,
      frameworks || null,
      tax_id ? tax_id.trim() : null,
      vat_number ? vat_number.trim() : null,
      address ? address.trim() : null,
      city ? city.trim() : null,
      phone ? phone.trim() : null,
      email ? email.trim() : null,
      retention_years ? Number(retention_years) : null,
      orgId,
    ]
  );

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: 'update',
    entity: 'organization',
    entityId: orgId,
    summary: `Updated entity legal and fiscal parameters for ${name || 'organisation'}`,
  });

  return getOrganizationDetails(orgId);
}

// --- VAT, TVA & Tax Parameters ----------------------------------------------

export async function listTaxParameters(orgId) {
  const rows = await query(
    `SELECT t.*,
            ai.code AS input_account_code, ai.name AS input_account_name,
            ao.code AS output_account_code, ao.name AS output_account_name
       FROM tax_codes t
       LEFT JOIN accounts ai ON ai.id = t.input_account_id
       LEFT JOIN accounts ao ON ao.id = t.output_account_id
      WHERE t.org_id = ?
      ORDER BY t.tax_type, t.code`,
    [orgId]
  );
  return {
    rows: rows.map(r => ({
      ...r,
      rate: Number(r.rate),
      is_recoverable: Boolean(r.is_recoverable),
      is_active: Boolean(r.is_active),
    })),
    total: rows.length,
  };
}

export async function createTaxParameter(orgId, data, currentUserId) {
  const code = data.code;
  const name = data.name;
  const tax_type = data.taxType ?? data.tax_type;
  const rate = data.rate;
  const is_recoverable = data.isRecoverable ?? data.is_recoverable ?? false;
  const input_account_id = data.inputAccountId ?? data.input_account_id ?? null;
  const output_account_id = data.outputAccountId ?? data.output_account_id ?? null;
  const applies_to = data.appliesTo ?? data.applies_to ?? 'both';
  const exemption_reason = data.exemptionReason ?? data.exemption_reason ?? null;
  const declaration_box = data.declarationBox ?? data.declaration_box ?? null;

  const res = await query(
    `INSERT INTO tax_codes
      (org_id, code, name, tax_type, rate, is_recoverable, input_account_id,
       output_account_id, applies_to, exemption_reason, declaration_box, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      orgId,
      code.trim(),
      name.trim(),
      tax_type,
      Number(rate) || 0,
      is_recoverable ? 1 : 0,
      input_account_id || null,
      output_account_id || null,
      applies_to,
      exemption_reason,
      declaration_box,
    ]
  );

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: 'create',
    entity: 'tax_code',
    entityId: res.insertId,
    summary: `Created tax / VAT code ${code} (${name}) at ${rate}%`,
  });

  return listTaxParameters(orgId);
}

export async function updateTaxParameter(orgId, id, data, currentUserId) {
  const name = data.name;
  const rate = data.rate;
  const is_recoverable = data.isRecoverable ?? data.is_recoverable;
  const input_account_id = data.inputAccountId ?? data.input_account_id;
  const output_account_id = data.outputAccountId ?? data.output_account_id;
  const applies_to = data.appliesTo ?? data.applies_to;
  const exemption_reason = data.exemptionReason ?? data.exemption_reason;
  const declaration_box = data.declarationBox ?? data.declaration_box;
  const is_active = data.isActive ?? data.is_active;

  await query(
    `UPDATE tax_codes
        SET name = COALESCE(?, name),
            rate = COALESCE(?, rate),
            is_recoverable = COALESCE(?, is_recoverable),
            input_account_id = ?,
            output_account_id = ?,
            applies_to = COALESCE(?, applies_to),
            exemption_reason = ?,
            declaration_box = ?,
            is_active = COALESCE(?, is_active)
      WHERE id = ? AND org_id = ?`,
    [
      name ? name.trim() : null,
      rate !== undefined ? Number(rate) : null,
      is_recoverable !== undefined ? (is_recoverable ? 1 : 0) : null,
      input_account_id !== undefined ? (input_account_id || null) : undefined,
      output_account_id !== undefined ? (output_account_id || null) : undefined,
      applies_to || null,
      exemption_reason !== undefined ? exemption_reason : undefined,
      declaration_box !== undefined ? declaration_box : undefined,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id,
      orgId,
    ]
  );

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: 'update',
    entity: 'tax_code',
    entityId: id,
    summary: `Updated tax / VAT parameter ID ${id}`,
  });

  return listTaxParameters(orgId);
}

export async function toggleTaxParameter(orgId, id, currentUserId) {
  const row = await queryOne('SELECT id, code, is_active FROM tax_codes WHERE id = ? AND org_id = ?', [id, orgId]);
  if (!row) throw notFound('Tax code not found.');

  const newStatus = row.is_active ? 0 : 1;
  await query('UPDATE tax_codes SET is_active = ? WHERE id = ?', [newStatus, id]);

  await writeAudit({
    orgId,
    userId: currentUserId,
    action: newStatus ? 'activate' : 'deactivate',
    entity: 'tax_code',
    entityId: id,
    summary: `${newStatus ? 'Activated' : 'Deactivated'} tax code ${row.code}`,
  });

  return { ok: true, is_active: Boolean(newStatus) };
}
