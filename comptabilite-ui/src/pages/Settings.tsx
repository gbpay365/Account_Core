import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { coreConfigApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';

type Tab = 'currencies' | 'fiscalYears' | 'periods';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('currencies');
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCurrency, setNewCurrency] = useState({ code: '', name: '', symbol: '', exchangeRate: 1, isDefault: false });
  const [newYear, setNewYear] = useState(new Date().getFullYear());

  const companyId = getStoredCompanyId();

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [curRes, fyRes] = await Promise.all([
        coreConfigApi.getCurrencies(companyId),
        coreConfigApi.getFiscalYears(companyId),
      ]);
      setCurrencies(curRes.data);
      setFiscalYears(fyRes.data);
    } catch {
      setError(t('settings.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { load(); }, [load]);

  const apiError = (err: unknown, fallback: string) => {
    const ax = err as { response?: { data?: { error?: string; title?: string }; status?: number }; message?: string };
    if (ax.response?.status === 403) return t('settings.permission_denied', 'You do not have permission to change settings.');
    return ax.response?.data?.error || ax.response?.data?.title || ax.message || fallback;
  };

  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    try {
      setError(null);
      await coreConfigApi.createCurrency({ ...newCurrency, companyId });
      setNewCurrency({ code: '', name: '', symbol: '', exchangeRate: 1, isDefault: false });
      load();
    } catch (err) { setError(apiError(err, t('settings.create_failed'))); }
  };

  const handleAddFiscalYear = async () => {
    if (!companyId) return;
    try {
      setError(null);
      await coreConfigApi.createFiscalYear({ companyId, year: newYear, isCurrent: true });
      load();
    } catch (err) { setError(apiError(err, t('settings.create_failed'))); }
  };

  const handleSeedDefaults = async () => {
    if (!companyId) return;
    try {
      setError(null);
      await coreConfigApi.seedDefaults(companyId);
      load();
    } catch (err) { setError(apiError(err, t('settings.create_failed'))); }
  };

  const currentFy = fiscalYears.find((fy: any) => fy.isCurrent) || fiscalYears[0];
  const periods = currentFy?.periods || [];

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>⚙️ {t('settings.title')}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{t('settings.subtitle')}</p>
        </div>
        <button onClick={handleSeedDefaults} className="btn-glow">{t('settings.seed_defaults')}</button>
      </div>

      {error && <div className="glass-panel" style={{ padding: 16, color: 'var(--color-danger)', marginBottom: 20 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['currencies', 'fiscalYears', 'periods'] as Tab[]).map(key => (
          <button key={key} onClick={() => setTab(key)}
            className={tab === key ? 'btn-glow' : 'jem-btn-ghost'}
            style={{ padding: '8px 16px' }}>
            {t(`settings.tab_${key}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
      ) : tab === 'currencies' ? (
        <div className="glass-panel" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.currencies')}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>{t('settings.code')}</th>
                <th style={{ textAlign: 'left', padding: 8 }}>{t('common.label')}</th>
                <th style={{ textAlign: 'right', padding: 8 }}>{t('settings.rate')}</th>
                <th style={{ textAlign: 'center', padding: 8 }}>{t('settings.default')}</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((c: any) => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{c.code}</td>
                  <td style={{ padding: 8 }}>{c.name}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{c.exchangeRate}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>{c.isDefault ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={handleAddCurrency} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, alignItems: 'end' }}>
            <input placeholder={t('settings.code')} value={newCurrency.code} onChange={e => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })} required maxLength={3} />
            <input placeholder={t('common.label')} value={newCurrency.name} onChange={e => setNewCurrency({ ...newCurrency, name: e.target.value })} required />
            <input placeholder={t('settings.symbol')} value={newCurrency.symbol} onChange={e => setNewCurrency({ ...newCurrency, symbol: e.target.value })} />
            <input type="number" step="0.0001" placeholder={t('settings.rate')} value={newCurrency.exchangeRate} onChange={e => setNewCurrency({ ...newCurrency, exchangeRate: parseFloat(e.target.value) || 1 })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={newCurrency.isDefault} onChange={e => setNewCurrency({ ...newCurrency, isDefault: e.target.checked })} />
              {t('settings.default')}
            </label>
            <button type="submit" className="btn-glow">{t('common.create')}</button>
          </form>
        </div>
      ) : tab === 'fiscalYears' ? (
        <div className="glass-panel" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.fiscal_years')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            {fiscalYears.map((fy: any) => (
              <div key={fy.id} style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: fy.isCurrent ? '1px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{fy.year}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {new Date(fy.startDate).toLocaleDateString()} – {new Date(fy.endDate).toLocaleDateString()}
                </div>
                {fy.isCurrent && <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>{t('settings.current')}</span>}
                {fy.isClosed && <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}> {t('settings.closed')}</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="number" value={newYear} onChange={e => setNewYear(parseInt(e.target.value) || new Date().getFullYear())} style={{ width: 120 }} />
            <button onClick={handleAddFiscalYear} className="btn-glow">{t('settings.add_fiscal_year')}</button>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>{t('settings.periods')} {currentFy ? `— ${currentFy.year}` : ''}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>#</th>
                <th style={{ textAlign: 'left', padding: 8 }}>{t('common.label')}</th>
                <th style={{ textAlign: 'left', padding: 8 }}>{t('settings.dates')}</th>
                <th style={{ textAlign: 'center', padding: 8 }}>{t('settings.status')}</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p: any) => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: 8 }}>{p.number}</td>
                  <td style={{ padding: 8 }}>{p.name}</td>
                  <td style={{ padding: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}
                  </td>
                  <td style={{ padding: 8, textAlign: 'center' }}>
                    {p.isClosed ? t('settings.closed') : t('settings.open')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Settings;
