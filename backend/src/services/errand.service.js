import { toISO, today } from '../utils/dates.js';
import { ApiError } from '../utils/errors.js';
import { nextSequence } from './ledger.service.js';

const DEFAULT_KINDS = [
  ['purchase_run', "Course d'achat", 'Purchase run', 10],
  ['fleet', 'Parc / garage', 'Fleet / garage', 20],
  ['it_hardware', 'Matériel informatique', 'IT hardware', 30],
  ['electrical', 'Électricité', 'Electrical', 40],
  ['network', 'Câblage réseau', 'Network cabling', 50],
  ['general', 'Général', 'General', 60],
];
const ERRAND_OPEN = ['requested', 'assigned', 'in_progress'];
const SHOP_OPEN = ['open', 'shopping'];

const ERRAND_SELECT = `
  SELECT e.*,
         req.full_name AS requested_by_name,
         asg.full_name AS assigned_to_name,
         cc.code AS cost_center_code,
         cc.name AS cost_center_name,
         cc.name_en AS cost_center_name_en,
         sl.list_no AS shopping_list_no,
         sl.title AS shopping_list_title,
         sl.status AS shopping_list_status,
         k.name AS kind_name,
         k.name_en AS kind_name_en
    FROM errands e
    LEFT JOIN users req ON req.id = e.requested_by
    LEFT JOIN users asg ON asg.id = e.assigned_to
    LEFT JOIN cost_centers cc ON cc.id = e.cost_center_id
    LEFT JOIN shopping_lists sl ON sl.id = e.shopping_list_id
    LEFT JOIN errand_kinds k ON k.org_id = e.org_id AND k.code = e.kind
`;

const LIST_SELECT = `
  SELECT l.*,
         req.full_name AS requested_by_name,
         asg.full_name AS assigned_to_name,
         e.errand_no,
         e.status AS errand_status,
         e.title AS errand_title
    FROM shopping_lists l
    LEFT JOIN users req ON req.id = l.requested_by
    LEFT JOIN users asg ON asg.id = l.assigned_to
    LEFT JOIN errands e ON e.id = l.errand_id
`;

function decorateErrand(row) {
  if (!row) return row;
  const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
  return {
    ...row,
    is_open: ERRAND_OPEN.includes(row.status),
    is_past_due: Boolean(due && ERRAND_OPEN.includes(row.status) && due < today()),
  };
}

function decorateList(row) {
  if (!row) return row;
  const needed = row.needed_by ? String(row.needed_by).slice(0, 10) : null;
  return {
    ...row,
    is_open: SHOP_OPEN.includes(row.status),
    is_past_due: Boolean(needed && SHOP_OPEN.includes(row.status) && needed < today()),
  };
}

export async function getErrand(tx, orgId, id) {
  const row = await tx.queryOne(`${ERRAND_SELECT} WHERE e.org_id = ? AND e.id = ?`, [orgId, id]);
  return decorateErrand(row);
}

export async function getShoppingList(tx, orgId, id) {
  const row = await tx.queryOne(`${LIST_SELECT} WHERE l.org_id = ? AND l.id = ?`, [orgId, id]);
  if (!row) return null;
  const items = await tx.query(
    'SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY line_no, id',
    [id]
  );
  return { ...decorateList(row), items };
}

export async function listErrands(tx, orgId, q) {
  const params = [orgId];
  let filter = '';
  if (q.search) {
    filter += ' AND (e.errand_no LIKE ? OR e.title LIKE ? OR e.location_note LIKE ? OR e.vehicle_note LIKE ?)';
    const like = `%${q.search}%`;
    params.push(like, like, like, like);
  }
  if (q.status) {
    const statuses = String(q.status).split(',').map((s) => s.trim()).filter(Boolean);
    filter += ` AND e.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }
  if (q.kind) {
    filter += ' AND e.kind = ?';
    params.push(q.kind);
  }
  if (q.priority) {
    filter += ' AND e.priority = ?';
    params.push(q.priority);
  }
  if (q.assignedTo) {
    filter += ' AND e.assigned_to = ?';
    params.push(q.assignedTo);
  }
  if (q.mine && q.actorId) {
    filter += ' AND (e.assigned_to = ? OR e.requested_by = ?)';
    params.push(q.actorId, q.actorId);
  }
  if (q.openOnly) {
    filter += ` AND e.status IN (${ERRAND_OPEN.map(() => '?').join(',')})`;
    params.push(...ERRAND_OPEN);
  }
  if (q.pastDueOnly) {
    filter += ` AND e.due_date < ? AND e.status IN (${ERRAND_OPEN.map(() => '?').join(',')})`;
    params.push(today(), ...ERRAND_OPEN);
  }

  const { n: total } = await tx.queryOne(
    `SELECT COUNT(*) AS n FROM errands e WHERE e.org_id = ?${filter}`,
    params
  );
  const rows = await tx.query(
    `${ERRAND_SELECT} WHERE e.org_id = ?${filter}
      ORDER BY FIELD(e.priority,'urgent','high','normal','low'), e.due_date IS NULL, e.due_date, e.id DESC
      LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize]
  );
  return { rows: rows.map(decorateErrand), total: Number(total) };
}

export async function listShoppingLists(tx, orgId, q) {
  const params = [orgId];
  let filter = '';
  if (q.search) {
    filter += ' AND (l.list_no LIKE ? OR l.title LIKE ? OR l.destination LIKE ?)';
    const like = `%${q.search}%`;
    params.push(like, like, like);
  }
  if (q.status) {
    const statuses = String(q.status).split(',').map((s) => s.trim()).filter(Boolean);
    filter += ` AND l.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }
  if (q.assignedTo) {
    filter += ' AND l.assigned_to = ?';
    params.push(q.assignedTo);
  }
  if (q.mine && q.actorId) {
    filter += ' AND (l.assigned_to = ? OR l.requested_by = ?)';
    params.push(q.actorId, q.actorId);
  }
  if (q.openOnly) {
    filter += ` AND l.status IN (${SHOP_OPEN.map(() => '?').join(',')})`;
    params.push(...SHOP_OPEN);
  }

  const { n: total } = await tx.queryOne(
    `SELECT COUNT(*) AS n FROM shopping_lists l WHERE l.org_id = ?${filter}`,
    params
  );
  const rows = await tx.query(
    `${LIST_SELECT} WHERE l.org_id = ?${filter}
      ORDER BY l.needed_by IS NULL, l.needed_by, l.id DESC
      LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize]
  );

  const ids = rows.map((r) => r.id);
  let itemsByList = new Map();
  if (ids.length) {
    const items = await tx.query(
      `SELECT * FROM shopping_list_items WHERE list_id IN (${ids.map(() => '?').join(',')}) ORDER BY line_no, id`,
      ids
    );
    itemsByList = items.reduce((map, item) => {
      const list = map.get(item.list_id) || [];
      list.push(item);
      map.set(item.list_id, list);
      return map;
    }, new Map());
  }

  return {
    rows: rows.map((row) => {
      const items = itemsByList.get(row.id) || [];
      return {
        ...decorateList(row),
        item_count: items.length,
        needed_count: items.filter((i) => i.status === 'needed').length,
        bought_count: items.filter((i) => i.status === 'bought').length,
        items,
      };
    }),
    total: Number(total),
  };
}

function slugKind(name) {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return slug || 'kind';
}

export async function ensureDefaultKinds(tx, orgId) {
  for (const [code, name, nameEn, sort] of DEFAULT_KINDS) {
    await tx.query(
      `INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
       VALUES (?,?,?,?,1,?)`,
      [orgId, code, name, nameEn, sort]
    );
  }
}

export async function listErrandKinds(tx, orgId) {
  await ensureDefaultKinds(tx, orgId);
  return tx.query(
    `SELECT * FROM errand_kinds
      WHERE org_id = ? AND is_active = 1
      ORDER BY sort_order, name_en, name`,
    [orgId]
  );
}

export async function createErrandKind(tx, orgId, data) {
  const nameEn = String(data.nameEn || data.name || '').trim();
  const name = String(data.name || nameEn).trim();
  if (!nameEn) throw new ApiError(422, 'Give the kind a name.');

  const existing = await tx.queryOne(
    `SELECT * FROM errand_kinds
      WHERE org_id = ? AND is_active = 1
        AND (LOWER(name_en) = ? OR LOWER(name) = ?)`,
    [orgId, nameEn.toLowerCase(), name.toLowerCase()]
  );
  if (existing) return existing;

  let code = slugKind(nameEn);
  let suffix = 2;
  while (await tx.queryOne('SELECT id FROM errand_kinds WHERE org_id = ? AND code = ?', [orgId, code])) {
    code = `${slugKind(nameEn).slice(0, 36)}_${suffix}`;
    suffix += 1;
  }

  const { n } = await tx.queryOne(
    'SELECT COALESCE(MAX(sort_order), 90) AS n FROM errand_kinds WHERE org_id = ?',
    [orgId]
  );
  const res = await tx.query(
    `INSERT INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
     VALUES (?,?,?,?,0,?)`,
    [orgId, code, name, nameEn, Number(n) + 10]
  );
  return tx.queryOne('SELECT * FROM errand_kinds WHERE id = ?', [res.insertId]);
}

export async function createErrand(tx, orgId, data, actor = null) {
  if (!data.title?.trim()) throw new ApiError(422, 'Give the errand a title.');
  await ensureDefaultKinds(tx, orgId);
  const kind = data.kind || 'general';
  const known = await tx.queryOne(
    'SELECT code FROM errand_kinds WHERE org_id = ? AND code = ? AND is_active = 1',
    [orgId, kind]
  );
  if (!known) throw new ApiError(422, `Unknown errand kind "${kind}".`);

  let shoppingListId = data.shoppingListId ?? null;
  if (shoppingListId) {
    const list = await tx.queryOne(
      'SELECT id, status FROM shopping_lists WHERE id = ? AND org_id = ?',
      [shoppingListId, orgId]
    );
    if (!list) throw new ApiError(404, 'Shopping list not found.');
  }

  const assignedTo = data.assignedTo ?? null;
  const status = assignedTo ? 'assigned' : 'requested';
  const errandNo = await nextSequence(tx, orgId, 'errand', data.dueDate || today());

  const res = await tx.query(
    `INSERT INTO errands
       (org_id, errand_no, title, description, kind, priority, status, due_date,
        location_note, vehicle_note, cost_center_id, requested_by, assigned_to, shopping_list_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orgId, errandNo, data.title.trim(), data.description?.trim() || null,
      kind, data.priority || 'normal', status,
      data.dueDate ? toISO(data.dueDate) : null,
      data.locationNote?.trim() || null, data.vehicleNote?.trim() || null,
      data.costCenterId ?? null, actor?.id ?? null, assignedTo, shoppingListId,
    ]
  );

  if (shoppingListId) {
    await tx.query('UPDATE shopping_lists SET errand_id = ? WHERE id = ?', [res.insertId, shoppingListId]);
  }
  return getErrand(tx, orgId, res.insertId);
}

export async function transitionErrand(tx, orgId, id, action, data = {}, actor = null) {
  const errand = await tx.queryOne('SELECT * FROM errands WHERE id = ? AND org_id = ?', [id, orgId]);
  if (!errand) throw new ApiError(404, 'Errand not found.');

  const now = new Date();
  if (action === 'assign') {
    if (!['requested', 'assigned'].includes(errand.status)) {
      throw new ApiError(409, `An errand in status "${errand.status}" cannot be assigned.`);
    }
    if (!data.assignedTo) throw new ApiError(422, 'Choose the technician to assign.');
    await tx.query(
      'UPDATE errands SET assigned_to = ?, status = ? WHERE id = ?',
      [data.assignedTo, 'assigned', errand.id]
    );
  } else if (action === 'start') {
    if (!['requested', 'assigned'].includes(errand.status)) {
      throw new ApiError(409, `An errand in status "${errand.status}" cannot be started.`);
    }
    const assignee = errand.assigned_to || actor?.id || null;
    if (!assignee) throw new ApiError(422, 'Assign the errand before starting it.');
    await tx.query(
      'UPDATE errands SET assigned_to = ?, status = ? WHERE id = ?',
      [assignee, 'in_progress', errand.id]
    );
    if (errand.shopping_list_id) {
      await tx.query(
        "UPDATE shopping_lists SET status = 'shopping', assigned_to = COALESCE(assigned_to, ?) WHERE id = ? AND status = 'open'",
        [assignee, errand.shopping_list_id]
      );
    }
  } else if (action === 'complete') {
    if (!['assigned', 'in_progress'].includes(errand.status)) {
      throw new ApiError(409, `An errand in status "${errand.status}" cannot be completed.`);
    }
    await tx.query(
      'UPDATE errands SET status = ?, completed_at = ?, completion_note = ? WHERE id = ?',
      ['completed', now, data.completionNote?.trim() || null, errand.id]
    );
  } else if (action === 'cancel') {
    if (!ERRAND_OPEN.includes(errand.status)) {
      throw new ApiError(409, `An errand in status "${errand.status}" cannot be cancelled.`);
    }
    await tx.query(
      'UPDATE errands SET status = ?, completion_note = ? WHERE id = ?',
      ['cancelled', data.completionNote?.trim() || null, errand.id]
    );
  } else {
    throw new ApiError(422, `Unknown errand action "${action}".`);
  }

  return getErrand(tx, orgId, errand.id);
}

export async function createShoppingList(tx, orgId, data, actor = null) {
  if (!data.title?.trim()) throw new ApiError(422, 'Give the shopping list a title.');
  const listNo = await nextSequence(tx, orgId, 'shopping_list', data.neededBy || today());
  const res = await tx.query(
    `INSERT INTO shopping_lists
       (org_id, list_no, title, notes, status, needed_by, destination, requested_by, assigned_to)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      orgId, listNo, data.title.trim(), data.notes?.trim() || null, 'open',
      data.neededBy ? toISO(data.neededBy) : null,
      data.destination?.trim() || null, actor?.id ?? null, data.assignedTo ?? null,
    ]
  );
  const items = Array.isArray(data.items) ? data.items : [];
  for (const [idx, item] of items.entries()) {
    if (!item.description?.trim()) continue;
    await tx.query(
      `INSERT INTO shopping_list_items
         (list_id, line_no, description, quantity, unit, estimated_unit_cost, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        res.insertId, idx + 1, item.description.trim(),
        item.quantity ?? 1, item.unit?.trim() || 'ea',
        item.estimatedUnitCost ?? 0, item.notes?.trim() || null,
      ]
    );
  }
  return getShoppingList(tx, orgId, res.insertId);
}

export async function addShoppingItem(tx, orgId, listId, data) {
  const list = await tx.queryOne('SELECT * FROM shopping_lists WHERE id = ? AND org_id = ?', [listId, orgId]);
  if (!list) throw new ApiError(404, 'Shopping list not found.');
  if (!SHOP_OPEN.includes(list.status)) {
    throw new ApiError(409, 'Items can only be added to an open shopping list.');
  }
  if (!data.description?.trim()) throw new ApiError(422, 'Describe the item.');
  const { n } = await tx.queryOne(
    'SELECT COALESCE(MAX(line_no), 0) AS n FROM shopping_list_items WHERE list_id = ?',
    [listId]
  );
  await tx.query(
    `INSERT INTO shopping_list_items
       (list_id, line_no, description, quantity, unit, estimated_unit_cost, notes)
     VALUES (?,?,?,?,?,?,?)`,
    [
      listId, Number(n) + 1, data.description.trim(),
      data.quantity ?? 1, data.unit?.trim() || 'ea',
      data.estimatedUnitCost ?? 0, data.notes?.trim() || null,
    ]
  );
  return getShoppingList(tx, orgId, listId);
}

export async function updateShoppingItem(tx, orgId, listId, itemId, data) {
  const list = await tx.queryOne('SELECT * FROM shopping_lists WHERE id = ? AND org_id = ?', [listId, orgId]);
  if (!list) throw new ApiError(404, 'Shopping list not found.');
  const item = await tx.queryOne(
    'SELECT * FROM shopping_list_items WHERE id = ? AND list_id = ?',
    [itemId, listId]
  );
  if (!item) throw new ApiError(404, 'Shopping list item not found.');
  if (!SHOP_OPEN.includes(list.status)) {
    throw new ApiError(409, 'This shopping list is no longer open.');
  }

  const status = data.status ?? item.status;
  if (!['needed', 'bought', 'unavailable'].includes(status)) {
    throw new ApiError(422, `Unknown item status "${status}".`);
  }
  await tx.query(
    `UPDATE shopping_list_items
        SET status = ?, bought_qty = ?, actual_unit_cost = ?, vendor_note = ?, notes = COALESCE(?, notes)
      WHERE id = ?`,
    [
      status,
      data.boughtQty ?? (status === 'bought' ? item.quantity : item.bought_qty),
      data.actualUnitCost ?? item.actual_unit_cost,
      data.vendorNote !== undefined ? (data.vendorNote?.trim() || null) : item.vendor_note,
      data.notes !== undefined ? (data.notes?.trim() || null) : null,
      item.id,
    ]
  );
  return getShoppingList(tx, orgId, listId);
}

export async function transitionShoppingList(tx, orgId, id, action, data = {}, actor = null) {
  const list = await tx.queryOne('SELECT * FROM shopping_lists WHERE id = ? AND org_id = ?', [id, orgId]);
  if (!list) throw new ApiError(404, 'Shopping list not found.');

  if (action === 'start') {
    if (list.status !== 'open') throw new ApiError(409, 'Only an open list can be taken shopping.');
    await tx.query(
      'UPDATE shopping_lists SET status = ?, assigned_to = COALESCE(assigned_to, ?) WHERE id = ?',
      ['shopping', actor?.id ?? null, list.id]
    );
  } else if (action === 'receive') {
    if (list.status !== 'shopping') throw new ApiError(409, 'Mark the list as shopping before receiving it.');
    const leftover = await tx.queryOne(
      "SELECT COUNT(*) AS n FROM shopping_list_items WHERE list_id = ? AND status = 'needed'",
      [list.id]
    );
    if (Number(leftover.n) > 0 && !data.force) {
      throw new ApiError(422, 'Mark every line bought or unavailable before receiving the list.');
    }
    await tx.query("UPDATE shopping_lists SET status = 'received' WHERE id = ?", [list.id]);
    if (list.errand_id) {
      const errand = await tx.queryOne('SELECT id, status FROM errands WHERE id = ?', [list.errand_id]);
      if (errand && ['assigned', 'in_progress'].includes(errand.status)) {
        await tx.query(
          'UPDATE errands SET status = ?, completed_at = ?, completion_note = COALESCE(completion_note, ?) WHERE id = ?',
          ['completed', new Date(), 'Shopping list received.', errand.id]
        );
      }
    }
  } else if (action === 'cancel') {
    if (!SHOP_OPEN.includes(list.status)) {
      throw new ApiError(409, `A shopping list in status "${list.status}" cannot be cancelled.`);
    }
    await tx.query("UPDATE shopping_lists SET status = 'cancelled' WHERE id = ?", [list.id]);
  } else if (action === 'assign') {
    if (!SHOP_OPEN.includes(list.status)) {
      throw new ApiError(409, 'This shopping list is no longer open.');
    }
    if (!data.assignedTo) throw new ApiError(422, 'Choose the technician to assign.');
    await tx.query('UPDATE shopping_lists SET assigned_to = ? WHERE id = ?', [data.assignedTo, list.id]);
  } else {
    throw new ApiError(422, `Unknown shopping-list action "${action}".`);
  }
  return getShoppingList(tx, orgId, list.id);
}

export async function servicesOverview(tx, orgId) {
  const errands = await tx.queryOne(
    `SELECT
        SUM(status = 'requested') AS requested,
        SUM(status = 'assigned') AS assigned,
        SUM(status = 'in_progress') AS in_progress,
        SUM(status IN ('requested','assigned','in_progress') AND due_date < CURDATE()) AS past_due,
        SUM(status = 'completed') AS completed,
        COUNT(*) AS total
       FROM errands WHERE org_id = ?`,
    [orgId]
  );
  const lists = await tx.queryOne(
    `SELECT
        SUM(status = 'open') AS open_lists,
        SUM(status = 'shopping') AS shopping,
        SUM(status = 'received') AS received,
        COUNT(*) AS total
       FROM shopping_lists WHERE org_id = ?`,
    [orgId]
  );
  const items = await tx.queryOne(
    `SELECT
        SUM(i.status = 'needed') AS needed,
        SUM(i.status = 'bought') AS bought,
        SUM(i.status = 'unavailable') AS unavailable
       FROM shopping_list_items i
       JOIN shopping_lists l ON l.id = i.list_id
      WHERE l.org_id = ? AND l.status IN ('open','shopping')`,
    [orgId]
  );
  const technicians = await tx.query(
    `SELECT u.id, u.full_name, u.job_title,
            (SELECT COUNT(*) FROM errands e
              WHERE e.assigned_to = u.id AND e.status IN ('assigned','in_progress')) AS open_errands
       FROM users u
      WHERE u.org_id = ? AND u.is_active = 1 AND u.is_technician = 1
      ORDER BY u.full_name`,
    [orgId]
  );
  return { errands, lists, items, technicians };
}

export const openErrandStatuses = ERRAND_OPEN;
export const openShoppingStatuses = SHOP_OPEN;
