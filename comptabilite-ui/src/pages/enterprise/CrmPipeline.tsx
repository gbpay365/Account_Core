import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api, { getApiErrorMessage } from '../../api';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../../lib/companyContext';
import { showToast } from '../../utils/dialogs';


interface Lead {
  id: string;
  title: string;
  contactName: string;
  email: string;
  phone: string;
  expectedRevenue: number;
  probability: number;
  status: string;
  createdAt: string;
}

const EMPTY_LEAD = {
  title: '',
  contactName: '',
  email: '',
  phone: '',
  expectedRevenue: 0,
  probability: 50,
  status: 'new'
};

const CrmPipeline: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_LEAD });

  const loadLeads = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const res = await api.get(`/crm/leads?companyId=${companyId}`);
      setLeads(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadLeads(); }, [loadLeads]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setSaving(true);
      await api.post('/crm/leads', { ...form, companyId });
      setShowModal(false);
      setForm({ ...EMPTY_LEAD });
      void loadLeads();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('crm.error_create')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'qualified': return '#10b981';
      case 'lost': return '#f87171';
      case 'converted': return '#8b5cf6';
      default: return '#38bdf8';
    }
  };

  const totalExpected = leads.reduce((acc, l) => acc + l.expectedRevenue, 0);
  const formatCurrency = (val: number) => {
    return val.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
      style: 'currency',
      currency: 'XAF',
      maximumFractionDigits: 0
    });
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>🤝</span> {t('crm.title')}
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('crm.desc')}</p>
        </div>
        <button className="btn-glow" onClick={() => setShowModal(true)} style={{ fontWeight: 700 }}>{t('crm.btn_new')}</button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
         <div className="glass-panel" style={{ flex: 1, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('crm.active_leads')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{leads.length}</div>
         </div>
         <div className="glass-panel" style={{ flex: 1, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t('crm.expected_pipeline')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{formatCurrency(totalExpected)}</div>
         </div>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('crm.loading')}</div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('crm.col_opportunity')}</th>
                <th>{t('crm.col_contact')}</th>
                <th style={{ textAlign: 'right' }}>{t('crm.col_revenue')}</th>
                <th>{t('crm.col_prob')}</th>
                <th>{t('crm.col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 700 }}>{l.title}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{l.contactName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.email}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                    {formatCurrency(l.expectedRevenue)}
                  </td>
                  <td>
                    <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                       <div style={{ width: `${l.probability}%`, height: '100%', background: getStatusColor(l.status) }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{l.probability}%</div>
                  </td>
                  <td>
                    <span style={{ 
                      padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                      background: `${getStatusColor(l.status)}22`, color: getStatusColor(l.status), border: `1px solid ${getStatusColor(l.status)}44`
                    }}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('crm.no_leads')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <JemShellModal
            title={t('crm.modal_title')}
            subtitle={t('crm.modal_desc')}
            onClose={() => setShowModal(false)}
            size="md"
            pill="CRM"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" form="crm-lead-form" className="jem-btn-primary" disabled={saving}>
                  {saving ? t('common.save') : t('crm.btn_save')}
                </button>
              </>
            }
          >
            <form
              id="crm-lead-form"
              onSubmit={(e) => {
                void handleCreateLead(e);
              }}
            >
              <div className="jem-input-group" style={{ marginBottom: 12 }}>
                <span className="jem-label">{t('crm.form_title')}</span>
                <input
                  className="jem-field"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="jem-form-grid2" style={{ marginBottom: 12 }}>
                <div className="jem-input-group">
                  <span className="jem-label">{t('crm.form_contact')}</span>
                  <input
                    className="jem-field"
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    required
                  />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('crm.form_phone')}</span>
                  <input
                    className="jem-field"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="jem-input-group" style={{ marginBottom: 12 }}>
                <span className="jem-label">{t('crm.form_email')}</span>
                <input
                  className="jem-field"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="jem-form-grid2" style={{ marginBottom: 8 }}>
                <div className="jem-input-group">
                  <span className="jem-label">{t('crm.form_revenue')}</span>
                  <input
                    className="jem-field jem-mono"
                    type="number"
                    value={form.expectedRevenue}
                    onChange={(e) => setForm({ ...form, expectedRevenue: Number(e.target.value) })}
                  />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">
                    {t('crm.form_prob')} ({form.probability}%)
                  </span>
                  <input
                    className="jem-field"
                    type="range"
                    value={form.probability}
                    onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })}
                    min={0}
                    max={100}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                </div>
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default CrmPipeline;