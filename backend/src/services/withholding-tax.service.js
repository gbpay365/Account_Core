import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { toISO } from '../utils/dates.js';
import { money } from '../utils/money.js';
import { createJournalEntry, nextSequence } from './ledger.service.js';

/**
 * CEMAC Withholding Tax (WHT, Précompte & TSR) Engine.
 * Compliant with CEMAC Directives and Cameroon General Tax Code (CGI).
 */

export function computeTaxSplit({
  grossAmount,
  hasTva = true,
  tvaRate = 19.25,
  precompteRate = 2.2,
  tsrRate = 0.0,
}) {
  const gross = Number(grossAmount || 0);
  const tva = hasTva ? money(gross * (Number(tvaRate) / 100)) : 0;
  const tvaWithheld = hasTva ? tva : 0; // 100% TVA withholding for designated entities
  const precompte = money(gross * (Number(precompteRate) / 100));
  const tsr = Number(tsrRate) > 0 ? money(gross * (Number(tsrRate) / 100)) : 0;
  const totalWithheld = tvaWithheld + precompte + tsr;
  const netPayable = money(gross - precompte - tsr);

  return {
    grossAmount: gross,
    hasTva: Boolean(hasTva),
    tvaRate: Number(tvaRate),
    tvaAmount: tva,
    tvaWithheldAmount: tvaWithheld,
    precompteRate: Number(precompteRate),
    precompteAmount: precompte,
    tsrRate: Number(tsrRate),
    tsrAmount: tsr,
    totalWithheldAmount: totalWithheld,
    netPayableAmount: netPayable,
  };
}

/**
 * List all issued withholding tax certificates.
 */
export async function listCertificates(orgId, filters = {}) {
  const { period, supplierId, status } = filters;
  const params = [orgId];
  let sql = `
    SELECT wc.*,
           s.name AS supplier_name,
           s.tax_id AS supplier_niu,
           s.tax_regime AS supplier_regime,
           je.entry_no
      FROM withholding_certificates wc
      JOIN suppliers s ON s.id = wc.supplier_id
 LEFT JOIN journal_entries je ON je.id = wc.entry_id
     WHERE wc.org_id = ?
  `;

  if (period) {
    sql += ` AND wc.tax_period = ?`;
    params.push(period);
  }
  if (supplierId) {
    sql += ` AND wc.supplier_id = ?`;
    params.push(supplierId);
  }
  if (status) {
    sql += ` AND wc.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY wc.certificate_date DESC, wc.id DESC`;

  const rows = await query(sql, params);
  return rows.map(r => ({
    ...r,
    gross_amount: Number(r.gross_amount),
    tva_amount: Number(r.tva_amount),
    tva_withheld_amount: Number(r.tva_withheld_amount),
    precompte_amount: Number(r.precompte_amount),
    tsr_amount: Number(r.tsr_amount),
    total_withheld_amount: Number(r.total_withheld_amount),
    net_payable_amount: Number(r.net_payable_amount),
  }));
}

/**
 * Get detailed certificate data for official printout.
 */
export async function getCertificate(orgId, certId) {
  const cert = await queryOne(
    `SELECT wc.*,
            s.name AS supplier_name,
            s.tax_id AS supplier_niu,
            s.tax_regime AS supplier_regime,
            s.address AS supplier_address,
            s.country_code AS supplier_country,
            s.phone AS supplier_phone,
            s.email AS supplier_email,
            o.name AS org_name,
            o.legal_name AS org_legal_name,
            o.tax_id AS org_niu,
            o.vat_number AS org_rccm,
            o.address AS org_address,
            o.city AS org_city,
            o.country_code AS org_country,
            je.entry_no,
            je.entry_date
       FROM withholding_certificates wc
       JOIN suppliers s ON s.id = wc.supplier_id
       JOIN organizations o ON o.id = wc.org_id
  LEFT JOIN journal_entries je ON je.id = wc.entry_id
      WHERE wc.id = ? AND wc.org_id = ?`,
    [certId, orgId]
  );

  if (!cert) throw new ApiError(404, 'Withholding tax certificate not found.');

  return {
    ...cert,
    gross_amount: Number(cert.gross_amount),
    tva_amount: Number(cert.tva_amount),
    tva_withheld_amount: Number(cert.tva_withheld_amount),
    precompte_amount: Number(cert.precompte_amount),
    tsr_amount: Number(cert.tsr_amount),
    total_withheld_amount: Number(cert.total_withheld_amount),
    net_payable_amount: Number(cert.net_payable_amount),
  };
}

/**
 * Issue a new Withholding Tax Certificate and optionally post the complete
 * 5-line purchase & tax withholding journal entry in the Purchase Journal (HA).
 */
export async function issueCertificate(orgId, payload, actor) {
  const {
    supplier_id,
    subledger_id = null,
    certificate_date,
    tax_period,
    invoice_ref,
    gross_amount,
    has_tva = true,
    tva_rate = 19.25,
    precompte_rate = 2.2,
    tsr_rate = 0.0,
    post_journal_entry = false,
    expense_account_code = '601',
    description = null,
  } = payload;

  if (!supplier_id || !certificate_date || !tax_period || !invoice_ref || !gross_amount) {
    throw new ApiError(400, 'Missing mandatory certificate parameters.');
  }

  const supplier = await queryOne(
    `SELECT * FROM suppliers WHERE id = ? AND org_id = ?`,
    [supplier_id, orgId]
  );
  if (!supplier) throw new ApiError(404, 'Supplier not found.');

  const split = computeTaxSplit({
    grossAmount: gross_amount,
    hasTva: has_tva,
    tvaRate: tva_rate,
    precompteRate: precompte_rate,
    tsrRate: tsr_rate,
  });

  return await transaction(async (tx) => {
    // Generate Certificate Number via sequences table
    let certNo = null;
    try {
      certNo = await nextSequence(tx, orgId, 'withholding_certificate', certificate_date);
    } catch {
      // Create sequence on the fly if missing
      await tx.query(
        `INSERT IGNORE INTO sequences (org_id, name, prefix, next_value, padding, reset_yearly, include_year)
         VALUES (?, 'withholding_certificate', 'ATT-', 1, 5, 1, 1)`,
        [orgId]
      );
      certNo = await nextSequence(tx, orgId, 'withholding_certificate', certificate_date);
    }

    let entryId = null;

    if (post_journal_entry) {
      // Find required SYSCOHADA accounts
      // 1. Expense Account (e.g. 601 Achats de marchandises or user specified)
      const expAcct = await tx.queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND code = ? LIMIT 1`,
        [orgId, expense_account_code]
      );
      if (!expAcct) throw new ApiError(422, `Expense account ${expense_account_code} does not exist in chart of accounts.`);

      // 2. TVA déductible (4452 or 445)
      const tvaAcct = await tx.queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND (code = '4452' OR code = '445') LIMIT 1`,
        [orgId]
      );

      // 3. Retenue TVA à la source (4472 or 447)
      const retTvaAcct = await tx.queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND (code = '4472' OR code = '447') LIMIT 1`,
        [orgId]
      );

      // 4. Précompte sur achats / Acompte IS (4471)
      const precompteAcct = await tx.queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND (code = '4471' OR code = '447') LIMIT 1`,
        [orgId]
      );

      // 5. Fournisseur (4011 or 401)
      const supplierAcct = await tx.queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND (code = '4011' OR code = '401') LIMIT 1`,
        [orgId]
      );
      if (!supplierAcct) throw new ApiError(422, 'Supplier collective account 4011 / 401 not found.');

      // 6. TSR (4478) if applicable
      let tsrAcct = null;
      if (split.tsrAmount > 0) {
        tsrAcct = await tx.queryOne(
          `SELECT id FROM accounts WHERE org_id = ? AND (code = '4478' OR code = '447') LIMIT 1`,
          [orgId]
        );
      }

      const note = description || `Facture ${invoice_ref} - ${supplier.name} (avec retenues CEMAC)`;
      const lines = [
        // Debit Charge HT
        {
          accountId: expAcct.id,
          description: note,
          debit: split.grossAmount,
          credit: 0,
        },
      ];

      // Debit TVA Déductible
      if (split.tvaAmount > 0 && tvaAcct) {
        lines.push({
          accountId: tvaAcct.id,
          description: `TVA 19.25% sur fact. ${invoice_ref}`,
          debit: split.tvaAmount,
          credit: 0,
        });
      }

      // Credit Retenue TVA à la source (100% withheld)
      if (split.tvaWithheldAmount > 0 && retTvaAcct) {
        lines.push({
          accountId: retTvaAcct.id,
          description: `Retenue 100% TVA source - Fact. ${invoice_ref}`,
          debit: 0,
          credit: split.tvaWithheldAmount,
        });
      }

      // Credit Précompte sur achats
      if (split.precompteAmount > 0 && precompteAcct) {
        lines.push({
          accountId: precompteAcct.id,
          description: `Précompte ${split.precompteRate}% sur fact. ${invoice_ref}`,
          debit: 0,
          credit: split.precompteAmount,
        });
      }

      // Credit TSR if applicable
      if (split.tsrAmount > 0 && tsrAcct) {
        lines.push({
          accountId: tsrAcct.id,
          description: `TSR ${split.tsrRate}% - Fact. ${invoice_ref}`,
          debit: 0,
          credit: split.tsrAmount,
        });
      }

      // Credit Fournisseur Net à Payer
      lines.push({
        accountId: supplierAcct.id,
        subledgerId: subledger_id,
        description: `Net à payer - Fact. ${invoice_ref} (${supplier.name})`,
        debit: 0,
        credit: split.netPayableAmount,
      });

      const entry = await createJournalEntry(tx, {
        orgId,
        journalCode: 'HA',
        date: certificate_date,
        description: note,
        reference: invoice_ref,
        sourceDocument: certNo,
        framework: 'both',
        autoPost: true,
        lines,
        actor,
      });
      entryId = entry.id;
    }

    const res = await tx.query(
      `INSERT INTO withholding_certificates
       (org_id, certificate_no, supplier_id, subledger_id, entry_id, certificate_date,
        tax_period, invoice_ref, gross_amount, has_tva, tva_rate, tva_amount,
        tva_withheld_amount, precompte_rate, precompte_amount, tsr_rate, tsr_amount,
        total_withheld_amount, net_payable_amount, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`,
      [
        orgId,
        certNo,
        supplier_id,
        subledger_id,
        entryId,
        certificate_date,
        tax_period,
        invoice_ref,
        split.grossAmount,
        split.hasTva ? 1 : 0,
        split.tvaRate,
        split.tvaAmount,
        split.tvaWithheldAmount,
        split.precompteRate,
        split.precompteAmount,
        split.tsrRate,
        split.tsrAmount,
        split.totalWithheldAmount,
        split.netPayableAmount,
        actor?.id || null,
      ]
    );

    return {
      id: res.insertId,
      certificate_no: certNo,
      entry_id: entryId,
      ...split,
    };
  });
}

/**
 * Record DGI payment receipt or filing reference on an issued certificate.
 */
export async function updateCertificateStatus(orgId, certId, payload) {
  const { status = 'declared', dgi_receipt_ref } = payload;
  await query(
    `UPDATE withholding_certificates
        SET status = ?,
            dgi_receipt_ref = COALESCE(?, dgi_receipt_ref)
      WHERE id = ? AND org_id = ?`,
    [status, dgi_receipt_ref || null, certId, orgId]
  );
  return { success: true };
}

/**
 * List all active suppliers for withholding tax operations.
 */
export async function listSuppliers(orgId) {
  const rows = await query(
    `SELECT s.*, sa.code AS subledger_code
       FROM suppliers s
  LEFT JOIN subledger_accounts sa ON sa.partner_type = 'supplier' AND sa.partner_id = s.id AND sa.org_id = s.org_id
      WHERE s.org_id = ?
   ORDER BY s.name ASC`,
    [orgId]
  );
  return rows;
}
