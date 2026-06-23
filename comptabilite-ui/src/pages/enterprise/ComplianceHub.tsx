import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api, { getApiErrorMessage } from '../../api';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../../lib/companyContext';
import '../../utils/apiHelpers';

interface WormEntry {
  id: string;
  timestamp: string;
  resourceType: string;
  resourceId: string;
  contentHash: string;
  metadataJson: string;
}

interface FiscalLock {
  id: string;
  fiscalYear: number;
  fiscalMonth: number;
  lockedAt: string;
  notes: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  ipAddress: string;
  payloadJson: string;
}

const ComplianceHub: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'overview' | 'worm' | 'locks' | 'audit'>('overview');
  const [wormEntries, setWormEntries] = useState<WormEntry[]>([]);
  const [locks, setLocks] = useState<FiscalLock[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockForm, setLockForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const companyId = getStoredCompanyId();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!companyId) return;
      if (activeTab === 'overview' || activeTab === 'worm') {
        const res = await api.get(`/compliance/worm-entries?companyId=${companyId}&take=10`);
        setWormEntries(res.data);
      }
      if (activeTab === 'overview' || activeTab === 'locks') {
        const res = await api.get(`/compliance/fiscal-locks?companyId=${companyId}`);
        setLocks(res.data);
      }
      if (activeTab === 'overview' || activeTab === 'audit') {
        const res = await api.get(`/compliance/audit?companyId=${companyId}&take=20`);
        setAuditLogs(res.data);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t('compliance.error_load')));
    } finally {
      setLoading(false);
    }
  }, [companyId, activeTab, t]);

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId, activeTab, loadData]);

  const handleLockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/compliance/fiscal-locks', {
        companyId,
        fiscalYear: lockForm.year,
        fiscalMonth: lockForm.month,
        notes: lockForm.notes
      });
      setShowLockModal(false);
      setLockForm({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, notes: '' });
      loadData();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t('compliance.error_lock')));
    } finally {
      setSubmitting(false);
    }
  };

  const tile = (to: string, title: string, desc: string, icon: string) => (
    <Link key={to} to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        className="glass-panel"
        style={{
          padding: '20px',
          height: '100%',
          borderLeft: '4px solid var(--color-primary)',
          transition: 'transform 0.2s ease',
          cursor: 'pointer'
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{icon}</div>
        <div style={{ fontWeight: 700, marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </Link>
  );

  return (
    <div className="animate-fade-in" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '1.8rem' }}>{t('compliance.title')}</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            {t('compliance.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {t('common.loading')}
            </div>
          )}
          {error && (
            <div style={{ color: 'var(--color-danger)', fontSize: '0.9rem', background: 'rgba(255,0,0,0.1)', padding: '8px 12px', borderRadius: '4px' }}>
              ⚠️ {error}
            </div>
          )}
          <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', gap: '12px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{wormEntries.length}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.stat_worm')}</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-success)' }}>{locks.length}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('compliance.stat_locks')}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '1px' }}>
        {(['overview', 'worm', 'locks', 'audit'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 0.2s'
            }}
          >
            {t(`compliance.tab_${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <section>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>{t('compliance.quick_actions')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {tile('/tax', t('tax.title'), t('compliance.action_tax_desc'), '🧮')}
              {tile('/ecf', t('ecf.title'), t('compliance.action_ecf_desc'), '📋')}
              {tile('/trial-balance', t('trial_balance.title'), t('compliance.action_trial_desc'), '⚖️')}
              {tile('/journal', t('journal.title'), t('compliance.action_audit_desc'), '📝')}
            </div>
          </section>

          <section>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>{t('compliance.health_title')}</h3>
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t('compliance.health_worm')}</span>
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>● {t('compliance.health_active')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t('compliance.health_audit')}</span>
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>● {t('compliance.health_enabled')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t('compliance.health_last_lock')}</span>
                  <span>{locks.length > 0 ? `${locks[0].fiscalYear}-${locks[0].fiscalMonth.toString().padStart(2, '0')}` : t('common.none')}</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                  {t('compliance.health_footer')}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'worm' && (
        <div className="glass-panel" style={{ padding: '0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)' }}>
              <tr>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_timestamp')}</th>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_resource')}</th>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_id')}</th>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_hash')}</th>
              </tr>
            </thead>
            <tbody>
              {wormEntries.map(e => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 20px' }}>{new Date(e.timestamp).toLocaleString(i18n.language === 'fr' ? 'fr-CM' : 'en-US')}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-muted)', fontSize: '0.8rem' }}>
                      {e.resourceType}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.resourceId.substring(0, 8)}...</td>
                  <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                    {e.contentHash.substring(0, 32)}...
                  </td>
                </tr>
              ))}
              {wormEntries.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('compliance.empty_worm')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'locks' && (
        <>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowLockModal(true)}
              className="glass-panel"
              style={{
                padding: '8px 16px',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + {t('compliance.btn_lock')}
            </button>
          </div>
          <div className="glass-panel" style={{ padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)' }}>
                <tr>
                  <th style={{ padding: '12px 20px' }}>{t('compliance.col_period')}</th>
                  <th style={{ padding: '12px 20px' }}>{t('compliance.col_locked_at')}</th>
                  <th style={{ padding: '12px 20px' }}>{t('compliance.col_notes')}</th>
                  <th style={{ padding: '12px 20px' }}>{t('compliance.col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {locks.map(l => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 20px', fontWeight: 600 }}>
                      {l.fiscalYear}-{l.fiscalMonth.toString().padStart(2, '0')}
                    </td>
                    <td style={{ padding: '12px 20px' }}>{new Date(l.lockedAt).toLocaleString(i18n.language === 'fr' ? 'fr-CM' : 'en-US')}</td>
                    <td style={{ padding: '12px 20px' }}>{l.notes}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 700 }}>{t('compliance.status_locked')}</span>
                    </td>
                  </tr>
                ))}
                {locks.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {t('compliance.empty_locks')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'audit' && (
        <div className="glass-panel" style={{ padding: '0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)' }}>
              <tr>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_time')}</th>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_action')}</th>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_entity')}</th>
                <th style={{ padding: '12px 20px' }}>{t('compliance.col_ip')}</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 20px' }}>{new Date(a.timestamp).toLocaleString(i18n.language === 'fr' ? 'fr-CM' : 'en-US')}</td>
                  <td style={{ padding: '12px 20px', fontWeight: 600 }}>{a.action}</td>
                  <td style={{ padding: '12px 20px' }}>{a.entityType}</td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>{a.ipAddress}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('compliance.empty_audit')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showLockModal && (
        <ModalPortal onClose={() => setShowLockModal(false)}>
          <JemShellModal
            title={t('compliance.modal_title')}
            subtitle={t('compliance.modal_desc')}
            onClose={() => setShowLockModal(false)}
            size="md"
            pill="LCK"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowLockModal(false)}>
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  form="compliance-lock-form"
                  className="jem-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? t('compliance.btn_locking') : t('compliance.btn_confirm_lock')}
                </button>
              </>
            }
          >
            <form id="compliance-lock-form" onSubmit={handleLockSubmit} style={{ display: 'grid', gap: 16 }}>
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">{t('compliance.form_year')}</span>
                  <input
                    type="number"
                    className="jem-field jem-mono"
                    value={lockForm.year}
                    onChange={e => setLockForm({ ...lockForm, year: parseInt(e.target.value) })}
                  />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('compliance.form_month')}</span>
                  <input
                    type="number"
                    className="jem-field jem-mono"
                    min="1"
                    max="12"
                    value={lockForm.month}
                    onChange={e => setLockForm({ ...lockForm, month: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('compliance.form_notes')}</span>
                <textarea
                  className="jem-field"
                  value={lockForm.notes}
                  onChange={e => setLockForm({ ...lockForm, notes: e.target.value })}
                  style={{ minHeight: 100, resize: 'vertical' }}
                  placeholder={t('compliance.form_notes_placeholder')}
                />
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default ComplianceHub;

