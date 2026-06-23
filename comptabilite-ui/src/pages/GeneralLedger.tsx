import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';
import { amountLocale } from '../utils/reportLocale';
import { useFiscalYear } from '../hooks/useFiscalYear';
import FiscalYearSelect from '../components/FiscalYearSelect';

interface GlRow {
  entryDate: string;
  entryId: string;
  journalType: string;
  reference?: string;
  description: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
}

const GeneralLedger: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { fiscalYear, setFiscalYear, availableYears, loading: yearLoading } = useFiscalYear();
  const [data, setData] = useState<GlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState(() => searchParams.get('account') ?? '');
  const [journalFilter, setJournalFilter] = useState('');
  const numLoc = amountLocale(i18n.language);

  useEffect(() => {
    const account = searchParams.get('account');
    const year = searchParams.get('year');
    if (account) setAccountFilter(account);
    if (year && !Number.isNaN(Number(year))) setFiscalYear(Number(year));
  }, [searchParams, setFiscalYear]);

  const load = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await reportsApi.getGeneralLedger(fiscalYear, companyId, {
        accountCode: accountFilter || undefined,
        journalType: journalFilter || undefined,
        lang: i18n.language,
      });
      setData(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [accountFilter, journalFilter, i18n.language, fiscalYear]);

  useEffect(() => { if (!yearLoading) load(); }, [load, yearLoading]);

  const fmt = (n: number) => n.toLocaleString(numLoc, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const totalCredit = data.reduce((s, r) => s + (r.credit || 0), 0);
  const totalDebit = data.reduce((s, r) => s + (r.debit || 0), 0);
  const closingBalance = data.length > 0 ? data[data.length - 1].runningBalance : 0;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <FiscalYearSelect fiscalYear={fiscalYear} availableYears={availableYears} onChange={setFiscalYear} disabled={loading} />
          <h1 style={{ margin: '10px 0 0', fontSize: '2.2rem', fontWeight: 800 }}>📖 {t('general_ledger.title')}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
            {t('general_ledger.subtitle')} — {fiscalYear}
            {accountFilter ? ` · ${accountFilter}` : ''}
          </p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input placeholder={t('general_ledger.filter_account')} value={accountFilter} onChange={e => setAccountFilter(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <input placeholder={t('general_ledger.filter_journal')} value={journalFilter} onChange={e => setJournalFilter(e.target.value)} style={{ width: 120 }} />
        <button onClick={load} className="btn-glow">{t('common.search')}</button>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>{t('common.loading')}</div>
      ) : data.length === 0 ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.no_data')}</div>
      ) : (
        <div className="glass-panel" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('general_ledger.date')}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('common.reference', { defaultValue: 'Reference' })}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('journals.type')}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('common.account')}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('common.label')}</th>
                <th style={{ padding: 10, textAlign: 'right' }}>{t('common.debit')}</th>
                <th style={{ padding: 10, textAlign: 'right' }}>{t('common.credit')}</th>
                <th style={{ padding: 10, textAlign: 'right' }}>{t('general_ledger.balance')}</th>
                <th style={{ padding: 10, textAlign: 'center' }}>{t('settings.status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={`${row.entryId}-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{new Date(row.entryDate).toLocaleDateString()}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: '0.85rem' }}>{row.reference || '—'}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{row.journalType}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{row.accountCode}</td>
                  <td style={{ padding: 8 }}>{row.description || row.accountName}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{row.debit > 0 ? fmt(row.debit) : ''}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{row.credit > 0 ? fmt(row.credit) : ''}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{fmt(row.runningBalance)}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 8, background: row.status === 'Validated' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)' }}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {data.length > 0 && (
                <tr style={{ borderTop: '2px solid var(--color-primary)', background: 'rgba(99,102,241,0.05)' }}>
                  <td colSpan={5} style={{ padding: 12, fontWeight: 800 }}>{t('trial_balance.totals', { defaultValue: 'Totals' })}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{totalDebit > 0 ? fmt(totalDebit) : ''}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{totalCredit > 0 ? fmt(totalCredit) : ''}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>{fmt(closingBalance)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GeneralLedger;
