import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage, payrollApi } from '../../api';
import { getStoredCompanyId } from '../../lib/companyContext';

interface DepartmentSummary {
  id: string;
  year: number;
  month: number;
  department: string;
  headcount: number;
  grossPayroll: number;
  netPayroll: number;
  employerCharges: number;
}

const PAYROLL_APP_URL =
  (import.meta.env.VITE_PAYROLL_APP_URL as string | undefined) || 'http://127.0.0.1:3010';

const Payroll: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const isEn = i18n.language.startsWith('en');
  const formatXaf = (value: number) =>
    (value || 0).toLocaleString(isEn ? 'en-US' : 'fr-FR', {
      style: 'currency',
      currency: 'XAF',
      currencyDisplay: 'symbol',
    });

  const loadSummaries = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
      setLoading(false);
      return;
    }
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    try {
      setLoading(true);
      setLoadError(null);
      const res = await payrollApi.getDepartmentSummaries(companyId, year, month);
      const raw = Array.isArray(res.data) ? res.data : [];
      setRows(
        raw.map((r: Record<string, unknown>) => ({
          id: String(r.id ?? r.Id ?? ''),
          year: Number(r.year ?? r.Year ?? year),
          month: Number(r.month ?? r.Month ?? month),
          department: String(r.department ?? r.Department ?? ''),
          headcount: Number(r.headcount ?? r.Headcount ?? 0),
          grossPayroll: Number(r.grossPayroll ?? r.GrossPayroll ?? 0),
          netPayroll: Number(r.netPayroll ?? r.NetPayroll ?? 0),
          employerCharges: Number(r.employerCharges ?? r.EmployerCharges ?? 0),
        }))
      );
    } catch (err) {
      setRows([]);
      setLoadError(getApiErrorMessage(err, t('payroll.error_load')));
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, t]);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          headcount: acc.headcount + row.headcount,
          gross: acc.gross + row.grossPayroll,
          net: acc.net + row.netPayroll,
          employer: acc.employer + row.employerCharges,
        }),
        { headcount: 0, gross: 0, net: 0, employer: 0 }
      ),
    [rows]
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>💸 {t('payroll.title')}</h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>{t('payroll.desc')}</p>
        </div>
        <a
          href={PAYROLL_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-glow"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          {t('payroll.open_payroll_app')}
        </a>
      </div>

      <div className="glass-panel" style={{ padding: '14px 18px', marginBottom: '20px', borderColor: 'rgba(59, 130, 246, 0.25)' }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{t('payroll.source_title')}</div>
        <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('payroll.dept_summary_hint')}</div>
      </div>

      <div className="glass-panel" style={{ padding: '20px 28px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('payroll.filter_period')}</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--glass-border)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text)',
              }}
            />
          </label>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('hr.loading')}</div>
        ) : loadError ? (
          <div style={{ padding: '16px', color: 'var(--text-muted)' }}>{loadError}</div>
        ) : (
          <>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>{t('hr.department', { defaultValue: 'Department' })}</th>
                  <th style={{ textAlign: 'right' }}>{t('payroll.employees')}</th>
                  <th style={{ textAlign: 'right' }}>{t('payroll.gross')}</th>
                  <th style={{ textAlign: 'right' }}>{t('payroll.net')}</th>
                  <th style={{ textAlign: 'right' }}>{t('payroll.total_employer_charges')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id || `${row.department}-${row.month}`}>
                    <td>{row.department || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{row.headcount}</td>
                    <td style={{ textAlign: 'right' }}>{formatXaf(row.grossPayroll)}</td>
                    <td style={{ textAlign: 'right' }}>{formatXaf(row.netPayroll)}</td>
                    <td style={{ textAlign: 'right' }}>{formatXaf(row.employerCharges)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {t('payroll.no_dept_summaries')}
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td style={{ fontWeight: 800 }}>{t('payroll.totals', { defaultValue: 'Totals' })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{totals.headcount}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatXaf(totals.gross)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatXaf(totals.net)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatXaf(totals.employer)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </>
        )}
      </div>
    </div>
  );
};

export default Payroll;
