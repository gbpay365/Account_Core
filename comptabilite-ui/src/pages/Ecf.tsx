import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob, ecfApi, getApiErrorMessage } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { getStoredCompanyId } from '../lib/companyContext';
import { showConfirm } from '../utils/dialogs';


const Ecf: React.FC = () => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('ecf', 'write');

  const [declarations, setDeclarations] = useState<any[]>([]);
  const [fecRows, setFecRows] = useState<any[]>([]);
  const [selectedDecl, setSelectedDecl] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [declType, setDeclType] = useState('annual_cit');
  const [periodMonth, setPeriodMonth] = useState<number | ''>('');
  const [periodQuarter, setPeriodQuarter] = useState<number | ''>('');
  const [ebillingMsg, setEbillingMsg] = useState<string | null>(null);
  const [ebillingStatus, setEbillingStatus] = useState<string | null>(null);

  const statusLabel = (status: string) => {
    const key = `ecf.status_${String(status || '').toLowerCase()}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };

  const declarationTypeLabel = (type: string) => {
    const key = `ecf.decl_type_${type}`;
    const translated = t(key);
    return translated === key ? type : translated;
  };

  const load = useCallback(async () => {
    const cid = getStoredCompanyId();
    if (!cid) {
      setDeclarations([]);
      setFecRows([]);
      setLoading(false);
      setError(t('ecf.error_no_company'));
      return;
    }
    setLoading(true);
    setError(null);
try {
      const [d, f] = await Promise.all([ecfApi.listDeclarations(cid), ecfApi.listFec(cid)]);
      setDeclarations(d.data);
      setFecRows(f.data);
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_load')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void ecfApi
      .getEbillingIntegrationStatus()
      .then((r) => {
        const m = r.data as { message?: string; dgiStubMode?: boolean };
        setEbillingStatus(
          m?.dgiStubMode != null
            ? `${m.message ?? ''} (DGI stub: ${m.dgiStubMode ? 'on' : 'off'})`
            : null
        );
      })
      .catch(() => setEbillingStatus(null));
  }, []);

  useEffect(() => {
    const onCompany = () => void load();
    window.addEventListener('companyChange', onCompany);
    return () => window.removeEventListener('companyChange', onCompany);
  }, [load]);

  const calculate = async () => {
    if (!canWrite) return;
    setError(null);
    try {
      await ecfApi.calculate({
        companyId: getStoredCompanyId(),
        declarationType: declType,
        fiscalYear,
        periodMonth: declType === 'vat_monthly' ? Number(periodMonth) || 1 : null,
        periodQuarter: declType === 'irpp_quarterly' ? Number(periodQuarter) || 1 : null,
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_calculate')));
    }
  };

  const openDeclaration = async (id: string) => {
    setError(null);
    try {
      const res = await ecfApi.getDeclaration(id);
      setSelectedDecl(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_open')));
    }
  };

  const downloadXml = async (id: string) => {
    const res = await ecfApi.downloadEdiXml(id);
    downloadBlob(res.data, `liasse_${id}.xml`, 'application/xml');
  };

  const submitDgi = async (id: string) => {
    if (!(await showConfirm(t('ecf.confirm_submit_dgi')))) return;
    setError(null);
    try {
      const res = await ecfApi.submitDgi(id);
      const msg = res.data?.message as string | undefined;
      const cid = (res.data as { correlationId?: string })?.correlationId;
      setEbillingMsg(
        (msg && /stub/i.test(msg) ? t('ecf.stub_dgi_submit_banner') : msg || JSON.stringify(res.data)) +
          (cid ? ` — ${t('ecf.correlation')}: ${cid}` : '')
      );
      await load();
      await openDeclaration(id);
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_submit')));
    }
  };

  const generateFec = async () => {
    if (!canWrite) return;
    setError(null);
    try {
      await ecfApi.generateFec({ companyId: getStoredCompanyId(), fiscalYear });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_fec')));
    }
  };

  const downloadFec = async (id: string) => {
    const res = await ecfApi.downloadFec(id);
    downloadBlob(res.data, `FEC_${id}.txt`, 'text/plain;charset=utf-8');
  };

  const downloadComplianceZip = async () => {
    setError(null);
    const cid = getStoredCompanyId();
    if (!cid) {
      setError(t('ecf.error_no_company'));
      return;
    }
    try {
      const res = await ecfApi.downloadComplianceZip(cid, fiscalYear);
      downloadBlob(res.data, `compliance_FY${fiscalYear}.zip`, 'application/zip');
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_zip')));
    }
  };

  const patchDeclStatus = async (id: string, status: 'reviewed' | 'locked' | 'adjusted') => {
    if (!canWrite) return;
    const cid = getStoredCompanyId();
    if (!cid) return;
    setError(null);
    try {
      await ecfApi.patchStatus(id, cid, status);
      await load();
      await openDeclaration(id);
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_status')));
    }
  };

  const stubEbilling = async () => {
    if (!canWrite) return;
    setEbillingMsg(null);
    try {
      const res = await ecfApi.submitEbillingInvoice({
        companyId: getStoredCompanyId(),
        documentNumber: 'DEMO-001',
        customerTaxId: 'M123456789012A',
        totalAmount: 100000,
      });
      const msg = res.data?.message as string | undefined;
      setEbillingMsg(
        msg && msg.includes('Stub')
          ? t('ecf.stub_ebilling_banner')
          : msg || res.data?.status || 'OK'
      );
    } catch (err) {
      setError(getApiErrorMessage(err, t('ecf.error_ebilling')));
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 style={{ margin: '0 0 8px 0', fontSize: '1.8rem' }}>{t('ecf.title')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '900px' }}>{t('ecf.intro')}</p>

      {error && (
        <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--color-danger)' }}>
          {error}
          <button type="button" onClick={() => setError(null)} style={{ marginLeft: '12px', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            {t('ecf.dismiss')}
          </button>
        </div>
      )}
      {ebillingMsg && (
        <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--color-success)' }}>
          {ebillingMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{t('ecf.new_declaration')}</h2>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('ecf.type')}</label>
          <select value={declType} onChange={(e) => setDeclType(e.target.value)} style={{ width: '100%', marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <option value="annual_cit">{t('ecf.decl_type_annual_cit')}</option>
            <option value="vat_monthly">{t('ecf.decl_type_vat_monthly')}</option>
            <option value="irpp_quarterly">{t('ecf.decl_type_irpp_quarterly')}</option>
          </select>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('ecf.fiscal_year')}</label>
          <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(+e.target.value)} style={{ width: '100%', marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
          {declType === 'vat_monthly' && (
            <>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('ecf.month_1_12')}</label>
              <input type="number" min={1} max={12} value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value === '' ? '' : +e.target.value)} style={{ width: '100%', marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
            </>
          )}
          {declType === 'irpp_quarterly' && (
            <>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('ecf.quarter_1_4')}</label>
              <input type="number" min={1} max={4} value={periodQuarter} onChange={(e) => setPeriodQuarter(e.target.value === '' ? '' : +e.target.value)} style={{ width: '100%', marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
            </>
          )}
          {canWrite ? (
            <button type="button" className="btn-glow" onClick={() => void calculate()}>
              {t('ecf.calculate_save')}
            </button>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('ecf.read_only_hint')}</p>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{t('ecf.fec_card_title')}</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>{t('ecf.fec_card_desc')}</p>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('ecf.fiscal_year')}</label>
          <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(+e.target.value)} style={{ width: '100%', marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
          {canWrite && (
            <button type="button" className="btn-glow" onClick={() => void generateFec()}>
              {t('ecf.generate_fec')}
            </button>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{t('ecf.compliance_package')}</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>{t('ecf.compliance_package_desc')}</p>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('ecf.fiscal_year')}</label>
          <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(+e.target.value)} style={{ width: '100%', marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
          <button type="button" className="btn-glow" onClick={() => void downloadComplianceZip()}>
            {t('ecf.download_compliance_zip')}
          </button>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{t('ecf.ebilling_title')}</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>{t('ecf.ebilling_desc')}</p>
          {ebillingStatus && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{ebillingStatus}</p>
          )}
          {canWrite && (
            <button type="button" onClick={() => void stubEbilling()} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--color-primary)', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}>
              {t('ecf.test_invoice_submit')}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }} className="ecf-grid-responsive">
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px' }}>{t('ecf.declarations')}</h3>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('ecf.loading')}</p>
          ) : declarations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('ecf.no_declarations')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {declarations.map((d: any) => (
                <li key={d.id} style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <button type="button" onClick={() => void openDeclaration(d.id)} style={{ textAlign: 'left', flex: '1 1 200px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', cursor: 'pointer' }}>
                    <strong>{declarationTypeLabel(d.declarationType)}</strong> · {d.fiscalYear} · {statusLabel(d.status)}
                    {d.correlationId && (
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {t('ecf.correlation')}: {String(d.correlationId).replace(/-/g, '')}
                      </span>
                    )}
                  </button>
                  <button type="button" onClick={() => void downloadXml(d.id)} style={{ fontSize: '0.85rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                    {t('ecf.xml')}
                  </button>
                  {canWrite && d.status !== 'filed' && d.status !== 'locked' && (
                    <button type="button" onClick={() => void submitDgi(d.id)} style={{ fontSize: '0.85rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--color-success)', color: 'var(--color-success)', cursor: 'pointer' }}>
                      {t('ecf.dgi_stub')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px' }}>{t('ecf.fec_generations')}</h3>
          {fecRows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('ecf.no_fec')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {fecRows.map((r: any) => (
                <li key={r.id} style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.9rem' }}>
                    {r.fiscalYear} · {new Date(r.generatedAt).toLocaleString()}
                  </span>
                  <button type="button" onClick={() => void downloadFec(r.id)} style={{ fontSize: '0.85rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                    {t('ecf.download')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {selectedDecl && (
        <div className="glass-panel" style={{ marginTop: '20px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>
              {t('ecf.detail')} — {declarationTypeLabel(selectedDecl.declarationType)}
            </h3>
            <button type="button" onClick={() => setSelectedDecl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
              ×
            </button>
          </div>
          {canWrite && selectedDecl && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              {(selectedDecl.status === 'calculated' || selectedDecl.status === 'draft') && (
                <button type="button" onClick={() => void patchDeclStatus(selectedDecl.id, 'reviewed')} className="btn-glow" style={{ padding: '8px 16px' }}>
                  {t('ecf.mark_reviewed')}
                </button>
              )}
              {selectedDecl.status === 'reviewed' && (
                <button type="button" onClick={() => void patchDeclStatus(selectedDecl.id, 'locked')} className="btn-glow" style={{ padding: '8px 16px' }}>
                  {t('ecf.lock_declaration')}
                </button>
              )}
              {(selectedDecl.status === 'calculated' || selectedDecl.status === 'reviewed' || selectedDecl.status === 'draft') && (
                <button
                  type="button"
                  onClick={() => void patchDeclStatus(selectedDecl.id, 'adjusted')}
                  style={{ opacity: 0.9, padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', cursor: 'pointer' }}
                >
                  {t('ecf.mark_adjusted')}
                </button>
              )}
            </div>
          )}
          <pre style={{ marginTop: '16px', overflow: 'auto', maxHeight: '420px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
            {(() => {
              const raw = selectedDecl.declarationData;
              if (raw == null || raw === '') return '{}';
              if (typeof raw === 'string') {
                try {
                  return JSON.stringify(JSON.parse(raw), null, 2);
                } catch {
                  return raw;
                }
              }
              return JSON.stringify(raw, null, 2);
            })()}
          </pre>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .ecf-grid-responsive { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export default Ecf;
