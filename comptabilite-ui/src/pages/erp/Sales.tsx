import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalPortal } from '../../components/ModalPortal';
import { JemShellModal } from '../../components/jem/JemShellModal';
import '../../components/JournalEntry/JournalEntryForm.css';
import { commercialApi } from '../../api';
import { getStoredCompanyId } from '../../lib/companyContext';
import { showToast } from '../../utils/dialogs';


interface SalesDocument {
  id: string;
  documentNumber: string;
  customerId: string;
  customer?: { name: string };
  status: string;
  documentType: string;
  issueDate: string;
  totalAmount: number;
  totalTTC: number;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  accountCode?: string;
}

interface Product {
  id: string;
  name: string;
  nameEn?: string;
  nameFr?: string;
  code?: string;
  unitPrice: number;
}

interface QuoteLine {
  productId: string;
  quantity: number;
}

interface QuoteForm {
  customerId: string;
  documentNumber: string;
  issueDate: string;
  lines: QuoteLine[];
}

const createEmptyQuote = (): QuoteForm => ({
  customerId: '',
  documentNumber: 'Q-' + Date.now().toString(36).toUpperCase(),
  issueDate: new Date().toISOString().split('T')[0],
  lines: [{ productId: '', quantity: 1 }]
});

const Sales: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [docs, setDocs] = useState<SalesDocument[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [newQuote, setNewQuote] = useState<QuoteForm>(createEmptyQuote);

  const loadData = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const [docsRes, custRes, prodRes] = await Promise.all([
        commercialApi.getSalesDocuments(companyId),
        commercialApi.getCustomers(companyId),
        commercialApi.getProducts(companyId)
      ]);
      setDocs(docsRes.data);
      setCustomers(custRes.data);
      setProducts(prodRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleTransform = async (id: string, type: string) => {
    try {
      if (type === 'invoice') {
        await commercialApi.transformToInvoice(id);
        showToast(t('sales.alert_invoice_posted'), 'success');
      } else if (type === 'order') {
        await commercialApi.transformToOrder(id);
      }
      loadData();
    } catch (err) {
      showToast(t('common.error') + ': ' + (err as Error).message, 'error');
    }
  };

  const handleLineChange = (index: number, field: string, value: string | number) => {
    const updated = [...newQuote.lines];
    updated[index] = { ...updated[index], [field]: value };
    setNewQuote({ ...newQuote, lines: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getStoredCompanyId();
    
    if (!companyId) {
      showToast(t('common.no_company', 'Select a company first.'), 'error');
      return;
    }
    if (!newQuote.customerId) {
      showToast(t('sales.error_no_customer', 'Please select a customer.'), 'error');
      return;
    }

    try {
      // Hydrate lines with unit prices and totals from selected products
      const hydratedLines = newQuote.lines.map(l => {
        const product = products.find(p => p.id === l.productId);
        const unitPrice = product ? product.unitPrice : 0;
        return {
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: unitPrice,
          totalLine: unitPrice * l.quantity
        };
      }).filter(l => l.productId && l.quantity > 0);

      if (hydratedLines.length === 0) {
        showToast(t('sales.error_no_products', 'Add at least one product with quantity.'), 'error');
        return;
      }

      const payload = {
        companyId,
        customerId: newQuote.customerId,
        documentNumber: newQuote.documentNumber,
        issueDate: newQuote.issueDate,
        lines: hydratedLines
      };

      await commercialApi.createQuote(payload);
      setShowModal(false);
      setNewQuote(createEmptyQuote());
      loadData();
    } catch (err) {
      const msg = err && typeof err === 'object' && 'response' in err 
        ? JSON.stringify((err.response as any)?.data || err)
        : (err as Error).message;
      showToast(t('common.error') + ': ' + msg, 'error');
      console.error('Quote Creation Error:', err);
    }
  };

  const isFr = i18n.language === 'fr';

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await commercialApi.patchSalesDocumentStatus(id, newStatus);
      loadData();
    } catch (err) {
      showToast(t('common.error') + ': ' + (err as Error).message, 'error');
    }
  };

  return (
    <div className="tc-page animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{t('sales.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('sales.subtitle')}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-glow" style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: 700 }}>
          + {t('sales.btn_new_quote')}
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '28px', overflowX: 'auto' }}>
        <table className="premium-table">
          <thead>
            <tr>
              <th>{t('sales.col_date')}</th>
              <th>{t('sales.col_doc_no')}</th>
              <th>{t('sales.col_customer')}</th>
              <th>{t('sales.col_type')}</th>
              <th style={{ textAlign: 'right' }}>{t('sales.col_total_ttc')}</th>
              <th style={{ textAlign: 'center' }}>{t('sales.col_status')}</th>
              <th style={{ textAlign: 'right' }}>{t('sales.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(d.issueDate).toLocaleDateString(isFr ? 'fr-CM' : 'en-US')}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{d.documentNumber}</td>
                <td>{d.customer?.name}</td>
                <td>{t(`sales.doc_type_${d.documentType}`)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{d.totalTTC.toLocaleString(isFr ? 'fr-CM' : 'en-US', { minimumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'center' }}>
                  <select
                    value={d.status}
                    onChange={(e) => handleStatusChange(d.id, e.target.value)}
                    style={{
                      background: d.status === 'invoiced' || d.status === 'delivered' ? 'var(--color-success)' : 
                                 d.status === 'confirmed' || d.status === 'sent' ? 'var(--color-primary)' : 
                                 'var(--color-warning)', 
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '99px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      appearance: 'none',
                      textAlign: 'center',
                      width: '110px'
                    }}
                  >
                    <option value="draft" style={{ color: '#000' }}>{t('sales.status_draft').toUpperCase()}</option>
                    <option value="confirmed" style={{ color: '#000' }}>{t('sales.status_confirmed').toUpperCase()}</option>
                    <option value="sent" style={{ color: '#000' }}>{t('sales.status_sent').toUpperCase()}</option>
                    <option value="delivered" style={{ color: '#000' }}>{t('sales.status_delivered').toUpperCase()}</option>
                    <option value="invoiced" style={{ color: '#000' }}>{t('sales.status_invoiced').toUpperCase()}</option>
                  </select>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {d.documentType === 'quote' && (
                    <button onClick={() => handleTransform(d.id, 'order')} style={{ background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>{t('sales.btn_to_order')}</button>
                  )}
                  {d.documentType === 'order' && (
                    <button onClick={() => handleTransform(d.id, 'invoice')} style={{ background: 'var(--color-success)', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>{t('sales.btn_to_invoice')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('sales.empty_docs')}</div>
        )}
      </div>

      {showModal && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <JemShellModal
            title={t('sales.modal_quote_title')}
            onClose={() => setShowModal(false)}
            size="lg"
            wideBody
            bodyClassName="jem-body--detail-scroll"
            pill="QTE"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                <button type="submit" form="sales-quote-form" className="jem-btn-primary">{t('sales.btn_create_quote')}</button>
              </>
            }
          >
            <form id="sales-quote-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">Quote no.</span>
                  <input type="text" readOnly className="jem-field jem-mono" value={newQuote.documentNumber} style={{ background: 'rgba(15,23,42,0.04)' }} />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">{t('sales.form_date')}</span>
                  <input
                    type="date"
                    required
                    className="jem-field"
                    value={newQuote.issueDate}
                    onChange={e => setNewQuote({ ...newQuote, issueDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('sales.form_customer')}</span>
                <select
                  required
                  className="jem-field"
                  value={newQuote.customerId}
                  onChange={e => setNewQuote({ ...newQuote, customerId: e.target.value })}
                >
                  <option value="">-- {t('sales.form_customer_select')} --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.accountCode})</option>)}
                </select>
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('sales.form_products')}</span>
                {newQuote.lines.map((line, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                    <div style={{ flex: 3, minWidth: 0 }}>
                      <select
                        required
                        className="jem-field"
                        value={line.productId}
                        onChange={e => handleLineChange(idx, 'productId', e.target.value)}
                      >
                        <option value="">-- {t('sales.form_product_select')} --</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.code} - {isFr ? p.nameFr : p.nameEn} ({p.unitPrice.toLocaleString(isFr ? 'fr-CM' : 'en-US')} HT)</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                      <input
                        type="number"
                        required
                        min="1"
                        className="jem-field jem-mono"
                        placeholder={t('sales.form_qty')}
                        value={line.quantity}
                        onChange={e => handleLineChange(idx, 'quantity', +e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = newQuote.lines.filter((_, i) => i !== idx);
                        setNewQuote({ ...newQuote, lines: updated });
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.1rem' }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setNewQuote({ ...newQuote, lines: [...newQuote.lines, { productId: '', quantity: 1 }] })}
                  style={{ marginTop: 4, background: 'rgba(79,70,229,0.1)', color: 'var(--color-primary)', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  + {t('sales.btn_add_product')}
                </button>
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default Sales;
