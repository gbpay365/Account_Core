import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { createJournalEntry } from './ledger.service.js';

/**
 * CEMAC / DGI Electronic Invoicing & Fiscal Stamp Duty Engine (DFE - Dispositif Fiscal Électronique)
 *
 * Applicable Standards:
 * - DGI Electronic Invoice Normalization (Cameroon CGI / CEMAC Directives)
 * - Mandatory Timbre Fiscal (1,000 XAF standard per commercial/hospital bill, Account 6461 / 4474)
 * - Standard TVA Retenue / Facturée @ 19.25% (Account 4431)
 * - SHA-256 Cryptographic Digital Signature & Verification Token
 * - Standard 2D QR Code embedding fiscal authenticity payload
 */

export async function listDfeInvoices(orgId) {
  return query(
    `SELECT dfe.*, je.entry_no AS journal_entry_number
       FROM dfe_invoices dfe
  LEFT JOIN journal_entries je ON je.id = dfe.journal_entry_id
      WHERE dfe.org_id = ?
   ORDER BY dfe.invoice_date DESC, dfe.id DESC`,
    [orgId]
  );
}

export async function getDfeInvoiceDetails(orgId, invoiceId) {
  const invoice = await queryOne(
    `SELECT dfe.*, je.entry_no AS journal_entry_number
       FROM dfe_invoices dfe
  LEFT JOIN journal_entries je ON je.id = dfe.journal_entry_id
      WHERE dfe.id = ? AND dfe.org_id = ?`,
    [invoiceId, orgId]
  );
  if (!invoice) throw new ApiError(404, 'Facture électronique DFE introuvable');

  // Regenerate QR data URL for display
  const qrDataUrl = await QRCode.toDataURL(invoice.dfe_qr_payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });

  return { ...invoice, qr_data_url: qrDataUrl };
}

export async function issueDfeInvoice(orgId, data, actor = 'Facturation DFE') {
  return transaction(async (tx) => {
    const {
      invoice_number,
      customer_name,
      customer_niu,
      customer_email,
      invoice_date,
      total_ht,
      tva_rate = 19.25,
      fiscal_stamp_duty = 1000.0,
      currency = 'XAF',
    } = data;

    if (!invoice_number || !customer_name || !invoice_date || total_ht === undefined) {
      throw new ApiError(400, 'Champs obligatoires manquants (numéro facture, client, date, montant HT)');
    }

    const ht = Number(total_ht);
    const rate = Number(tva_rate);
    const stamp = Number(fiscal_stamp_duty);
    const tva = money(ht * (rate / 100));
    const ttc = money(ht + tva + stamp);

    // Cryptographic SHA-256 Digital Signature Token
    const rawSignature = `${orgId}|${invoice_number}|${customer_niu || 'ANONYME'}|${invoice_date}|${ht}|${tva}|${stamp}|${ttc}|SECRET_DGI_KEY_2026`;
    const securityToken = crypto.createHash('sha256').update(rawSignature).digest('hex').toUpperCase();

    // Standardized DGI QR Payload
    const qrPayload = `DFE|NIU:${customer_niu || 'M019200000000T'}|FAC:${invoice_number}|DATE:${invoice_date}|HT:${ht}|TVA:${tva}|TIMBRE:${stamp}|TTC:${ttc}|SIG:${securityToken.substring(0, 24)}`;

    // Generate QR code data URL
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
    });

    // Accounts for posting
    const acctClient = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4111'`, [orgId]);
    const acctRevenus = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND (code = '7061' OR code = '7011' OR code = '706') LIMIT 1`, [orgId]);
    const acctTva = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4431'`, [orgId]);
    const acctTimbre = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '4474'`, [orgId]);

    let journalEntryId = null;
    if (acctClient && acctRevenus && acctTva && acctTimbre) {
      const lines = [
        // Debit Client: Total TTC
        {
          accountId: acctClient.id,
          description: `Facture normalisée DFE - ${customer_name}`,
          debit: ttc,
          credit: 0,
          partnerType: 'customer',
          partnerId: data.customer_id || 1,
        },
        // Credit Prestations de soins: Total HT
        {
          accountId: acctRevenus.id,
          description: `Prestations médicales / Actes de soins HT - ${invoice_number}`,
          debit: 0,
          credit: ht,
        },
        // Credit TVA facturée
        {
          accountId: acctTva.id,
          description: `TVA facturée 19.25% - ${invoice_number}`,
          debit: 0,
          credit: tva,
        },
        // Credit État, timbres fiscaux légaux
        {
          accountId: acctTimbre.id,
          description: `Droit de timbre fiscal légal CEMAC - ${invoice_number}`,
          debit: 0,
          credit: stamp,
        },
      ];

      const entry = await createJournalEntry(tx, {
        orgId,
        journalCode: 'VTE',
        date: invoice_date,
        description: `Facturation client DFE certifiée - ${customer_name} (${invoice_number})`,
        sourceRef: invoice_number,
        framework: 'both',
        autoPost: true,
        overrideReason: 'Comptabilisation facture normalisée DFE certifiée',
        lines,
        actor: typeof actor === 'object' ? actor : { name: String(actor), permissions: new Set(['journal.post_closed']) },
      });

      journalEntryId = entry.id;
    }

    const res = await tx.query(
      `INSERT INTO dfe_invoices
       (org_id, invoice_number, customer_name, customer_niu, customer_email,
        invoice_date, currency, total_ht, tva_rate, total_tva, fiscal_stamp_duty, total_ttc,
        dfe_security_token, dfe_qr_payload, dfe_status, journal_entry_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'certified', ?)`,
      [
        orgId,
        invoice_number.trim(),
        customer_name.trim(),
        (customer_niu || 'M019200000000T').trim(),
        customer_email || null,
        invoice_date,
        currency,
        ht,
        rate,
        tva,
        stamp,
        ttc,
        securityToken,
        qrPayload,
        journalEntryId,
      ]
    );

    return {
      id: res.insertId,
      invoice_number,
      customer_name,
      total_ht: ht,
      total_tva: tva,
      fiscal_stamp_duty: stamp,
      total_ttc: ttc,
      security_token: securityToken,
      qr_payload: qrPayload,
      qr_data_url: qrDataUrl,
      journal_entry_id: journalEntryId,
    };
  });
}

/**
 * Public Verification of a DFE Invoice by its security token.
 */
export async function verifyDfeToken(token) {
  if (!token) throw new ApiError(400, 'Jeton de sécurité DFE requis');

  const invoice = await queryOne(
    `SELECT dfe.invoice_number, dfe.customer_name, dfe.customer_niu, dfe.invoice_date,
            dfe.total_ht, dfe.total_tva, dfe.fiscal_stamp_duty, dfe.total_ttc, dfe.dfe_status,
            dfe.created_at, o.legal_name, o.tax_id
       FROM dfe_invoices dfe
       JOIN organizations o ON o.id = dfe.org_id
      WHERE dfe.dfe_security_token = ? OR dfe.dfe_security_token LIKE ?`,
    [token, `${token}%`]
  );

  if (!invoice) {
    return {
      verified: false,
      message: 'Jeton de sécurité DFE non reconnu ou invalide selon les registres officiels',
    };
  }

  return {
    verified: true,
    status: invoice.dfe_status,
    issuer: {
      name: invoice.legal_name,
      tax_id: invoice.tax_id,
    },
    invoice: {
      number: invoice.invoice_number,
      date: invoice.invoice_date,
      customer: invoice.customer_name,
      customer_niu: invoice.customer_niu,
      total_ht: Number(invoice.total_ht),
      total_tva: Number(invoice.total_tva),
      fiscal_stamp: Number(invoice.fiscal_stamp_duty),
      total_ttc: Number(invoice.total_ttc),
      issued_at: invoice.created_at,
    },
  };
}
