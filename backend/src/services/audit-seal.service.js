import crypto from 'crypto';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function sha256(data) {
  return crypto.createHash('sha256').update(String(data), 'utf8').digest('hex');
}

export function computeLineDigest(lines) {
  const normalized = (lines || [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map(
      (l) =>
        `${l.line_no}:${l.account_code || l.account_id}:${Number(l.debit || 0).toFixed(2)}:${Number(l.credit || 0).toFixed(2)}:${l.subledger_code || ''}:${l.cost_center_code || ''}`
    )
    .join(';');
  return sha256(normalized);
}

export function computeEntryHash(prevHash, entry, lineDigest) {
  const payload = [
    prevHash,
    entry.entry_no,
    String(entry.entry_date).slice(0, 10),
    Number(entry.total_debit || 0).toFixed(2),
    Number(entry.total_credit || 0).toFixed(2),
    entry.period_id,
    entry.journal_id,
    lineDigest,
  ].join('|');
  return sha256(payload);
}

export async function sealPostedEntries(tx, orgId, { actor, periodId = null, fiscalYearId = null }) {
  // Query current head of the hash chain
  const latestSealed = await tx.queryOne(
    `SELECT id, entry_no, entry_hash, seal_sequence
       FROM journal_entries
      WHERE org_id = ? AND is_sealed = 1
      ORDER BY seal_sequence DESC LIMIT 1`,
    [orgId]
  );

  let prevHash = latestSealed?.entry_hash || GENESIS_HASH;
  let nextSeq = (latestSealed?.seal_sequence || 0) + 1;

  let sql = `
    SELECT je.*
      FROM journal_entries je
      JOIN accounting_periods ap ON ap.id = je.period_id
     WHERE je.org_id = ? AND je.status = 'posted' AND je.is_sealed = 0
       ${periodId ? 'AND je.period_id = ?' : ''}
       ${fiscalYearId ? 'AND ap.fiscal_year_id = ?' : ''}
     ORDER BY je.entry_date ASC, je.id ASC`;

  const params = [orgId];
  if (periodId) params.push(periodId);
  if (fiscalYearId) params.push(fiscalYearId);

  const unsealed = await tx.query(sql, params);
  if (!unsealed.length) {
    return {
      sealedCount: 0,
      headHash: prevHash,
      message: 'Toutes les écritures publiées sont déjà scellées.',
    };
  }

  const now = new Date();
  let firstEntryNo = unsealed[0].entry_no;
  let lastEntryNo = unsealed[unsealed.length - 1].entry_no;

  for (const entry of unsealed) {
    const lines = await tx.query(
      `SELECT jl.*, a.code AS account_code, cc.code AS cost_center_code, sa.code AS subledger_code
         FROM journal_lines jl
         JOIN accounts a ON a.id = jl.account_id
         LEFT JOIN cost_centers cc ON cc.id = jl.cost_center_id
         LEFT JOIN subledger_accounts sa ON sa.id = jl.subledger_id
        WHERE jl.entry_id = ?
        ORDER BY jl.line_no ASC`,
      [entry.id]
    );

    const lineDigest = computeLineDigest(lines);
    const entryHash = computeEntryHash(prevHash, entry, lineDigest);

    await tx.query(
      `UPDATE journal_entries
          SET entry_hash = ?, prev_hash = ?, is_sealed = 1, sealed_at = ?, seal_sequence = ?
        WHERE id = ?`,
      [entryHash, prevHash, now, nextSeq, entry.id]
    );

    prevHash = entryHash;
    nextSeq++;
  }

  const runRes = await tx.query(
    `INSERT INTO audit_seal_runs (org_id, period_id, fiscal_year_id, entries_count, first_entry_no, last_entry_no, genesis_hash, final_seal_hash, verified, sealed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      orgId,
      periodId,
      fiscalYearId,
      unsealed.length,
      firstEntryNo,
      lastEntryNo,
      latestSealed?.entry_hash || GENESIS_HASH,
      prevHash,
      actor?.userId || null,
    ]
  );

  return {
    runId: runRes.insertId,
    sealedCount: unsealed.length,
    firstEntryNo,
    lastEntryNo,
    genesisHash: latestSealed?.entry_hash || GENESIS_HASH,
    finalSealHash: prevHash,
    nextSeq: nextSeq - 1,
  };
}

export async function verifyHashChain({ query, queryOne }, orgId) {
  const sealed = await query(
    `SELECT id, entry_no, entry_date, total_debit, total_credit, period_id, journal_id,
            entry_hash, prev_hash, seal_sequence, sealed_at
       FROM journal_entries
      WHERE org_id = ? AND is_sealed = 1
      ORDER BY seal_sequence ASC`,
    [orgId]
  );

  if (!sealed.length) {
    return {
      valid: true,
      totalChecked: 0,
      message: 'Aucune écriture scellée dans le grand livre.',
      genesisHash: GENESIS_HASH,
      headHash: GENESIS_HASH,
    };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < sealed.length; i++) {
    const entry = sealed[i];

    // Check chaining link
    if (entry.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalChecked: i,
        brokenAtSequence: entry.seal_sequence,
        brokenEntryNo: entry.entry_no,
        reason: 'Rupture de la chaîne : le prev_hash ne correspond pas au hash de l écriture précédente.',
        expectedPrevHash,
        actualPrevHash: entry.prev_hash,
      };
    }

    // Recompute line digest
    const lines = await query(
      `SELECT jl.*, a.code AS account_code, cc.code AS cost_center_code, sa.code AS subledger_code
         FROM journal_lines jl
         JOIN accounts a ON a.id = jl.account_id
         LEFT JOIN cost_centers cc ON cc.id = jl.cost_center_id
         LEFT JOIN subledger_accounts sa ON sa.id = jl.subledger_id
        WHERE jl.entry_id = ?
        ORDER BY jl.line_no ASC`,
      [entry.id]
    );

    const lineDigest = computeLineDigest(lines);
    const expectedHash = computeEntryHash(entry.prev_hash, entry, lineDigest);

    if (entry.entry_hash !== expectedHash) {
      return {
        valid: false,
        totalChecked: i,
        brokenAtSequence: entry.seal_sequence,
        brokenEntryNo: entry.entry_no,
        reason: 'Altération détectée : le hash de l écriture recalculé ne correspond pas au sceau original.',
        storedHash: entry.entry_hash,
        recomputedHash: expectedHash,
      };
    }

    expectedPrevHash = entry.entry_hash;
  }

  return {
    valid: true,
    totalChecked: sealed.length,
    firstEntryNo: sealed[0].entry_no,
    lastEntryNo: sealed[sealed.length - 1].entry_no,
    genesisHash: GENESIS_HASH,
    finalSealHash: expectedPrevHash,
    verifiedAt: new Date(),
  };
}

export async function getAuditSealStatus({ queryOne }, orgId) {
  const stats = await queryOne(
    `SELECT
       COUNT(*) AS total_entries,
       SUM(status = 'posted') AS total_posted,
       SUM(is_sealed = 1) AS total_sealed,
       SUM(status = 'posted' AND is_sealed = 0) AS pending_seal
     FROM journal_entries WHERE org_id = ?`,
    [orgId]
  );

  const lastRun = await queryOne(
    `SELECT r.*, u.full_name AS sealed_by_name
       FROM audit_seal_runs r
       LEFT JOIN users u ON u.id = r.sealed_by
      WHERE r.org_id = ?
      ORDER BY r.id DESC LIMIT 1`,
    [orgId]
  );

  return {
    totalEntries: Number(stats?.total_entries || 0),
    totalPosted: Number(stats?.total_posted || 0),
    totalSealed: Number(stats?.total_sealed || 0),
    pendingSeal: Number(stats?.pending_seal || 0),
    lastRun,
  };
}
