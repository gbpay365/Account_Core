/**
 * Apply errand / shopping-list schema, permissions and demo jobs on a live
 * organisation without resetting the ledger.
 */
import { query, queryOne, transaction, pool } from '../src/db/pool.js';
import { PERMISSIONS, ROLES } from '../src/db/seed/data/rbac.js';
import { seedServices } from '../src/db/seed/demo.js';

const SERVICE_PERMS = PERMISSIONS.filter(([, module]) => module === 'services');

for (const [code, module, description] of SERVICE_PERMS) {
  await query(
    'INSERT INTO permissions (code, module, description) VALUES (?,?,?) '
      + 'ON DUPLICATE KEY UPDATE module=VALUES(module), description=VALUES(description)',
    [code, module, description]
  );
}

const permRows = await query('SELECT id, code FROM permissions');
const permId = new Map(permRows.map((r) => [r.code, r.id]));

const roleCodes = ['system_admin', 'cfo', 'asset_manager', 'general_services_technician', 'ward_head'];
for (const code of roleCodes) {
  const role = ROLES.find((r) => r.code === code);
  const row = await queryOne('SELECT id FROM roles WHERE code = ?', [code]);
  if (!role || !row) continue;
  for (const p of role.permissions) {
    if (!permId.has(p)) continue;
    await query(
      'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)',
      [row.id, permId.get(p)]
    );
  }
}

const gst = ROLES.find((r) => r.code === 'general_services_technician');
const gstRow = await queryOne('SELECT id FROM roles WHERE code = ?', [gst.code]);
if (gstRow) {
  await query('DELETE FROM role_permissions WHERE role_id = ?', [gstRow.id]);
  for (const p of gst.permissions) {
    if (permId.has(p)) {
      await query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?,?)', [gstRow.id, permId.get(p)]);
    }
  }
}

const org = await queryOne('SELECT id FROM organizations ORDER BY id LIMIT 1');
for (const [name, prefix, padding] of [['errand', 'ER-', 4], ['shopping_list', 'SL-', 4]]) {
  await query(
    `INSERT INTO sequences (org_id, name, prefix, padding, next_value, include_year, reset_yearly)
     VALUES (?,?,?,?,1,1,1)
     ON DUPLICATE KEY UPDATE prefix = VALUES(prefix), padding = VALUES(padding)`,
    [org.id, name, prefix, padding]
  );
}

const existing = await queryOne('SELECT COUNT(*) AS n FROM errands WHERE org_id = ?', [org.id]);
if (Number(existing.n) === 0) {
  const users = await query('SELECT id, email FROM users WHERE org_id = ?', [org.id]);
  const userId = new Map(users.map((u) => [u.email, u.id]));
  const centers = await query('SELECT id, code FROM cost_centers WHERE org_id = ?', [org.id]);
  const ccId = new Map(centers.map((c) => [c.code, c.id]));
  await transaction((tx) => seedServices(tx, org.id, {
    userId, ccId, log: (msg) => console.log(`[services] ${msg}`),
  }));
} else {
  console.log(`[services] ${existing.n} errand(s) already present — seed skipped`);
}

const derick = await queryOne(
  `SELECT u.email, r.code AS role_code, COUNT(rp.permission_id) AS perms
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
    WHERE u.email = 'derick.nji@hgy.cm'
    GROUP BY u.id`
);
const counts = await queryOne(
  `SELECT (SELECT COUNT(*) FROM errands WHERE org_id = ?) AS errands,
          (SELECT COUNT(*) FROM shopping_lists WHERE org_id = ?) AS lists,
          (SELECT COUNT(*) FROM shopping_list_items i
             JOIN shopping_lists l ON l.id = i.list_id WHERE l.org_id = ?) AS items`,
  [org.id, org.id, org.id]
);
console.log(JSON.stringify({ derick, counts }, null, 2));
await pool.end();
