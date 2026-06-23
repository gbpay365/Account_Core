import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { auditApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';

const AuditLog: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const companyId = getStoredCompanyId();
    try {
      setLoading(true);
      const res = await auditApi.query(companyId || undefined, 200);
      setEntries(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>🔍 {t('audit_log.title')}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{t('audit_log.subtitle')}</p>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>{t('common.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.no_data')}</div>
      ) : (
        <div className="glass-panel" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('general_ledger.date')}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('audit_log.action')}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('audit_log.entity')}</th>
                <th style={{ padding: 10, textAlign: 'left' }}>{t('audit_log.details')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{new Date(e.timestamp).toLocaleString()}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: '0.82rem' }}>{e.action}</td>
                  <td style={{ padding: 8 }}>{e.entityType}{e.entityId ? ` #${String(e.entityId).slice(0, 8)}` : ''}</td>
                  <td style={{ padding: 8, color: 'var(--text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.payloadJson}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
