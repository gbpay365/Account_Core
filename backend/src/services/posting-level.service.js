import { ApiError } from '../utils/errors.js';

/**
 * FR-PL-001 .. FR-PL-012 :: posting length and header / postable control.
 *
 * SYSCOHADA allows 2+ digits; this deployment posts only at 4 characters.
 * Shorter codes are headings. Existing longer hospital codes stay postable
 * (legacy) but new codes longer than the parameter are refused.
 */

export const DEFAULT_POSTING_LENGTH = 4;

export async function getSetting(db, orgId, key, fallback = null) {
  const row = await db.queryOne(
    'SELECT value_text FROM settings WHERE org_id = ? AND setting_key = ?',
    [orgId, key]
  );
  return row?.value_text ?? fallback;
}

export async function getPostingLength(db, orgId) {
  const raw = await getSetting(db, orgId, 'accounting.posting_length', String(DEFAULT_POSTING_LENGTH));
  const n = Number(raw);
  return Number.isFinite(n) && n >= 2 && n <= 8 ? n : DEFAULT_POSTING_LENGTH;
}

export async function isPostingLengthLocked(db, orgId) {
  const flagged = await getSetting(db, orgId, 'accounting.posting_length_locked', 'false');
  if (flagged === 'true' || flagged === '1') return true;
  const used = await db.queryOne('SELECT id FROM journal_lines WHERE org_id = ? LIMIT 1', [orgId]);
  return Boolean(used);
}

export async function getPostingSettings(db, orgId) {
  const postingLength = await getPostingLength(db, orgId);
  const locked = await isPostingLengthLocked(db, orgId);
  const suspenseCode = await getSetting(db, orgId, 'accounting.suspense_account', '4718');
  const historyOn = (await getSetting(db, orgId, 'accounting.history_suggestions', 'true')) !== 'false';
  const suspense = await db.queryOne(
    'SELECT id, code, name, name_en, is_postable FROM accounts WHERE org_id = ? AND code = ?',
    [orgId, suspenseCode]
  );
  return { posting_length: postingLength, locked, suspense_account: suspenseCode, suspense, history_suggestions: historyOn };
}

export function isHeaderCode(code, postingLength = DEFAULT_POSTING_LENGTH) {
  return String(code || '').length < postingLength;
}

export async function listPostableChildren(db, orgId, code, postingLength = DEFAULT_POSTING_LENGTH) {
  return db.query(
    `SELECT id, code, name, name_en, is_postable
       FROM accounts
      WHERE org_id = ? AND code LIKE ? AND code <> ? AND CHAR_LENGTH(code) >= ? AND is_postable = 1
      ORDER BY code LIMIT 12`,
    [orgId, `${code}%`, code, postingLength]
  );
}

export function headingMessage(code, children = []) {
  const examples = children.slice(0, 4).map((c) => c.code).join(', ');
  const hint = examples
    ? ` Post to a 4-character account (e.g. ${examples}).`
    : ' Post to a 4-character account.';
  return `${code} is a heading account.${hint}`;
}

export async function nextDefaultChildCode(db, orgId, parentCode, postingLength = DEFAULT_POSTING_LENGTH) {
  const need = postingLength - parentCode.length;
  if (need <= 0) return null;
  for (let i = 1; i <= 9; i += 1) {
    const code = parentCode + String(i).padStart(need, '0');
    const clash = await db.queryOne('SELECT id FROM accounts WHERE org_id = ? AND code = ?', [orgId, code]);
    if (!clash) return code;
  }
  return null;
}

export async function ensureDefaultChild(tx, orgId, parent, postingLength = DEFAULT_POSTING_LENGTH) {
  const existing = (await listPostableChildren(tx, orgId, parent.code, postingLength))[0];
  if (existing) {
    return tx.queryOne('SELECT * FROM accounts WHERE id = ?', [existing.id]);
  }
  const code = await nextDefaultChildCode(tx, orgId, parent.code, postingLength);
  if (!code) {
    throw new ApiError(422, `No free ${postingLength}-character account remains under ${parent.code}.`);
  }
  const ins = await tx.query(
    `INSERT INTO accounts
       (org_id, code, name, name_en, account_class, account_type, normal_side, parent_id, level,
        is_postable, requires_cost_center, requires_asset, requires_third_party, is_reconcilable,
        is_fixed_asset, currency, in_tier_normal, in_tier_allege, in_tier_smt, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [
      orgId, code,
      `${parent.name} — général`,
      parent.name_en ? `${parent.name_en} — general` : null,
      parent.account_class, parent.account_type, parent.normal_side,
      parent.id, Number(parent.level || 1) + 1,
      1,
      parent.requires_cost_center ? 1 : 0,
      parent.requires_asset ? 1 : 0,
      parent.requires_third_party ? 1 : 0,
      parent.is_reconcilable ? 1 : 0,
      parent.is_fixed_asset ? 1 : 0,
      parent.currency ?? null,
      parent.in_tier_normal ? 1 : 0,
      parent.in_tier_allege ? 1 : 0,
      parent.in_tier_smt ? 1 : 0,
    ]
  );
  await tx.query('UPDATE accounts SET is_postable = 0 WHERE id = ?', [parent.id]);
  return tx.queryOne('SELECT * FROM accounts WHERE id = ?', [ins.insertId]);
}

/**
 * Resolve a line's account. Manual capture refuses headings (FR-PL-003).
 * System journals silently land on the default 4-character child (FR-PL-006).
 */
export async function resolvePostableAccount(tx, orgId, raw, { source = 'manual', postingLength } = {}) {
  const length = postingLength ?? await getPostingLength(tx, orgId);
  const account = raw.accountId
    ? await tx.queryOne('SELECT * FROM accounts WHERE id = ? AND org_id = ?', [raw.accountId, orgId])
    : await tx.queryOne('SELECT * FROM accounts WHERE code = ? AND org_id = ?', [raw.accountCode, orgId]);

  if (!account) {
    throw new ApiError(422, `Account "${raw.accountCode ?? raw.accountId}" does not exist.`);
  }
  if (!account.is_active) {
    throw new ApiError(422, `Account ${account.code} is not found or inactive.`);
  }

  const header = isHeaderCode(account.code, length) || !account.is_postable;
  if (!header) return account;

  const children = await listPostableChildren(tx, orgId, account.code, length);
  if (source === 'manual') {
    throw new ApiError(422, headingMessage(account.code, children));
  }
  return ensureDefaultChild(tx, orgId, account, length);
}

export function validateNewAccountCode(code, accountClass, postingLength = DEFAULT_POSTING_LENGTH) {
  if (!/^[1-9][0-9]*$/.test(code)) {
    throw new ApiError(422, 'Account numbers are numeric and start with a class digit from 1 to 9.');
  }
  if (!code.startsWith(String(accountClass))) {
    throw new ApiError(422, `A class ${accountClass} account must have a code beginning with ${accountClass}.`);
  }
  if (code.length > postingLength) {
    throw new ApiError(
      422,
      `Account numbers longer than ${postingLength} characters cannot be created. Use a ${postingLength}-character account plus a dimension.`
    );
  }
}

export async function requireExistingParents(tx, orgId, code) {
  for (let len = 1; len < code.length; len += 1) {
    const parentCode = code.slice(0, len);
    if (!/^[1-9][0-9]*$/.test(parentCode)) continue;
    const parent = await tx.queryOne(
      'SELECT id, code, is_postable FROM accounts WHERE org_id = ? AND code = ?',
      [orgId, parentCode]
    );
    if (!parent && len >= 2) {
      throw new ApiError(422, `Parent account ${parentCode} does not exist. Create it before ${code}.`);
    }
    if (parent) {
      const used = await tx.queryOne(
        'SELECT COUNT(*) AS n FROM journal_lines WHERE account_id = ?',
        [parent.id]
      );
      if (Number(used.n) > 0 && parent.is_postable) {
        throw new ApiError(422, `Account ${parent.code} already has movements. Use the reclassification procedure.`);
      }
    }
  }
}

export async function classifyAccount(code, postingLength, hasChildren) {
  if (hasChildren) return 0;
  return String(code).length >= postingLength ? 1 : 0;
}

export async function remapHeadingMovements(tx, orgId, postingLength = DEFAULT_POSTING_LENGTH) {
  const headings = await tx.query(
    `SELECT a.* FROM accounts a
      WHERE a.org_id = ?
        AND (CHAR_LENGTH(a.code) < ? OR a.is_postable = 0)
        AND EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.account_id = a.id)`,
    [orgId, postingLength]
  );
  let remapped = 0;
  for (const heading of headings) {
    const child = await ensureDefaultChild(tx, orgId, heading, postingLength);
    const res = await tx.query(
      'UPDATE journal_lines SET account_id = ? WHERE account_id = ?',
      [child.id, heading.id]
    );
    remapped += Number(res.affectedRows || 0);
  }
  return remapped;
}

export async function reclassifyByLength(tx, orgId, postingLength = DEFAULT_POSTING_LENGTH) {
  await tx.query(
    'UPDATE accounts SET is_postable = 0 WHERE org_id = ? AND CHAR_LENGTH(code) < ?',
    [orgId, postingLength]
  );
  await tx.query(
    `UPDATE accounts a
        JOIN accounts c ON c.org_id = a.org_id AND c.parent_id = a.id
        SET a.is_postable = 0
      WHERE a.org_id = ?`,
    [orgId]
  );
  await tx.query(
    `UPDATE accounts a
        LEFT JOIN accounts c ON c.org_id = a.org_id AND c.parent_id = a.id
        SET a.is_postable = 1
      WHERE a.org_id = ? AND c.id IS NULL AND CHAR_LENGTH(a.code) >= ?`,
    [orgId, postingLength]
  );
}

export async function flagCollectiveAccounts(tx, orgId) {
  await tx.query(
    `UPDATE accounts
        SET requires_third_party = 1
      WHERE org_id = ? AND is_postable = 1
        AND (code LIKE '401%' OR code LIKE '411%' OR code LIKE '422%'
             OR code LIKE '403%' OR code LIKE '409%')`,
    [orgId]
  );
}

export async function suspenseBalance(db, orgId) {
  const settings = await getPostingSettings(db, orgId);
  if (!settings.suspense?.id) return { account: settings.suspense_account, balance: 0, lines: 0 };
  const row = await db.queryOne(
    `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance, COUNT(jl.id) AS n
       FROM journal_lines jl
       JOIN journal_entries e ON e.id = jl.entry_id
      WHERE jl.account_id = ? AND e.status = 'posted'`,
    [settings.suspense.id]
  );
  return {
    account: settings.suspense,
    balance: Number(row?.balance || 0),
    lines: Number(row?.n || 0),
  };
}
