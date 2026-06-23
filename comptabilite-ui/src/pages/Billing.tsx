import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { billingApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';
import { amountLocale } from '../utils/reportLocale';
import { showToast } from '../utils/dialogs';

const Billing: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const companyId = getStoredCompanyId();
  const numLoc = amountLocale(i18n.language);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [pRes, sRes, payRes] = await Promise.all([
        billingApi.getPlans(),
        billingApi.getSubscription(companyId),
        billingApi.getPayments(companyId),
      ]);
      setPlans(pRes.data);
      setSubscription(sRes.data?.status === 'none' ? null : sRes.data);
      setPayments(Array.isArray(payRes.data) ? payRes.data : []);
    } catch { showToast(t('billing.load_failed'), 'error'); }
    finally { setLoading(false); }
  }, [companyId, t]);

  useEffect(() => { load(); }, [load]);

  const handleSubscribe = async (planId: string, provider = 'Manual') => {
    if (!companyId) return;
    try {
      await billingApi.subscribe({ companyId, planId, billingCycle, provider });
      showToast(t('billing.subscribed'), 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.error || t('billing.subscribe_failed'), 'error');
    }
  };

  const handleCheckout = async (planId: string, provider: string) => {
    if (!companyId) return;
    try {
      const res = await billingApi.checkout({ companyId, planId, billingCycle, provider });
      showToast(`${t('billing.checkout_created')}: ${res.data.checkoutUrl}`, 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.error || t('billing.subscribe_failed'), 'error');
    }
  };

  const handleCancel = async () => {
    if (!companyId || !confirm(t('billing.confirm_cancel'))) return;
    try {
      await billingApi.cancel(companyId);
      showToast(t('billing.cancelled'), 'success');
      load();
    } catch { showToast(t('billing.subscribe_failed'), 'error'); }
  };

  const fmt = (n: number) => n.toLocaleString(numLoc);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>💳 {t('billing.title')}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{t('billing.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={billingCycle === 'monthly' ? 'btn-glow' : 'jem-btn-ghost'} onClick={() => setBillingCycle('monthly')}>{t('billing.monthly')}</button>
          <button className={billingCycle === 'yearly' ? 'btn-glow' : 'jem-btn-ghost'} onClick={() => setBillingCycle('yearly')}>{t('billing.yearly')}</button>
        </div>
      </div>

      {subscription && (
        <div className="glass-panel" style={{ padding: 20, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('billing.current_plan')}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{subscription.planName}</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
              {t('settings.status')}: <strong>{subscription.status}</strong>
              {subscription.renewalDate && ` · ${t('billing.renews')}: ${new Date(subscription.renewalDate).toLocaleDateString()}`}
            </div>
          </div>
          {subscription.status !== 'Cancelled' && (
            <button className="jem-btn-ghost" onClick={handleCancel}>{t('billing.cancel')}</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>{t('common.loading')}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
            {plans.map((plan: any) => {
              const price = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
              const isCurrent = subscription?.planId === plan.id;
              return (
                <div key={plan.id} className="glass-panel" style={{
                  padding: 24, border: isCurrent ? '1px solid var(--color-primary)' : undefined,
                  display: 'flex', flexDirection: 'column'
                }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{plan.name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>{plan.description}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 16 }}>
                    {price === 0 ? t('billing.free') : `${fmt(price)} XAF`}
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>/{billingCycle === 'yearly' ? t('billing.year') : t('billing.month')}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, flex: 1 }}>
                    {t('billing.max_users')}: {plan.maxUsers} · {t('billing.max_companies')}: {plan.maxCompanies}
                  </div>
                  {isCurrent ? (
                    <span className="status-pill active">{t('billing.current')}</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button className="btn-glow" onClick={() => handleSubscribe(plan.id)}>{t('billing.select_plan')}</button>
                      {price > 0 && (
                        <>
                          <button className="jem-btn-ghost" onClick={() => handleCheckout(plan.id, 'Stripe')}>Stripe</button>
                          <button className="jem-btn-ghost" onClick={() => handleCheckout(plan.id, 'PayPal')}>PayPal</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="glass-panel" style={{ padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>{t('billing.payment_history')}</h3>
            {payments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>{t('common.no_data')}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: 8 }}>{t('general_ledger.date')}</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>{t('billing.provider')}</th>
                    <th style={{ textAlign: 'right', padding: 8 }}>{t('common.amount')}</th>
                    <th style={{ textAlign: 'center', padding: 8 }}>{t('settings.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: 8 }}>{new Date(p.paidAt || p.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: 8 }}>{p.provider}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{fmt(p.amount)} {p.currency}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Billing;
