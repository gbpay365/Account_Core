import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError } from '../utils/errors.js';
import { money } from '../utils/money.js';
import { createJournalEntry } from './ledger.service.js';

/**
 * Mobile Money Counter & Daily Cashier Close Service (Caisse & Arrêté de Caisse).
 * Manages physical and electronic counters (MTN MoMo, Orange Money, Cash),
 * automated transaction posting, telecom fee accounting, cash variance detection,
 * and statutory Procès-Verbal d'Arrêté de Caisse.
 */

/**
 * List all cash registers with assigned accounts and today's summary.
 */
export async function listCashRegisters(orgId) {
  const registers = await query(
    `SELECT cr.*, u.full_name AS cashier_name,
            ac.code AS cash_account_code, ac.name AS cash_account_name,
            am.code AS momo_account_code, am.name AS momo_account_name,
            ao.code AS orange_account_code, ao.name AS orange_account_name,
            (SELECT COALESCE(SUM(net_amount), 0)
               FROM mobile_money_transactions
              WHERE cash_register_id = cr.id AND DATE(transaction_date) = CURDATE() AND status != 'cancelled') AS today_momo_total
       FROM cash_registers cr
  LEFT JOIN users u ON u.id = cr.cashier_user_id
  LEFT JOIN accounts ac ON ac.id = cr.cash_account_id
  LEFT JOIN accounts am ON am.id = cr.momo_account_id
  LEFT JOIN accounts ao ON ao.id = cr.orange_account_id
      WHERE cr.org_id = ?
   ORDER BY cr.code ASC`,
    [orgId]
  );

  return registers.map(r => ({
    ...r,
    today_momo_total: Number(r.today_momo_total || 0),
  }));
}

/**
 * Get register details including transactions for a given date.
 */
export async function getCashRegisterDetails(orgId, registerId, dateStr = null) {
  const register = await queryOne(
    `SELECT cr.*, u.full_name AS cashier_name,
            ac.code AS cash_account_code, am.code AS momo_account_code, ao.code AS orange_account_code
       FROM cash_registers cr
  LEFT JOIN users u ON u.id = cr.cashier_user_id
  LEFT JOIN accounts ac ON ac.id = cr.cash_account_id
  LEFT JOIN accounts am ON am.id = cr.momo_account_id
  LEFT JOIN accounts ao ON ao.id = cr.orange_account_id
      WHERE cr.id = ? AND cr.org_id = ?`,
    [registerId, orgId]
  );
  if (!register) throw new ApiError(404, 'Cash register not found.');

  const targetDate = dateStr || new Date().toISOString().slice(0, 10);

  // Fetch transactions for target date
  const txs = await query(
    `SELECT mmt.*, je.entry_no
       FROM mobile_money_transactions mmt
  LEFT JOIN journal_entries je ON je.id = mmt.journal_entry_id
      WHERE mmt.cash_register_id = ?
        AND DATE(mmt.transaction_date) = ?
   ORDER BY mmt.transaction_date DESC, mmt.id DESC`,
    [registerId, targetDate]
  );

  // Breakdown by provider
  let mtnTotal = 0;
  let orangeTotal = 0;
  let totalFees = 0;
  let totalGross = 0;

  for (const t of txs) {
    const gross = Number(t.gross_amount || 0);
    const fee = Number(t.fee_amount || 0);
    totalGross = money(totalGross + gross);
    totalFees = money(totalFees + fee);

    if (t.provider === 'mtn_momo') {
      mtnTotal = money(mtnTotal + Number(t.net_amount || 0));
    } else if (t.provider === 'orange_money') {
      orangeTotal = money(orangeTotal + Number(t.net_amount || 0));
    }
  }

  // Fetch daily close record if exists
  const dailyClose = await queryOne(
    `SELECT dcc.*, u.full_name AS cashier_name, u_app.full_name AS approver_name
       FROM daily_cash_closes dcc
  LEFT JOIN users u ON u.id = dcc.cashier_id
  LEFT JOIN users u_app ON u_app.id = dcc.approved_by
      WHERE dcc.cash_register_id = ? AND dcc.close_date = ?`,
    [registerId, targetDate]
  );

  return {
    register,
    date: targetDate,
    transactions: txs.map(t => ({
      ...t,
      gross_amount: Number(t.gross_amount),
      fee_amount: Number(t.fee_amount),
      net_amount: Number(t.net_amount),
    })),
    summary: {
      transaction_count: txs.length,
      total_gross: totalGross,
      total_fees: totalFees,
      mtn_momo_net: mtnTotal,
      orange_money_net: orangeTotal,
      total_electronic_net: money(mtnTotal + orangeTotal),
    },
    daily_close: dailyClose ? {
      ...dailyClose,
      physical_cash_counted: Number(dailyClose.physical_cash_counted),
      system_cash_expected: Number(dailyClose.system_cash_expected),
      cash_variance: Number(dailyClose.cash_variance),
      momo_collected: Number(dailyClose.momo_collected),
      orange_collected: Number(dailyClose.orange_collected),
      total_collections: Number(dailyClose.total_collections),
      bank_deposit_amount: Number(dailyClose.bank_deposit_amount),
    } : null,
  };
}

/**
 * Record a mobile money transaction and post balanced journal entries.
 */
export async function recordMobileMoneyTransaction(orgId, payload, actor) {
  const {
    cash_register_id,
    provider,
    telecom_ref,
    customer_phone = null,
    patient_name = null,
    patient_file_no = null,
    gross_amount,
    fee_amount = 0,
    credit_account_id = null,
    notes = null,
  } = payload;

  if (!cash_register_id || !provider || !telecom_ref || !gross_amount) {
    throw new ApiError(400, 'Missing mandatory transaction parameters.');
  }

  const register = await queryOne(`SELECT * FROM cash_registers WHERE id = ? AND org_id = ?`, [cash_register_id, orgId]);
  if (!register) throw new ApiError(404, 'Cash register not found.');

  const gross = Number(gross_amount);
  const fee = Number(fee_amount || 0);
  const net = money(gross - fee);

  return await transaction(async (tx) => {
    // Determine provider cash account
    const debitAccountId = provider === 'mtn_momo' ? register.momo_account_id : register.orange_account_id;

    // Resolve fee account (6312)
    const feeAccount = await tx.queryOne(
      `SELECT id FROM accounts WHERE org_id = ? AND code IN ('6312', '6311') AND is_postable = 1 LIMIT 1`,
      [orgId]
    );

    // Resolve revenue / patient receivable account (Default: 7061 or 4111)
    let revAccountId = credit_account_id;
    if (!revAccountId) {
      const defaultRev = await tx.queryOne(
        `SELECT id FROM accounts WHERE org_id = ? AND (code LIKE '706%' OR code LIKE '701%') AND is_postable = 1 ORDER BY code ASC LIMIT 1`,
        [orgId]
      );
      revAccountId = defaultRev?.id;
    }

    let journalEntryId = null;

    if (debitAccountId && revAccountId) {
      const lines = [
        // Debit MoMo/Orange account for net collection
        {
          accountId: debitAccountId,
          description: `Paiement ${provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'} - Réf: ${telecom_ref} (${patient_name || 'Patient'})`,
          debit: net,
          credit: 0,
        },
      ];

      // If telecom fee was charged directly
      if (fee > 0 && feeAccount) {
        lines.push({
          accountId: feeAccount.id,
          description: `Commission télécom opérateur ${provider} - Réf: ${telecom_ref}`,
          debit: fee,
          credit: 0,
        });
      }

      // Credit Revenue
      lines.push({
        accountId: revAccountId,
        description: `Encaissement soins/actes médicaux - ${patient_name || 'Patient'}`,
        debit: 0,
        credit: gross,
      });

      const entry = await createJournalEntry(tx, {
        orgId,
        journalCode: 'CA',
        date: new Date().toISOString().slice(0, 10),
        description: `Encaissement ${provider === 'mtn_momo' ? 'MTN Mobile Money' : 'Orange Money'} - ${telecom_ref}`,
        sourceRef: telecom_ref,
        framework: 'both',
        autoPost: true,
        lines,
        actor,
      });

      journalEntryId = entry.id;
    }

    const res = await tx.query(
      `INSERT INTO mobile_money_transactions
       (org_id, cash_register_id, provider, telecom_ref, transaction_date, customer_phone,
        patient_name, patient_file_no, gross_amount, fee_amount, net_amount, journal_entry_id, status, notes)
       VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, 'reconciled', ?)`,
      [
        orgId,
        cash_register_id,
        provider,
        telecom_ref,
        customer_phone,
        patient_name,
        patient_file_no,
        gross,
        fee,
        net,
        journalEntryId,
        notes,
      ]
    );

    return {
      id: res.insertId,
      telecom_ref,
      gross_amount: gross,
      fee_amount: fee,
      net_amount: net,
      journal_entry_id: journalEntryId,
      status: 'reconciled',
    };
  });
}

/**
 * Perform daily cash close (Arrêté de Caisse Journalier) and generate audit PV.
 */
export async function performDailyCashClose(orgId, registerId, payload, actor) {
  const {
    close_date,
    physical_cash_counted = 0,
    system_cash_expected = 0,
    bank_deposit_amount = 0,
    bank_deposit_ref = null,
    notes = null,
  } = payload;

  const register = await queryOne(`SELECT * FROM cash_registers WHERE id = ? AND org_id = ?`, [registerId, orgId]);
  if (!register) throw new ApiError(404, 'Cash register not found.');

  const physical = Number(physical_cash_counted);
  const expected = Number(system_cash_expected);
  const variance = money(physical - expected);
  const depositAmt = Number(bank_deposit_amount);

  // Compute MoMo & Orange collected on close_date
  const totalsRes = await query(
    `SELECT provider, COALESCE(SUM(net_amount), 0) AS total_net
       FROM mobile_money_transactions
      WHERE cash_register_id = ?
        AND DATE(transaction_date) = ?
        AND status != 'cancelled'
   GROUP BY provider`,
    [registerId, close_date]
  );

  let momoNet = 0;
  let orangeNet = 0;
  for (const t of totalsRes) {
    if (t.provider === 'mtn_momo') momoNet = Number(t.total_net);
    if (t.provider === 'orange_money') orangeNet = Number(t.total_net);
  }

  const totalCollections = money(physical + momoNet + orangeNet);

  return await transaction(async (tx) => {
    let varianceEntryId = null;
    let depositEntryId = null;

    // 1. Post Cash Variance if non-zero
    if (Math.abs(variance) >= 0.01) {
      const acct5711 = register.cash_account_id;
      if (variance < 0) {
        // Déficit de caisse: Debit 6581 (Perte / déficit), Credit 5711
        const acct6581 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '6581' LIMIT 1`, [orgId]);
        if (acct6581 && acct5711) {
          const entryVar = await createJournalEntry(tx, {
            orgId,
            journalCode: 'CA',
            date: close_date,
            description: `Déficit constaté lors de l’arrêté de caisse - ${register.code} (${close_date})`,
            sourceRef: `VAR-${close_date}`,
            framework: 'both',
            autoPost: true,
            lines: [
              { accountId: acct6581.id, description: 'Déficit de caisse constaté', debit: Math.abs(variance), credit: 0 },
              { accountId: acct5711, description: 'Régularisation caisse espèces', debit: 0, credit: Math.abs(variance) },
            ],
            actor,
          });
          varianceEntryId = entryVar.id;
        }
      } else {
        // Excédent de caisse: Debit 5711, Credit 7581 (Produit / excédent)
        const acct7581 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '7581' LIMIT 1`, [orgId]);
        if (acct7581 && acct5711) {
          const entryVar = await createJournalEntry(tx, {
            orgId,
            journalCode: 'CA',
            date: close_date,
            description: `Excédent constaté lors de l’arrêté de caisse - ${register.code} (${close_date})`,
            sourceRef: `VAR-${close_date}`,
            framework: 'both',
            autoPost: true,
            lines: [
              { accountId: acct5711, description: 'Régularisation caisse espèces', debit: variance, credit: 0 },
              { accountId: acct7581.id, description: 'Excédent de caisse constaté', debit: 0, credit: variance },
            ],
            actor,
          });
          varianceEntryId = entryVar.id;
        }
      }
    }

    // 2. Post Bank Deposit Transit if deposit amount > 0
    if (depositAmt > 0) {
      const acct5851 = await tx.queryOne(`SELECT id FROM accounts WHERE org_id = ? AND code = '5851' LIMIT 1`, [orgId]);
      const acct5711 = register.cash_account_id;

      if (acct5851 && acct5711) {
        // Debit 5851 (Virement interne transit), Credit 5711 (Caisse espèces)
        const entryDep = await createJournalEntry(tx, {
          orgId,
          journalCode: 'CA',
          date: close_date,
          description: `Versement d’espèces en banque sous bordereau ${bank_deposit_ref || ''}`,
          sourceRef: bank_deposit_ref || `VERS-${close_date}`,
          framework: 'both',
          autoPost: true,
          lines: [
            { accountId: acct5851.id, description: 'Fonds en transit vers compte bancaire', debit: depositAmt, credit: 0 },
            { accountId: acct5711, description: 'Sortie caisse pour versement bancaire', debit: 0, credit: depositAmt },
          ],
          actor,
        });
        depositEntryId = entryDep.id;
      }
    }

    // 3. Save daily cash close
    const res = await tx.query(
      `INSERT INTO daily_cash_closes
       (org_id, cash_register_id, close_date, cashier_id, physical_cash_counted, system_cash_expected,
        cash_variance, momo_collected, orange_collected, total_collections, bank_deposit_amount,
        bank_deposit_ref, variance_entry_id, deposit_entry_id, status, approved_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)
       ON DUPLICATE KEY UPDATE
        physical_cash_counted = VALUES(physical_cash_counted),
        system_cash_expected = VALUES(system_cash_expected),
        cash_variance = VALUES(cash_variance),
        momo_collected = VALUES(momo_collected),
        orange_collected = VALUES(orange_collected),
        total_collections = VALUES(total_collections),
        bank_deposit_amount = VALUES(bank_deposit_amount),
        bank_deposit_ref = VALUES(bank_deposit_ref),
        variance_entry_id = VALUES(variance_entry_id),
        deposit_entry_id = VALUES(deposit_entry_id),
        status = 'posted'`,
      [
        orgId,
        registerId,
        close_date,
        actor.id,
        physical,
        expected,
        variance,
        momoNet,
        orangeNet,
        totalCollections,
        depositAmt,
        bank_deposit_ref,
        varianceEntryId,
        depositEntryId,
        actor.id,
        notes,
      ]
    );

    return {
      id: res.insertId,
      close_date,
      register_name: register.name,
      physical_cash_counted: physical,
      system_cash_expected: expected,
      cash_variance: variance,
      momo_collected: momoNet,
      orange_collected: orangeNet,
      total_collections: totalCollections,
      bank_deposit_amount: depositAmt,
      variance_entry_id: varianceEntryId,
      deposit_entry_id: depositEntryId,
      status: 'posted',
      pv_date: new Date().toISOString().slice(0, 10),
    };
  });
}
