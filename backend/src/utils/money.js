/** Decimal places per currency. XOF/XAF have no minor unit. */
const DECIMALS = { XAF: 0, XOF: 0, KMF: 0, GNF: 0, JPY: 0 };

export const currencyDecimals = (code) => DECIMALS[String(code || '').toUpperCase()] ?? 2;

/** Round half-away-from-zero, which is what statutory rounding expects. */
export function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return (value < 0 ? -1 : 1) * Math.round(Math.abs(value) * f) / f;
}

export const roundCurrency = (value, currency) => round(value, currencyDecimals(currency));

/** Ledger amounts are stored with 2 decimals regardless of currency. */
export const money = (value) => round(Number(value) || 0, 2);

export function formatAmount(value, currency = 'XAF', locale = 'fr-FR') {
  const d = currencyDecimals(currency);
  return new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
    .format(Number(value) || 0);
}
