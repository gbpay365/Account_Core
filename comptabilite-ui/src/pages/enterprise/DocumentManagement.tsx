import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { commercialApi } from '../../api';
import { getStoredCompanyId } from '../../lib/companyContext';

interface SalesDoc {
  id: string;
  documentNumber: string;
  customerId: string;
  status: string;
  totalAmount: number;
  issueDate: string;
}

const DocumentManagement: React.FC = () => {
  const [docs, setDocs] = useState<SalesDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocs = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const res = await commercialApi.getSalesDocuments(companyId);
      setDocs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  return (
    <div className="animate-fade-in" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>📁 Document management</h1>
          <p style={{ margin: '8px 0 0 0', color: 'var(--text-muted)' }}>
            Customer-facing commercial documents (quotes, orders, invoices). Create or change documents in{' '}
            <Link to="/sales" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              Sales &amp; Invoices
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : docs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No documents found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Document</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{doc.documentNumber}</td>
                  <td style={{ padding: '12px 16px' }}>{doc.customerId}</td>
                  <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{doc.status}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>{doc.totalAmount?.toLocaleString('fr-FR', { style: 'currency', currency: 'XAF' }) || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{doc.issueDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DocumentManagement;