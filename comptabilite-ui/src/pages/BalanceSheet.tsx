import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob, reportsApi } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { amountLocale } from '../utils/reportLocale';
import { getStoredCompanyId } from '../lib/companyContext';
import { useFiscalYear } from '../hooks/useFiscalYear';
import FiscalYearSelect from '../components/FiscalYearSelect';

const BalanceSheet: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { fiscalYear, setFiscalYear, availableYears, loading: yearLoading } = useFiscalYear();
  const { hasPermission } = usePermissions();
  const canExport = hasPermission('balance_sheet', 'export');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const numLoc = amountLocale(i18n.language);

  useEffect(() => {
    const companyId = getStoredCompanyId();
    if (!companyId || yearLoading) {
      if (!companyId) {
        setError(t('reports.no_company'));
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    reportsApi.getBalanceSheet(fiscalYear, companyId)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { console.error(err); setError(t('reports.load_failed')); setLoading(false); });
  }, [t, fiscalYear, yearLoading]);

  const handleExport = async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
      setError(t('reports.no_company'));
      return;
    }
    try {
      const res = await reportsApi.exportBalanceSheetPdf(fiscalYear, companyId, i18n.language);
      downloadBlob(res.data, `balance_sheet_${fiscalYear}.pdf`, 'application/pdf');
    } catch (err) { console.error('Export failed', err); }
  };

  const AccountTable = ({ items, accentColor, total, totalLabel }: any) => (
    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${accentColor}33` }}>
      <table className="premium-table">
        <thead>
          <tr style={{ background: `${accentColor}11` }}>
            <th style={{ padding: '12px 20px', fontSize: '0.75rem', color: accentColor }}>{t('common.account').toUpperCase()}</th>
            <th style={{ padding: '12px 20px', fontSize: '0.75rem', color: accentColor }}>{t('common.label').toUpperCase()}</th>
            <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: '0.75rem', color: accentColor }}>{t('common.amount').toUpperCase()}</th>
          </tr>
        </thead>
        <tbody>
          {items?.map((item: any, idx: number) => (
            <tr key={idx}>
              <td style={{ padding: '10px 20px', fontFamily: 'monospace', color: accentColor, fontWeight: 700 }}>{item.code}</td>
              <td style={{ padding: '10px 20px', color: 'var(--text-main)' }}>{i18n.language === 'fr' ? item.labelFr : item.labelEn}</td>
              <td style={{ textAlign: 'right', padding: '10px 20px', fontWeight: 600, fontFamily: 'monospace' }}>
                {item.amount.toLocaleString(numLoc, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
          <tr style={{ background: `${accentColor}08`, borderTop: `2px solid ${accentColor}44` }}>
            <td colSpan={2} style={{ padding: '14px 20px', fontWeight: 800, color: 'var(--text-main)' }}>{totalLabel}</td>
            <td style={{ padding: '14px 20px', fontWeight: 900, color: accentColor, textAlign: 'right', fontSize: '1.1rem', fontFamily: 'monospace' }}>
              {total?.toLocaleString(numLoc, { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <FiscalYearSelect fiscalYear={fiscalYear} availableYears={availableYears} onChange={setFiscalYear} disabled={loading} />
          <h1 style={{ margin: '10px 0 0', fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            ⚖️ {t('balance_sheet.title')}
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '1rem' }}>
            {t('balance_sheet.subtitle', { year: fiscalYear })}
          </p>
        </div>
        {canExport && (
          <button onClick={handleExport} className="btn-danger-glow" style={{ padding: '10px 24px', fontWeight: 700 }}>
            ↓ {t('reports.export_pdf')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '80px', textAlign: 'center' }}>
          <div className="animate-spin" style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚖️</div>
          <p style={{ color: 'var(--text-muted)' }}>{t('reports.loading')}</p>
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: '#f87171' }}>{error}</div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            {/* ASSETS COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <span style={{ fontSize: '1.4rem' }}>📦</span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)' }}>{t('balance_sheet.assets')}</h3>
              </div>
              <AccountTable items={data.assets} accentColor="#6366f1" total={data.totalAssets} totalLabel={t('balance_sheet.total_assets')} />
            </div>

            {/* LIABILITIES & EQUITY COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <span style={{ fontSize: '1.4rem' }}>🏦</span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-warning)' }}>{t('balance_sheet.liabilities')} & {t('balance_sheet.equity')}</h3>
              </div>
              
              {data.equity?.length > 0 && (
                <AccountTable items={data.equity} accentColor="#10b981" total={data.equity.reduce((s: number, e: any) => s + e.amount, 0)} totalLabel={t('balance_sheet.total_equity_footer')} />
              )}

              <AccountTable items={data.liabilities} accentColor="#f59e0b" total={data.totalLiabilitiesAndEquity} totalLabel={t('balance_sheet.total_liabilities_footer')} />
            </div>
          </div>

          {/* BALANCE CHECK FOOTER */}
          <div className="glass-panel" style={{
            padding: '32px 48px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.04))',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ color: 'var(--text-main)', fontWeight: 800, fontSize: '1.2rem' }}>
              {t('balance_sheet.equation_check')}
            </div>
            <div style={{ display: 'flex', gap: '60px', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>{t('balance_sheet.total_assets')}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#6366f1', fontFamily: 'monospace' }}>{data.totalAssets?.toLocaleString(numLoc)}</div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 300, color: 'var(--text-muted)' }}>=</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>{t('balance_sheet.liabilities')} + {t('balance_sheet.equity')}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b', fontFamily: 'monospace' }}>{data.totalLiabilitiesAndEquity?.toLocaleString(numLoc)}</div>
              </div>
              <div style={{ padding: '8px 16px', borderRadius: '30px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 800, fontSize: '0.85rem', border: '1px solid rgba(16,185,129,0.3)' }}>
                ✓ {t('balance_sheet.status_balanced')}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('reports.no_data')}</div>
      )}
    </div>
  );
};

export default BalanceSheet;
