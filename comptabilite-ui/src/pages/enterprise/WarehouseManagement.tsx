import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api, { getApiErrorMessage } from '../../api';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../../lib/companyContext';
import { showToast } from '../../utils/dialogs';


interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string;
  isActive: boolean;
}

const WarehouseManagement: React.FC = () => {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    location: '',
    isActive: true
  });

  const loadWarehouses = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const res = await api.get(`/warehouses?companyId=${encodeURIComponent(companyId)}`);
      setWarehouses(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWarehouses(); }, [loadWarehouses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setSaving(true);
      const body: Record<string, unknown> = { ...form, companyId };
      await api.post('/warehouses', body);
      setShowModal(false);
      setForm({ code: '', name: '', location: '', isActive: true });
      void loadWarehouses();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('common.error')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateCode = useCallback(() => {
    return 'WH-' + Date.now().toString(36).toUpperCase();
  }, []);

  const handleOpenModal = () => {
    setForm({ code: generateCode(), name: '', location: '', isActive: true });
    setShowModal(true);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>🏢</span> {t('logistics.title')}
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('logistics.desc')}</p>
        </div>
        <button className="btn-glow" onClick={handleOpenModal} style={{ fontWeight: 700 }}>{t('logistics.btn_add')}</button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
         <div className="glass-panel" style={{ flex: 1, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('logistics.total_locations')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{warehouses.length}</div>
         </div>
         <div className="glass-panel" style={{ flex: 1, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('logistics.active_hubs')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{warehouses.filter(w => w.isActive).length}</div>
         </div>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('hr.loading')}</div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('logistics.code')}</th>
                <th>{t('logistics.hub_name')}</th>
                <th>{t('logistics.location')}</th>
                <th>{t('logistics.capacity')}</th>
                <th>{t('logistics.operation')}</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map(w => (
                <tr key={w.id}>
                  <td>
                    <span style={{ 
                      fontFamily: 'monospace', fontSize: '0.82rem', background: 'rgba(99,102,241,0.15)',
                      border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '2px 8px', color: '#a5b4fc', fontWeight: 700
                    }}>
                      {w.code}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{w.name}</td>
                  <td>{w.location || '—'}</td>
                  <td>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Optimal</div>
                  </td>
                  <td>
                    <span style={{ 
                      padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                      background: w.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                      color: w.isActive ? '#10b981' : '#6b7280',
                      border: `1px solid ${w.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.3)'}`
                    }}>
                      {w.isActive ? t('logistics.status_active') : t('logistics.status_offline')}
                    </span>
                  </td>
                </tr>
              ))}
              {warehouses.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('logistics.no_warehouses')}
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
            title={t('logistics.register_title')}
            subtitle={t('logistics.register_desc')}
            onClose={() => setShowModal(false)}
            size="sm"
            pill="WH"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button type="submit" form="warehouse-form-modal" className="jem-btn-primary" disabled={saving}>
                  {saving ? t('logistics.creating') : t('logistics.btn_add')}
                </button>
              </>
            }
          >
            <form id="warehouse-form-modal" onSubmit={(e) => void handleCreate(e)} style={{ display: 'grid', gap: 14 }}>
              <div className="jem-input-group">
                <span className="jem-label">{t('logistics.code_label')}</span>
                <input type="text" className="jem-field jem-mono" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('logistics.name_label')}</span>
                <input
                  type="text"
                  className="jem-field"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder={t('logistics.name_placeholder')}
                />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('logistics.loc_label')}</span>
                <input
                  type="text"
                  className="jem-field"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder={t('logistics.loc_placeholder')}
                />
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default WarehouseManagement;