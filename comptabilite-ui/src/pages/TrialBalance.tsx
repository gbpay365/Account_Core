import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { downloadBlob, reportsApi } from '../api';
import { amountLocale } from '../utils/reportLocale';
import { getStoredCompanyId } from '../lib/companyContext';
import { showToast } from '../utils/dialogs';
import { useFiscalYear } from '../hooks/useFiscalYear';
import FiscalYearSelect from '../components/FiscalYearSelect';

interface TrialBalanceRow {
  accountCode: string;
  nameEn: string;
  nameFr: string;
  totalDebit: number;
  totalCredit: number;
  balance?: number;
}

const TrialBalance: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { fiscalYear, setFiscalYear, availableYears, loading: yearLoading } = useFiscalYear();
  const [data, setData] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const numLoc = amountLocale(i18n.language);

  const loadTrialBalance = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
      setError(t('trial_balance.no_company'));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await reportsApi.getTrialBalance(fiscalYear, companyId);
      setData(res.data);
    } catch {
      setError(t('trial_balance.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t, fiscalYear]);

  useEffect(() => {
    if (!yearLoading) loadTrialBalance();
  }, [loadTrialBalance, yearLoading]);

  const totalDebit = data.reduce((s, r) => s + (r.totalDebit || 0), 0);
  const totalCredit = data.reduce((s, r) => s + (r.totalCredit || 0), 0);

  const handleExcelExport = async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
      showToast(t('trial_balance.no_company'), 'error');
      return;
    }
    try {
      const res = await reportsApi.exportTrialBalanceExcel(fiscalYear, companyId, i18n.language);
      downloadBlob(
        res.data,
        `trial_balance_${fiscalYear}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    } catch { showToast(t('trial_balance.export_failed'), 'error'); }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <FiscalYearSelect fiscalYear={fiscalYear} availableYears={availableYears} onChange={setFiscalYear} disabled={loading} />
          <div>
          <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            ⚖️ {t('trial_balance.title')}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              {t('trial_balance.subtitle', { year: fiscalYear })}
            </p>
          </div>
          </div>
        </div>
        <button 
          onClick={handleExcelExport} 
          disabled={loading} 
          className="btn-glow"
          style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
        >
          <span>📊</span> {t('common.export_excel')}
        </button>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '80px', textAlign: 'center' }}>
          <div className="animate-spin" style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⌛</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{t('trial_balance.loading') || t('reports.loading')}</p>
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
          <p style={{ fontWeight: 600 }}>{error}</p>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="premium-table">
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                <th style={{ padding: '18px 24px' }}>{t('trial_balance.account')}</th>
                <th style={{ padding: '18px 24px' }}>{t('trial_balance.label')}</th>
                <th style={{ textAlign: 'right', padding: '18px 24px' }}>{t('trial_balance.debit')}</th>
                <th style={{ textAlign: 'right', padding: '18px 24px' }}>{t('trial_balance.credit')}</th>
                <th style={{ textAlign: 'right', padding: '18px 24px' }}>{t('trial_balance.balance', { defaultValue: 'Balance' })}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, idx) => {
                const balance = r.balance ?? (r.totalCredit - r.totalDebit);
                return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '14px 24px' }}>
                    <Link
                      to={`/general-ledger?account=${encodeURIComponent(r.accountCode)}&year=${fiscalYear}`}
                      title={t('trial_balance.drill_gl', { defaultValue: 'View ledger detail' })}
                      style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '0.85rem', 
                        fontWeight: 700,
                        color: 'var(--color-primary)',
                        background: 'rgba(99,102,241,0.08)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        textDecoration: 'none',
                      }}
                    >
                      {r.accountCode}
                    </Link>
                  </td>
                  <td style={{ padding: '14px 24px', fontWeight: 500, color: 'var(--text-main)' }}>
                    {i18n.language === 'fr' ? r.nameFr : r.nameEn}
                  </td>
                  <td style={{ textAlign: 'right', padding: '14px 24px', fontFamily: 'monospace', fontSize: '0.95rem', color: r.totalDebit > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    {r.totalDebit > 0 ? r.totalDebit.toLocaleString(numLoc, { minimumFractionDigits: 2 }) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '14px 24px', fontFamily: 'monospace', fontSize: '0.95rem', color: r.totalCredit > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    {r.totalCredit > 0 ? r.totalCredit.toLocaleString(numLoc, { minimumFractionDigits: 2 }) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '14px 24px', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: balance !== 0 ? 600 : 400, color: balance !== 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    {balance !== 0 ? balance.toLocaleString(numLoc, { minimumFractionDigits: 2 }) : '—'}
                  </td>
                </tr>
              );})}
              <tr style={{ background: 'rgba(99,102,241,0.05)', borderTop: '2px solid var(--color-primary)' }}>
                <td colSpan={2} style={{ padding: '20px 24px', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                  {t('trial_balance.totals')}
                </td>
                <td style={{ textAlign: 'right', padding: '20px 24px', fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                  {totalDebit.toLocaleString(numLoc, { minimumFractionDigits: 2 })}
                </td>
                <td style={{ textAlign: 'right', padding: '20px 24px', fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                  {totalCredit.toLocaleString(numLoc, { minimumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                    {t('trial_balance.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TrialBalance;
