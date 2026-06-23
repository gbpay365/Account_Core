import React, { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '../hooks/usePermissions';
import { downloadBlob, reportsApi } from '../api';
import { useTranslation } from 'react-i18next';
import { amountLocale } from '../utils/reportLocale';
import { getStoredCompanyId } from '../lib/companyContext';
import { useFiscalYear } from '../hooks/useFiscalYear';
import FiscalYearSelect from '../components/FiscalYearSelect';

const SECTION_ORDER = ['operating', 'investing', 'financing', 'bridge'] as const;

const CashFlow: React.FC = () => {
  const { hasPermission } = usePermissions();
  const { t, i18n } = useTranslation();
  const { fiscalYear, setFiscalYear, availableYears, loading: yearLoading } = useFiscalYear();
  const canExport = hasPermission('cash_flow', 'export');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const numLoc = amountLocale(i18n.language);

  const formatAmt = useMemo(
    () => (n: number) =>
      Number(n).toLocaleString(numLoc, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [numLoc]
  );

  useEffect(() => {
    const companyId = getStoredCompanyId();
    if (!companyId || yearLoading) {
      if (!companyId) {
        setError(t('reports.no_company'));
        setLoading(false);
      }
      return;
    }
    reportsApi.getCashFlow(fiscalYear, companyId)
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
      const res = await reportsApi.exportCashFlowPdf(fiscalYear, companyId, i18n.language);
      downloadBlob(res.data, `cashflow_${fiscalYear}.pdf`, 'application/pdf');
    } catch (err) { console.error('Export failed', err); }
  };

  const card = (label: string, value: number, borderColor: string) => (
    <div className="glass-panel" style={{ padding: '24px', borderTop: `4px solid ${borderColor}` }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
      <div style={{
        fontSize: '1.8rem', fontWeight: 800,
        color: value >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
        fontFamily: 'var(--font-heading)'
      }}>
        {formatAmt(value)}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('reports.fcfa')}</div>
    </div>
  );

  const renderLineRow = (line: any, idx: string | number) => {
    const kind = (line.lineKind || 'detail').toLowerCase();
    const isSub = kind === 'subtotal';
    const isPh = kind === 'placeholder';
    const isSec = kind === 'section_header';
    const label = i18n.language === 'fr' ? line.labelFr : line.labelEn;
    const amt = Number(line.amount ?? 0);

    if (isSec) {
      return (
        <tr key={idx}>
          <td colSpan={2} style={{
            paddingTop: '18px', paddingBottom: '6px',
            fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-heading)', fontSize: '0.95rem'
          }}>{label}</td>
        </tr>
      );
    }

    return (
      <tr key={idx} style={isSub ? { background: 'rgba(79,70,229,0.06)' } : undefined}>
        <td style={{
          color: isPh ? 'var(--text-muted)' : 'var(--text-main)',
          fontStyle: isPh ? 'italic' : undefined,
          fontWeight: isSub ? 700 : 400,
          fontFamily: isSub ? 'var(--font-heading)' : undefined
        }}>{label}</td>
        <td style={{
          textAlign: 'right',
          fontWeight: isSub ? 800 : 600,
          color: isPh ? 'var(--text-muted)' : (amt >= 0 ? 'var(--color-success)' : 'var(--color-danger)')
        }}>
          {!isPh && amt >= 0 ? '+' : ''}{formatAmt(amt)}
        </td>
      </tr>
    );
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <FiscalYearSelect fiscalYear={fiscalYear} availableYears={availableYears} onChange={setFiscalYear} disabled={loading} />
          <h1 style={{ margin: '10px 0 0', fontSize: '1.8rem' }}>💰 {t('cash_flow.title')}</h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>{t('cash_flow.subtitle', { year: fiscalYear })}</p>
        </div>
        {canExport && (
          <button onClick={handleExport} className="btn-danger-glow">↓ {t('reports.export_pdf')}</button>
        )}
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
          <p>{t('reports.loading')}</p>
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-danger)' }}>{error}</div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '20px 24px', background: 'rgba(79,70,229,0.06)', borderLeft: '4px solid var(--color-primary)' }}>
            <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>{t('cash_flow.methodology_title')}</div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{t('cash_flow.methodology_body')}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
            {card(t('cash_flow.operating'), Number(data.operatingCF ?? 0), 'var(--color-success)')}
            {card(t('cash_flow.investing'), Number(data.investingCF ?? 0), 'var(--color-warning)')}
            {card(t('cash_flow.financing'), Number(data.financingCF ?? 0), 'var(--color-primary)')}
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ fontWeight: 700, marginBottom: '16px', color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
              {t('cash_flow.bridge_panel_title')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('cash_flow.bridge_opening')}</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{formatAmt(Number(data.openingCashClass5 ?? 0))}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('cash_flow.bridge_closing')}</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{formatAmt(Number(data.closingCashClass5 ?? 0))}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('cash_flow.bridge_ledger_delta')}</div>
                <div style={{
                  fontWeight: 700, fontFamily: 'var(--font-heading)',
                  color: Number(data.changeInCashClass5Ledger ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                }}>{formatAmt(Number(data.changeInCashClass5Ledger ?? 0))}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('cash_flow.bridge_modeled')}</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{formatAmt(Number(data.netCashFlow ?? 0))}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('cash_flow.bridge_variance')}</div>
                <div style={{
                  fontWeight: 700, fontFamily: 'var(--font-heading)',
                  color: Math.abs(Number(data.cashBridgeVariance ?? 0)) < 1 ? 'var(--color-success)' : 'var(--color-warning)'
                }}>{formatAmt(Number(data.cashBridgeVariance ?? 0))}</div>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '28px' }}>
            <h3 style={{ margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <span>📋</span> {t('cash_flow.detail')}
            </h3>

            {SECTION_ORDER.map(sec => {
              const secLines = (data.lines ?? []).filter((l: any) => (l.section || 'operating') === sec);
              if (!secLines.length) return null;
              return (
                <div key={sec} style={{ marginBottom: sec === 'bridge' ? 0 : '28px' }}>
                  <h4 style={{
                    margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.04em'
                  }}>{t(`cash_flow.section_${sec}`)}</h4>
                  <table className="premium-table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th>{t('reports.table_description')}</th>
                        <th style={{ textAlign: 'right' }}>{t('reports.table_amount_fcfa')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secLines.map((line: any, i: number) => renderLineRow(line, `${sec}-${i}`))}
                    </tbody>
                  </table>
                </div>
              );
            })}

            <p style={{ margin: '16px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('cash_flow.investing_financing_note')}</p>
          </div>

          <div className="glass-panel" style={{
            padding: '24px 32px',
            borderLeft: '4px solid var(--color-primary)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '16px'
          }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{t('cash_flow.net_change_cash')}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t('cash_flow.bridge_modeled')}</div>
            </div>
            <div style={{
              fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-heading)',
              color: Number(data.netCashFlow ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
            }}>
              {formatAmt(Number(data.netCashFlow ?? 0))} {t('reports.fcfa')}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('reports.no_data')}</div>
      )}
    </div>
  );
};

export default CashFlow;
