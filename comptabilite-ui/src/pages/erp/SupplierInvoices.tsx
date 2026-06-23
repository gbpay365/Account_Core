import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apApi, commercialApi, getApiErrorMessage } from '../../api';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../../lib/companyContext';
import { showToast } from '../../utils/dialogs';

interface Supplier {
  id: string;
  name: string;
  accountCode: string;
}

interface InvoiceLine {
  description: string;
  expenseAccountCode: string;
  amountHt: number;
  vatRate: number;
}

interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalHT: number;
  totalTVA: number;
  amountTtc: number;
  paidAmount: number;
  openAmount: number;
  journalEntryId?: string;
  supplier?: Supplier;
}

interface SupplierPayment {
  id: string;
  supplierId: string;
  paymentDate: string;
  amount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  reference: string;
  paymentMethod: string;
  bankAccountCode: string;
  status: string;
  journalEntryId?: string;
  supplier?: Supplier;
}

const emptyLine = (): InvoiceLine => ({
  description: '',
  expenseAccountCode: '604700',
  amountHt: 0,
  vatRate: 19.25,
});

const createEmptyInvoice = () => ({
  supplierId: '',
  invoiceNumber: '',
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  notes: '',
  lines: [emptyLine()],
});

const createEmptyPayment = () => ({
  supplierId: '',
  paymentDate: new Date().toISOString().split('T')[0],
  amount: 0,
  reference: '',
  paymentMethod: 'transfer',
  bankAccountCode: '521100',
  allocations: [] as { supplierInvoiceId: string; amount: number }[],
});

const fmt = (n: number, isFr: boolean) =>
  n.toLocaleString(isFr ? 'fr-CM' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColor = (status: string) => {
  if (status === 'posted' || status === 'paid') return 'var(--color-success)';
  if (status === 'void') return 'var(--text-muted)';
  return 'var(--color-warning)';
};

const SupplierInvoices: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isFr = i18n.language === 'fr';

  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(createEmptyInvoice());
  const [paymentForm, setPaymentForm] = useState(createEmptyPayment());

  const openInvoicesForPayment = useMemo(
    () => invoices.filter(
      i => i.supplierId === paymentForm.supplierId && i.status === 'posted' && i.openAmount > 0.01
    ),
    [invoices, paymentForm.supplierId]
  );

  const loadData = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const [invRes, payRes, supRes] = await Promise.all([
        apApi.getInvoices(companyId),
        apApi.getPayments(companyId),
        commercialApi.getSuppliers(companyId),
      ]);
      setInvoices(invRes.data);
      setPayments(payRes.data);
      setSuppliers(supRes.data);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Request failed'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePostInvoice = async (id: string) => {
    try {
      await apApi.postInvoice(id);
      showToast(t('ap.alert_invoice_posted'), 'success');
      loadData();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Request failed'), 'error');
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!window.confirm(t('ap.confirm_delete_invoice'))) return;
    try {
      await apApi.deleteInvoice(id);
      loadData();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Request failed'), 'error');
    }
  };

  const handlePostPayment = async (id: string) => {
    try {
      await apApi.postPayment(id);
      showToast(t('ap.alert_payment_posted'), 'success');
      loadData();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Request failed'), 'error');
    }
  };

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.supplierId) {
      showToast(t('ap.error_no_supplier'), 'error');
      return;
    }
    const lines = invoiceForm.lines.filter(l => l.description.trim() && l.amountHt > 0);
    if (lines.length === 0) {
      showToast(t('ap.error_no_lines'), 'error');
      return;
    }
    try {
      await apApi.createInvoice({
        supplierId: invoiceForm.supplierId,
        invoiceNumber: invoiceForm.invoiceNumber || undefined,
        issueDate: invoiceForm.issueDate,
        dueDate: invoiceForm.dueDate,
        notes: invoiceForm.notes,
        lines,
      });
      setShowInvoiceModal(false);
      setInvoiceForm(createEmptyInvoice());
      loadData();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Request failed'), 'error');
    }
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.supplierId || paymentForm.amount <= 0) {
      showToast(t('ap.error_payment_invalid'), 'error');
      return;
    }
    const allocations = paymentForm.allocations.filter(a => a.supplierInvoiceId && a.amount > 0);
    const allocTotal = allocations.reduce((s, a) => s + a.amount, 0);
    if (allocTotal > paymentForm.amount + 0.01) {
      showToast(t('ap.error_alloc_exceeds'), 'error');
      return;
    }
    try {
      await apApi.createPayment({
        supplierId: paymentForm.supplierId,
        paymentDate: paymentForm.paymentDate,
        amount: paymentForm.amount,
        reference: paymentForm.reference || undefined,
        paymentMethod: paymentForm.paymentMethod,
        bankAccountCode: paymentForm.bankAccountCode,
        allocations: allocations.length ? allocations : undefined,
      });
      setShowPaymentModal(false);
      setPaymentForm(createEmptyPayment());
      loadData();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Request failed'), 'error');
    }
  };

  const openPaymentModal = () => {
    setPaymentForm(createEmptyPayment());
    setShowPaymentModal(true);
  };

  const kpis = useMemo(() => {
    const openInv = invoices.filter(i => i.status === 'posted' && i.openAmount > 0.01);
    const draftPay = payments.filter(p => p.status === 'draft');
    return {
      openCount: openInv.length,
      openTotal: openInv.reduce((s, i) => s + i.openAmount, 0),
      draftPayments: draftPay.length,
    };
  }, [invoices, payments]);

  return (
    <div className="tc-page animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>{t('ap.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('ap.subtitle')}</p>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 0', fontSize: '0.85rem' }}>
            {t('ap.hms_note')}{' '}
            <Link to="/enterprise/procurement" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{t('ap.hms_link')}</Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-glow" onClick={() => { setInvoiceForm(createEmptyInvoice()); setShowInvoiceModal(true); }}>
            + {t('ap.btn_new_invoice')}
          </button>
          <button type="button" onClick={openPaymentModal} style={{ padding: '12px 20px', borderRadius: 12, fontWeight: 700, border: '1px solid var(--color-primary)', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer' }}>
            + {t('ap.btn_new_payment')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{t('ap.kpi_open_invoices')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{kpis.openCount}</div>
        </div>
        <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{t('ap.kpi_open_ap')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-warning)' }}>{fmt(kpis.openTotal, isFr)}</div>
        </div>
        <div style={{ flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{t('ap.kpi_draft_payments')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{kpis.draftPayments}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setTab('invoices')} style={{ padding: '8px 18px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, background: tab === 'invoices' ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)', color: tab === 'invoices' ? '#fff' : 'var(--text-muted)' }}>
          {t('ap.tab_invoices')}
        </button>
        <button type="button" onClick={() => setTab('payments')} style={{ padding: '8px 18px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, background: tab === 'payments' ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)', color: tab === 'payments' ? '#fff' : 'var(--text-muted)' }}>
          {t('ap.tab_payments')}
        </button>
      </div>

      <div className="glass-panel" style={{ padding: 28, overflowX: 'auto' }}>
        {tab === 'invoices' ? (
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('ap.col_date')}</th>
                <th>{t('ap.col_invoice_no')}</th>
                <th>{t('ap.col_supplier')}</th>
                <th style={{ textAlign: 'right' }}>{t('ap.col_total_ttc')}</th>
                <th style={{ textAlign: 'right' }}>{t('ap.col_open')}</th>
                <th style={{ textAlign: 'center' }}>{t('ap.col_status')}</th>
                <th style={{ textAlign: 'right' }}>{t('ap.col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(inv.issueDate).toLocaleDateString(isFr ? 'fr-CM' : 'en-US')}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td>{inv.supplier?.name}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(inv.amountTtc, isFr)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(inv.openAmount ?? inv.amountTtc - inv.paidAmount, isFr)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: statusColor(inv.status), color: '#fff', padding: '4px 12px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}>
                      {t(`ap.status_${inv.status}`, inv.status).toUpperCase()}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {inv.status === 'draft' && (
                      <>
                        <button type="button" onClick={() => handlePostInvoice(inv.id)} style={{ background: 'var(--color-success)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginRight: 6 }}>
                          {t('ap.btn_post')}
                        </button>
                        <button type="button" onClick={() => handleDeleteInvoice(inv.id)} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                          {t('common.delete')}
                        </button>
                      </>
                    )}
                    {inv.journalEntryId && (
                      <Link to="/journal" style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginLeft: 6 }}>{t('ap.view_journal')}</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('ap.col_date')}</th>
                <th>{t('ap.col_reference')}</th>
                <th>{t('ap.col_supplier')}</th>
                <th style={{ textAlign: 'right' }}>{t('ap.col_amount')}</th>
                <th style={{ textAlign: 'right' }}>{t('ap.col_allocated')}</th>
                <th style={{ textAlign: 'center' }}>{t('ap.col_status')}</th>
                <th style={{ textAlign: 'right' }}>{t('ap.col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(p.paymentDate).toLocaleDateString(isFr ? 'fr-CM' : 'en-US')}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.reference}</td>
                  <td>{p.supplier?.name}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.amount, isFr)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(p.allocatedAmount, isFr)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: statusColor(p.status), color: '#fff', padding: '4px 12px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}>
                      {t(`ap.status_${p.status}`, p.status).toUpperCase()}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {p.status === 'draft' && (
                      <button type="button" onClick={() => handlePostPayment(p.id)} style={{ background: 'var(--color-success)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                        {t('ap.btn_post_payment')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && ((tab === 'invoices' && invoices.length === 0) || (tab === 'payments' && payments.length === 0)) && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('ap.empty')}</div>
        )}
      </div>

      {showInvoiceModal && (
        <ModalPortal onClose={() => setShowInvoiceModal(false)}>
          <JemShellModal
            title={t('ap.modal_invoice_title')}
            onClose={() => setShowInvoiceModal(false)}
            size="lg"
            wideBody
            bodyClassName="jem-body--detail-scroll"
            pill="AP"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowInvoiceModal(false)}>{t('common.cancel')}</button>
                <button type="submit" form="ap-invoice-form" className="jem-btn-primary">{t('ap.btn_save_draft')}</button>
              </>
            }
          >
            <form id="ap-invoice-form" onSubmit={submitInvoice} className="ap-modal-form">
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.form_supplier')}</span>
                  <select required className="jem-field" value={invoiceForm.supplierId} onChange={e => setInvoiceForm({ ...invoiceForm, supplierId: e.target.value })}>
                    <option value="">--</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.accountCode})</option>)}
                  </select>
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.form_invoice_no')}</span>
                  <input className="jem-field" placeholder={t('ap.form_invoice_auto')} value={invoiceForm.invoiceNumber} onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} />
                </div>
              </div>
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.col_date')}</span>
                  <input type="date" required className="jem-field" value={invoiceForm.issueDate} onChange={e => setInvoiceForm({ ...invoiceForm, issueDate: e.target.value })} />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.form_due_date')}</span>
                  <input type="date" required className="jem-field" value={invoiceForm.dueDate} onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} />
                </div>
              </div>
              <div className="jem-input-group ap-invoice-lines">
                <span className="jem-label">{t('ap.form_lines')}</span>
                <div className="ap-invoice-lines__grid ap-invoice-lines__head">
                  <span>{t('ap.form_line_description')}</span>
                  <span>{t('ap.form_line_account')}</span>
                  <span>{t('ap.form_line_amount_ht')}</span>
                  <span>{t('ap.form_line_vat')}</span>
                  <span aria-hidden="true" />
                </div>
                {invoiceForm.lines.map((line, idx) => (
                  <div key={idx} className="ap-invoice-lines__grid ap-invoice-lines__row">
                    <input
                      className="jem-field"
                      placeholder={t('ap.form_description')}
                      value={line.description}
                      onChange={e => {
                        const lines = [...invoiceForm.lines];
                        lines[idx] = { ...line, description: e.target.value };
                        setInvoiceForm({ ...invoiceForm, lines });
                      }}
                    />
                    <input
                      className="jem-field jem-mono"
                      placeholder="604700"
                      title={t('ap.form_line_account')}
                      value={line.expenseAccountCode}
                      onChange={e => {
                        const lines = [...invoiceForm.lines];
                        lines[idx] = { ...line, expenseAccountCode: e.target.value };
                        setInvoiceForm({ ...invoiceForm, lines });
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="jem-field"
                      placeholder="0.00"
                      title={t('ap.form_line_amount_ht')}
                      value={line.amountHt || ''}
                      onChange={e => {
                        const lines = [...invoiceForm.lines];
                        lines[idx] = { ...line, amountHt: parseFloat(e.target.value) || 0 };
                        setInvoiceForm({ ...invoiceForm, lines });
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="jem-field"
                      placeholder="19.25"
                      title={t('ap.form_line_vat')}
                      value={line.vatRate}
                      onChange={e => {
                        const lines = [...invoiceForm.lines];
                        lines[idx] = { ...line, vatRate: parseFloat(e.target.value) || 0 };
                        setInvoiceForm({ ...invoiceForm, lines });
                      }}
                    />
                    <button
                      type="button"
                      className="ap-invoice-lines__remove"
                      onClick={() => setInvoiceForm({ ...invoiceForm, lines: invoiceForm.lines.filter((_, i) => i !== idx) })}
                      aria-label={t('common.delete')}
                      disabled={invoiceForm.lines.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ap-invoice-lines__add"
                  onClick={() => setInvoiceForm({ ...invoiceForm, lines: [...invoiceForm.lines, emptyLine()] })}
                >
                  + {t('ap.form_add_line')}
                </button>
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}

      {showPaymentModal && (
        <ModalPortal onClose={() => setShowPaymentModal(false)}>
          <JemShellModal
            title={t('ap.modal_payment_title')}
            onClose={() => setShowPaymentModal(false)}
            size="lg"
            wideBody
            bodyClassName="jem-body--detail-scroll"
            pill="PAY"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowPaymentModal(false)}>{t('common.cancel')}</button>
                <button type="submit" form="ap-payment-form" className="jem-btn-primary">{t('ap.btn_save_payment')}</button>
              </>
            }
          >
            <form id="ap-payment-form" onSubmit={submitPayment} className="ap-modal-form">
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.form_supplier')}</span>
                  <select required className="jem-field" value={paymentForm.supplierId} onChange={e => setPaymentForm({ ...paymentForm, supplierId: e.target.value, allocations: [] })}>
                    <option value="">--</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.col_date')}</span>
                  <input type="date" required className="jem-field" value={paymentForm.paymentDate} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} />
                </div>
              </div>
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.col_amount')}</span>
                  <input type="number" min={0.01} step="0.01" required className="jem-field" value={paymentForm.amount || ''} onChange={e => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.col_reference')}</span>
                  <input className="jem-field" placeholder={t('ap.form_reference_auto')} value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                </div>
              </div>
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.form_payment_method')}</span>
                  <select className="jem-field" value={paymentForm.paymentMethod} onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value, bankAccountCode: e.target.value === 'cash' ? '571100' : '521100' })}>
                    <option value="transfer">{t('ap.method_transfer')}</option>
                    <option value="cash">{t('ap.method_cash')}</option>
                    <option value="cheque">{t('ap.method_cheque')}</option>
                  </select>
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.form_bank_account')}</span>
                  <input className="jem-field jem-mono" value={paymentForm.bankAccountCode} onChange={e => setPaymentForm({ ...paymentForm, bankAccountCode: e.target.value })} />
                </div>
              </div>
              {paymentForm.supplierId && openInvoicesForPayment.length > 0 && (
                <div className="jem-input-group">
                  <span className="jem-label">{t('ap.form_allocate')}</span>
                  <div className="ap-payment-alloc">
                    <div className="ap-payment-alloc__grid ap-payment-alloc__head">
                      <span>{t('ap.col_invoice_no')}</span>
                      <span>{t('ap.col_open')}</span>
                      <span>{t('ap.form_allocate_amount')}</span>
                    </div>
                    {openInvoicesForPayment.map(inv => {
                      const alloc = paymentForm.allocations.find(a => a.supplierInvoiceId === inv.id);
                      const amount = alloc?.amount ?? 0;
                      return (
                        <div key={inv.id} className="ap-payment-alloc__grid ap-payment-alloc__row">
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{inv.invoiceNumber}</span>
                          <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{fmt(inv.openAmount, isFr)}</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="jem-field"
                            placeholder="0.00"
                            value={amount || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              const rest = paymentForm.allocations.filter(a => a.supplierInvoiceId !== inv.id);
                              setPaymentForm({ ...paymentForm, allocations: val > 0 ? [...rest, { supplierInvoiceId: inv.id, amount: val }] : rest });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default SupplierInvoices;
