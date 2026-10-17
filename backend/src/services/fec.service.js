import { money } from '../utils/money.js';

/**
 * FEC OHADA (Fichier des Écritures Comptables)
 * Conforming to OHADA AUDCIF Article 22 & General Tax Codes of OHADA Member States.
 *
 * Generates the standardized 18-column accounting audit file required for tax audits
 * and statutory certification.
 */

export const FEC_COLUMNS = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
];

function formatDateYMD(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatAmount(val, decimalSep = ',') {
  const num = Number(val || 0);
  const fixed = num.toFixed(2);
  return decimalSep === ',' ? fixed.replace('.', ',') : fixed;
}

export async function generateFecData({ query, queryOne }, orgId, { fiscalYearId = null, periodId = null }) {
  const org = await queryOne(
    `SELECT id, name, tax_id, country_code, functional_currency FROM organizations WHERE id = ?`,
    [orgId]
  );

  let fy = null;
  if (fiscalYearId) {
    fy = await queryOne(`SELECT * FROM fiscal_years WHERE id = ? AND org_id = ?`, [fiscalYearId, orgId]);
  } else if (periodId) {
    const p = await queryOne(
      `SELECT ap.*, fy.id AS fy_id, fy.code AS fy_code, fy.end_date AS fy_end_date
         FROM accounting_periods ap
         JOIN fiscal_years fy ON fy.id = ap.fiscal_year_id
        WHERE ap.id = ? AND ap.org_id = ?`,
      [periodId, orgId]
    );
    fy = { id: p.fy_id, code: p.fy_code, end_date: p.fy_end_date };
  } else {
    fy = await queryOne(
      `SELECT * FROM fiscal_years WHERE org_id = ? ORDER BY start_date DESC LIMIT 1`,
      [orgId]
    );
  }

  const sql = `
    SELECT
      j.code AS journal_code,
      j.name AS journal_name,
      je.entry_no,
      je.entry_date,
      je.reference AS piece_ref,
      je.description AS entry_desc,
      je.posted_at,
      jl.line_no,
      jl.description AS line_desc,
      jl.debit,
      jl.credit,
      jl.currency,
      jl.fx_rate,
      jl.match_code,
      jl.match_date,
      a.code AS account_code,
      a.name AS account_name,
      sa.code AS subledger_code,
      sa.name AS subledger_name,
      s.code AS supplier_code,
      s.name AS supplier_name,
      c.code AS customer_code,
      c.name AS customer_name
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN journals j ON j.id = je.journal_id
    JOIN accounts a ON a.id = jl.account_id
    JOIN accounting_periods ap ON ap.id = je.period_id
    LEFT JOIN subledger_accounts sa ON sa.id = jl.subledger_id
    LEFT JOIN suppliers s ON s.id = jl.partner_id AND jl.partner_type = 'supplier'
    LEFT JOIN customers c ON c.id = jl.partner_id AND jl.partner_type = 'customer'
    WHERE je.org_id = ? AND je.status = 'posted'
      ${fy ? 'AND ap.fiscal_year_id = ?' : ''}
      ${periodId ? 'AND je.period_id = ?' : ''}
    ORDER BY je.entry_date ASC, je.entry_no ASC, jl.line_no ASC`;

  const params = [orgId];
  if (fy) params.push(fy.id);
  if (periodId) params.push(periodId);

  const lines = await query(sql, params);

  let totalDebit = 0;
  let totalCredit = 0;

  const rows = lines.map((l) => {
    totalDebit += Number(l.debit || 0);
    totalCredit += Number(l.credit || 0);

    const compAuxNum = l.subledger_code || l.supplier_code || l.customer_code || '';
    const compAuxLib = l.subledger_name || l.supplier_name || l.customer_name || '';

    const isFx = l.currency && l.currency !== (org?.functional_currency || 'XAF');
    const fxAmount = isFx ? (Number(l.debit) || Number(l.credit)) / (Number(l.fx_rate) || 1) : null;

    return {
      JournalCode: l.journal_code,
      JournalLib: l.journal_name,
      EcritureNum: l.entry_no,
      EcritureDate: formatDateYMD(l.entry_date),
      CompteNum: l.account_code,
      CompteLib: l.account_name,
      CompAuxNum: compAuxNum,
      CompAuxLib: compAuxLib,
      PieceRef: l.piece_ref || l.entry_no,
      PieceDate: formatDateYMD(l.entry_date),
      EcritureLib: l.line_desc || l.entry_desc || '',
      Debit: Number(l.debit || 0),
      Credit: Number(l.credit || 0),
      EcritureLet: l.match_code || '',
      DateLet: formatDateYMD(l.match_date),
      ValidDate: formatDateYMD(l.posted_at || l.entry_date),
      Montantdevise: fxAmount != null ? Number(fxAmount.toFixed(2)) : '',
      Idevise: isFx ? l.currency : '',
    };
  });

  const taxIdSanitized = (org?.tax_id || '999999999').replace(/[^a-zA-Z0-9]/g, '');
  const closingDateStr = formatDateYMD(fy?.end_date || new Date());
  const fileName = `${taxIdSanitized}FEC${closingDateStr}.txt`;

  return {
    organisation: org,
    fiscalYear: fy,
    fileName,
    totalLines: rows.length,
    totalDebit: money(totalDebit),
    totalCredit: money(totalCredit),
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    rows,
  };
}

export function exportFecString(fecData, { delimiter = '\t', decimalSep = ',' } = {}) {
  const header = FEC_COLUMNS.join(delimiter);
  const dataLines = fecData.rows.map((r) =>
    [
      r.JournalCode,
      r.JournalLib,
      r.EcritureNum,
      r.EcritureDate,
      r.CompteNum,
      r.CompteLib,
      r.CompAuxNum,
      r.CompAuxLib,
      r.PieceRef,
      r.PieceDate,
      r.EcritureLib,
      formatAmount(r.Debit, decimalSep),
      formatAmount(r.Credit, decimalSep),
      r.EcritureLet,
      r.DateLet,
      r.ValidDate,
      r.Montantdevise !== '' ? formatAmount(r.Montantdevise, decimalSep) : '',
      r.Idevise,
    ].join(delimiter)
  );

  return [header, ...dataLines].join('\r\n');
}
