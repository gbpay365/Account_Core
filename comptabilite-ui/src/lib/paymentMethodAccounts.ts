/** OHADA payment method accounts (Class 5) — aligned with WYVERN 552601–552606. */

export const PAYMENT_METHOD_ACCOUNT_CODES = Object.freeze([
  '552601',
  '552602',
  '552603',
  '552604',
  '552605',
  '552606',
]);

export const PAYMENT_METHOD_SHORT_LABELS: Record<string, string> = Object.freeze({
  '552601': 'Cash',
  '552602': 'OM',
  '552603': 'MOMO',
  '552604': 'Bank',
  '552605': 'BetterPay',
  '552606': 'Wallet',
});

export function isPaymentMethodAccountCode(code: string): boolean {
  return PAYMENT_METHOD_ACCOUNT_CODES.includes(String(code || '').trim());
}

export type PostingAccountRef = {
  id: string;
  code: string;
  label: string;
};

export function paymentMethodsFromAccounts(postingAccounts: PostingAccountRef[]) {
  const byCode = new Map(postingAccounts.map((a) => [a.code, a]));
  const out: Array<PostingAccountRef & { shortLabel: string }> = [];
  for (const code of PAYMENT_METHOD_ACCOUNT_CODES) {
    const acct = byCode.get(code);
    if (!acct) continue;
    out.push({
      ...acct,
      shortLabel: PAYMENT_METHOD_SHORT_LABELS[code] || acct.label,
    });
  }
  return out;
}
