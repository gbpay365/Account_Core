import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ecfApi } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { getStoredCompanyId } from '../lib/companyContext';
import { downloadBlob, getApiErrorMessage } from '../api';
import './TaxCompliance.css';

const getCompanyId = () => getStoredCompanyId();

type DeclarationType = 'annual_cit' | 'vat_monthly' | 'irpp_quarterly';

type AttachmentMeta = {
  id: string;
  uploadedAt: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

type ChecklistItem = {
  code: string;
  title: string;
  severity: 'info' | 'warning' | 'error' | string;
  passed: boolean;
  summary: string;
  evidenceJson: string;
};

type ChecklistDto = {
  companyId: string;
  fiscalYear: number;
  jurisdiction: string;
  preparation: ChecklistItem[];
  controls: ChecklistItem[];
  filingPack: ChecklistItem[];
  integrity: ChecklistItem[];
};

type DeclarationDto = {
  id: string;
  companyId: string;
  declarationType: string;
  fiscalYear: number;
  periodMonth?: number | null;
  periodQuarter?: number | null;
  status: string;
  declarationData?: string;
  correlationId?: string | null;
  lockedAt?: string | null;
  filedAt?: string | null;
  filingReceiptId?: string | null;
  createdAt?: string;
};

const TaxCalculation: React.FC = () => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canReadBooks = hasPermission('balance_sheet', 'read');
  const canWriteEcf = hasPermission('ecf', 'write');

  const [companyId, setCompanyId] = useState(getCompanyId);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [jurisdiction, setJurisdiction] = useState('CM');
  const [declType, setDeclType] = useState<DeclarationType>('annual_cit');
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1);
  const [periodQuarter, setPeriodQuarter] = useState<number>(1);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [declarationId, setDeclarationId] = useState<string | null>(null);
  const [declaration, setDeclaration] = useState<DeclarationDto | null>(null);
  const [checklist, setChecklist] = useState<ChecklistDto | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [packSha256, setPackSha256] = useState<string | null>(null);
  const [packWormEntryId, setPackWormEntryId] = useState<string | null>(null);
  const [dgiResult, setDgiResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncCompany = useCallback(() => {
    setCompanyId(getCompanyId());
  }, []);

  useEffect(() => {
    const init = window.setTimeout(() => syncCompany(), 0);
    window.addEventListener('storage', syncCompany);
    const onCo = () => syncCompany();
    window.addEventListener('companyChange', onCo);
    return () => {
      window.clearTimeout(init);
      window.removeEventListener('storage', syncCompany);
      window.removeEventListener('companyChange', onCo);
    };
  }, [syncCompany]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDeclarationId(null);
      setDeclaration(null);
      setChecklist(null);
      setAttachments([]);
      setPackSha256(null);
      setPackWormEntryId(null);
      setDgiResult(null);
      setError(null);
      setStep(1);
    }, 0);
    return () => window.clearTimeout(id);
  }, [companyId]);

  const loadDeclaration = useCallback(
    async (id: string) => {
      const res = await ecfApi.getDeclaration(id);
      setDeclaration(res.data as DeclarationDto);
    },
    []
  );

  const loadChecklist = useCallback(async () => {
    if (!companyId || !canReadBooks) return;
    const res = await ecfApi.getComplianceChecklist(companyId, fiscalYear, jurisdiction);
    setChecklist(res.data as ChecklistDto);
  }, [companyId, canReadBooks, fiscalYear, jurisdiction]);

  const loadAttachments = useCallback(
    async (id: string) => {
      if (!companyId) return;
      const res = await ecfApi.listAttachments(id, companyId);
      setAttachments(res.data as AttachmentMeta[]);
    },
    [companyId]
  );

  useEffect(() => {
    if (step === 2 || step === 4) {
      const id = window.setTimeout(() => {
        void loadChecklist();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return;
  }, [step, loadChecklist]);

  useEffect(() => {
    if (step === 3 && declarationId) {
      const id = window.setTimeout(() => {
        void loadAttachments(declarationId);
      }, 0);
      return () => window.clearTimeout(id);
    }
    return;
  }, [step, declarationId, loadAttachments]);

  const canEnterStep = useMemo(() => {
    const base = {
      1: true,
      2: Boolean(companyId && declarationId),
      3: Boolean(companyId && declarationId),
      4: Boolean(companyId && declarationId),
      5: Boolean(companyId && declarationId),
      6: Boolean(companyId && declarationId),
    } as Record<number, boolean>;
    return base;
  }, [companyId, declarationId]);

  const parseJson = (s?: string) => {
    if (!s) return null;
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const fmtXaf = (n: unknown) => {
    const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' XAF';
  };

  const calculateAndSave = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    setDgiResult(null);
    setPackSha256(null);
    setPackWormEntryId(null);
    try {
      const body =
        declType === 'vat_monthly'
          ? { companyId, declarationType: declType, fiscalYear, periodMonth, periodQuarter: null }
          : declType === 'irpp_quarterly'
            ? { companyId, declarationType: declType, fiscalYear, periodMonth: null, periodQuarter }
            : { companyId, declarationType: declType, fiscalYear, periodMonth: null, periodQuarter: null };

      const res = await ecfApi.calculate(body);
      const created = res.data as { id?: string; Id?: string };
      const id = (created.id || created.Id || '') as string;
      if (!id) throw new Error('Missing declaration id');
      setDeclarationId(id);
      await loadDeclaration(id);
      setStep(2);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t('tax_compliance.error_calculate')));
    } finally {
      setLoading(false);
    }
  };

  const patchDeclStatus = async (status: 'reviewed' | 'locked' | 'adjusted') => {
    if (!canWriteEcf || !companyId || !declarationId) return;
    setLoading(true);
    setError(null);
    try {
      await ecfApi.patchStatus(declarationId, companyId, status);
      await loadDeclaration(declarationId);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Status update failed'));
    } finally {
      setLoading(false);
    }
  };

  const downloadXml = async () => {
    if (!declarationId) return;
    const res = await ecfApi.downloadEdiXml(declarationId);
    downloadBlob(res.data, `liasse_${declarationId}.xml`, 'application/xml');
  };

  const uploadAttachment = async (file: File) => {
    if (!companyId || !declarationId) return;
    setLoading(true);
    setError(null);
    try {
      await ecfApi.uploadAttachment(declarationId, companyId, file);
      await loadAttachments(declarationId);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Upload failed'));
    } finally {
      setLoading(false);
    }
  };

  const downloadAttachment = async (aId: string, name: string) => {
    const res = await ecfApi.downloadAttachment(aId);
    downloadBlob(res.data, name || `attachment_${aId}`, 'application/octet-stream');
  };

  const generatePack = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    setPackSha256(null);
    setPackWormEntryId(null);
    try {
      const lockMonth =
        declType === 'vat_monthly'
          ? periodMonth
          : declType === 'irpp_quarterly'
            ? Math.min(12, Math.max(1, periodQuarter * 3))
            : 12;
      const res = await ecfApi.generateCompliancePack({ companyId, fiscalYear, lockMonth });
      const sha = String(res.headers?.['x-compliancepack-sha256'] || '');
      const worm = String(res.headers?.['x-worm-entry-id'] || '');
      setPackSha256(sha || null);
      setPackWormEntryId(worm || null);

      downloadBlob(res.data, `compliance_FY${fiscalYear}.zip`, 'application/zip');

      setStep(6);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Compliance pack generation failed'));
    } finally {
      setLoading(false);
    }
  };

  const submitDgi = async () => {
    if (!canWriteEcf || !declarationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ecfApi.submitDgi(declarationId);
      setDgiResult(res.data as Record<string, unknown>);
      await loadDeclaration(declarationId);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Submit failed'));
    } finally {
      setLoading(false);
    }
  };

  const declData = useMemo(() => parseJson(declaration?.declarationData), [declaration?.declarationData]);
  const form2031 = (declData?.Form2031 || declData?.form2031 || null) as Record<string, unknown> | null;
  const calc = (declData?.Calculation || declData?.calculation || null) as Record<string, unknown> | null;

  return (
    <div className="tc-page animate-fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="tc-pill">{t('tax_compliance.pill_ohada')}</div>
        <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.7rem', fontWeight: 700 }}>{t('tax_compliance.title')}</h1>
        <p className="tc-lead">{t('tax_compliance.subtitle')}</p>
      </div>

      {!companyId && <div className="tc-warn" role="alert">{t('tax_compliance.no_company')}</div>}
      {!canReadBooks && companyId && (
        <div className="tc-warn" role="status">{t('tax_compliance.no_perm_calc')}</div>
      )}

      <div className="tc-stepper" role="tablist" aria-label="Declaration builder steps">
        {([
          { n: 1, label: t('tax_compliance.step_select') },
          { n: 2, label: t('tax_compliance.step_readiness') },
          { n: 3, label: t('tax_compliance.step_preview') },
          { n: 4, label: t('tax_compliance.step_controls') },
          { n: 5, label: t('tax_compliance.step_pack') },
          { n: 6, label: t('tax_compliance.step_submit') },
        ] as const).map((s) => {
          const enabled = canEnterStep[s.n];
          return (
            <button
              key={s.n}
              type="button"
              className={`tc-step ${step === s.n ? 'tc-step-active' : ''} ${enabled ? '' : 'tc-step-disabled'}`}
              onClick={() => enabled && setStep(s.n)}
              aria-selected={step === s.n}
              disabled={!enabled}
            >
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="tc-warn" role="alert">{error}</div>}

      {step === 1 && (
        <div className="tc-zones">
          <section className="tc-zone" aria-labelledby="tc-zone-books">
            <h2 id="tc-zone-books">{t('tax_compliance.zone_books_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.zone_books_desc')}</p>
            <ul className="tc-links">
              <li>
                <Link to="/trial-balance">{t('tax_compliance.link_tb')}</Link>
              </li>
              <li>
                <Link to="/income-statement">{t('tax_compliance.link_is')}</Link>
              </li>
              <li>
                <Link to="/balance-sheet">{t('tax_compliance.link_bs')}</Link>
              </li>
              <li>
                <Link to="/notes">{t('tax_compliance.link_notes')}</Link>
              </li>
              <li>
                <Link to="/reporting">{t('tax_compliance.link_reporting')}</Link>
              </li>
            </ul>
            <div className="tc-check">
              <h3>{t('tax_compliance.checklist_h')}</h3>
              <ol>
                <li>{t('tax_compliance.c1')}</li>
                <li>{t('tax_compliance.c2')}</li>
                <li>{t('tax_compliance.c3')}</li>
              </ol>
            </div>
          </section>

          <section className="tc-zone tc-engine" aria-labelledby="tc-zone-engine">
            <h2 id="tc-zone-engine">{t('tax_compliance.build_declaration')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.build_declaration_desc')}</p>

            <div className="tc-params">
              <div>
                <label
                  htmlFor="tc-fy"
                  style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}
                >
                  {t('tax_compliance.fiscal_year')}
                </label>
                <input
                  id="tc-fy"
                  type="number"
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(+e.target.value)}
                  disabled={!canReadBooks || !companyId}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--glass-border)',
                    width: 120,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t('tax_compliance.jurisdiction')}
                </label>
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  disabled={!companyId}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  <option value="CM">CM</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t('tax_compliance.decl_type')}
                </label>
                <select
                  value={declType}
                  onChange={(e) => setDeclType(e.target.value as DeclarationType)}
                  disabled={!companyId}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  <option value="annual_cit">{t('ecf.decl_type_annual_cit')}</option>
                  <option value="vat_monthly">{t('ecf.decl_type_vat_monthly')}</option>
                  <option value="irpp_quarterly">{t('ecf.decl_type_irpp_quarterly')}</option>
                </select>
              </div>

              {declType === 'vat_monthly' && (
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('tax_compliance.month_label')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                    disabled={!companyId}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--glass-border)',
                      width: 120,
                    }}
                  />
                </div>
              )}

              {declType === 'irpp_quarterly' && (
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('tax_compliance.quarter_label')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={periodQuarter}
                    onChange={(e) => setPeriodQuarter(Math.max(1, Math.min(4, Number(e.target.value) || 1)))}
                    disabled={!companyId}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--glass-border)',
                      width: 120,
                    }}
                  />
                </div>
              )}

              <button
                type="button"
                className="btn-glow"
                onClick={() => void calculateAndSave()}
                disabled={loading || !companyId}
              >
                {loading ? t('tax_compliance.btn_building') : t('tax_compliance.btn_build')}
              </button>
            </div>

            {declarationId && declaration && (
              <div className="tc-check">
                <h3>{t('tax_compliance.current_decl')}</h3>
                <ol>
                  <li>Id: {declarationId}</li>
                  <li>{t('trial_balance.status')}: {declaration.status}</li>
                  <li>Type: {declaration.declarationType}</li>
                </ol>
              </div>
            )}
          </section>

          <section className="tc-zone" aria-labelledby="tc-zone-decl">
            <h2 id="tc-zone-decl">{t('tax_compliance.zone_decl_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.zone_decl_desc')}</p>
            <ul className="tc-links">
              <li>
                <Link to="/ecf">{t('tax_compliance.link_ecf')}</Link>
              </li>
              <li>
                <Link to="/enterprise/compliance">{t('compliance.title')}</Link>
              </li>
            </ul>
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="tc-zones">
          <section className="tc-zone" aria-labelledby="tc-prep">
            <h2 id="tc-prep">{t('tax_compliance.prep_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.prep_desc')}</p>
            {!checklist && <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('tax_compliance.loading_checklist')}</p>}
            {checklist && (
              <div className="tc-checklist">
                {checklist.preparation.map((c) => (
                  <div key={c.code} className="tc-checkitem">
                    <div className="tc-checkitem-title">
                      <span>{c.title}</span>
                      <span className={`tc-badge ${c.passed ? 'tc-badge-pass' : 'tc-badge-fail'}`}>
                        {c.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <p className="tc-checkitem-summary">{c.summary}</p>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn-glow" onClick={() => setStep(3)} disabled={!canEnterStep[3]}>
                {t('common.next')}: {t('tax_compliance.step_preview')}
              </button>
            </div>
          </section>

          <section className="tc-zone" aria-labelledby="tc-ready-links">
            <h2 id="tc-ready-links">{t('tax_compliance.quick_links')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.quick_links_desc')}</p>
            <ul className="tc-links">
              <li>
                <Link to="/accounts">{t('common.accounts')}</Link>
              </li>
              <li>
                <Link to="/trial-balance">{t('trial_balance.title')}</Link>
              </li>
              <li>
                <Link to="/notes">{t('nav.notes_annexes')}</Link>
              </li>
            </ul>
          </section>
        </div>
      )}

      {step === 3 && declaration && (
        <div className="tc-zones">
          <section className="tc-zone tc-engine" aria-labelledby="tc-preview">
            <h2 id="tc-preview">{t('tax_compliance.preview_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.preview_desc')}</p>

            {declaration.declarationType === 'annual_cit' && (
              <div className="tc-stat-grid">
                <div className="tc-stat" style={{ borderTop: '3px solid var(--color-primary)' }}>
                  <div className="tc-lbl">{t('tax_compliance.turnover')}</div>
                  <div className="tc-val" style={{ color: 'var(--color-primary)' }}>
                    {fmtXaf(form2031?.DomesticTurnover ?? form2031?.domesticTurnover)}
                  </div>
                </div>
                <div className="tc-stat" style={{ borderTop: '3px solid var(--color-warning)' }}>
                  <div className="tc-lbl">{t('tax_compliance.net_profit')}</div>
                  <div className="tc-val" style={{ color: 'var(--color-warning)' }}>
                    {fmtXaf(form2031?.NetProfit ?? form2031?.netProfit)}
                  </div>
                </div>
                <div className="tc-stat" style={{ borderTop: '3px solid var(--color-success)' }}>
                  <div className="tc-lbl">{t('tax_compliance.tax_to_pay')}</div>
                  <div className="tc-val" style={{ color: 'var(--color-success)' }}>
                    {fmtXaf(calc?.TaxToPay ?? calc?.taxToPay)}
                  </div>
                </div>
                <div className="tc-stat">
                  <div className="tc-lbl">{t('tax_compliance.min_tax')}</div>
                  <div className="tc-val">{fmtXaf(calc?.MinimumTax ?? calc?.minimumTax)}</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className="btn-glow" onClick={() => void downloadXml()} disabled={!declarationId}>
                {t('tax_compliance.btn_download_xml')}
              </button>
              <button type="button" className="btn-glow" onClick={() => setStep(4)} disabled={!canEnterStep[4]}>
                {t('common.next')}: {t('tax_compliance.step_controls')}
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t('tax_compliance.decl_data_label')}</div>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.06)',
                  border: '1px solid var(--glass-border)',
                  overflow: 'auto',
                  maxHeight: 260,
                }}
              >
                {declaration.declarationData || '{}'}
              </pre>
            </div>
          </section>

          <section className="tc-zone" aria-labelledby="tc-evidence">
            <h2 id="tc-evidence">{t('tax_compliance.evidence_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.evidence_desc')}</p>

            <div style={{ marginBottom: 10 }}>
              <input
                type="file"
                disabled={!canWriteEcf || loading || !declarationId}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAttachment(f);
                  e.currentTarget.value = '';
                }}
              />
            </div>

            {attachments.length === 0 && (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem' }}>{t('tax_compliance.no_attachments')}</p>
            )}
            {attachments.length > 0 && (
              <ul className="tc-links">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => void downloadAttachment(a.id, a.fileName)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.4rem 0.6rem',
                        borderRadius: 8,
                        fontSize: '0.88rem',
                        fontWeight: 500,
                        textDecoration: 'none',
                        color: 'var(--color-primary)',
                        background: 'rgba(79, 70, 229, 0.06)',
                        border: '1px solid rgba(79, 70, 229, 0.15)',
                        cursor: 'pointer',
                      }}
                    >
                      {a.fileName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {step === 4 && (
        <div className="tc-zones">
          <section className="tc-zone" aria-labelledby="tc-controls">
            <h2 id="tc-controls">{t('tax_compliance.controls_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.controls_desc')}</p>
            {!checklist && <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('tax_compliance.loading_controls')}</p>}
            {checklist && (
              <div className="tc-checklist">
                {checklist.controls.map((c) => (
                  <div key={c.code} className="tc-checkitem">
                    <div className="tc-checkitem-title">
                      <span>{c.title}</span>
                      <span className={`tc-badge ${c.passed ? 'tc-badge-pass' : 'tc-badge-fail'}`}>
                        {c.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <p className="tc-checkitem-summary">{c.summary}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className="btn-glow" onClick={() => void patchDeclStatus('reviewed')} disabled={!canWriteEcf || loading}>
                {t('tax_compliance.btn_mark_reviewed')}
              </button>
              <button type="button" className="btn-glow" onClick={() => void patchDeclStatus('locked')} disabled={!canWriteEcf || loading}>
                {t('tax_compliance.btn_lock_decl')}
              </button>
              <button type="button" className="btn-glow" onClick={() => setStep(5)} disabled={!canEnterStep[5]}>
                {t('common.next')}: {t('tax_compliance.step_pack')}
              </button>
            </div>
          </section>

          <section className="tc-zone" aria-labelledby="tc-status">
            <h2 id="tc-status">{t('tax_compliance.workflow_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.workflow_desc')}</p>
            {!declaration && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('tax_compliance.no_decl_loaded')}</p>}
            {declaration && (
              <div className="tc-check">
                <h3>{t('tax_compliance.state_h')}</h3>
                <ol>
                  <li>{t('trial_balance.status')}: {declaration.status}</li>
                  <li>{t('tax_compliance.locked_at')}: {declaration.lockedAt || '—'}</li>
                  <li>{t('tax_compliance.correlation')}: {declaration.correlationId || '—'}</li>
                </ol>
              </div>
            )}
          </section>
        </div>
      )}

      {step === 5 && (
        <div className="tc-zones">
          <section className="tc-zone" aria-labelledby="tc-pack">
            <h2 id="tc-pack">{t('tax_compliance.pack_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.pack_desc')}</p>
            <button type="button" className="btn-glow" onClick={() => void generatePack()} disabled={loading || !companyId}>
              {loading ? t('tax_compliance.btn_generating') : t('tax_compliance.btn_generate_pack')}
            </button>
            {(packSha256 || packWormEntryId) && (
              <div className="tc-check" style={{ marginTop: 12 }}>
                <h3>{t('tax_compliance.integrity_title')}</h3>
                <ol>
                  <li>SHA-256: {packSha256 || '—'}</li>
                  <li>{t('tax_compliance.worm_entry')}: {packWormEntryId || '—'}</li>
                </ol>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/enterprise/compliance">{t('compliance.title')}</Link>
            </div>
          </section>
        </div>
      )}

      {step === 6 && (
        <div className="tc-zones">
          <section className="tc-zone" aria-labelledby="tc-submit">
            <h2 id="tc-submit">{t('tax_compliance.submit_title')}</h2>
            <p className="tc-zone-desc">{t('tax_compliance.submit_desc')}</p>
            <button type="button" className="btn-glow" onClick={() => void submitDgi()} disabled={loading || !canWriteEcf || !declarationId}>
              {loading ? t('tax_compliance.btn_submitting') : t('tax_compliance.btn_submit_dgi')}
            </button>
            {dgiResult && (
              <pre
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.06)',
                  border: '1px solid var(--glass-border)',
                  overflow: 'auto',
                  maxHeight: 260,
                }}
              >
                {JSON.stringify(dgiResult, null, 2)}
              </pre>
            )}
          </section>
        </div>
      )}

      <p className="tc-legal">{t('tax_compliance.legal')}</p>
    </div>
  );
};

export default TaxCalculation;
