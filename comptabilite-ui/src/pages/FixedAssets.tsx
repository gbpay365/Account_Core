import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { assetsApi, getApiErrorMessage } from '../api';
import { ModalPortal } from '../components/ModalPortal';
import { JemShellModal } from '../components/jem/JemShellModal';
import '../components/JournalEntry/JournalEntryForm.css';
import { getStoredCompanyId } from '../lib/companyContext';
import { showToast } from '../utils/dialogs';

interface CategoryDef {
  category: string;
  labelEn: string;
  labelFr: string;
  assetAccountCode: string;
  accumulatedDepreciationAccountCode: string;
  depreciationExpenseAccountCode: string;
  defaultUsefulLifeMonths: number;
}

interface AssetRow {
  id: string;
  code: string;
  name: string;
  status: string;
  category: string;
  acquisitionDate: string;
  cost: number;
  activeCost: number;
  usefulLifeMonths: number;
  serialNumber?: string;
  location?: string;
}

const currentPeriod = () => {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
};

const fmt = (n: number, isFr: boolean) =>
  n.toLocaleString(isFr ? 'fr-CM' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColor = (s: string) => {
  if (s === 'active') return 'var(--color-success)';
  if (s === 'pending_disposal') return 'var(--color-warning)';
  if (s === 'disposed' || s === 'written_off') return 'var(--text-muted)';
  return 'var(--color-primary)';
};

const emptyForm = () => ({
  code: `FA-${Date.now().toString(36).toUpperCase()}`,
  name: '',
  category: 'equipment',
  acquisitionDate: new Date().toISOString().split('T')[0],
  cost: 0,
  salvageValue: 0,
  usefulLifeMonths: 60,
  serialNumber: '',
  location: '',
  custodian: '',
  creditAccountCode: '521100',
});

const FixedAssets: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isFr = i18n.language === 'fr';
  const [tab, setTab] = useState<'register' | 'reports'>('register');
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCapitalizeModal, setShowCapitalizeModal] = useState(false);
  const [showRevalueModal, setShowRevalueModal] = useState(false);
  const [showComponentModal, setShowComponentModal] = useState(false);
  const [partialAmount, setPartialAmount] = useState<number | ''>('');
  const [revalueForm, setRevalueForm] = useState({ newActiveCost: 0, notes: '' });
  const [componentForm, setComponentForm] = useState({ name: '', cost: 0, salvageValue: 0, usefulLifeMonths: 60 });
  const [capitalizeForm, setCapitalizeForm] = useState({ supplierInvoiceId: '', code: '', name: '', category: 'equipment' });
  const [form, setForm] = useState(emptyForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [registerReport, setRegisterReport] = useState<Record<string, unknown> | null>(null);
  const [glRecon, setGlRecon] = useState<Record<string, unknown> | null>(null);
  const [depSchedule, setDepSchedule] = useState<Record<string, unknown> | null>(null);
  const fiscalYear = new Date().getFullYear();

  const load = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const [listRes, catRes] = await Promise.all([
        assetsApi.list(companyId),
        assetsApi.getCategories(),
      ]);
      setAssets(listRes.data);
      setCategories(catRes.data);
    } catch (err) {
      showToast(getApiErrorMessage(err, t('common.error')), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      const [reg, gl, dep] = await Promise.all([
        assetsApi.getRegisterReport(companyId),
        assetsApi.getGlReconciliation(companyId),
        assetsApi.getDepreciationSchedule(companyId, fiscalYear),
      ]);
      setRegisterReport(reg.data);
      setGlRecon(gl.data);
      setDepSchedule(dep.data);
    } catch (err) {
      showToast(getApiErrorMessage(err, t('common.error')), 'error');
    }
  }, [fiscalYear]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'reports') loadReports(); }, [tab, loadReports]);

  const onCategoryChange = (cat: string) => {
    const def = categories.find(c => c.category === cat);
    setForm(f => ({
      ...f,
      category: cat,
      usefulLifeMonths: def?.defaultUsefulLifeMonths ?? f.usefulLifeMonths,
    }));
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getStoredCompanyId();
    if (!companyId || !form.name.trim()) return;
    const def = categories.find(c => c.category === form.category);
    try {
      await assetsApi.create({
        companyId,
        ...form,
        assetAccountCode: def?.assetAccountCode,
        accumulatedDepreciationAccountCode: def?.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountCode: def?.depreciationExpenseAccountCode,
      });
      setShowModal(false);
      setForm(emptyForm());
      load();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('common.error')), 'error');
    }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await assetsApi.get(id);
      setDetail(res.data);
      setSelectedId(id);
    } catch (err) {
      showToast(getApiErrorMessage(err, t('common.error')), 'error');
    }
  };

  const runAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    try {
      await fn();
      showToast(successMsg, 'success');
      load();
      if (selectedId) openDetail(selectedId);
      if (tab === 'reports') loadReports();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('common.error')), 'error');
    }
  };

  const kpis = useMemo(() => {
    const active = assets.filter(a => a.status === 'active');
    return { total: assets.length, active: active.length, gross: active.reduce((s, a) => s + (a.activeCost || a.cost), 0) };
  }, [assets]);

  const catLabel = (c: string) => {
    const def = categories.find(x => x.category === c);
    if (!def) return c;
    return isFr ? def.labelFr : def.labelEn;
  };

  const submitCapitalize = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getStoredCompanyId();
    if (!companyId || !capitalizeForm.supplierInvoiceId.trim()) return;
    try {
      await assetsApi.capitalizeFromInvoice(companyId, {
        supplierInvoiceId: capitalizeForm.supplierInvoiceId.trim(),
        request: {
          code: capitalizeForm.code || undefined,
          name: capitalizeForm.name || undefined,
          category: capitalizeForm.category,
        },
      });
      setShowCapitalizeModal(false);
      setCapitalizeForm({ supplierInvoiceId: '', code: '', name: '', category: 'equipment' });
      showToast(t('assets.alert_capitalized'), 'success');
      load();
    } catch (err) {
      showToast(getApiErrorMessage(err, t('common.error')), 'error');
    }
  };

  const submitRevalue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || revalueForm.newActiveCost <= 0) return;
    await runAction(
      () => assetsApi.revalue(selectedId, revalueForm),
      t('assets.alert_revalued'),
    );
    setShowRevalueModal(false);
  };

  const submitComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !componentForm.name.trim()) return;
    await runAction(
      () => assetsApi.addComponent(selectedId, componentForm),
      t('assets.alert_component'),
    );
    setShowComponentModal(false);
    setComponentForm({ name: '', cost: 0, salvageValue: 0, usefulLifeMonths: 60 });
  };

  const assetStatus = detail ? (detail.asset as { status: string }).status : '';
  const detailComponents = detail && Array.isArray(detail.components)
    ? (detail.components as { id: string; name: string; cost: number; salvageValue: number; usefulLifeMonths: number }[])
    : [];

  return (
    <div className="tc-page animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>{t('assets.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('assets.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-glow" onClick={() => { setForm(emptyForm()); setShowModal(true); }}>
            + {t('assets.btn_new')}
          </button>
          <button type="button" onClick={() => setShowCapitalizeModal(true)} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>
            {t('assets.btn_capitalize')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setTab('register')} style={{ padding: '8px 18px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, background: tab === 'register' ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)', color: tab === 'register' ? '#fff' : 'var(--text-muted)' }}>
          {t('assets.tab_register')}
        </button>
        <button type="button" onClick={() => setTab('reports')} style={{ padding: '8px 18px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, background: tab === 'reports' ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)', color: tab === 'reports' ? '#fff' : 'var(--text-muted)' }}>
          {t('assets.tab_reports')}
        </button>
      </div>

      {tab === 'register' ? (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{t('assets.kpi_total')}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{kpis.total}</div>
            </div>
            <div style={{ flex: '1 1 140px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{t('assets.kpi_active')}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{kpis.active}</div>
            </div>
            <div style={{ flex: '1 1 140px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{t('assets.kpi_gross')}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{fmt(kpis.gross, isFr)}</div>
            </div>
            <button type="button" onClick={() => {
              const companyId = getStoredCompanyId();
              if (!companyId) return;
              runAction(() => assetsApi.runBatchDepreciation(companyId, currentPeriod()), t('assets.alert_batch_dep'));
            }} style={{ alignSelf: 'center', padding: '10px 18px', borderRadius: 10, border: '1px solid var(--color-primary)', background: 'transparent', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer' }}>
              {t('assets.btn_batch_dep')}
            </button>
          </div>

          <div className="glass-panel" style={{ padding: 28, overflowX: 'auto' }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>{t('assets.col_code')}</th>
                  <th>{t('assets.col_name')}</th>
                  <th>{t('assets.col_category')}</th>
                  <th style={{ textAlign: 'right' }}>{t('assets.col_cost')}</th>
                  <th style={{ textAlign: 'center' }}>{t('assets.col_status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('assets.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.code}</td>
                    <td>{a.name}</td>
                    <td>{catLabel(a.category)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(a.activeCost || a.cost, isFr)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: statusColor(a.status), color: '#fff', padding: '4px 12px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}>
                        {t(`assets.status_${a.status}`, a.status)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => openDetail(a.id)} style={{ fontSize: '0.8rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        {t('assets.btn_detail')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && assets.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('assets.empty')}</div>
            )}
          </div>
        </>
      ) : (
        <div className="glass-panel" style={{ padding: 28 }}>
          {registerReport && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px' }}>{t('assets.report_register')}</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 12px' }}>
                {t('assets.report_nbv')}: <strong>{fmt(Number(registerReport.totalNetBookValue) || 0, isFr)}</strong>
                {' · '}{t('assets.report_gross')}: {fmt(Number(registerReport.totalGross) || 0, isFr)}
                {' · '}{t('assets.report_acc_dep')}: {fmt(Number(registerReport.totalAccumulatedDepreciation) || 0, isFr)}
              </p>
            </div>
          )}
          {glRecon && (
            <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
              <h3 style={{ margin: '0 0 8px' }}>{t('assets.report_gl_recon')}</h3>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('assets.register_nbv')}: {fmt(Number(glRecon.registerNetBookValue) || 0, isFr)}
                {' · '}{t('assets.gl_nbv')}: {fmt(Number(glRecon.glClass2NetBalance) || 0, isFr)}
                {' · '}{t('assets.variance')}: <strong style={{ color: Math.abs(Number(glRecon.variance) || 0) > 1 ? 'var(--color-warning)' : 'var(--color-success)' }}>{fmt(Number(glRecon.variance) || 0, isFr)}</strong>
              </p>
            </div>
          )}
          {depSchedule && Array.isArray((depSchedule as { periods?: unknown[] }).periods) && (
            <div>
              <h3 style={{ margin: '0 0 12px' }}>{t('assets.report_dep_schedule')} ({fiscalYear})</h3>
              <table className="premium-table">
                <thead>
                  <tr><th>{t('assets.col_period')}</th><th>{t('assets.col_code')}</th><th>{t('assets.col_name')}</th><th style={{ textAlign: 'right' }}>{t('assets.col_amount')}</th></tr>
                </thead>
                <tbody>
                  {((depSchedule as { periods: { periodYearMonth: number; assetCode: string; assetName: string; amount: number }[] }).periods).slice(0, 50).map((p, i) => (
                    <tr key={i}>
                      <td>{p.periodYearMonth}</td>
                      <td>{p.assetCode}</td>
                      <td>{p.assetName}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(p.amount, isFr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <JemShellModal title={t('assets.modal_title')} onClose={() => setShowModal(false)} size="lg" wideBody bodyClassName="jem-body--detail-scroll" pill="FA"
            footer={<><button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>{t('common.cancel')}</button><button type="submit" form="asset-form" className="jem-btn-primary">{t('assets.btn_save')}</button></>}>
            <form id="asset-form" onSubmit={submitCreate} className="ap-modal-form">
              <div className="jem-form-grid2">
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_code')}</span><input className="jem-field jem-mono" required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_name')}</span><input className="jem-field" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              </div>
              <div className="jem-form-grid2">
                <div className="jem-input-group">
                  <span className="jem-label">{t('assets.col_category')}</span>
                  <select className="jem-field" value={form.category} onChange={e => onCategoryChange(e.target.value)}>
                    {categories.map(c => <option key={c.category} value={c.category}>{isFr ? c.labelFr : c.labelEn}</option>)}
                  </select>
                </div>
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_acquisition')}</span><input type="date" className="jem-field" required value={form.acquisitionDate} onChange={e => setForm({ ...form, acquisitionDate: e.target.value })} /></div>
              </div>
              <div className="jem-form-grid2">
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_cost')}</span><input type="number" min={0.01} step="0.01" className="jem-field" required value={form.cost || ''} onChange={e => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_life_months')}</span><input type="number" min={1} className="jem-field" value={form.usefulLifeMonths} onChange={e => setForm({ ...form, usefulLifeMonths: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div className="jem-form-grid2">
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_serial')}</span><input className="jem-field" value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} /></div>
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_location')}</span><input className="jem-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}

      {selectedId && detail && (
        <ModalPortal onClose={() => { setSelectedId(null); setDetail(null); }}>
          <JemShellModal title={(detail.asset as { code: string; name: string }).code} subtitle={(detail.asset as { name: string }).name} onClose={() => { setSelectedId(null); setDetail(null); }} size="lg" wideBody bodyClassName="jem-body--detail-scroll" pill="FA"
            footer={<button type="button" className="jem-btn-ghost" onClick={() => { setSelectedId(null); setDetail(null); }}>{t('common.cancel')}</button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                {t('assets.nbv')}: <strong>{fmt(Number(detail.netBookValue) || 0, isFr)}</strong>
                {' · '}{t('assets.acc_dep')}: {fmt(Number(detail.accumulatedDepreciation) || 0, isFr)}
                {' · '}{t('assets.col_status')}: {(detail.asset as { status: string }).status}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {assetStatus === 'draft' && (
                  <button type="button" className="jem-btn-primary" onClick={() => runAction(() => assetsApi.postAcquisition(selectedId), t('assets.alert_acquisition'))}>{t('assets.btn_post_acquisition')}</button>
                )}
                {assetStatus === 'active' && (
                  <>
                    <button type="button" onClick={() => runAction(() => assetsApi.postDepreciation(selectedId, currentPeriod()), t('assets.alert_dep'))}>{t('assets.btn_depreciate')}</button>
                    <button type="button" onClick={() => {
                      setRevalueForm({ newActiveCost: Number(detail.netBookValue) || 0, notes: '' });
                      setShowRevalueModal(true);
                    }}>{t('assets.btn_revalue')}</button>
                    <button type="button" onClick={() => setShowComponentModal(true)}>{t('assets.btn_add_component')}</button>
                    <button type="button" onClick={() => runAction(() => assetsApi.requestDisposal(selectedId, { disposalDate: new Date().toISOString().split('T')[0], proceeds: 0, notes: '' }), t('assets.alert_disposal_requested'))}>{t('assets.btn_request_disposal')}</button>
                    <button type="button" onClick={() => runAction(() => assetsApi.writeOff(selectedId, { writeOffDate: new Date().toISOString().split('T')[0] }), t('assets.alert_write_off'))}>{t('assets.btn_write_off')}</button>
                  </>
                )}
                {assetStatus === 'pending_disposal' && (
                  <>
                    <button type="button" className="jem-btn-primary" onClick={() => runAction(() => assetsApi.approveDisposal(selectedId), t('assets.alert_approved'))}>{t('assets.btn_approve_disposal')}</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" min={0} step="0.01" placeholder={t('assets.col_partial_amount')} value={partialAmount} onChange={e => setPartialAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)} style={{ width: 160, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'inherit' }} />
                      <button type="button" onClick={() => runAction(() => assetsApi.postDisposal(selectedId, typeof partialAmount === 'number' && partialAmount > 0 ? partialAmount : undefined), t('assets.alert_disposed'))}>{t('assets.btn_post_disposal')}</button>
                    </div>
                  </>
                )}
              </div>
              {detailComponents.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px' }}>{t('assets.col_components')}</h4>
                  <table className="premium-table">
                    <thead><tr><th>{t('assets.col_name')}</th><th style={{ textAlign: 'right' }}>{t('assets.col_cost')}</th><th style={{ textAlign: 'right' }}>{t('assets.col_life_months')}</th></tr></thead>
                    <tbody>
                      {detailComponents.map(c => (
                        <tr key={c.id}><td>{c.name}</td><td style={{ textAlign: 'right' }}>{fmt(c.cost, isFr)}</td><td style={{ textAlign: 'right' }}>{c.usefulLifeMonths}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {Array.isArray(detail.events) && (detail.events as { eventType: string; eventDate: string; amount: number; notes: string }[]).length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px' }}>{t('assets.events')}</h4>
                  <table className="premium-table">
                    <thead><tr><th>{t('assets.col_type')}</th><th>{t('assets.col_date')}</th><th style={{ textAlign: 'right' }}>{t('assets.col_amount')}</th><th>{t('assets.col_notes')}</th></tr></thead>
                    <tbody>
                      {(detail.events as { eventType: string; eventDate: string; amount: number; notes: string }[]).map((ev, i) => (
                        <tr key={i}><td>{ev.eventType}</td><td>{new Date(ev.eventDate).toLocaleDateString(isFr ? 'fr-CM' : 'en-US')}</td><td style={{ textAlign: 'right' }}>{fmt(ev.amount, isFr)}</td><td>{ev.notes}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </JemShellModal>
        </ModalPortal>
      )}

      {showCapitalizeModal && (
        <ModalPortal onClose={() => setShowCapitalizeModal(false)}>
          <JemShellModal title={t('assets.modal_capitalize')} onClose={() => setShowCapitalizeModal(false)} size="lg" wideBody bodyClassName="jem-body--detail-scroll" pill="AP"
            footer={<><button type="button" className="jem-btn-ghost" onClick={() => setShowCapitalizeModal(false)}>{t('common.cancel')}</button><button type="submit" form="capitalize-form" className="jem-btn-primary">{t('assets.btn_capitalize')}</button></>}>
            <form id="capitalize-form" onSubmit={submitCapitalize} className="ap-modal-form">
              <div className="jem-input-group"><span className="jem-label">{t('assets.col_invoice_id')}</span><input className="jem-field jem-mono" required value={capitalizeForm.supplierInvoiceId} onChange={e => setCapitalizeForm({ ...capitalizeForm, supplierInvoiceId: e.target.value })} /></div>
              <div className="jem-form-grid2">
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_code')}</span><input className="jem-field jem-mono" value={capitalizeForm.code} onChange={e => setCapitalizeForm({ ...capitalizeForm, code: e.target.value })} /></div>
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_name')}</span><input className="jem-field" value={capitalizeForm.name} onChange={e => setCapitalizeForm({ ...capitalizeForm, name: e.target.value })} /></div>
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('assets.col_category')}</span>
                <select className="jem-field" value={capitalizeForm.category} onChange={e => setCapitalizeForm({ ...capitalizeForm, category: e.target.value })}>
                  {categories.map(c => <option key={c.category} value={c.category}>{isFr ? c.labelFr : c.labelEn}</option>)}
                </select>
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}

      {showRevalueModal && selectedId && (
        <ModalPortal onClose={() => setShowRevalueModal(false)}>
          <JemShellModal title={t('assets.modal_revalue')} onClose={() => setShowRevalueModal(false)} size="md" bodyClassName="jem-body--detail-scroll" pill="FA"
            footer={<><button type="button" className="jem-btn-ghost" onClick={() => setShowRevalueModal(false)}>{t('common.cancel')}</button><button type="submit" form="revalue-form" className="jem-btn-primary">{t('assets.btn_revalue')}</button></>}>
            <form id="revalue-form" onSubmit={submitRevalue} className="ap-modal-form">
              <div className="jem-input-group"><span className="jem-label">{t('assets.col_new_cost')}</span><input type="number" min={0.01} step="0.01" className="jem-field" required value={revalueForm.newActiveCost || ''} onChange={e => setRevalueForm({ ...revalueForm, newActiveCost: parseFloat(e.target.value) || 0 })} /></div>
              <div className="jem-input-group"><span className="jem-label">{t('assets.col_notes')}</span><input className="jem-field" value={revalueForm.notes} onChange={e => setRevalueForm({ ...revalueForm, notes: e.target.value })} /></div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}

      {showComponentModal && selectedId && (
        <ModalPortal onClose={() => setShowComponentModal(false)}>
          <JemShellModal title={t('assets.modal_component')} onClose={() => setShowComponentModal(false)} size="md" bodyClassName="jem-body--detail-scroll" pill="FA"
            footer={<><button type="button" className="jem-btn-ghost" onClick={() => setShowComponentModal(false)}>{t('common.cancel')}</button><button type="submit" form="component-form" className="jem-btn-primary">{t('assets.btn_add_component')}</button></>}>
            <form id="component-form" onSubmit={submitComponent} className="ap-modal-form">
              <div className="jem-input-group"><span className="jem-label">{t('assets.col_name')}</span><input className="jem-field" required value={componentForm.name} onChange={e => setComponentForm({ ...componentForm, name: e.target.value })} /></div>
              <div className="jem-form-grid2">
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_cost')}</span><input type="number" min={0.01} step="0.01" className="jem-field" required value={componentForm.cost || ''} onChange={e => setComponentForm({ ...componentForm, cost: parseFloat(e.target.value) || 0 })} /></div>
                <div className="jem-input-group"><span className="jem-label">{t('assets.col_life_months')}</span><input type="number" min={1} className="jem-field" value={componentForm.usefulLifeMonths} onChange={e => setComponentForm({ ...componentForm, usefulLifeMonths: parseInt(e.target.value) || 0 })} /></div>
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default FixedAssets;
