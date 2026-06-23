import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob, reportsApi } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { amountLocale } from '../utils/reportLocale';
import { getStoredCompanyId } from '../lib/companyContext';
import { useFiscalYear } from '../hooks/useFiscalYear';
import FiscalYearSelect from '../components/FiscalYearSelect';

const IncomeStatement: React.FC = () => {
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
    reportsApi.getIncomeStatement(fiscalYear, companyId)
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
      const res = await reportsApi.exportIncomeStatementPdf(fiscalYear, companyId, i18n.language);
      downloadBlob(res.data, `income_statement_${fiscalYear}.pdf`, 'application/pdf');
    } catch (err) { console.error('Export failed', err); }
  };

  const TableSection = ({ title, items, color, total, totalLabel }: any) => (
    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${color}33` }}>
      <div style={{ 
        padding: '16px 24px', 
        background: `${color}11`, 
        borderBottom: `1px solid ${color}22`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{items?.length || 0} {t('common.accounts_label')}</div>
      </div>
      <table className="premium-table">
        <thead>
          <tr style={{ background: 'transparent' }}>
            <th style={{ padding: '12px 24px', fontSize: '0.75rem' }}>{t('common.account').toUpperCase()}</th>
            <th style={{ padding: '12px 24px', fontSize: '0.75rem' }}>{t('common.label').toUpperCase()}</th>
            <th style={{ textAlign: 'right', padding: '12px 24px', fontSize: '0.75rem' }}>{t('common.amount').toUpperCase()} (FCFA)</th>
          </tr>
        </thead>
        <tbody>
          {items?.map((r: any, idx: number) => (
            <tr key={idx}>
              <td style={{ padding: '10px 24px', fontFamily: 'monospace', fontWeight: 700, color: color }}>{r.code}</td>
              <td style={{ padding: '10px 24px', color: 'var(--text-main)' }}>{i18n.language === 'fr' ? r.labelFr : r.labelEn}</td>
              <td style={{ textAlign: 'right', padding: '10px 24px', fontWeight: 600, fontFamily: 'monospace' }}>
                {r.amount.toLocaleString(numLoc, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
          <tr style={{ background: `${color}08`, borderTop: `2px solid ${color}44` }}>
            <td colSpan={2} style={{ padding: '16px 24px', fontWeight: 800, color: 'var(--text-main)' }}>{totalLabel}</td>
            <td style={{ textAlign: 'right', padding: '16px 24px', fontWeight: 900, color: color, fontSize: '1.1rem', fontFamily: 'monospace' }}>
              {total.toLocaleString(numLoc, { minimumFractionDigits: 2 })}
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
            📉 {t('income_statement.title')}
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '1rem' }}>
            {t('income_statement.subtitle', { year: fiscalYear })}
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
          <div className="animate-spin" style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: 'var(--text-muted)' }}>{t('reports.loading')}</p>
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: '#f87171' }}>{error}</div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
             <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--color-success)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('income_statement.total_revenue')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)' }}>{data.totalRevenue.toLocaleString(numLoc)} <span style={{ fontSize: '0.8rem' }}>FCFA</span></div>
             </div>
             <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--color-warning)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('income_statement.total_expenses')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-warning)' }}>{data.totalExpenses.toLocaleString(numLoc)} <span style={{ fontSize: '0.8rem' }}>FCFA</span></div>
             </div>
             <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--color-primary)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('income_statement.net_income')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: data.netIncome >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                  {data.netIncome.toLocaleString(numLoc)} <span style={{ fontSize: '0.8rem' }}>FCFA</span>
                </div>
             </div>
          </div>

          <TableSection 
            title={t('income_statement.revenues')} 
            items={data.revenues} 
            color="#10b981" 
            total={data.totalRevenue} 
            totalLabel={t('income_statement.total_revenue')} 
          />

          <TableSection 
            title={t('income_statement.expenses')} 
            items={data.expenses} 
            color="#f59e0b" 
            total={data.totalExpenses} 
            totalLabel={t('income_statement.total_expenses')} 
          />

          <div className="glass-panel" style={{
            padding: '32px 40px',
            background: data.netIncome >= 0
              ? 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02))'
              : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.02))',
            border: `1px solid ${data.netIncome >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderRadius: '16px'
          }}>
            <div>
              <div style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('income_statement.net_income')}</div>
              <div style={{ fontSize: '0.9rem', color: data.netIncome >= 0 ? 'var(--color-success)' : 'var(--color-danger)', marginTop: '8px', fontWeight: 600 }}>
                {data.netIncome >= 0 ? `💹 ${t('income_statement.status_profit')}` : `📉 ${t('income_statement.status_loss')}`}
              </div>
            </div>
            <div style={{
              fontSize: '3rem', fontWeight: 900, fontFamily: 'monospace',
              color: data.netIncome >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              textShadow: '0 0 20px rgba(0,0,0,0.1)'
            }}>
              {data.netIncome.toLocaleString(numLoc, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('reports.no_data')}</div>
      )}
    </div>
  );
};

export default IncomeStatement;
