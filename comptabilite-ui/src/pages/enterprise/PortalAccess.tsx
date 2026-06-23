import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api, { getApiErrorMessage } from '../../api';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../../lib/companyContext';
import { showToast } from '../../utils/dialogs';


interface PortalLink {
  id: string;
  portalType: string;
  entityId: string;
  entityName: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

interface EntityOption {
  id: string;
  name: string;
}

interface PortalForm {
  portalType: string;
  customerId: string;
  supplierId: string;
  expiresAt: string;
}

const getDefaultExpiry = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().split('T')[0];
};

const PortalAccess: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [customers, setCustomers] = useState<EntityOption[]>([]);
  const [suppliers, setSuppliers] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newLink, setNewLink] = useState<PortalForm>({
    portalType: 'customer',
    customerId: '',
    supplierId: '',
    expiresAt: getDefaultExpiry()
  });

  const loadData = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const [linksRes, custRes, suppRes] = await Promise.all([
        api.get(`/portals/links?companyId=${companyId}`),
        api.get(`/commercial/customers?companyId=${companyId}`),
        api.get(`/commercial/suppliers?companyId=${companyId}`)
      ]);
      setLinks(linksRes.data);
      setCustomers(Array.isArray(custRes.data) ? custRes.data : []);
      setSuppliers(Array.isArray(suppRes.data) ? suppRes.data : []);
    } catch (err) {
      console.error('Portal load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setGenerating(true);
      await api.post('/portals/links', { ...newLink, companyId });
      setShowModal(false);
      setNewLink({
        portalType: 'customer',
        customerId: '',
        supplierId: '',
        expiresAt: getDefaultExpiry()
      });
      void loadData();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('portals.error_create')), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/${token}`;
    void navigator.clipboard.writeText(url);
    showToast(t('portals.copy_success'), 'success');
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>🌐</span> {t('portals.title')}
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('portals.desc')}</p>
        </div>
        <button className="btn-glow" onClick={() => setShowModal(true)} style={{ fontWeight: 700 }}>{t('portals.btn_generate')}</button>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('portals.loading')}</div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('portals.col_type')}</th>
                <th>{t('portals.col_entity')}</th>
                <th>{t('portals.col_url')}</th>
                <th>{t('portals.col_expiry')}</th>
                <th>{t('common.registered')}</th>
                <th style={{ textAlign: 'right' }}>{t('payroll.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {links.map(link => (
                <tr key={link.id}>
                  <td>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '20px', 
                      fontSize: '0.75rem', 
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: link.portalType === 'customer' ? 'rgba(56,189,248,0.15)' : 'rgba(234,179,8,0.15)',
                      color: link.portalType === 'customer' ? '#38bdf8' : '#eab308'
                    }}>
                      {link.portalType === 'customer' ? t('portals.type_customer') : t('portals.type_supplier')}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{link.entityName}</td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {link.token.substring(0, 8)}...
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{new Date(link.expiresAt).toLocaleDateString(i18n.language)}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(link.createdAt).toLocaleDateString(i18n.language)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      onClick={() => copyLink(link.token)}
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid var(--glass-border)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      📋 {t('common.export_excel')}
                    </button>
                  </td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('portals.no_links')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <JemShellModal
            title={t('portals.modal_title')}
            subtitle={t('portals.modal_desc')}
            onClose={() => setShowModal(false)}
            size="md"
            pill="POR"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button type="submit" form="portal-link-form" className="jem-btn-primary" disabled={generating}>
                  {generating ? t('portals.loading') : t('portals.btn_generate')}
                </button>
              </>
            }
          >
            <form id="portal-link-form" onSubmit={(e) => void handleGenerate(e)} style={{ display: 'grid', gap: 16 }}>
              <div className="jem-input-group">
                <span className="jem-label">{t('portals.form_type')}</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setNewLink({ ...newLink, portalType: 'customer' })}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: newLink.portalType === 'customer' ? '#38bdf8' : 'var(--glass-border)',
                      background: newLink.portalType === 'customer' ? 'rgba(56,189,248,0.1)' : 'transparent',
                      color: newLink.portalType === 'customer' ? '#38bdf8' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('portals.type_customer')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLink({ ...newLink, portalType: 'supplier' })}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: newLink.portalType === 'supplier' ? '#eab308' : 'var(--glass-border)',
                      background: newLink.portalType === 'supplier' ? 'rgba(234,179,8,0.1)' : 'transparent',
                      color: newLink.portalType === 'supplier' ? '#eab308' : 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('portals.type_supplier')}
                  </button>
                </div>
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('portals.form_entity')}</span>
                <select
                  className="jem-field"
                  value={newLink.portalType === 'customer' ? newLink.customerId : newLink.supplierId}
                  onChange={e =>
                    setNewLink({
                      ...newLink,
                      [newLink.portalType === 'customer' ? 'customerId' : 'supplierId']: e.target.value,
                    })
                  }
                  required
                >
                  <option value="">{t('common.search')}</option>
                  {(newLink.portalType === 'customer' ? customers : suppliers).map(entity => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('portals.form_expiry')}</span>
                <input
                  type="date"
                  className="jem-field"
                  value={newLink.expiresAt}
                  onChange={e => setNewLink({ ...newLink, expiresAt: e.target.value })}
                  required
                />
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default PortalAccess;