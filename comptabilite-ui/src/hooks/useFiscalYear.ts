import { useCallback, useEffect, useState } from 'react';
import { reportsApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';
import { currentFiscalYear } from '../lib/fiscalYear';

/**
 * Resolves the fiscal year for GL / statements: prefers the latest year with posted journals.
 */
export function useFiscalYear() {
  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear());
  const [availableYears, setAvailableYears] = useState<number[]>([currentFiscalYear()]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await reportsApi.getJournalYears(companyId);
      const years = Array.isArray(res.data)
        ? (res.data as number[]).filter((y) => Number.isFinite(y))
        : [];
      if (years.length) {
        setAvailableYears(years);
        setFiscalYear((prev) => (years.includes(prev) ? prev : years[0]));
      } else {
        const y = currentFiscalYear();
        setAvailableYears([y]);
        setFiscalYear(y);
      }
    } catch {
      const y = currentFiscalYear();
      setAvailableYears([y]);
      setFiscalYear(y);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onCompany = () => refresh();
    window.addEventListener('companyChange', onCompany);
    return () => window.removeEventListener('companyChange', onCompany);
  }, [refresh]);

  return { fiscalYear, setFiscalYear, availableYears, loading, refresh };
}
