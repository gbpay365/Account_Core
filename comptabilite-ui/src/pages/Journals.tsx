import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { coreConfigApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';

const JOURNAL_TYPES = ['Bank', 'Cash', 'Purchases', 'Sales', 'Miscellaneous'];

const Journals: React.FC = () => {
  const { t } = useTranslation();
  const [journals, setJournals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', type: 'Miscellaneous', defaultDebitAccountCode: '', defaultCreditAccountCode: '' });

  const companyId = getStoredCompanyId();

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    try {
      const res = await coreConfigApi.getJournals(companyId);
      setJournals(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    await coreConfigApi.createJournal({ ...form, companyId });
    setShowForm(false);
    setForm({ code: '', name: '', type: 'Miscellaneous', defaultDebitAccountCode: '', defaultCreditAccountCode: '' });
    load();
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>📒 {t('journals.title')}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{t('journals.subtitle')}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-glow">+ {t('journals.new')}</button>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>{t('common.loading')}</div>
      ) : (
        <div className="glass-panel" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: 12 }}>{t('settings.code')}</th>
                <th style={{ textAlign: 'left', padding: 12 }}>{t('common.label')}</th>
                <th style={{ textAlign: 'left', padding: 12 }}>{t('journals.type')}</th>
                <th style={{ textAlign: 'left', padding: 12 }}>{t('journals.default_debit')}</th>
                <th style={{ textAlign: 'left', padding: 12 }}>{t('journals.default_credit')}</th>
                <th style={{ textAlign: 'center', padding: 12 }}>{t('common.active')}</th>
              </tr>
            </thead>
            <tbody>
              {journals.map((j: any) => (
                <tr key={j.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: 12, fontFamily: 'monospace', fontWeight: 600 }}>{j.code}</td>
                  <td style={{ padding: 12 }}>{j.name}</td>
                  <td style={{ padding: 12 }}><span style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', fontSize: '0.8rem' }}>{j.type}</span></td>
                  <td style={{ padding: 12, fontFamily: 'monospace' }}>{j.defaultDebitAccountCode || '—'}</td>
                  <td style={{ padding: 12, fontFamily: 'monospace' }}>{j.defaultCreditAccountCode || '—'}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>{j.isActive ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: 28, width: '100%', maxWidth: 480 }}>
            <h3>{t('journals.new')}</h3>
            <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12 }}>
              <input placeholder={t('settings.code')} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
              <input placeholder={t('common.label')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {JOURNAL_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
              </select>
              <input placeholder={t('journals.default_debit')} value={form.defaultDebitAccountCode} onChange={e => setForm({ ...form, defaultDebitAccountCode: e.target.value })} />
              <input placeholder={t('journals.default_credit')} value={form.defaultCreditAccountCode} onChange={e => setForm({ ...form, defaultCreditAccountCode: e.target.value })} />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-glow">{t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Journals;
