import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { reconciliationApi, getApiErrorMessage } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';
import { amountLocale } from '../utils/reportLocale';
import { showToast } from '../utils/dialogs';

type RecType = 'AR' | 'AP';

interface Candidate {
  id: string;
  entityType: string;
  reference: string;
  date: string;
  amount: number;
  remaining: number;
  partnerName: string;
  source?: string;
}

interface Summary {
  openInvoiceCount: number;
  openPaymentCount: number;
  openInvoiceTotal: number;
  openPaymentTotal: number;
}

const isInvoice = (entityType: string) => /invoice|balance/i.test(entityType);
const isPayment = (entityType: string) => /payment|journal/i.test(entityType);

const Reconciliation: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState<RecType>('AR');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<Candidate | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const numLoc = amountLocale(i18n.language);

  const companyId = getStoredCompanyId();

  const load = useCallback(async () => {
    if (!companyId) {
      setError(t('reconciliation.no_company', { defaultValue: 'Select a company first.' }));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [candRes, matchRes] = await Promise.all([
        reconciliationApi.getCandidates(companyId, type),
        reconciliationApi.list(companyId, type),
      ]);
      const payload = candRes.data;
      const list = Array.isArray(payload) ? payload : payload?.candidates ?? [];
      setCandidates(list);
      setSummary(Array.isArray(payload) ? null : payload?.summary ?? null);
      setMatches(matchRes.data ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err, t('reconciliation.load_failed', { defaultValue: 'Failed to load reconciliation data.' })));
    } finally {
      setLoading(false);
    }
  }, [companyId, type, t]);

  useEffect(() => {
    void load();
    setSelectedSource(null);
    setSelectedTarget(null);
  }, [load]);

  const invoices = candidates.filter((c) => isInvoice(c.entityType));
  const payments = candidates.filter((c) => isPayment(c.entityType));

  const handleMatch = async () => {
    if (!companyId || !selectedSource || !selectedTarget) return;
    const amount = Math.min(selectedSource.remaining, selectedTarget.remaining);
    const discrepancy = selectedSource.remaining - selectedTarget.remaining;
    try {
      await reconciliationApi.create({
        companyId,
        type,
        sourceEntityType: selectedSource.entityType,
        sourceEntityId: selectedSource.id,
        targetEntityType: selectedTarget.entityType,
        targetEntityId: selectedTarget.id,
        amount,
        discrepancy,
      });
      showToast(t('reconciliation.matched', { defaultValue: 'Match recorded successfully.' }), 'success');
      setSelectedSource(null);
      setSelectedTarget(null);
      void load();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('reconciliation.match_failed', { defaultValue: 'Failed to record match.' })), 'error');
    }
  };

  const fmt = (n: number) => n.toLocaleString(numLoc, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const renderCard = (item: Candidate, selected: Candidate | null, onSelect: (c: Candidate) => void) => (
    <div
      key={`${item.entityType}-${item.id}`}
      onClick={() => onSelect(item)}
      style={{
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        cursor: 'pointer',
        border: selected?.id === item.id && selected?.entityType === item.entityType
          ? '1px solid var(--color-primary)'
          : '1px solid rgba(255,255,255,0.08)',
        background: selected?.id === item.id && selected?.entityType === item.entityType
          ? 'rgba(99,102,241,0.1)'
          : 'rgba(255,255,255,0.02)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{item.reference}</div>
        {item.source === 'journal' && (
          <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
            {t('reconciliation.live_gl', { defaultValue: 'Live GL' })}
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.partnerName || '—'}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span>{new Date(item.date).toLocaleDateString()}</span>
        <span style={{ fontWeight: 600 }}>{fmt(item.remaining)}</span>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>🔗 {t('reconciliation.title')}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{t('reconciliation.subtitle')}</p>
        </div>
        <button onClick={() => void load()} className="jem-btn-ghost" disabled={loading}>
          ↻ {t('common.refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['AR', 'AP'] as RecType[]).map((tp) => (
          <button key={tp} onClick={() => setType(tp)} className={type === tp ? 'btn-glow' : 'jem-btn-ghost'}>
            {tp === 'AR' ? t('reconciliation.ar') : t('reconciliation.ap')}
          </button>
        ))}
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div className="glass-panel" style={{ padding: 16 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('reconciliation.open_invoices', { defaultValue: 'Open invoices' })}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{summary.openInvoiceCount}</div>
            <div style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>{fmt(summary.openInvoiceTotal)} XAF</div>
          </div>
          <div className="glass-panel" style={{ padding: 16 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('reconciliation.open_payments', { defaultValue: 'Open payments' })}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{summary.openPaymentCount}</div>
            <div style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>{fmt(summary.openPaymentTotal)} XAF</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>{t('common.loading')}</div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: 48, textAlign: 'center', color: '#f87171' }}>{error}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div className="glass-panel" style={{ padding: 16, maxHeight: 480, overflow: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{t('reconciliation.invoices')} ({invoices.length})</h3>
              {invoices.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {t('reconciliation.no_invoices', { defaultValue: 'No open invoices for this category.' })}
                </p>
              ) : (
                invoices.map((inv) => renderCard(inv, selectedSource, setSelectedSource))
              )}
            </div>
            <div className="glass-panel" style={{ padding: 16, maxHeight: 480, overflow: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{t('reconciliation.payments')} ({payments.length})</h3>
              {payments.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {t('reconciliation.no_payments', { defaultValue: 'No unmatched payments yet.' })}
                </p>
              ) : (
                payments.map((pay) => renderCard(pay, selectedTarget, setSelectedTarget))
              )}
            </div>
          </div>

          {selectedSource && selectedTarget && (
            <div className="glass-panel" style={{ padding: 16, marginBottom: 20, textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                {t('reconciliation.match_preview', { defaultValue: 'Match amount' })}:{' '}
                <strong>{fmt(Math.min(selectedSource.remaining, selectedTarget.remaining))} XAF</strong>
              </div>
              <button onClick={() => void handleMatch()} className="btn-glow">
                {t('reconciliation.match')}
              </button>
            </div>
          )}

          {matches.length > 0 && (
            <div className="glass-panel" style={{ padding: 16 }}>
              <h3>{t('reconciliation.history')}</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: 8 }}>{t('general_ledger.date')}</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>{t('settings.status')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t('common.amount')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t('reconciliation.discrepancy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m: any) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: 8 }}>{new Date(m.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: 8 }}>{m.status}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fmt(m.amount)}</td>
                      <td style={{ padding: 8, textAlign: 'right', color: m.discrepancy !== 0 ? '#fbbf24' : 'inherit' }}>
                        {fmt(m.discrepancy)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Reconciliation;
