import crypto from 'node:crypto';
import { query, queryOne, transaction } from '../db/pool.js';
import { createJournalEntry, postJournalEntry } from './ledger.service.js';
import { ApiError, badRequest, notFound, unauthorized, forbidden } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { toISO } from '../utils/dates.js';

// ============================================================================
// CLIENT / API KEY MANAGEMENT
// ============================================================================

export async function listClients(orgId) {
  const rows = await query(
    `SELECT c.*, j.code AS journal_code, j.name AS journal_name,
            COUNT(DISTINCT m.id) AS mapping_count,
            COUNT(DISTINCT l.id) AS log_count
       FROM integration_clients c
       LEFT JOIN journals j ON j.id = c.default_journal_id
       LEFT JOIN integration_mappings m ON m.client_id = c.id
       LEFT JOIN integration_logs l ON l.client_id = c.id
      WHERE c.org_id = ?
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    [orgId]
  );
  return { rows, total: rows.length };
}

export async function getClient(orgId, id) {
  const client = await queryOne(
    `SELECT c.*, j.code AS journal_code, j.name AS journal_name
       FROM integration_clients c
       LEFT JOIN journals j ON j.id = c.default_journal_id
      WHERE c.org_id = ? AND c.id = ?`,
    [orgId, id]
  );
  if (!client) throw notFound('Integration client not found.');
  return { client };
}

export async function createClient(orgId, data, userId) {
  const {
    name,
    clientCode,
    defaultJournalId = null,
    defaultStatus = 'draft',
    ipWhitelist = null,
    webhookUrl = null,
    description = null,
  } = data;

  const normalizedCode = clientCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const existing = await queryOne(
    'SELECT id FROM integration_clients WHERE org_id = ? AND client_code = ?',
    [orgId, normalizedCode]
  );
  if (existing) throw badRequest(`An integration client with code "${normalizedCode}" already exists.`);

  // Generate secure API key
  const apiKey = `lch_live_${normalizedCode.toLowerCase()}_${crypto.randomBytes(16).toString('hex')}`;
  const apiSecret = crypto.randomBytes(24).toString('hex');

  const res = await query(
    `INSERT INTO integration_clients
       (org_id, name, client_code, api_key, api_secret, default_journal_id, default_status, ip_whitelist, webhook_url, description, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [orgId, name.trim(), normalizedCode, apiKey, apiSecret, defaultJournalId || null, defaultStatus, ipWhitelist || null, webhookUrl || null, description || null, userId || null]
  );

  return await getClient(orgId, res.insertId);
}

export async function updateClient(orgId, id, data) {
  const client = await queryOne('SELECT * FROM integration_clients WHERE org_id = ? AND id = ?', [orgId, id]);
  if (!client) throw notFound('Integration client not found.');

  const fields = [];
  const params = [];

  if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name.trim()); }
  if (data.defaultJournalId !== undefined) { fields.push('default_journal_id = ?'); params.push(data.defaultJournalId || null); }
  if (data.defaultStatus !== undefined) { fields.push('default_status = ?'); params.push(data.defaultStatus); }
  if (data.ipWhitelist !== undefined) { fields.push('ip_whitelist = ?'); params.push(data.ipWhitelist || null); }
  if (data.webhookUrl !== undefined) { fields.push('webhook_url = ?'); params.push(data.webhookUrl || null); }
  if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description || null); }
  if (data.isActive !== undefined) { fields.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }

  if (fields.length > 0) {
    params.push(orgId, id);
    await query(`UPDATE integration_clients SET ${fields.join(', ')} WHERE org_id = ? AND id = ?`, params);
  }

  return await getClient(orgId, id);
}

export async function regenerateApiKey(orgId, id) {
  const client = await queryOne('SELECT * FROM integration_clients WHERE org_id = ? AND id = ?', [orgId, id]);
  if (!client) throw notFound('Integration client not found.');

  const newKey = `lch_live_${client.client_code.toLowerCase()}_${crypto.randomBytes(16).toString('hex')}`;
  const newSecret = crypto.randomBytes(24).toString('hex');

  await query(
    'UPDATE integration_clients SET api_key = ?, api_secret = ? WHERE org_id = ? AND id = ?',
    [newKey, newSecret, orgId, id]
  );

  return { apiKey: newKey, apiSecret: newSecret, message: 'API key regenerated successfully.' };
}

export async function deleteClient(orgId, id) {
  const client = await queryOne('SELECT * FROM integration_clients WHERE org_id = ? AND id = ?', [orgId, id]);
  if (!client) throw notFound('Integration client not found.');

  // Check if logs exist
  const count = await queryOne('SELECT COUNT(*) AS c FROM integration_logs WHERE org_id = ? AND client_id = ?', [orgId, id]);
  if (count && count.c > 0) {
    // Soft deactivate
    await query('UPDATE integration_clients SET is_active = 0 WHERE org_id = ? AND id = ?', [orgId, id]);
    return { success: true, deactivated: true, message: 'Integration deactivated (audit records exist).' };
  }

  await query('DELETE FROM integration_mappings WHERE org_id = ? AND client_id = ?', [orgId, id]);
  await query('DELETE FROM integration_clients WHERE org_id = ? AND id = ?', [orgId, id]);
  return { success: true, deleted: true };
}

// ============================================================================
// EVENT MAPPING RULES
// ============================================================================

export async function listMappings(orgId, clientId = null) {
  let sql = `
    SELECT m.*,
           c.name AS client_name, c.client_code,
           j.code AS journal_code, j.name AS journal_name,
           da.code AS debit_account_code, da.name AS debit_account_name, da.name_en AS debit_account_name_en,
           ca.code AS credit_account_code, ca.name AS credit_account_name, ca.name_en AS credit_account_name_en,
           cc.code AS cost_center_code, cc.name AS cost_center_name
      FROM integration_mappings m
      LEFT JOIN integration_clients c ON c.id = m.client_id
      LEFT JOIN journals j ON j.id = m.default_journal_id
      LEFT JOIN accounts da ON da.id = m.debit_account_id
      LEFT JOIN accounts ca ON ca.id = m.credit_account_id
      LEFT JOIN cost_centers cc ON cc.id = m.default_cost_center_id
     WHERE m.org_id = ?
  `;
  const params = [orgId];
  if (clientId) {
    sql += ' AND (m.client_id = ? OR m.client_id IS NULL)';
    params.push(clientId);
  }
  sql += ' ORDER BY m.event_code ASC';

  const rows = await query(sql, params);
  return { rows, total: rows.length };
}

export async function createMapping(orgId, data) {
  const {
    clientId = null,
    eventCode,
    name,
    defaultJournalId = null,
    debitAccountId,
    creditAccountId,
    defaultCostCenterId = null,
    taxCodeId = null,
    descriptionTemplate = null,
  } = data;

  const normalizedEvent = eventCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  const res = await query(
    `INSERT INTO integration_mappings
       (org_id, client_id, event_code, name, default_journal_id, debit_account_id, credit_account_id, default_cost_center_id, tax_code_id, description_template, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      orgId, clientId || null, normalizedEvent, name.trim(), defaultJournalId || null,
      debitAccountId, creditAccountId, defaultCostCenterId || null, taxCodeId || null,
      descriptionTemplate || null,
    ]
  );

  return { id: res.insertId, message: 'Mapping rule created successfully.' };
}

export async function updateMapping(orgId, id, data) {
  const existing = await queryOne('SELECT * FROM integration_mappings WHERE org_id = ? AND id = ?', [orgId, id]);
  if (!existing) throw notFound('Mapping rule not found.');

  const fields = [];
  const params = [];

  if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name.trim()); }
  if (data.defaultJournalId !== undefined) { fields.push('default_journal_id = ?'); params.push(data.defaultJournalId || null); }
  if (data.debitAccountId !== undefined) { fields.push('debit_account_id = ?'); params.push(data.debitAccountId); }
  if (data.creditAccountId !== undefined) { fields.push('credit_account_id = ?'); params.push(data.creditAccountId); }
  if (data.defaultCostCenterId !== undefined) { fields.push('default_cost_center_id = ?'); params.push(data.defaultCostCenterId || null); }
  if (data.taxCodeId !== undefined) { fields.push('tax_code_id = ?'); params.push(data.taxCodeId || null); }
  if (data.descriptionTemplate !== undefined) { fields.push('description_template = ?'); params.push(data.descriptionTemplate || null); }
  if (data.isActive !== undefined) { fields.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }

  if (fields.length > 0) {
    params.push(orgId, id);
    await query(`UPDATE integration_mappings SET ${fields.join(', ')} WHERE org_id = ? AND id = ?`, params);
  }

  return { success: true, message: 'Mapping updated successfully.' };
}

export async function deleteMapping(orgId, id) {
  const existing = await queryOne('SELECT * FROM integration_mappings WHERE org_id = ? AND id = ?', [orgId, id]);
  if (!existing) throw notFound('Mapping rule not found.');

  await query('DELETE FROM integration_mappings WHERE org_id = ? AND id = ?', [orgId, id]);
  return { success: true };
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export async function listLogs(orgId, filters = {}) {
  const { clientId, status, search, limit = 50, offset = 0 } = filters;
  const params = [orgId];
  let filterSql = '';

  if (clientId) {
    filterSql += ' AND l.client_id = ?';
    params.push(clientId);
  }
  if (status) {
    filterSql += ' AND l.status = ?';
    params.push(status);
  }
  if (search) {
    filterSql += ' AND (l.external_reference LIKE ? OR l.entry_no LIKE ? OR l.event_code LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM integration_logs l WHERE l.org_id = ? ${filterSql}`,
    params
  );
  const total = countRow ? countRow.total : 0;

  const rows = await query(
    `SELECT l.*, c.name AS client_name, c.client_code, je.status AS journal_entry_status
       FROM integration_logs l
       LEFT JOIN integration_clients c ON c.id = l.client_id
       LEFT JOIN journal_entries je ON je.id = l.entry_id
      WHERE l.org_id = ? ${filterSql}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  return { rows, total };
}

// ============================================================================
// API KEY AUTHENTICATION
// ============================================================================

export async function authenticateApiKey(apiKey, requestIp = null) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw unauthorized('Missing or invalid API key. Provide via X-API-Key or Authorization Bearer header.');
  }

  const client = await queryOne(
    `SELECT c.*, o.name AS organization_name, o.functional_currency
       FROM integration_clients c
       JOIN organizations o ON o.id = c.org_id
      WHERE c.api_key = ? AND c.is_active = 1`,
    [apiKey.trim()]
  );

  if (!client) {
    throw unauthorized('Invalid or revoked API key.');
  }

  // Verify IP whitelist if configured
  if (client.ip_whitelist && requestIp) {
    const allowed = client.ip_whitelist.split(',').map((s) => s.trim());
    const clientIp = String(requestIp).replace(/^.*:/, ''); // normalize IPv4-mapped IPv6
    const isAllowed = allowed.some((ip) => ip === '*' || clientIp === ip || clientIp.startsWith(ip));
    if (!isAllowed) {
      throw forbidden(`IP address ${requestIp} is not authorized for this API client.`);
    }
  }

  return client;
}

// ============================================================================
// CORE INGESTION ENGINE
// ============================================================================

export async function ingestExternalEntry(client, payload, requestInfo = {}) {
  const orgId = client.org_id;
  const requestIp = requestInfo.ip || null;
  const eventCode = payload.event_type || payload.event_code || payload.event || null;
  const reference = String(payload.reference || payload.external_reference || payload.ref || payload.receipt_no || '').trim();

  if (!reference) {
    throw badRequest('Missing required transaction reference / receipt_no.');
  }

  // 1. Idempotency Check: if reference was already ingested, return existing
  const existingEntry = await queryOne(
    `SELECT id, entry_no, status, total_debit, entry_date
       FROM journal_entries
      WHERE org_id = ? AND reference = ?`,
    [orgId, reference]
  );

  if (existingEntry) {
    // Log as duplicate
    await query(
      `INSERT INTO integration_logs
         (org_id, client_id, event_code, external_reference, request_ip, payload, entry_id, entry_no, status, total_amount, currency, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'duplicate', ?, ?, 'Duplicate transaction reference ignored.')`,
      [
        orgId, client.id, eventCode, reference, requestIp,
        JSON.stringify(payload), existingEntry.id, existingEntry.entry_no,
        existingEntry.total_debit || 0, payload.currency || client.functional_currency || 'XAF',
      ]
    );

    return {
      status: 'duplicate',
      duplicate: true,
      entry_id: existingEntry.id,
      entry_no: existingEntry.entry_no,
      entry_status: existingEntry.status,
      message: `Transaction ${reference} already exists in the system as ${existingEntry.entry_no} (Status: ${existingEntry.status}).`,
    };
  }

  // 2. Prepare double-entry lines
  let journalCode = payload.journal_code || null;
  let linesToPost = [];
  let description = payload.description || '';
  let totalAmount = 0;

  try {
    if (eventCode) {
      // Event-based mapping (e.g. CONSULTATION_FEE, HOSPITAL_BILLING, PHARMACY_SALE)
      const mapping = await queryOne(
        `SELECT m.*,
                da.code AS debit_account_code, ca.code AS credit_account_code,
                j.code AS journal_code, cc.id AS cc_id, cc.code AS cc_code
           FROM integration_mappings m
           JOIN accounts da ON da.id = m.debit_account_id
           JOIN accounts ca ON ca.id = m.credit_account_id
           LEFT JOIN journals j ON j.id = m.default_journal_id
           LEFT JOIN cost_centers cc ON cc.id = m.default_cost_center_id
          WHERE m.org_id = ? AND (m.client_id = ? OR m.client_id IS NULL) AND m.event_code = ? AND m.is_active = 1
          ORDER BY m.client_id DESC LIMIT 1`,
        [orgId, client.id, eventCode]
      );

      if (!mapping && (!payload.lines || payload.lines.length < 2)) {
        throw badRequest(`No active accounting mapping found for event "${eventCode}". Please configure this event in Admin.`);
      }

      const amount = Number(payload.amount);
      if (!amount || amount <= 0) {
        throw badRequest('Transaction amount must be a positive number.');
      }
      totalAmount = amount;

      if (!journalCode) {
        journalCode = mapping?.journal_code || null;
      }

      // Format description using template or fallback
      const partyName = payload.customer_name || payload.client_name || payload.vendor_name || payload.supplier_name || payload.beneficiary || payload.patient_name || payload.third_party_name || '';
      const partyId = payload.customer_id || payload.client_id || payload.vendor_id || payload.supplier_id || payload.patient_id || payload.third_party_id || '';

      if (mapping?.description_template && !payload.description) {
        description = mapping.description_template
          .replace('{customer_name}', partyName || 'Customer/Client')
          .replace('{vendor_name}', partyName || 'Supplier/Vendor')
          .replace('{client_name}', partyName || 'Client')
          .replace('{patient_name}', partyName || 'Third-Party')
          .replace('{third_party_name}', partyName || 'Third-Party')
          .replace('{customer_id}', partyId)
          .replace('{vendor_id}', partyId)
          .replace('{patient_id}', partyId)
          .replace('{reference}', reference)
          .replace('{doctor}', payload.doctor || payload.practitioner || '');
      }
      if (!description) {
        description = `${mapping?.name || eventCode}${partyName ? ` — ${partyName}` : ''} (${reference})`.trim();
      }

      // Cost center resolution: payload cost_center_id/code > department_code > mapping default
      let costCenterId = payload.cost_center_id || null;
      if (!costCenterId && (payload.cost_center_code || payload.department_code)) {
        const ccCode = String(payload.cost_center_code || payload.department_code).trim().toUpperCase();
        const foundCC = await queryOne(
          'SELECT id FROM cost_centers WHERE org_id = ? AND (code = ? OR code LIKE ?)',
          [orgId, ccCode, `%${ccCode}%`]
        );
        if (foundCC) costCenterId = foundCC.id;
      }
      if (!costCenterId) {
        costCenterId = mapping?.default_cost_center_id || mapping?.cc_id || null;
      }

      // Debit Account: check if payment method overrides (e.g. Bank vs Cash)
      let debitAccountId = mapping?.debit_account_id;
      if (payload.payment_method) {
        const pm = String(payload.payment_method).toUpperCase();
        if (pm.includes('BANK') || pm.includes('VIREMENT') || pm.includes('CHEQUE')) {
          const bankAcct = await queryOne("SELECT id FROM accounts WHERE org_id = ? AND code = '5211' AND is_postable = 1", [orgId]);
          if (bankAcct) debitAccountId = bankAcct.id;
        } else if (pm.includes('MOMO') || pm.includes('OM') || pm.includes('MOBILE')) {
          const momoAcct = await queryOne("SELECT id FROM accounts WHERE org_id = ? AND code LIKE '57%' AND is_postable = 1 LIMIT 1", [orgId]);
          if (momoAcct) debitAccountId = momoAcct.id;
        }
      }

      linesToPost = [
        {
          accountId: debitAccountId,
          debit: amount,
          credit: 0,
          costCenterId: costCenterId,
          description: description,
        },
        {
          accountId: mapping.credit_account_id,
          debit: 0,
          credit: amount,
          costCenterId: costCenterId,
          description: description,
        },
      ];
    } else if (Array.isArray(payload.lines) && payload.lines.length >= 2) {
      // Direct double-entry lines provided
      description = payload.description || `Integration Entry — ${reference}`;

      for (const line of payload.lines) {
        let accountId = line.account_id || null;
        if (!accountId && line.account_code) {
          const acct = await queryOne(
            'SELECT id FROM accounts WHERE org_id = ? AND code = ? AND is_active = 1',
            [orgId, String(line.account_code).trim()]
          );
          if (acct) accountId = acct.id;
          else throw badRequest(`Account code "${line.account_code}" does not exist in chart of accounts.`);
        }
        if (!accountId) throw badRequest('Each line must specify account_id or account_code.');

        let ccId = line.cost_center_id || null;
        if (!ccId && line.cost_center_code) {
          const cc = await queryOne(
            'SELECT id FROM cost_centers WHERE org_id = ? AND code = ? AND is_active = 1',
            [orgId, String(line.cost_center_code).trim()]
          );
          if (cc) ccId = cc.id;
        }

        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        totalAmount += debit;

        linesToPost.push({
          accountId,
          debit,
          credit,
          costCenterId: ccId,
          description: line.description || description,
        });
      }
    } else {
      throw badRequest('Payload must contain either event_type/event_code or balanced lines array.');
    }

    // Default Journal resolution:
    if (!journalCode) {
      if (client.default_journal_id) {
        const j = await queryOne('SELECT code FROM journals WHERE id = ?', [client.default_journal_id]);
        if (j) journalCode = j.code;
      }
      if (!journalCode) journalCode = 'VTE';
    }

    const entryDate = payload.date ? toISO(payload.date) : toISO(new Date());

    // Execute journal entry creation in transaction
    // Enforce draft mode as requested ("post these entries into Draft mode and when everything are Checked and ok, it can then be posted with status Posted")
    const targetStatus = client.default_status || 'draft';
    const autoPost = targetStatus === 'posted' && payload.auto_post === true;

    const entryResult = await transaction(async (tx) => {
      const entry = await createJournalEntry(tx, {
        orgId,
        journalCode,
        date: entryDate,
        description,
        reference,
        narration: payload.notes || `Ingested via API from ${client.name} (${client.client_code})`,
        lines: linesToPost,
        source: `api:${client.client_code.toLowerCase()}`,
        sourceRef: reference,
        autoPost: autoPost,
        framework: 'both',
        currency: payload.currency || client.functional_currency || 'XAF',
      });
      return entry;
    });

    const createdStatus = autoPost ? 'auto_posted' : 'draft_created';

    // Log success in integration_logs
    await query(
      `INSERT INTO integration_logs
         (org_id, client_id, event_code, external_reference, request_ip, payload, entry_id, entry_no, status, total_amount, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId, client.id, eventCode, reference, requestIp,
        JSON.stringify(payload), entryResult.id, entryResult.entry_no,
        createdStatus, totalAmount, payload.currency || 'XAF',
      ]
    );

    return {
      ok: true,
      status: createdStatus,
      entry_id: entryResult.id,
      entry_no: entryResult.entry_no,
      entry_status: autoPost ? 'posted' : 'draft',
      message: autoPost
        ? `Transaction posted to General Ledger as ${entryResult.entry_no}.`
        : `Transaction successfully accepted into Journal as Draft (${entryResult.entry_no}). Awaiting accountant validation.`,
      summary: {
        journal: journalCode,
        reference: reference,
        date: entryDate,
        total_amount: totalAmount,
        currency: payload.currency || 'XAF',
        lines_count: linesToPost.length,
      },
    };
  } catch (err) {
    // Log rejection in integration_logs
    await query(
      `INSERT INTO integration_logs
         (org_id, client_id, event_code, external_reference, request_ip, payload, status, total_amount, currency, error_message)
       VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?)`,
      [
        orgId, client.id, eventCode, reference, requestIp,
        JSON.stringify(payload), totalAmount || 0, payload.currency || 'XAF',
        err.message || 'Validation error during ingestion',
      ]
    ).catch(() => {});

    throw err;
  }
}
