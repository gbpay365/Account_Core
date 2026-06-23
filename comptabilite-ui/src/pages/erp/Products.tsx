import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { commercialApi } from '../../api';
import { getStoredCompanyId } from '../../lib/companyContext';

interface Product {
  id: string;
  code: string;
  nameEn: string;
  nameFr?: string;
  description?: string;
  unitPrice: number;
  stockQuantity: number;
  taxRate: number;
  isActive?: boolean;
  family?: { id: string; nameEn: string; nameFr: string };
}

const HMS_CATALOG_URL = import.meta.env.VITE_HMS_CATALOG_URL || 'http://127.0.0.1:3000/catalog';

const Products: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isFr = i18n.language === 'fr';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const loadData = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const prodRes = await commercialApi.getProducts(companyId);
      setProducts(prodRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = products.filter((p) => {
    const name = (isFr ? p.nameFr : p.nameEn) || p.nameEn;
    return (
      name.toLowerCase().includes(query.toLowerCase()) ||
      p.code.toLowerCase().includes(query.toLowerCase())
    );
  });

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.6rem' }}>📦</span> {t('products.title')}
        </h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {t('products.readonly_desc', {
            defaultValue:
              'Read-only catalog synced from HMS service catalog and stock. Add or edit items in the hospital system.',
          })}
        </p>
      </div>

      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          borderLeft: '4px solid var(--color-primary)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: 720 }}>
          {t('products.hms_banner', {
            defaultValue:
              'Product master data is owned by HMS (service catalog & inventory). Account_Core receives one-way updates via POST /api/v1/integrations/products.',
          })}
        </div>
        <a
          href={HMS_CATALOG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-glow"
          style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          {t('products.open_hms_catalog', { defaultValue: 'Manage in HMS →' })}
        </a>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder={t('products.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--glass-border)',
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text)',
          }}
        />
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('common.loading')}
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('products.col_code')}</th>
                <th>{t('products.col_name')}</th>
                <th>{t('products.col_family')}</th>
                <th style={{ textAlign: 'right' }}>{t('products.col_price')}</th>
                <th>{t('settings.status', { defaultValue: 'Status' })}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.82rem',
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 6,
                        padding: '2px 8px',
                        color: '#a5b4fc',
                        fontWeight: 700,
                      }}
                    >
                      {p.code}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{isFr ? p.nameFr || p.nameEn : p.nameEn}</td>
                  <td>{(isFr ? p.family?.nameFr : p.family?.nameEn) || p.family?.nameEn || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                    {p.unitPrice.toLocaleString('fr-FR', { style: 'currency', currency: 'XAF' })}
                  </td>
                  <td>
                    {p.isActive === false ? (
                      <span style={{ color: 'var(--text-muted)' }}>{t('hr.inactive', { defaultValue: 'Inactive' })}</span>
                    ) : (
                      <span style={{ color: '#10b981' }}>{t('hr.active', { defaultValue: 'Active' })}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('products.no_data')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Products;
