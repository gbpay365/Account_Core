/** Calendar year used as default fiscal year when no ledger data hint exists. */
export function currentFiscalYear(): number {
  return new Date().getFullYear();
}
