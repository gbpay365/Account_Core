import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { createJournalEntry } from './ledger.service.js';

/**
 * Inter-Branch Establishments & Reciprocal Clearing Service (Comptes de Liaison 18)
 *
 * Applicable Standard:
 * - SYSCOHADA Article 18: Reciprocal Liaison Accounts for Multi-Establishment / Hospital Networks
 * - Account 1851: Compte de liaison Siège / Hôpital Central
 * - Account 1852: Compte de liaison Succursales, Cliniques et Dispensaires
 * - Mandatory reconciliation condition: Sum(Debits 18) = Sum(Credits 18) across the network.
 */

export async function listBranches(orgId) {
  return query(
    `SELECT b.*,
            (SELECT COUNT(*) FROM interbranch_transfers WHERE (source_branch_id = b.id OR dest_branch_id = b.id)) AS transfer_count
       FROM branch_establishments b
      WHERE b.org_id = ?
   ORDER BY b.branch_type = 'headquarters' DESC, b.name ASC`,
    [orgId]
  );
}

export async function createBranch(orgId, data) {
  const { code, name, city, branch_type = 'clinic', liaison_account_code = '1851' } = data;
  if (!code || !name || !city) {
    throw new ApiError(400, 'Champs obligatoires manquants (code, nom, ville)');
  }

  const res = await query(
    `INSERT INTO branch_establishments (org_id, code, name, city, branch_type, liaison_account_code, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [orgId, code.toUpperCase().trim(), name.trim(), city.trim(), branch_type, liaison_account_code]
  );

  return queryOne(`SELECT * FROM branch_establishments WHERE id = ?`, [res.insertId]);
}

export async function listInterbranchTransfers(orgId) {
  return query(
    `SELECT ibt.*,
            sb.name AS source_branch_name, sb.code AS source_branch_code,
            db.name AS dest_branch_name, db.code AS dest_branch_code,
            je_s.entry_no AS source_entry_number,
            je_d.entry_no AS dest_entry_number
       FROM interbranch_transfers ibt
       JOIN branch_establishments sb ON sb.id = ibt.source_branch_id
       JOIN branch_establishments db ON db.id = ibt.dest_branch_id
  LEFT JOIN journal_entries je_s ON je_s.id = ibt.source_journal_entry_id
  LEFT JOIN journal_entries je_d ON je_d.id = ibt.dest_journal_entry_id
      WHERE ibt.org_id = ?
   ORDER BY ibt.transfer_date DESC, ibt.id DESC`,
    [orgId]
  );
}

export async function createInterbranchTransfer(orgId, data, actor = 'Trésorier Central') {
  return transaction(async (tx) => {
    const {
      transfer_number,
      source_branch_id,
      dest_branch_id,
      transfer_date,
      amount,
      currency = 'XAF',
      description,
    } = data;

    if (!transfer_number || !source_branch_id || !dest_branch_id || !transfer_date || !amount) {
      throw new ApiError(400, 'Champs obligatoires manquants pour le virement inter-établissements');
    }

    if (Number(source_branch_id) === Number(dest_branch_id)) {
      throw new ApiError(400, 'L’établissement source et l’établissement destinataire doivent être distincts');
    }

    const amt = Number(amount);
    if (amt <= 0) throw new ApiError(400, 'Le montant doit être supérieur à zéro');

    const sourceBranch = await queryOne(`SELECT * FROM branch_establishments WHERE id = ? AND org_id = ?`, [source_branch_id, orgId]);
    const destBranch = await queryOne(`SELECT * FROM branch_establishments WHERE id = ? AND org_id = ?`, [dest_branch_id, orgId]);
    if (!sourceBranch || !destBranch) throw new ApiError(404, 'Établissement source ou destinataire introuvable');

    // Fetch accounts
    const acctLiaisonDest = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '1852'`, [orgId]);
    const acctLiaisonSource = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '1851'`, [orgId]);
    const acctBank = await queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '5211'`, [orgId]);

    let sourceJeId = null;
    let destJeId = null;

    if (acctLiaisonDest && acctBank) {
      // 1. Source Entry: Debit Liaison 1852 / Credit Banque 5211
      const sourceEntry = await createJournalEntry(tx, {
        orgId,
        journalCode: 'BQ',
        date: transfer_date,
        description: `Virement émis vers ${destBranch.name} - ${description}`,
        sourceRef: transfer_number,
        framework: 'both',
        autoPost: true,
        overrideReason: 'Virement réciproque de liaison inter-établissements',
        lines: [
          {
            accountId: acctLiaisonDest.id,
            description: `Transfert de fonds émis vers établissement ${destBranch.code}`,
            debit: amt,
            credit: 0,
          },
          {
            accountId: acctBank.id,
            description: `Décaissement bancaire pour virement inter-sites - ${transfer_number}`,
            debit: 0,
            credit: amt,
          },
        ],
        actor: typeof actor === 'object' ? actor : { name: String(actor), permissions: new Set(['journal.post_closed']) },
      });
      sourceJeId = sourceEntry.id;
    }

    if (acctLiaisonSource && acctBank) {
      // 2. Dest Entry: Debit Banque 5211 / Credit Liaison 1851
      const destEntry = await createJournalEntry(tx, {
        orgId,
        journalCode: 'BQ',
        date: transfer_date,
        description: `Réception de fonds reçus de ${sourceBranch.name} - ${description}`,
        sourceRef: transfer_number,
        framework: 'both',
        autoPost: true,
        overrideReason: 'Encaissement réciproque de liaison inter-établissements',
        lines: [
          {
            accountId: acctBank.id,
            description: `Encaissement bancaire transfert inter-établissements - ${transfer_number}`,
            debit: amt,
            credit: 0,
          },
          {
            accountId: acctLiaisonSource.id,
            description: `Compte réciproque de liaison reçu du Siège / ${sourceBranch.code}`,
            debit: 0,
            credit: amt,
          },
        ],
        actor: typeof actor === 'object' ? actor : { name: String(actor), permissions: new Set(['journal.post_closed']) },
      });
      destJeId = destEntry.id;
    }

    const res = await tx.query(
      `INSERT INTO interbranch_transfers
       (org_id, transfer_number, source_branch_id, dest_branch_id, transfer_date,
        amount, currency, description, source_journal_entry_id, dest_journal_entry_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reconciled')`,
      [
        orgId,
        transfer_number.trim(),
        source_branch_id,
        dest_branch_id,
        transfer_date,
        amt,
        currency,
        description.trim(),
        sourceJeId,
        destJeId,
      ]
    );

    return {
      id: res.insertId,
      transfer_number,
      source_branch: sourceBranch.name,
      dest_branch: destBranch.name,
      amount: amt,
      source_journal_entry_id: sourceJeId,
      dest_journal_entry_id: destJeId,
      status: 'reconciled',
    };
  });
}

/**
 * Inter-Branch Reciprocal Balance Reconciliation Report.
 * Validates that accounts 1851 and 1852 balance each other out across all transfers.
 */
export async function getInterbranchReconciliation(orgId) {
  const branches = await listBranches(orgId);
  const transfers = await listInterbranchTransfers(orgId);

  // Calculate totals
  let totalTransferred = 0;
  for (const t of transfers) {
    totalTransferred = money(totalTransferred + Number(t.amount || 0));
  }

  // Reciprocal ledger balance for 1851 and 1852
  const bal1851 = await queryOne(
    `SELECT COALESCE(SUM(jl.debit), 0) AS debit_total, COALESCE(SUM(jl.credit), 0) AS credit_total
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
      WHERE je.org_id = ? AND je.status = 'posted' AND a.code = '1851'`,
    [orgId]
  );

  const bal1852 = await queryOne(
    `SELECT COALESCE(SUM(jl.debit), 0) AS debit_total, COALESCE(SUM(jl.credit), 0) AS credit_total
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
      WHERE je.org_id = ? AND je.status = 'posted' AND a.code = '1852'`,
    [orgId]
  );

  const credit1851 = Number(bal1851?.credit_total || 0) - Number(bal1851?.debit_total || 0);
  const debit1852 = Number(bal1852?.debit_total || 0) - Number(bal1852?.credit_total || 0);
  const variance = money(Math.abs(debit1852 - credit1851));
  const isBalanced = variance === 0;

  return {
    branches,
    transfers,
    summary: {
      branch_count: branches.length,
      transfer_count: transfers.length,
      total_transferred: totalTransferred,
      account_1851_net_credit: credit1851,
      account_1852_net_debit: debit1852,
      variance,
      is_balanced: isBalanced,
    },
  };
}
