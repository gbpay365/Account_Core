import { money } from '../utils/money.js';

// -----------------------------------------------------------------------------
// Payment Orders & Ordonnancement Service (TOMPRO & Public Expenditure Standards)
// -----------------------------------------------------------------------------

export async function listPaymentOrders(db, orgId, filters = {}) {
  const {
    budgetId = null,
    budgetLineId = null,
    commitmentId = null,
    status = null,
    visaStatus = null,
    search = null,
  } = filters;

  const params = [orgId];
  let whereClause = ' WHERE bpo.org_id = ?';

  if (budgetId) {
    whereClause += ' AND bpo.budget_id = ?';
    params.push(budgetId);
  }
  if (budgetLineId) {
    whereClause += ' AND bpo.budget_line_id = ?';
    params.push(budgetLineId);
  }
  if (commitmentId) {
    whereClause += ' AND bpo.commitment_id = ?';
    params.push(commitmentId);
  }
  if (status) {
    whereClause += ' AND bpo.status = ?';
    params.push(status);
  }
  if (visaStatus) {
    whereClause += ' AND bpo.visa_status = ?';
    params.push(visaStatus);
  }
  if (search) {
    whereClause += ' AND (bpo.mandat_number LIKE ? OR bpo.beneficiary_name LIKE ? OR bpo.invoice_number LIKE ? OR bpo.object_description LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  const sql = `
    SELECT bpo.*,
           b.code AS budget_code,
           b.name AS budget_name,
           bl.budget_type,
           a.code AS account_code,
           a.name AS account_name,
           cc.code AS cost_center_code,
           cc.name AS cost_center_name,
           fp.code AS program_code,
           fp.name AS program_name,
           bc.commitment_number,
           bc.amount AS commitment_amount,
           bc.certified_amount AS commitment_certified_amount,
           bc.mandated_amount AS commitment_mandated_amount,
           sc.certificate_number,
           sc.conformity_rating,
           s.code AS supplier_code,
           s.name AS supplier_official_name,
           ba.name AS bank_account_name,
           ba.bank_name,
           ba.account_number AS bank_account_number,
           uo.full_name AS ordered_by_name,
           uv.full_name AS visa_by_name,
           up.full_name AS paid_by_name
      FROM budget_payment_orders bpo
      JOIN budgets b ON b.id = bpo.budget_id
      JOIN budget_lines bl ON bl.id = bpo.budget_line_id
      JOIN accounts a ON a.id = bl.account_id
      JOIN cost_centers cc ON cc.id = bl.cost_center_id
      LEFT JOIN funding_programs fp ON fp.id = bl.program_id
      LEFT JOIN budget_commitments bc ON bc.id = bpo.commitment_id
      LEFT JOIN service_certifications sc ON sc.id = bpo.certification_id
      LEFT JOIN suppliers s ON s.id = bpo.supplier_id
      LEFT JOIN bank_accounts ba ON ba.id = bpo.bank_account_id
      LEFT JOIN users uo ON uo.id = bpo.ordered_by
      LEFT JOIN users uv ON uv.id = bpo.visa_by
      LEFT JOIN users up ON up.id = bpo.paid_by
      ${whereClause}
     ORDER BY bpo.mandat_date DESC, bpo.id DESC
  `;

  return db.query(sql, params);
}

export async function getPaymentOrderById(db, orgId, id) {
  const sql = `
    SELECT bpo.*,
           b.code AS budget_code,
           b.name AS budget_name,
           bl.budget_type,
           a.code AS account_code,
           a.name AS account_name,
           cc.code AS cost_center_code,
           cc.name AS cost_center_name,
           fp.code AS program_code,
           fp.name AS program_name,
           bc.commitment_number,
           bc.amount AS commitment_amount,
           bc.certified_amount AS commitment_certified_amount,
           bc.mandated_amount AS commitment_mandated_amount,
           sc.certificate_number,
           sc.conformity_rating,
           s.code AS supplier_code,
           s.name AS supplier_official_name,
           ba.name AS bank_account_name,
           ba.bank_name,
           ba.account_number AS bank_account_number,
           uo.full_name AS ordered_by_name,
           uv.full_name AS visa_by_name,
           up.full_name AS paid_by_name
      FROM budget_payment_orders bpo
      JOIN budgets b ON b.id = bpo.budget_id
      JOIN budget_lines bl ON bl.id = bpo.budget_line_id
      JOIN accounts a ON a.id = bl.account_id
      JOIN cost_centers cc ON cc.id = bl.cost_center_id
      LEFT JOIN funding_programs fp ON fp.id = bl.program_id
      LEFT JOIN budget_commitments bc ON bc.id = bpo.commitment_id
      LEFT JOIN service_certifications sc ON sc.id = bpo.certification_id
      LEFT JOIN suppliers s ON s.id = bpo.supplier_id
      LEFT JOIN bank_accounts ba ON ba.id = bpo.bank_account_id
      LEFT JOIN users uo ON uo.id = bpo.ordered_by
      LEFT JOIN users uv ON uv.id = bpo.visa_by
      LEFT JOIN users up ON up.id = bpo.paid_by
     WHERE bpo.id = ? AND bpo.org_id = ?
  `;

  const order = await db.queryOne(sql, [id, orgId]);
  if (!order) return null;

  const auditTrail = await db.query(
    `SELECT bpoa.*, u.full_name AS actor_user_name
       FROM budget_payment_order_audit bpoa
       LEFT JOIN users u ON u.id = bpoa.action_by
      WHERE bpoa.payment_order_id = ?
      ORDER BY bpoa.action_date ASC, bpoa.id ASC`,
    [id]
  );

  return {
    ...order,
    audit_trail: auditTrail || [],
  };
}

export async function createPaymentOrder(db, orgId, userId, payload) {
  const {
    budget_id,
    budget_line_id,
    commitment_id = null,
    certification_id = null,
    supplier_id = null,
    beneficiary_name,
    beneficiary_bank_details = null,
    invoice_number = null,
    invoice_date = null,
    gross_amount,
    tax_withholding_amount = 0,
    warranty_retention_amount = 0,
    penalty_amount = 0,
    currency = 'XAF',
    object_description,
    mandat_date = new Date().toISOString().slice(0, 10),
  } = payload;

  const gross = Number(gross_amount);
  if (!gross || gross <= 0) {
    throw new Error('Le montant brut du mandat doit être strictement supérieur à zéro.');
  }

  const taxWithholding = Number(tax_withholding_amount || 0);
  const warranty = Number(warranty_retention_amount || 0);
  const penalty = Number(penalty_amount || 0);

  const net = gross - taxWithholding - warranty - penalty;
  if (net < 0) {
    throw new Error('Le montant net ordonnancé ne peut pas être négatif (retenues supérieures au montant brut).');
  }

  // Verify budget line
  const line = await db.queryOne(
    `SELECT bl.*, b.org_id
       FROM budget_lines bl
       JOIN budgets b ON b.id = bl.budget_id
      WHERE bl.id = ? AND bl.budget_id = ? AND b.org_id = ?`,
    [budget_line_id, budget_id, orgId]
  );
  if (!line) {
    throw new Error('La ligne budgétaire spécifiée est introuvable ou n\'appartient pas au budget actif.');
  }

  // If commitment_id provided, verify available unmandated balance
  if (commitment_id) {
    const comm = await db.queryOne(
      `SELECT * FROM budget_commitments WHERE id = ? AND org_id = ?`,
      [commitment_id, orgId]
    );
    if (!comm) {
      throw new Error('Engagement ferme (BC) introuvable.');
    }
    if (comm.status !== 'approved' && comm.status !== 'converted') {
      throw new Error(`Impossible d'ordonnancer un engagement au statut "${comm.status}".`);
    }

    const commAmt = Number(comm.amount);
    const alreadyMandated = Number(comm.mandated_amount || 0);
    const remainingToMandate = commAmt - alreadyMandated;

    if (gross > remainingToMandate + 0.001) {
      throw new Error(
        `Dépassement d'ordonnancement: L'engagement ${comm.commitment_number} a un reliquat disponible de ${remainingToMandate.toLocaleString()} ${currency}, insuffisant pour ordonnancer ${gross.toLocaleString()} ${currency}.`
      );
    }
  }

  // If certification_id provided, verify certification
  if (certification_id) {
    const cert = await db.queryOne(
      `SELECT * FROM service_certifications WHERE id = ? AND org_id = ?`,
      [certification_id, orgId]
    );
    if (!cert) {
      throw new Error('Procès-Verbal de Réception / Certification introuvable.');
    }
    if (cert.status === 'rejected') {
      throw new Error('Impossible d\'ordonnancer sur un PV de réception rejeté / non conforme.');
    }
  }

  // Generate unique sequential mandat number MDT-YYYY-XXXX
  const currentYear = new Date().getFullYear();
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM budget_payment_orders WHERE org_id = ? AND YEAR(mandat_date) = ?`,
    [orgId, currentYear]
  );
  const nextSeq = Number(countRow?.total || 0) + 1;
  const mandatNumber = `MDT-${currentYear}-${String(nextSeq).padStart(4, '0')}`;

  const insertRes = await db.query(
    `INSERT INTO budget_payment_orders (
       org_id, mandat_number, mandat_date, budget_id, budget_line_id,
       commitment_id, certification_id, supplier_id, beneficiary_name,
       beneficiary_bank_details, invoice_number, invoice_date,
       gross_amount, tax_withholding_amount, warranty_retention_amount,
       penalty_amount, net_amount, currency, object_description,
       status, visa_status, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?)`,
    [
      orgId,
      mandatNumber,
      mandat_date,
      budget_id,
      budget_line_id,
      commitment_id,
      certification_id,
      supplier_id,
      beneficiary_name,
      beneficiary_bank_details,
      invoice_number,
      invoice_date,
      gross,
      taxWithholding,
      warranty,
      penalty,
      net,
      currency,
      object_description,
      userId,
    ]
  );

  const orderId = insertRes.insertId;

  // Log audit
  await db.query(
    `INSERT INTO budget_payment_order_audit (
       org_id, payment_order_id, previous_status, new_status,
       action_type, action_by, notes
     ) VALUES (?, ?, NULL, 'draft', 'created', ?, ?)`,
    [orgId, orderId, userId, `Mandat créé avec montant brut: ${gross} et net: ${net}`]
  );

  return getPaymentOrderById(db, orgId, orderId);
}

export async function submitPaymentOrder(db, orgId, userId, id, { notes = null } = {}) {
  const order = await db.queryOne(
    `SELECT * FROM budget_payment_orders WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!order) {
    throw new Error('Mandat de paiement introuvable.');
  }
  if (order.status !== 'draft' && order.status !== 'visa_rejected') {
    throw new Error(`Le mandat ne peut être soumis que depuis le statut brouillon ou rejeté (statut actuel: ${order.status}).`);
  }

  await db.query(
    `UPDATE budget_payment_orders
        SET status = 'submitted',
            ordered_by = ?,
            ordered_at = NOW(),
            visa_status = 'pending'
      WHERE id = ? AND org_id = ?`,
    [userId, id, orgId]
  );

  await db.query(
    `INSERT INTO budget_payment_order_audit (
       org_id, payment_order_id, previous_status, new_status,
       action_type, action_by, notes
     ) VALUES (?, ?, ?, 'submitted', 'submitted_for_visa', ?, ?)`,
    [orgId, id, order.status, userId, notes || 'Mandat soumis pour visa du Contrôleur Financier']
  );

  return getPaymentOrderById(db, orgId, id);
}

export async function reviewVisaPaymentOrder(db, orgId, userId, id, { visaStatus, visaNotes = null }) {
  if (!['approved', 'rejected'].includes(visaStatus)) {
    throw new Error('Le statut du visa doit être "approved" ou "rejected".');
  }

  const order = await db.queryOne(
    `SELECT * FROM budget_payment_orders WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!order) {
    throw new Error('Mandat de paiement introuvable.');
  }
  if (order.status !== 'submitted') {
    throw new Error(`Le visa ne peut être appliqué que sur un mandat soumis (statut actuel: ${order.status}).`);
  }

  if (visaStatus === 'approved') {
    // Update commitment mandated_amount if commitment linked
    if (order.commitment_id) {
      await db.query(
        `UPDATE budget_commitments
            SET mandated_amount = mandated_amount + ?
          WHERE id = ? AND org_id = ?`,
        [order.gross_amount, order.commitment_id, orgId]
      );
    }

    // If certification linked, verify if fully mandated to set liquidated
    if (order.certification_id) {
      const cert = await db.queryOne(
        `SELECT sc.*,
                (SELECT COALESCE(SUM(gross_amount), 0)
                   FROM budget_payment_orders
                  WHERE certification_id = sc.id AND status IN ('visa_approved', 'transmitted_treasury', 'paid')
                ) AS total_mandated
           FROM service_certifications sc
          WHERE sc.id = ? AND sc.org_id = ?`,
        [order.certification_id, orgId]
      );
      if (cert && Number(cert.total_mandated) + Number(order.gross_amount) >= Number(cert.certified_amount)) {
        await db.query(
          `UPDATE service_certifications SET status = 'liquidated' WHERE id = ? AND org_id = ?`,
          [order.certification_id, orgId]
        );
      }
    }

    await db.query(
      `UPDATE budget_payment_orders
          SET status = 'visa_approved',
              visa_status = 'approved',
              visa_by = ?,
              visa_date = NOW(),
              visa_notes = ?
        WHERE id = ? AND org_id = ?`,
      [userId, visaNotes, id, orgId]
    );

    await db.query(
      `INSERT INTO budget_payment_order_audit (
         org_id, payment_order_id, previous_status, new_status,
         action_type, action_by, notes
       ) VALUES (?, ?, 'submitted', 'visa_approved', 'visa_approved', ?, ?)`,
      [orgId, id, userId, visaNotes || 'Visa accordé par le Contrôleur Financier (Bon à payer)']
    );
  } else {
    // Rejected
    await db.query(
      `UPDATE budget_payment_orders
          SET status = 'visa_rejected',
              visa_status = 'rejected',
              visa_by = ?,
              visa_date = NOW(),
              visa_notes = ?
        WHERE id = ? AND org_id = ?`,
      [userId, visaNotes, id, orgId]
    );

    await db.query(
      `INSERT INTO budget_payment_order_audit (
         org_id, payment_order_id, previous_status, new_status,
         action_type, action_by, notes
       ) VALUES (?, ?, 'submitted', 'visa_rejected', 'visa_rejected', ?, ?)`,
      [orgId, id, userId, visaNotes || 'Visa refusé par le Contrôleur Financier']
    );
  }

  return getPaymentOrderById(db, orgId, id);
}

export async function transmitToTreasury(db, orgId, userId, id, { notes = null } = {}) {
  const order = await db.queryOne(
    `SELECT * FROM budget_payment_orders WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!order) {
    throw new Error('Mandat de paiement introuvable.');
  }
  if (order.status !== 'visa_approved') {
    throw new Error(`Seul un mandat visé et approuvé peut être transmis à la Trésorerie (statut actuel: ${order.status}).`);
  }

  await db.query(
    `UPDATE budget_payment_orders
        SET status = 'transmitted_treasury'
      WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );

  await db.query(
    `INSERT INTO budget_payment_order_audit (
       org_id, payment_order_id, previous_status, new_status,
       action_type, action_by, notes
     ) VALUES (?, ?, 'visa_approved', 'transmitted_treasury', 'transmitted_treasury', ?, ?)`,
    [orgId, id, userId, notes || 'Mandat transmis au Comptable Assignataire / Trésorerie pour règlement']
  );

  return getPaymentOrderById(db, orgId, id);
}

export async function disbursePaymentOrder(db, orgId, userId, id, payload) {
  const {
    paymentMethod = 'bank_transfer',
    bankAccountId = null,
    paymentReference = null,
    paidAmount = null,
    notes = null,
  } = payload;

  const order = await db.queryOne(
    `SELECT * FROM budget_payment_orders WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!order) {
    throw new Error('Mandat de paiement introuvable.');
  }
  if (!['visa_approved', 'transmitted_treasury'].includes(order.status)) {
    throw new Error(`Le règlement ne peut être exécuté que pour un mandat visé ou en trésorerie (statut actuel: ${order.status}).`);
  }

  const amountToDisburse = paidAmount !== null && paidAmount !== undefined ? Number(paidAmount) : Number(order.net_amount);
  if (amountToDisburse <= 0) {
    throw new Error('Le montant du règlement doit être supérieur à zéro.');
  }

  await db.query(
    `UPDATE budget_payment_orders
        SET status = 'paid',
            payment_method = ?,
            bank_account_id = ?,
            payment_reference = ?,
            paid_amount = ?,
            paid_at = NOW(),
            paid_by = ?
      WHERE id = ? AND org_id = ?`,
    [paymentMethod, bankAccountId, paymentReference, amountToDisburse, userId, id, orgId]
  );

  // Update underlying commitment paid amount
  if (order.commitment_id) {
    await db.query(
      `UPDATE budget_commitments
          SET paid_amount = paid_amount + ?
        WHERE id = ? AND org_id = ?`,
      [amountToDisburse, order.commitment_id, orgId]
    );

    // If fully mandated & paid, mark commitment liquidated
    const comm = await db.queryOne(
      `SELECT * FROM budget_commitments WHERE id = ? AND org_id = ?`,
      [order.commitment_id, orgId]
    );
    if (comm && Number(comm.mandated_amount) >= Number(comm.amount) - 0.01 && Number(comm.paid_amount) >= Number(comm.amount) - 0.01) {
      await db.query(
        `UPDATE budget_commitments
            SET status = 'liquidated',
                liquidated_at = NOW()
          WHERE id = ? AND org_id = ?`,
        [order.commitment_id, orgId]
      );
    }
  }

  await db.query(
    `INSERT INTO budget_payment_order_audit (
       org_id, payment_order_id, previous_status, new_status,
       action_type, action_by, notes
     ) VALUES (?, ?, ?, 'paid', 'disbursed_paid', ?, ?)`,
    [orgId, id, order.status, userId, notes || `Règlement émis: ${amountToDisburse} via ${paymentMethod} (Réf: ${paymentReference || 'N/A'})`]
  );

  return getPaymentOrderById(db, orgId, id);
}

export async function cancelPaymentOrder(db, orgId, userId, id, { reason = null } = {}) {
  const order = await db.queryOne(
    `SELECT * FROM budget_payment_orders WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!order) {
    throw new Error('Mandat de paiement introuvable.');
  }
  if (order.status === 'paid') {
    throw new Error('Impossible d\'annuler un mandat déjà décaissé et réglé.');
  }

  // If was visa_approved or transmitted_treasury, reverse commitment mandated_amount
  if (['visa_approved', 'transmitted_treasury'].includes(order.status) && order.commitment_id) {
    await db.query(
      `UPDATE budget_commitments
          SET mandated_amount = GREATEST(0, mandated_amount - ?)
        WHERE id = ? AND org_id = ?`,
      [order.gross_amount, order.commitment_id, orgId]
    );
  }

  await db.query(
    `UPDATE budget_payment_orders
        SET status = 'cancelled'
      WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );

  await db.query(
    `INSERT INTO budget_payment_order_audit (
       org_id, payment_order_id, previous_status, new_status,
       action_type, action_by, notes
     ) VALUES (?, ?, ?, 'cancelled', 'cancelled', ?, ?)`,
    [orgId, id, order.status, userId, reason || 'Mandat annulé']
  );

  return getPaymentOrderById(db, orgId, id);
}

export async function getPaymentOrderStats(db, orgId, { budgetId = null } = {}) {
  const params = [orgId];
  let filter = '';
  if (budgetId) {
    filter += ' AND budget_id = ?';
    params.push(budgetId);
  }

  const row = await db.queryOne(
    `SELECT COUNT(*) AS total_mandats,
            COALESCE(SUM(gross_amount), 0) AS total_gross_amount,
            COALESCE(SUM(net_amount), 0) AS total_net_amount,
            COALESCE(SUM(tax_withholding_amount), 0) AS total_tax_withholding,
            COALESCE(SUM(warranty_retention_amount), 0) AS total_warranty_retention,
            COALESCE(SUM(penalty_amount), 0) AS total_penalties,
            COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS count_draft,
            COALESCE(SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END), 0) AS count_submitted,
            COALESCE(SUM(CASE WHEN status = 'visa_approved' THEN 1 ELSE 0 END), 0) AS count_visa_approved,
            COALESCE(SUM(CASE WHEN status = 'transmitted_treasury' THEN 1 ELSE 0 END), 0) AS count_transmitted_treasury,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS count_paid,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END), 0) AS total_paid_amount
       FROM budget_payment_orders
      WHERE org_id = ? ${filter}`,
    params
  );

  return row || {
    total_mandats: 0,
    total_gross_amount: 0,
    total_net_amount: 0,
    total_tax_withholding: 0,
    total_warranty_retention: 0,
    total_penalties: 0,
    count_draft: 0,
    count_submitted: 0,
    count_visa_approved: 0,
    count_transmitted_treasury: 0,
    count_paid: 0,
    total_paid_amount: 0,
  };
}
