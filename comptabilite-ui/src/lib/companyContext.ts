/**
 * Active company id from session storage (set after login / company pick).
 * No hardcoded fallback — callers must handle an empty string.
 */
export function getStoredCompanyId(): string {
  const raw = (localStorage.getItem('companyId') ?? '').trim();
  if (!raw) return '';
  return isGuid(raw) ? raw : '';
}

export function setStoredCompanyId(companyId: string): void {
  const trimmed = (companyId ?? '').trim();
  if (!trimmed) {
    localStorage.removeItem('companyId');
    window.dispatchEvent(new Event('companyChange'));
    return;
  }
  if (!isGuid(trimmed)) return;
  localStorage.setItem('companyId', trimmed);
  window.dispatchEvent(new Event('companyChange'));
}

function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
