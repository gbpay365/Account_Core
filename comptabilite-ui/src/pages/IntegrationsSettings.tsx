import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { integrationSettingsApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';

/** Strip dev ports from *.railway.app URLs (Railway uses standard 443). */
function normalizePartnerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith('.railway.app') && u.port && !['80', '443', ''].includes(u.port)) {
      u.port = '';
      return u.toString().replace(/\/$/, '');
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

const IntegrationsSettings: React.FC = () => {
  const { t } = useTranslation();
  const companyId = getStoredCompanyId();
  const [form, setForm] = useState({
    hmsFacilityId: 1,
    publicBaseUrl: '',
    hmsBaseUrl: '',
    hmsWebhookKey: '',
    zaizensPayrollBaseUrl: '',
    inboundApiKey: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await integrationSettingsApi.get(companyId);
      const d = res.data;
      setForm({
        hmsFacilityId: d.hmsFacilityId ?? 1,
        publicBaseUrl: d.publicBaseUrl || '',
        hmsBaseUrl: d.hmsBaseUrl || '',
        hmsWebhookKey: d.hmsWebhookKey || '',
        zaizensPayrollBaseUrl: d.zaizensPayrollBaseUrl || '',
        inboundApiKey: d.inboundApiKey || '',
      });
    } catch {
      setError(t('integrations.load_failed', 'Could not load integration settings.'));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await integrationSettingsApi.save(companyId, {
        companyId,
        hmsFacilityId: form.hmsFacilityId,
        publicBaseUrl: form.publicBaseUrl,
        hmsBaseUrl: form.hmsBaseUrl,
        hmsWebhookKey: form.hmsWebhookKey,
        zaizensPayrollBaseUrl: form.zaizensPayrollBaseUrl,
        inboundApiKey: form.inboundApiKey,
      });
      setMessage(t('integrations.saved', 'Integration settings saved.'));
      load();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; title?: string } }; message?: string };
      setError(ax.response?.data?.error || ax.response?.data?.title || ax.message || t('integrations.save_failed', 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const formPayload = () => ({
    companyId,
    hmsFacilityId: form.hmsFacilityId,
    publicBaseUrl: form.publicBaseUrl,
    hmsBaseUrl: form.hmsBaseUrl,
    hmsWebhookKey: form.hmsWebhookKey,
    zaizensPayrollBaseUrl: form.zaizensPayrollBaseUrl,
    inboundApiKey: form.inboundApiKey,
  });

  const testHms = async () => {
    if (!companyId) return;
    setMessage(null);
    setError(null);
    try {
      const res = await integrationSettingsApi.testHms(companyId, formPayload());
      if (res.data.ok) {
        setMessage(`HMS connection OK (${res.data.url || form.hmsBaseUrl})`);
      } else {
        setError(res.data.error || `HMS test failed (HTTP ${res.data.status}) — check URL is http://127.0.0.1:3003 for local HMS`);
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error || ax.message || 'HMS test failed');
    }
  };

  const testZaizens = async () => {
    if (!companyId) return;
    setMessage(null);
    setError(null);
    try {
      const res = await integrationSettingsApi.testZaizens(companyId, formPayload());
      if (res.data.ok) {
        setMessage(`Zaizens PayRoll connection OK (${res.data.url || form.zaizensPayrollBaseUrl})`);
      } else {
        setError(res.data.error || `Zaizens test failed (HTTP ${res.data.status}) — check URL is http://127.0.0.1:3010`);
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error || ax.message || 'Zaizens test failed');
    }
  };

  if (!companyId) {
    return <div className="glass-panel" style={{ padding: 24 }}>{t('integrations.select_company', 'Select a company first.')}</div>;
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>🔌 {t('integrations.title', 'Partner integrations')}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
          {t('integrations.subtitle', 'Multi-tenant API URLs and keys for HMS and Zaizens PayRoll (use public HTTPS URLs when hosted separately).')}
        </p>
      </div>

      {message && <div className="glass-panel" style={{ padding: 16, marginBottom: 16, color: 'var(--color-success)' }}>{message}</div>}
      {error && <div className="glass-panel" style={{ padding: 16, marginBottom: 16, color: 'var(--color-danger)' }}>{error}</div>}

      {loading ? (
        <div>{t('common.loading', 'Loading…')}</div>
      ) : (
        <form onSubmit={handleSave} className="glass-panel" style={{ padding: 24, maxWidth: 720 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('integrations.hms_facility_id', 'HMS facility ID')}</label>
            <input type="number" min={1} className="form-control" value={form.hmsFacilityId}
              onChange={(e) => setForm({ ...form, hmsFacilityId: parseInt(e.target.value, 10) || 1 })} />
            <small style={{ color: 'var(--text-muted)' }}>{t('integrations.facility_hint', 'Maps this company to HMS / PayRoll facility_id in X-Facility-Id header.')}</small>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('integrations.public_url', 'Account_Core public URL')}</label>
            <input type="url" className="form-control" value={form.publicBaseUrl}
              onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })}
              onBlur={(e) => setForm({ ...form, publicBaseUrl: normalizePartnerUrl(e.target.value) })}
              placeholder="https://zaizens-account.up.railway.app" />
            <small style={{ color: 'var(--text-muted)' }}>API base URL (not the React UI). Local: http://127.0.0.1:5072</small>
          </div>

          <h3 style={{ fontSize: '1.1rem', marginTop: 24 }}>{t('integrations.hms_section', 'HMS (inbound webhooks from Core)')}</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('integrations.hms_url', 'HMS URL')}</label>
            <input type="url" className="form-control" value={form.hmsBaseUrl}
              onChange={(e) => setForm({ ...form, hmsBaseUrl: e.target.value })}
              onBlur={(e) => setForm({ ...form, hmsBaseUrl: normalizePartnerUrl(e.target.value) })}
              placeholder="https://zaizens-hms.up.railway.app" />
            <small style={{ color: 'var(--text-muted)' }}>Railway: public HMS URL. Local: http://127.0.0.1:3003</small>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('integrations.hms_webhook_key', 'Outbound key (Core → HMS X-API-Key)')}</label>
            <input type="text" className="form-control" value={form.hmsWebhookKey}
              onChange={(e) => setForm({ ...form, hmsWebhookKey: e.target.value })} autoComplete="off"
              placeholder="dev-hms-inbound-key-change-in-production" />
          </div>
          <button type="button" className="btn-glow" style={{ marginBottom: 24 }} onClick={testHms}>{t('integrations.test_hms', 'Test HMS')}</button>

          <h3 style={{ fontSize: '1.1rem', marginTop: 8 }}>{t('integrations.zaizens_section', 'Zaizens PayRoll')}</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('integrations.zaizens_url', 'Zaizens PayRoll URL')}</label>
            <input type="url" className="form-control" value={form.zaizensPayrollBaseUrl}
              onChange={(e) => setForm({ ...form, zaizensPayrollBaseUrl: e.target.value })}
              onBlur={(e) => setForm({ ...form, zaizensPayrollBaseUrl: normalizePartnerUrl(e.target.value) })}
              placeholder="https://zaizenspay.up.railway.app" />
            <small style={{ color: 'var(--text-muted)' }}>
              PayRoll <strong>API</strong> URL — not <code>zaizens-account-ui</code>. Do not append <code>:3010</code> on Railway. Local: http://127.0.0.1:3010
            </small>
          </div>

          <h3 style={{ fontSize: '1.1rem', marginTop: 24 }}>{t('integrations.inbound_section', 'Inbound (HMS / PayRoll → Core)')}</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('integrations.inbound_key', 'Inbound API key (X-API-Key)')}</label>
            <input type="text" className="form-control" value={form.inboundApiKey}
              onChange={(e) => setForm({ ...form, inboundApiKey: e.target.value })} autoComplete="off"
              placeholder="dev-integration-key-change-in-production" />
          </div>
          <button type="button" className="btn-glow" style={{ marginBottom: 24 }} onClick={testZaizens}>{t('integrations.test_zaizens', 'Test Zaizens')}</button>

          <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.04)', borderRadius: 8, fontSize: '0.85rem' }}>
            <strong>{t('integrations.inbound_endpoints', 'Inbound endpoints for partners:')}</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              <li><code>POST /api/v1/integrations/employees</code></li>
              <li><code>POST /api/v1/integrations/payroll-periods</code></li>
              <li><code>POST /api/v1/integrations/payroll-department-summaries</code></li>
            </ul>
          </div>

          <button type="submit" className="btn-glow" style={{ marginTop: 24 }} disabled={saving}>
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </button>
        </form>
      )}
    </div>
  );
};

export default IntegrationsSettings;
