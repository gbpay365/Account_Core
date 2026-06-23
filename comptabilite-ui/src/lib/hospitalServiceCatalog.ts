/** Hospital revenue GL accounts (7016xx–7066xx) with HMS service catalog prices. */

import { isPaymentMethodAccountCode, PAYMENT_METHOD_SHORT_LABELS } from './paymentMethodAccounts';

export type CatalogService = {
  key: string;
  name: string;
  price: number;
};

export type CatalogEntry = {
  account_code: string;
  label: string;
  hms_category?: string;
  hms_subcategory?: string;
  services: CatalogService[];
  default_price: number;
};

export type ServiceCatalogByCode = Record<string, CatalogEntry>;

export function isHospitalRevenueAccount(code: string): boolean {
  const c = String(code || '');
  return (
    c.startsWith('7016') ||
    c.startsWith('7026') ||
    c.startsWith('7036') ||
    c.startsWith('7046') ||
    c.startsWith('7066')
  );
}

export function catalogEntryForAccount(catalogByCode: ServiceCatalogByCode | undefined, accountCode: string): CatalogEntry | null {
  if (!accountCode || !catalogByCode) return null;
  return catalogByCode[accountCode] ?? null;
}

export function pickDefaultCatalogService(entry: CatalogEntry | null): CatalogService | null {
  if (!entry?.services?.length) return null;
  if (entry.services.length === 1) return entry.services[0];
  const target = Number(entry.default_price) || 0;
  const hit = entry.services.find((s) => s.price === target);
  if (hit) return hit;
  let best = entry.services[0];
  let bestDiff = Math.abs(best.price - target);
  for (const svc of entry.services.slice(1)) {
    const diff = Math.abs(svc.price - target);
    if (diff < bestDiff) {
      best = svc;
      bestDiff = diff;
    }
  }
  return best;
}

export function findCatalogService(entry: CatalogEntry | null, serviceKey: string): CatalogService | null {
  if (!entry?.services?.length || !serviceKey) return null;
  return entry.services.find((s) => s.key === serviceKey) ?? null;
}

export type CatalogLinePatch = {
  catalogServiceKey?: string;
  creditAmount: number;
  debitAmount: number;
  description: string;
};

export function applyCatalogPriceToLine(
  line: { description?: string; debitAmount?: number; creditAmount?: number; catalogServiceKey?: string },
  _entry: CatalogEntry,
  service: CatalogService
): CatalogLinePatch {
  return {
    catalogServiceKey: service.key,
    creditAmount: service.price,
    debitAmount: 0,
    description: line.description?.trim() ? line.description : service.name,
  };
}

/** Prefer HMS subcategory / service name over long account label. */
export function defaultLineDescription(accountCode: string, accountLabel: string, catalogByCode: ServiceCatalogByCode | undefined): string {
  const code = String(accountCode || '').trim();
  if (isPaymentMethodAccountCode(code) && PAYMENT_METHOD_SHORT_LABELS[code]) {
    return PAYMENT_METHOD_SHORT_LABELS[code];
  }

  const entry = catalogEntryForAccount(catalogByCode, accountCode);
  const service = entry ? pickDefaultCatalogService(entry) : null;
  if (service?.name) return service.name;
  if (entry?.hms_subcategory) return entry.hms_subcategory;
  const parts = accountLabel.split('—').map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];
  const dashParts = accountLabel.split(' - ').map((s) => s.trim()).filter(Boolean);
  if (dashParts.length > 1) return dashParts[dashParts.length - 1];
  return accountLabel;
}
