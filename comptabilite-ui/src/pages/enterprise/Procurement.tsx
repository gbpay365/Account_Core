import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** Procurement hub — purchasing stays in HMS; AP invoices & payments in Account_Core. */
const Procurement: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-in" style={{ padding: '24px' }}>
      <div className="glass-panel" style={{ padding: '28px', maxWidth: '720px' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>📦 {t('procurement.title', 'Procurement')}</h1>
        <p style={{ margin: '12px 0 0 0', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {t('procurement.subtitle')}
        </p>
        <ul style={{ margin: '20px 0', paddingLeft: '1.25rem', color: 'var(--text-main)', lineHeight: 1.8 }}>
          <li>
            <strong>HMS</strong> — {t('procurement.hms_ops')}
          </li>
          <li>
            <Link to="/ap-invoices" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              {t('common.ap_invoices')}
            </Link>{' '}
            — {t('procurement.ap_link')}
          </li>
          <li>
            <Link to="/reconciliation" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              {t('reconciliation.nav')}
            </Link>{' '}
            — {t('procurement.recon_link')}
          </li>
          <li>
            <Link to="/suppliers" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              {t('common.suppliers')}
            </Link>{' '}
            — {t('procurement.suppliers_link')}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Procurement;
