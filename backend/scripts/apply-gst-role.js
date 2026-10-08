/**
 * Add the General Services Technician role and Derick Nji to a live organisation
 * without resetting the ledger.
 */
import bcrypt from 'bcryptjs';
import { query, queryOne, pool } from '../src/db/pool.js';
import { ROLES } from '../src/db/seed/data/rbac.js';
import { DEMO_PASSWORD } from '../src/db/seed/demo.js';

const role = ROLES.find((r) => r.code === 'general_services_technician');
if (!role) {
  console.error('general_services_technician is missing from rbac.js');
  process.exit(1);
}

await query(
  `INSERT INTO roles (code, name, name_en, description) VALUES (?,?,?,?)
   ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en), description = VALUES(description)`,
  [role.code, role.name, role.name_en, role.description]
);
const { id: roleId } = await queryOne('SELECT id FROM roles WHERE code = ?', [role.code]);
await query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
const perms = await query(
  `SELECT id, code FROM permissions WHERE code IN (${role.permissions.map(() => '?').join(',')})`,
  role.permissions
);
for (const p of perms) {
  await query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?,?)', [roleId, p.id]);
}

const org = await queryOne('SELECT id FROM organizations ORDER BY id LIMIT 1');
const tech = await queryOne(
  "SELECT id FROM cost_centers WHERE org_id = ? AND code = 'TECH'",
  [org.id]
);
const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
const existing = await queryOne(
  'SELECT id FROM users WHERE org_id = ? AND email = ?',
  [org.id, 'derick.nji@hgy.cm']
);
if (existing) {
  await query(
    `UPDATE users
        SET full_name = ?, job_title = ?, role_id = ?, cost_center_id = ?,
            is_technician = 1, hourly_rate = ?, is_active = 1
      WHERE id = ?`,
    ['Derick Nji', 'General Services Technician', roleId, tech?.id ?? null, 3800, existing.id]
  );
} else {
  await query(
    `INSERT INTO users (org_id, email, password_hash, full_name, job_title, role_id, cost_center_id, locale, is_technician, hourly_rate)
     VALUES (?,?,?,?,?,?,?,'en',1,?)`,
    [org.id, 'derick.nji@hgy.cm', hash, 'Derick Nji', 'General Services Technician', roleId, tech?.id ?? null, 3800]
  );
}

const user = await queryOne(
  `SELECT u.email, u.full_name, r.code AS role_code, COUNT(rp.permission_id) AS perms
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
    WHERE u.email = 'derick.nji@hgy.cm'
    GROUP BY u.id`
);
console.log(JSON.stringify({ roleId, user }, null, 2));
await pool.end();
