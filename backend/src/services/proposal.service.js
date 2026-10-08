import { money } from '../utils/money.js';
import { getPostingLength, getPostingSettings, resolvePostableAccount } from './posting-level.service.js';

/**
 * FR-DE-004 .. FR-DE-012 :: counter-account proposals.
 *
 * Sources, in order: posting template, account default, third-party default,
 * history, then the suspense account. A proposal is never posted by itself.
 */

function sideOf(line) {
  return Number(line.debit || 0) > 0 ? 'debit' : 'credit';
}

function enteredAccounts(lines) {
  return new Set(lines.map((l) => String(l.accountCode || l.accountId || '')));
}

async function resolveCode(tx, orgId, rule, postingLength) {
  if (!rule || rule.startsWith('{{')) return null;
  try {
    const account = await resolvePostableAccount(
      tx, orgId, { accountCode: rule }, { source: 'system', postingLength }
    );
    return account;
  } catch {
    const row = await tx.queryOne(
      `SELECT * FROM accounts
        WHERE org_id = ? AND is_postable = 1 AND is_active = 1 AND code LIKE ?
        ORDER BY CHAR_LENGTH(code), code LIMIT 1`,
      [orgId, `${rule}%`]
    );
    return row || null;
  }
}

async function fromTemplate(tx, orgId, { lines, transactionType, imbalance, postingLength }) {
  if (!transactionType) return null;
  const template = await tx.queryOne(
    `SELECT * FROM posting_templates
      WHERE org_id = ? AND is_active = 1 AND transaction_type = ?
      ORDER BY sort_order LIMIT 1`,
    [orgId, transactionType]
  );
  if (!template) return null;
  const tlines = await tx.query(
    'SELECT * FROM posting_template_lines WHERE template_id = ? AND is_proposed = 1 ORDER BY line_no',
    [template.id]
  );
  if (!tlines.length) return null;

  const needSide = imbalance > 0 ? 'credit' : 'debit';
  const amount = money(Math.abs(imbalance));
  const used = enteredAccounts(lines);
  const proposals = [];
  for (const row of tlines) {
    if (row.side !== needSide && tlines.length > 1) continue;
    const account = await resolveCode(tx, orgId, row.account_rule, postingLength);
    if (!account || used.has(account.code) || used.has(String(account.id))) continue;
    proposals.push({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name_en || account.name,
      debit: row.side === 'debit' ? amount : 0,
      credit: row.side === 'credit' ? amount : 0,
      partnerType: row.third_party_rule === 'none' ? 'none' : row.third_party_rule,
      origin: 'proposed',
      proposalSource: 'template',
      proposalRuleCode: template.code,
      proposalReason: `Template ${template.code}: ${template.name_en || template.name}`,
    });
    break;
  }
  return proposals.length ? { source: 'template', rule: template.code, proposals } : null;
}

async function fromAccountDefault(tx, orgId, { lines, imbalance }) {
  const needSide = imbalance > 0 ? 'credit' : 'debit';
  const amount = money(Math.abs(imbalance));
  for (const line of lines) {
    const account = line.accountId
      ? await tx.queryOne('SELECT * FROM accounts WHERE id = ?', [line.accountId])
      : await tx.queryOne('SELECT * FROM accounts WHERE org_id = ? AND code = ?', [orgId, line.accountCode]);
    if (!account) continue;
    const counterId = needSide === 'debit' ? account.default_counter_debit_id : account.default_counter_credit_id;
    if (!counterId) continue;
    const counter = await tx.queryOne(
      'SELECT * FROM accounts WHERE id = ? AND org_id = ? AND is_postable = 1 AND is_active = 1',
      [counterId, orgId]
    );
    if (!counter) continue;
    return {
      source: 'account_default',
      rule: account.code,
      proposals: [{
        accountId: counter.id,
        accountCode: counter.code,
        accountName: counter.name_en || counter.name,
        debit: needSide === 'debit' ? amount : 0,
        credit: needSide === 'credit' ? amount : 0,
        partnerType: 'none',
        origin: 'proposed',
        proposalSource: 'account_default',
        proposalRuleCode: account.code,
        proposalReason: `Default ${needSide} counterpart configured on ${account.code}`,
      }],
    };
  }
  return null;
}

async function fromThirdParty(tx, orgId, { lines, imbalance }) {
  const needSide = imbalance > 0 ? 'credit' : 'debit';
  const amount = money(Math.abs(imbalance));
  for (const line of lines) {
    if (!line.partnerId || line.partnerType === 'none') continue;
    const table = line.partnerType === 'customer' ? 'customers' : 'suppliers';
    const party = await tx.queryOne(
      `SELECT * FROM ${table} WHERE id = ? AND org_id = ?`,
      [line.partnerId, orgId]
    );
    const counterId = party?.default_account_id || party?.account_id;
    if (!counterId) continue;
    const counter = await tx.queryOne(
      'SELECT * FROM accounts WHERE id = ? AND is_postable = 1 AND is_active = 1',
      [counterId]
    );
    if (!counter) continue;
    return {
      source: 'third_party',
      rule: party.code,
      proposals: [{
        accountId: counter.id,
        accountCode: counter.code,
        accountName: counter.name_en || counter.name,
        debit: needSide === 'debit' ? amount : 0,
        credit: needSide === 'credit' ? amount : 0,
        partnerType: line.partnerType,
        partnerId: line.partnerId,
        origin: 'proposed',
        proposalSource: 'third_party',
        proposalRuleCode: party.code,
        proposalReason: `Default account on ${line.partnerType} ${party.name}`,
      }],
    };
  }
  return null;
}

async function fromHistory(tx, orgId, { lines, imbalance }) {
  const settings = await getPostingSettings(tx, orgId);
  if (!settings.history_suggestions) return null;
  const needSide = imbalance > 0 ? 'credit' : 'debit';
  const amount = money(Math.abs(imbalance));
  const entered = lines.find((l) => (needSide === 'credit' ? Number(l.debit || 0) > 0 : Number(l.credit || 0) > 0));
  if (!entered?.accountId && !entered?.accountCode) return null;
  const account = entered.accountId
    ? await tx.queryOne('SELECT * FROM accounts WHERE id = ?', [entered.accountId])
    : await tx.queryOne('SELECT * FROM accounts WHERE org_id = ? AND code = ?', [orgId, entered.accountCode]);
  if (!account) return null;

  const row = await tx.queryOne(
    `SELECT a.id, a.code, a.name, a.name_en,
            COUNT(*) AS uses, MAX(e.entry_date) AS last_used
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN journal_lines o ON o.entry_id = l.entry_id AND o.id <> l.id
       JOIN accounts a ON a.id = o.account_id
      WHERE l.account_id = ? AND e.org_id = ? AND e.status = 'posted'
        AND e.reversed_by_entry_id IS NULL AND a.is_postable = 1
        AND ((l.debit > 0 AND o.credit > 0) OR (l.credit > 0 AND o.debit > 0))
      GROUP BY a.id
      ORDER BY uses DESC, last_used DESC
      LIMIT 1`,
    [account.id, orgId]
  );
  if (!row) return null;
  return {
    source: 'history',
    rule: account.code,
    proposals: [{
      accountId: row.id,
      accountCode: row.code,
      accountName: row.name_en || row.name,
      debit: needSide === 'debit' ? amount : 0,
      credit: needSide === 'credit' ? amount : 0,
      partnerType: 'none',
      origin: 'proposed',
      proposalSource: 'history',
      proposalRuleCode: account.code,
      proposalReason: `Most used counterpart of ${account.code} (${row.uses} posted entries)`,
    }],
  };
}

async function fromSuspense(tx, orgId, { imbalance }) {
  const settings = await getPostingSettings(tx, orgId);
  const postingLength = settings.posting_length;
  const account = settings.suspense
    ? await resolvePostableAccount(
      tx, orgId, { accountCode: settings.suspense.code || settings.suspense_account },
      { source: 'system', postingLength }
    )
    : null;
  if (!account) return null;
  const needSide = imbalance > 0 ? 'credit' : 'debit';
  const amount = money(Math.abs(imbalance));
  return {
    source: 'suspense',
    rule: account.code,
    proposals: [{
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name_en || account.name,
      debit: needSide === 'debit' ? amount : 0,
      credit: needSide === 'credit' ? amount : 0,
      partnerType: 'none',
      origin: 'proposed',
      proposalSource: 'suspense',
      proposalRuleCode: account.code,
      proposalReason: 'No template, default or history applied — flagged for review on the suspense account',
    }],
  };
}

export async function proposeCounterLines(tx, orgId, input) {
  const lines = (input.lines || []).filter((l) => l.accountId || l.accountCode);
  const debit = money(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const credit = money(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  const imbalance = money(debit - credit);
  if (imbalance === 0) {
    return { balanced: true, difference: 0, source: null, proposals: [] };
  }

  const postingLength = await getPostingLength(tx, orgId);
  const ctx = { ...input, lines, imbalance, postingLength };
  const pack = await fromTemplate(tx, orgId, ctx)
    || await fromAccountDefault(tx, orgId, ctx)
    || await fromThirdParty(tx, orgId, ctx)
    || await fromHistory(tx, orgId, ctx)
    || await fromSuspense(tx, orgId, ctx);

  return {
    balanced: false,
    difference: imbalance,
    source: pack?.source || null,
    rule: pack?.rule || null,
    proposals: pack?.proposals || [],
  };
}

export { sideOf };
