import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { commercialApi, getApiErrorMessage } from '../../api';
import { getStoredCompanyId } from '../../lib/companyContext';
import { showToast, showConfirm } from '../../utils/dialogs';


interface Customer {
  id: string;
  accountCode: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  creditLimit?: number;
  currentOutstanding: number;
}

const EMPTY_CUSTOMER = {
  accountCode: '411',
  name: '',
  email: '',
  phone: '',
  address: '',
  creditLimit: null as number | null
};

const Customers: React.FC = () => {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CUSTOMER });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const loadCustomers = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const res = await commercialApi.getCustomers(companyId);
      setCustomers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const handleOpenModal = useCallback(() => {
    setEditingId(null);
    const nextNum = customers.length + 1;
    setForm({ ...EMPTY_CUSTOMER, accountCode: `411${nextNum.toString().padStart(4, '0')}` });
    setShowModal(true);
  }, [customers.length]);

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setForm({
      accountCode: customer.accountCode,
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      creditLimit: customer.creditLimit ?? null
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await showConfirm(t('customers.confirm_delete', { name })))) return;
    try {
      await commercialApi.deleteCustomer(id);
      loadCustomers();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('customers.error_delete', 'Failed to delete customer. Ensure they have no existing transactions.')), 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setSaving(true);
      if (editingId) {
        await commercialApi.updateCustomer(editingId, { ...form, companyId });
      } else {
        await commercialApi.createCustomer({ ...form, companyId });
      }
      setShowModal(false);
      setForm({ ...EMPTY_CUSTOMER });
      setEditingId(null);
      loadCustomers();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to create customer.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(query.toLowerCase()) || 
    c.accountCode.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>👥</span> {t('customers.title')}
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('customers.subtitle')}</p>
        </div>
        <button className="btn-glow" onClick={handleOpenModal} style={{ fontWeight: 700 }}>+ {t('customers.btn_add')}</button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder={t('customers.search')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            maxWidth: '400px',
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('customers.loading')}</div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('customers.col_code')}</th>
                <th>{t('customers.col_name')}</th>
                <th>{t('customers.col_contact')}</th>
                <th style={{ textAlign: 'right' }}>{t('customers.col_outstanding')}</th>
                <th style={{ textAlign: 'right' }}>{t('customers.col_credit_limit')}</th>
                <th style={{ textAlign: 'right' }}>{t('customers.col_actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <span style={{ 
                      fontFamily: 'monospace', fontSize: '0.82rem', background: 'rgba(56,189,248,0.15)',
                      border: '1px solid rgba(56,189,248,0.3)', borderRadius: 6, padding: '2px 8px', color: '#38bdf8', fontWeight: 700
                    }}>
                      {c.accountCode}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.address}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>{c.email}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{c.phone}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: c.currentOutstanding > 0 ? '#f87171' : 'inherit' }}>
                    {c.currentOutstanding.toLocaleString('en-US')} XAF
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    {(c.creditLimit !== null && c.creditLimit !== undefined) ? `${c.creditLimit.toLocaleString('en-US')} XAF` : t('customers.unlimited')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => handleEdit(c)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', marginRight: '8px' }} title={t('common.edit', 'Edit')}>✏️</button>
                    <button onClick={() => handleDelete(c.id, c.name)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }} title={t('common.delete', 'Delete')}>🗑️</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('customers.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <JemShellModal
            title={editingId ? t('customers.modal_title_edit', 'Edit customer') : t('customers.modal_title')}
            subtitle={t('customers.modal_desc')}
            onClose={() => setShowModal(false)}
            size="md"
            pill="AR"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button type="submit" form="customer-form-modal" className="jem-btn-primary" disabled={saving}>
                  {saving ? t('customers.btn_saving') : (editingId ? t('customers.btn_update', 'Update') : t('customers.btn_add'))}
                </button>
              </>
            }
          >
            <form id="customer-form-modal" onSubmit={handleSubmit} className="jem-form-grid2">
              <div className="jem-input-group">
                <span className="jem-label">{t('customers.form_code')}</span>
                <input type="text" className="jem-field jem-mono" value={form.accountCode} onChange={e => setForm({ ...form, accountCode: e.target.value })} required />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('customers.form_name')}</span>
                <input type="text" className="jem-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Global Tech SARL" />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('customers.form_email')}</span>
                <input type="email" className="jem-field" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="billing@company.cm" />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('customers.form_phone')}</span>
                <input type="tel" className="jem-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+237 ..." />
              </div>
              <div className="jem-input-group" style={{ gridColumn: '1 / -1' }}>
                <span className="jem-label">{t('customers.form_address')}</span>
                <input type="text" className="jem-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, City, Country" />
              </div>
              <div className="jem-input-group" style={{ gridColumn: '1 / -1' }}>
                <span className="jem-label">{t('customers.form_credit_limit')}</span>
                <input
                  type="number"
                  className="jem-field jem-mono"
                  value={form.creditLimit ?? ''}
                  onChange={e => setForm({ ...form, creditLimit: e.target.value === '' ? null : Number(e.target.value) })}
                  min="0"
                  step="50000"
                />
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default Customers;