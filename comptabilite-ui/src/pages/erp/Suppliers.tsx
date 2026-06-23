import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { commercialApi, getApiErrorMessage } from '../../api';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../../lib/companyContext';
import { showToast } from '../../utils/dialogs';


interface Supplier {
  id: string;
  name: string;
  accountCode: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  taxId: string;
  currentBalance: number | null;
  companyId: string;
  createdAt: string;
}

const EMPTY_FORM = {
  name: '',
  accountCode: '',
  email: '',
  phone: '',
  address: '',
  contactPerson: '',
  taxId: '',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--glass-border)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--text)',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  outline: 'none',
};

const StatCard = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) => (
  <div style={{
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--glass-border)',
    borderRadius: '14px',
    padding: '18px 22px',
    flex: '1 1 180px',
    minWidth: 160,
  }}>
    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: accent ?? 'var(--text)' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
  </div>
);

const Suppliers: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cid = getStoredCompanyId();
    if (!cid) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await commercialApi.getSuppliers(cid);
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(getApiErrorMessage(err, t('suppliers.error_load')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cid = getStoredCompanyId();
    if (!cid) { showToast(t('suppliers.error_no_company'), 'error'); return; }
    try {
      setSaving(true);
      await commercialApi.createSupplier({
        companyId: cid,
        name: form.name.trim(),
        ...(form.accountCode.trim() ? { accountCode: form.accountCode.trim() } : {}),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        contactPerson: form.contactPerson.trim(),
        taxId: form.taxId.trim(),
      } as Parameters<typeof commercialApi.createSupplier>[0]);
      setShowModal(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('suppliers.error_create')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const fmtXaf = (v: number | null) =>
    v == null ? '—' : v.toLocaleString(i18n.language === 'fr' ? 'fr-CM' : 'en-US', { style: 'currency', currency: 'XAF' });

  const filtered = suppliers.filter(s => {
    const q = query.toLowerCase();
    return !q || s.name.toLowerCase().includes(q)
      || (s.accountCode ?? '').toLowerCase().includes(q)
      || (s.email ?? '').toLowerCase().includes(q)
      || (s.contactPerson ?? '').toLowerCase().includes(q)
      || (s.taxId ?? '').toLowerCase().includes(q);
  });

  const totalBalance = suppliers.reduce((acc, s) => acc + (s.currentBalance ?? 0), 0);
  const withBalance = suppliers.filter(s => (s.currentBalance ?? 0) > 0).length;

  return (
    <div className="animate-fade-in">
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>🏭</span> {t('suppliers.title')}
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {t('suppliers.subtitle')}
          </p>
        </div>
        <button
          className="btn-glow"
          onClick={() => { setForm({ ...EMPTY_FORM }); setShowModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontWeight: 700 }}
        >
          <span style={{ fontSize: '1.1rem' }}>＋</span> {t('suppliers.btn_add')}
        </button>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label={t('suppliers.stat_total')} value={suppliers.length} sub={t('suppliers.stat_accounts')} />
        <StatCard label={t('suppliers.stat_with_balance')} value={withBalance} sub={t('suppliers.stat_outstanding')} accent="#f59e0b" />
        <StatCard label={t('suppliers.stat_total_ap')} value={fmtXaf(totalBalance)} sub={t('suppliers.stat_dettes')} accent="#ef4444" />
      </div>

      {/* ── Search ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder={t('suppliers.search')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ ...inputStyle, maxWidth: 380 }}
        />
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('suppliers.loading')}
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="premium-table" style={{ minWidth: 780 }}>
              <thead>
                <tr>
                  <th>{t('suppliers.col_account')}</th>
                  <th>{t('suppliers.col_name')}</th>
                  <th>{t('suppliers.col_contact')}</th>
                  <th>{t('suppliers.col_phone')}</th>
                  <th>{t('suppliers.col_taxid')}</th>
                  <th style={{ textAlign: 'right' }}>{t('suppliers.col_balance')}</th>
                  <th>{t('suppliers.col_details')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <React.Fragment key={s.id}>
                    <tr
                      style={{ cursor: 'pointer', background: expandedId === s.id ? 'rgba(255,255,255,0.03)' : undefined }}
                      onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    >
                      <td>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '0.82rem',
                          background: 'rgba(99,102,241,0.15)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          color: '#a5b4fc',
                          fontWeight: 700,
                        }}>
                          {s.accountCode || '—'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{s.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.contactPerson || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{s.phone || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{s.taxId || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: (s.currentBalance ?? 0) > 0 ? '#f87171' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {fmtXaf(s.currentBalance)}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setExpandedId(expandedId === s.id ? null : s.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: '2px 8px', transition: 'color 0.2s' }}
                          title={t('suppliers.col_details')}
                        >
                          {expandedId === s.id ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === s.id && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, borderTop: 'none' }}>
                          <div style={{
                            background: 'rgba(0,0,0,0.25)',
                            borderRadius: '0 0 10px 10px',
                            padding: '16px 24px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: 16,
                          }}>
                            {[
                              { label: t('suppliers.form_email'), value: s.email || '—' },
                              { label: t('suppliers.form_phone'), value: s.phone || '—' },
                              { label: t('suppliers.form_address'), value: s.address || '—' },
                              { label: t('suppliers.form_taxid'), value: s.taxId || '—' },
                              { label: t('suppliers.form_contact'), value: s.contactPerson || '—' },
                              { label: t('suppliers.form_account'), value: s.accountCode || '—' },
                              { label: t('companies.registered'), value: new Date(s.createdAt).toLocaleDateString(i18n.language === 'fr' ? 'fr-CM' : 'en-US') },
                            ].map(f => (
                              <div key={f.label}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{f.label}</div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{f.value}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {query ? t('suppliers.empty') : t('suppliers.empty_hint')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Supplier Modal ──────────────────────────────── */}
      {showModal && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <JemShellModal
            title={t('suppliers.modal_title')}
            subtitle={t('suppliers.modal_desc')}
            onClose={() => setShowModal(false)}
            size="md"
            pill="AP"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button type="submit" form="supplier-form-modal" className="jem-btn-primary" disabled={saving}>
                  {saving ? t('suppliers.btn_saving') : t('suppliers.btn_add')}
                </button>
              </>
            }
          >
            <form id="supplier-form-modal" onSubmit={handleCreate} className="jem-form-grid2">
              <div className="jem-input-group">
                <span className="jem-label">{t('suppliers.form_name')}</span>
                <input type="text" className="jem-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Camtel SARL" />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('suppliers.form_account')}</span>
                <input type="text" className="jem-field jem-mono" value={form.accountCode} onChange={e => setForm({ ...form, accountCode: e.target.value })} placeholder="Auto (401XXXX)" />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('suppliers.form_contact')}</span>
                <input type="text" className="jem-field" value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="e.g. Jean Dupont" />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('suppliers.form_phone')}</span>
                <input type="tel" className="jem-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +237 6XX XXX XXX" />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('suppliers.form_email')}</span>
                <input type="email" className="jem-field" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="supplier@example.cm" />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('suppliers.form_taxid')}</span>
                <input type="text" className="jem-field jem-mono" value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} placeholder="e.g. M123456789" />
              </div>
              <div className="jem-input-group" style={{ gridColumn: '1 / -1' }}>
                <span className="jem-label">{t('suppliers.form_address')}</span>
                <input type="text" className="jem-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="e.g. Rue de la Réunification, Douala" />
              </div>
            </form>
            <p style={{ margin: '12px 0 0', padding: '10px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('suppliers.auto_gen_hint')}
            </p>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default Suppliers;