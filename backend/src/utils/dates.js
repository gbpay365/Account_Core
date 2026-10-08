/** Date helpers. Everything is handled as a `YYYY-MM-DD` string to avoid
 *  timezone drift between MySQL DATE columns and JS Date objects. */

export const toISO = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const dt = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

export const parts = (iso) => {
  const [y, m, d] = toISO(iso).split('-').map(Number);
  return { y, m, d };
};

export const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

export function addMonths(iso, months) {
  const { y, m, d } = parts(iso);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  const p = (n) => String(n).padStart(2, '0');
  return `${ny}-${p(nm)}-${p(nd)}`;
}

export function addDays(iso, days) {
  const { y, m, d } = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export const endOfMonth = (iso) => {
  const { y, m } = parts(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(daysInMonth(y, m))}`;
};

export const startOfMonth = (iso) => `${toISO(iso).slice(0, 7)}-01`;

export const compare = (a, b) => (toISO(a) < toISO(b) ? -1 : toISO(a) > toISO(b) ? 1 : 0);

export const diffDays = (from, to) =>
  Math.round((Date.parse(`${toISO(to)}T00:00:00Z`) - Date.parse(`${toISO(from)}T00:00:00Z`)) / 86400000);

/** Whole and fractional months between two dates, used for pro-rata charges. */
export function monthsBetween(from, to) {
  const a = parts(from);
  const b = parts(to);
  return (b.y - a.y) * 12 + (b.m - a.m) + (b.d - a.d) / daysInMonth(b.y, b.m);
}

export const today = () => toISO(new Date());

/**
 * Next occurrence of a recurring schedule on or after `notBefore`.
 *
 * Equipment is usually registered long after it was bought, so anchoring a
 * recurring task on the acquisition date would make it look decades overdue.
 * The cadence is preserved by stepping whole intervals from the anchor.
 */
export function nextOccurrence(anchor, months, notBefore = today()) {
  if (!months || months <= 0) return null;
  const start = toISO(anchor);
  if (compare(start, notBefore) >= 0) return start;
  const elapsed = Math.max(0, Math.floor(monthsBetween(start, notBefore) / months));
  let due = addMonths(start, elapsed * months);
  while (compare(due, notBefore) < 0) due = addMonths(due, months);
  return due;
}
