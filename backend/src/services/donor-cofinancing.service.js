import { money } from '../utils/money.js';

/**
 * Multi-Donor Co-Financing & Convention Proration Service (TOMPRO & World Bank Standards)
 * Handles multi-donor keys, percentage proration, automated expenditure splitting,
 * and donor convention ceiling verification.
 */

export async function listCofinancingKeys(db, orgId) {
  const keys = await db.query(
    `SELECT k.*,
            (SELECT COUNT(*) FROM donor_cofinancing_key_lines WHERE key_id = k.id) AS lines_count,
            (SELECT COALESCE(SUM(split_amount), 0) FROM donor_cofinancing_splits WHERE key_id = k.id) AS total_split_amount
       FROM donor_cofinancing_keys k
      WHERE k.org_id = ?
   ORDER BY k.id ASC`,
    [orgId]
  );

  const lines = await db.query(
    `SELECT kl.*, dp.project_code, dp.project_name, dp.donor_name, dp.currency AS donor_currency,
            cat.category_code, cat.name AS category_name
       FROM donor_cofinancing_key_lines kl
       JOIN donor_cofinancing_keys k ON k.id = kl.key_id
       JOIN donor_projects dp ON dp.id = kl.project_id
  LEFT JOIN donor_expense_categories cat ON cat.id = kl.category_id
      WHERE k.org_id = ?
   ORDER BY kl.percentage DESC`,
    [orgId]
  );

  const linesByKey = new Map();
  for (const l of lines) {
    if (!linesByKey.has(l.key_id)) {
      linesByKey.set(l.key_id, []);
    }
    linesByKey.get(l.key_id).push({
      id: l.id,
      project_id: l.project_id,
      project_code: l.project_code,
      project_name: l.project_name,
      donor_name: l.donor_name,
      donor_currency: l.donor_currency,
      category_id: l.category_id,
      category_code: l.category_code,
      category_name: l.category_name,
      percentage: Number(l.percentage),
      notes: l.notes,
    });
  }

  return keys.map(k => ({
    ...k,
    lines: linesByKey.get(k.id) || [],
  }));
}

export async function getCofinancingKeyById(db, orgId, keyId) {
  const key = await db.queryOne(
    `SELECT * FROM donor_cofinancing_keys WHERE id = ? AND org_id = ?`,
    [keyId, orgId]
  );
  if (!key) return null;

  const lines = await db.query(
    `SELECT kl.*, dp.project_code, dp.project_name, dp.donor_name, dp.currency AS donor_currency,
            cat.category_code, cat.name AS category_name
       FROM donor_cofinancing_key_lines kl
       JOIN donor_projects dp ON dp.id = kl.project_id
  LEFT JOIN donor_expense_categories cat ON cat.id = kl.category_id
      WHERE kl.key_id = ?
   ORDER BY kl.percentage DESC`,
    [keyId]
  );

  return {
    ...key,
    lines: lines.map(l => ({
      id: l.id,
      project_id: l.project_id,
      project_code: l.project_code,
      project_name: l.project_name,
      donor_name: l.donor_name,
      donor_currency: l.donor_currency,
      category_id: l.category_id,
      category_code: l.category_code,
      category_name: l.category_name,
      percentage: Number(l.percentage),
      notes: l.notes,
    })),
  };
}

export async function createCofinancingKey(db, orgId, data) {
  const { code, name, description = null, lines = [] } = data;

  if (!code || !name) {
    throw new Error('Code et intitulé de la clé de co-financement obligatoires.');
  }

  if (!lines || lines.length === 0) {
    throw new Error('Au moins un bailleur/projet doit être rattaché à la clé de co-financement.');
  }

  const totalPct = lines.reduce((acc, l) => acc + Number(l.percentage || 0), 0);
  if (Math.abs(totalPct - 100.0) > 0.01) {
    throw new Error(`La somme des quotes-parts des bailleurs doit être exactement égale à 100% (Actuel : ${totalPct.toFixed(2)}%).`);
  }

  const res = await db.query(
    `INSERT INTO donor_cofinancing_keys (org_id, code, name, description, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [orgId, code.trim().toUpperCase(), name.trim(), description]
  );
  const keyId = res.insertId;

  for (const l of lines) {
    await db.query(
      `INSERT INTO donor_cofinancing_key_lines (key_id, project_id, category_id, percentage, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [keyId, Number(l.project_id), l.category_id ? Number(l.category_id) : null, Number(l.percentage), l.notes || null]
    );
  }

  return getCofinancingKeyById(db, orgId, keyId);
}

export async function updateCofinancingKey(db, orgId, keyId, data) {
  const key = await getCofinancingKeyById(db, orgId, keyId);
  if (!key) {
    throw new Error('Clé de co-financement introuvable.');
  }

  const { name = key.name, description = key.description, is_active = key.is_active, lines = null } = data;

  await db.query(
    `UPDATE donor_cofinancing_keys
        SET name = ?, description = ?, is_active = ?
      WHERE id = ? AND org_id = ?`,
    [name, description, is_active ? 1 : 0, keyId, orgId]
  );

  if (Array.isArray(lines) && lines.length > 0) {
    const totalPct = lines.reduce((acc, l) => acc + Number(l.percentage || 0), 0);
    if (Math.abs(totalPct - 100.0) > 0.01) {
      throw new Error(`La somme des quotes-parts des bailleurs doit être exactement égale à 100% (Actuel : ${totalPct.toFixed(2)}%).`);
    }

    await db.query(`DELETE FROM donor_cofinancing_key_lines WHERE key_id = ?`, [keyId]);
    for (const l of lines) {
      await db.query(
        `INSERT INTO donor_cofinancing_key_lines (key_id, project_id, category_id, percentage, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [keyId, Number(l.project_id), l.category_id ? Number(l.category_id) : null, Number(l.percentage), l.notes || null]
      );
    }
  }

  return getCofinancingKeyById(db, orgId, keyId);
}

export async function simulateCofinancingSplit(db, orgId, { keyId, amount, currency = 'XAF' }) {
  const key = await getCofinancingKeyById(db, orgId, keyId);
  if (!key) {
    throw new Error('Clé de co-financement introuvable.');
  }

  const totalAmount = Number(amount);
  if (isNaN(totalAmount) || totalAmount <= 0) {
    throw new Error('Le montant à répartir doit être strictement positif.');
  }

  let remaining = totalAmount;
  const breakdown = [];

  for (let i = 0; i < key.lines.length; i++) {
    const l = key.lines[i];
    let splitAmt;
    if (i === key.lines.length - 1) {
      splitAmt = money(remaining);
    } else {
      splitAmt = money(Math.round((totalAmount * (l.percentage / 100)) * 100) / 100);
      remaining -= splitAmt;
    }

    breakdown.push({
      project_id: l.project_id,
      project_code: l.project_code,
      project_name: l.project_name,
      donor_name: l.donor_name,
      donor_currency: l.donor_currency,
      category_id: l.category_id,
      category_code: l.category_code,
      category_name: l.category_name,
      percentage: l.percentage,
      split_amount: splitAmt,
      currency,
    });
  }

  return {
    key_id: key.id,
    key_code: key.code,
    key_name: key.name,
    total_amount: totalAmount,
    currency,
    breakdown,
  };
}

export async function executeCofinancingSplit(db, orgId, userId, payload) {
  const {
    keyId,
    sourceAmount,
    currency = 'XAF',
    commitmentId = null,
    paymentOrderId = null,
    voucherRef = null,
    stage = 'commitment',
    notes = null,
  } = payload;

  const sim = await simulateCofinancingSplit(db, orgId, { keyId, amount: sourceAmount, currency });

  const insertedIds = [];
  for (const b of sim.breakdown) {
    const res = await db.query(
      `INSERT INTO donor_cofinancing_splits
        (org_id, key_id, project_id, category_id, commitment_id, payment_order_id, voucher_ref,
         total_source_amount, split_percentage, split_amount, currency, stage, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        keyId,
        b.project_id,
        b.category_id,
        commitmentId,
        paymentOrderId,
        voucherRef,
        sim.total_amount,
        b.percentage,
        b.split_amount,
        currency,
        stage,
        notes,
      ]
    );
    insertedIds.push(res.insertId);
  }

  if (commitmentId) {
    await db.query(
      `UPDATE budget_commitments SET cofinancing_key_id = ? WHERE id = ? AND org_id = ?`,
      [keyId, commitmentId, orgId]
    );
  }

  return {
    key_id: keyId,
    key_code: sim.key_code,
    key_name: sim.key_name,
    total_amount: sim.total_amount,
    currency,
    splits_count: insertedIds.length,
    splits: sim.breakdown,
  };
}

export async function listCofinancingSplits(db, orgId, filters = {}) {
  const { keyId = null, projectId = null, commitmentId = null, paymentOrderId = null, stage = null } = filters;
  const params = [orgId];
  let where = ' WHERE s.org_id = ?';

  if (keyId) {
    where += ' AND s.key_id = ?';
    params.push(keyId);
  }
  if (projectId) {
    where += ' AND s.project_id = ?';
    params.push(projectId);
  }
  if (commitmentId) {
    where += ' AND s.commitment_id = ?';
    params.push(commitmentId);
  }
  if (paymentOrderId) {
    where += ' AND s.payment_order_id = ?';
    params.push(paymentOrderId);
  }
  if (stage) {
    where += ' AND s.stage = ?';
    params.push(stage);
  }

  return db.query(
    `SELECT s.*, k.code AS key_code, k.name AS key_name,
            dp.project_code, dp.project_name, dp.donor_name,
            cat.category_code, cat.name AS category_name,
            bc.commitment_number, bc.description AS commitment_desc
       FROM donor_cofinancing_splits s
       JOIN donor_cofinancing_keys k ON k.id = s.key_id
       JOIN donor_projects dp ON dp.id = s.project_id
  LEFT JOIN donor_expense_categories cat ON cat.id = s.category_id
  LEFT JOIN budget_commitments bc ON bc.id = s.commitment_id
     ${where}
   ORDER BY s.id DESC`,
    params
  );
}

export async function getCofinancingStats(db, orgId) {
  const totalKeys = await db.queryOne(
    `SELECT COUNT(*) AS total_keys FROM donor_cofinancing_keys WHERE org_id = ? AND is_active = 1`,
    [orgId]
  );

  const splitTotals = await db.queryOne(
    `SELECT COALESCE(SUM(split_amount), 0) AS total_cofinanced,
            COUNT(DISTINCT commitment_id) AS total_commitments_cofinanced,
            COUNT(DISTINCT payment_order_id) AS total_mandats_cofinanced
       FROM donor_cofinancing_splits
      WHERE org_id = ?`,
    [orgId]
  );

  const byDonor = await db.query(
    `SELECT dp.donor_name, dp.project_code, COALESCE(SUM(s.split_amount), 0) AS allocated_amount
       FROM donor_cofinancing_splits s
       JOIN donor_projects dp ON dp.id = s.project_id
      WHERE s.org_id = ?
      GROUP BY dp.id
      ORDER BY allocated_amount DESC`,
    [orgId]
  );

  return {
    total_active_keys: totalKeys ? totalKeys.total_keys : 0,
    total_cofinanced_amount: Number(splitTotals ? splitTotals.total_cofinanced : 0),
    total_commitments_cofinanced: totalKeys ? splitTotals.total_commitments_cofinanced : 0,
    total_mandats_cofinanced: totalKeys ? splitTotals.total_mandats_cofinanced : 0,
    by_donor: byDonor,
  };
}
