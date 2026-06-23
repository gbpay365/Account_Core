import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCostCenters,
  useCostCenterTemplates,
  useApplyCostCenterTemplate,
  costCentersQueryKey,
} from '../hooks/useCostCenters';
import { getStoredCompanyId } from '../lib/companyContext';
import { createCostCenter, updateCostCenter, fetchCostCenterTemplateLines } from '../api/costCenterApi';
import { fetchAccountChartHierarchy } from '../api/accountsApi';
import type { CostCenterDto } from '../types/costCenter';
import { showToast } from '../utils/dialogs';
import { AccountTreeView } from '../components/AccountTreeView';
import { Loader2, Plus, Pencil, LayoutGrid, BookOpen, Network } from 'lucide-react';
import { ModalPortal } from '../components/ModalPortal';
import { JemShellModal } from '../components/jem/JemShellModal';
import '../components/JournalEntry/JournalEntryForm.css';

const CostCenters: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language.startsWith('en');
  const companyId = getStoredCompanyId();
  const queryClient = useQueryClient();
  const { data: list = [], isLoading } = useCostCenters(true);
  const { data: templates = [] } = useCostCenterTemplates();
  const applyTpl = useApplyCostCenterTemplate();
  const [chartClass, setChartClass] = useState(6);
  const { data: chartRoots = [], isLoading: chartLoading } = useQuery({
    queryKey: ['accountChart', chartClass],
    queryFn: () => fetchAccountChartHierarchy({ classNo: chartClass }),
  });
  const [templateKey, setTemplateKey] = useState('');
  const [codePrefix, setCodePrefix] = useState('');
  const [enrichName, setEnrichName] = useState(true);
  const [enrichDesc, setEnrichDesc] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [editing, setEditing] = useState<CostCenterDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: templateLines = [], isLoading: linesLoading } = useQuery({
    queryKey: ['costCenterTemplateLines', templateKey],
    queryFn: () => fetchCostCenterTemplateLines(templateKey),
    enabled: Boolean(templateKey),
  });

  const onApplyTemplate = async () => {
    if (!templateKey) {
      showToast(isEn ? 'Choose a template' : 'Choisissez un modèle', 'error');
      return;
    }
    try {
      const { added, updated } = await applyTpl.mutateAsync({
        templateKey,
        codePrefix: codePrefix.trim() || undefined,
        enrichNameWithCompany: enrichName,
        enrichDescriptionWithCompany: enrichDesc,
        updateExistingFromTemplate: updateExisting,
      });
      const msg = isEn
        ? `Added ${added} · updated ${updated}. Names and descriptions use your company name; you can change any row later.`
        : `Ajoutés: ${added} · mis à jour: ${updated}. Libellés enrichis avec l’entité; modifiez librement.`;
      showToast(msg, 'success');
      queryClient.invalidateQueries({ queryKey: costCentersQueryKey });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      showToast(err.response?.data?.error || err.message || 'Error', 'error');
    }
  };

  const classLabel = (c: number) => `Classe ${c} (OHADA)`;

  if (!companyId) {
    return (
      <div className="animate-fade-in" style={{ padding: 24 }}>
        <p style={{ color: 'var(--text-muted)' }}>{t('cost_centers.pick_company', 'Select a company first.')}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>
            <LayoutGrid style={{ display: 'inline', width: 28, height: 28, marginRight: 8, verticalAlign: 'text-bottom' }} />
            {t('cost_centers.title', 'Cost centres (OHADA)')}
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', maxWidth: 640 }}>
            {t(
              'cost_centers.subtitle',
              'Analytical axes aligned with SYSCOHADA / OHADA account classes (1–7). Load a sector template, then adjust codes and labels for your entity. Journal lines must use these codes when cost centres are defined.'
            )}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
          gap: 16,
          marginBottom: 24,
        }}
        className="cc-grid"
      >
        <div style={{ background: 'var(--glass-bg, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: 20 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} />
            {t('cost_centers.load_template', 'Load sector template')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
            {t(
              'cost_centers.load_hint',
              'Choose a sector. By default, labels and descriptions are adjusted with your company name; optional code prefix. Missing codes are created; you can then edit everything.'
            )}
          </p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('cost_centers.code_prefix', 'Code prefix (optional)')}
              <input
                value={codePrefix}
                onChange={(e) => setCodePrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                placeholder="e.g. ACME"
                maxLength={8}
                style={{ display: 'block', width: '100%', maxWidth: 200, marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
              <input type="checkbox" checked={enrichName} onChange={(e) => setEnrichName(e.target.checked)} />
              {t('cost_centers.enrich_name', 'Add company name to each label (recommended)')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
              <input type="checkbox" checked={enrichDesc} onChange={(e) => setEnrichDesc(e.target.checked)} />
              {t('cost_centers.enrich_desc', 'Mention the entity in descriptions')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              {t(
                'cost_centers.update_existing',
                'Refresh existing rows with the same generated code (overwrites name/description for those codes)'
              )}
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              style={{ padding: '8px 12px', minWidth: 220, borderRadius: 8, border: '1px solid #e2e8f0' }}
            >
              <option value="">{t('cost_centers.select_template', '— Select —')}</option>
              {templates.map((x) => (
                <option key={x.key} value={x.key}>
                  {isEn ? x.labelEn : x.labelFr}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onApplyTemplate}
              disabled={!templateKey || applyTpl.isPending}
              className="glass-button"
            >
              {applyTpl.isPending && <Loader2 className="spin" size={16} style={{ marginRight: 6 }} />}
              {t('cost_centers.apply', 'Apply to company')}
            </button>
          </div>
          {templateKey && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10 }}>
              {(() => {
                const x = templates.find((y) => y.key === templateKey);
                if (!x) return null;
                return isEn ? x.ohadaNote : (x.ohadaNote);
              })()}
            </p>
          )}
        </div>

        <div style={{ background: 'var(--glass-bg, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: 20 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>{t('cost_centers.manual', 'Add manually')}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('cost_centers.manual_hint', 'Create a custom code linked to the OHADA class that best matches this axis.')}</p>
          <button type="button" onClick={() => setCreateOpen(true)} className="glass-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={18} />
            {t('cost_centers.add', 'Add cost centre')}
          </button>
        </div>
      </div>

      {templateKey && (
        <div
          style={{
            marginBottom: 20,
            background: 'var(--glass-bg, #f0fdf4)',
            border: '1px solid #bbf7d0',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>
            {t('cost_centers.template_lines', 'Template lines & reference GL (sector)')} — {templateKey}
          </h3>
          {linesLoading && <Loader2 className="spin" />}
          {!linesLoading && (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#166534' }}>
                    <th style={{ padding: 6 }}>CC</th>
                    <th style={{ padding: 6 }}>Cl.</th>
                    <th style={{ padding: 6 }}>{t('cost_centers.col_ref_account', 'Ref. compte')}</th>
                    <th style={{ padding: 6 }}>Libellé</th>
                  </tr>
                </thead>
                <tbody>
                  {templateLines.map((L) => (
                    <tr key={L.code} style={{ borderTop: '1px solid #d9f99d' }}>
                      <td style={{ padding: 6, fontFamily: 'ui-monospace, monospace' }}>{L.code}</td>
                      <td style={{ padding: 6 }}>{L.ohadaClass}</td>
                      <td style={{ padding: 6, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{L.relatedAccountCode ?? '—'}</td>
                      <td style={{ padding: 6 }}>{L.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginBottom: 20,
          background: 'var(--glass-bg, #f8fafc)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Network size={18} />
          {t('cost_centers.chart_tree', 'Chart of accounts (sub-codes)')}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
          {t(
            'cost_centers.chart_tree_hint',
            'Browse the OHADA plan: class 6 shows 60, 601, 602, 61… under their parents.'
          )}
        </p>
        <label style={{ display: 'inline-block', marginBottom: 8, fontSize: '0.85rem' }}>
          {t('cost_centers.ohada_class', 'Class')}
          <select
            value={chartClass}
            onChange={(e) => setChartClass(Number(e.target.value))}
            style={{ marginLeft: 8, padding: 6, borderRadius: 8, border: '1px solid #e2e8f0' }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {chartLoading && <Loader2 className="spin" style={{ display: 'block' }} />}
        {!chartLoading && <AccountTreeView roots={chartRoots} />}
      </div>

      <div style={{ overflow: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>{t('cost_centers.col_code', 'Code')}</th>
              <th style={{ padding: '10px 12px' }}>{t('cost_centers.col_name', 'Name')}</th>
              <th style={{ padding: '10px 12px' }}>OHADA</th>
              <th style={{ padding: '10px 12px' }}>{t('cost_centers.col_ref_account', 'Ref. compte')}</th>
              <th style={{ padding: '10px 12px' }}>{t('cost_centers.col_status', 'Status')}</th>
              <th style={{ padding: '10px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center' }}>
                  <Loader2 className="spin" />
                </td>
              </tr>
            )}
            {!isLoading && list.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: 'var(--text-muted)' }}>
                  {t('cost_centers.empty', 'No cost centres yet. Load a template or add one.')}
                </td>
              </tr>
            )}
            {list.map((row) => (
              <tr key={row.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace' }}>{row.code}</td>
                <td style={{ padding: '10px 12px' }}>{row.name}</td>
                <td style={{ padding: '10px 12px' }}>{classLabel(row.ohadaClass)}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace' }}>{row.relatedAccountCode ?? '—'}</td>
                <td style={{ padding: '10px 12px' }}>{row.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}</td>
                <td style={{ padding: '10px 12px' }}>
                  <button type="button" onClick={() => setEditing(row)} className="nav-link" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}>
                    <Pencil size={16} style={{ verticalAlign: 'middle' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CostCenterModal
          key="create"
          title={t('cost_centers.add', 'Add cost centre')}
          onClose={() => setCreateOpen(false)}
          onSave={async (payload) => {
            await createCostCenter({
              ...payload,
              sortOrder: payload.sortOrder || 0,
              relatedAccountCode: payload.relatedAccountCode?.trim() || undefined,
            });
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: costCentersQueryKey });
            showToast(t('cost_centers.saved', 'Saved.'), 'success');
          }}
        />
      )}

      {editing && (
        <CostCenterModal
          key={editing.id}
          title={t('cost_centers.edit', 'Edit cost centre')}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await updateCostCenter(editing.id, {
              code: payload.code,
              name: payload.name,
              description: payload.description,
              ohadaClass: payload.ohadaClass,
              sortOrder: payload.sortOrder,
              isActive: payload.isActive,
              relatedAccountCode: payload.relatedAccountCode?.trim() || undefined,
            });
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: costCentersQueryKey });
            showToast(t('cost_centers.saved', 'Saved.'), 'success');
          }}
        />
      )}

      <style>{`
        @media (max-width: 800px) {
          .cc-grid { grid-template-columns: 1fr !important; }
        }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

type Payload = {
  code: string;
  name: string;
  description?: string;
  ohadaClass: number;
  sortOrder: number;
  isActive: boolean;
  relatedAccountCode: string;
};

const CostCenterModal: React.FC<{
  title: string;
  initial?: CostCenterDto;
  onClose: () => void;
  onSave: (p: Payload) => Promise<void>;
}> = ({ title, initial, onClose, onSave }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [ohadaClass, setOhadaClass] = useState(initial?.ohadaClass ?? 6);
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [relatedAccountCode, setRelatedAccountCode] = useState(
    (initial?.relatedAccountCode != null && initial.relatedAccountCode !== 'null' ? String(initial.relatedAccountCode) : '') ?? ''
  );
  const [busy, setBusy] = useState(false);

  return (
    <ModalPortal onClose={onClose}>
      <JemShellModal
        title={title}
        subtitle={t('cost_centers.modal_subtitle', 'OHADA class and optional link to a GL compte.')}
        onClose={onClose}
        size="md"
        footer={
          <>
            <button type="button" onClick={onClose} className="jem-btn-ghost">
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!code.trim() || !name.trim()) {
                  return;
                }
                setBusy(true);
                try {
                  await onSave({ code, name, description, ohadaClass, sortOrder, isActive, relatedAccountCode });
                } finally {
                  setBusy(false);
                }
              }}
              className="jem-btn-primary"
              disabled={busy}
            >
              {busy ? '…' : t('common.save', 'Save')}
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="jem-input-group">
            <span className="jem-label">{t('cost_centers.col_code', 'Code')}</span>
            <input
              className="jem-field"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
          <div className="jem-input-group">
            <span className="jem-label">{t('cost_centers.col_name', 'Name')}</span>
            <input className="jem-field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="jem-input-group">
            <span className="jem-label">{t('cost_centers.description', 'Description')}</span>
            <textarea
              className="jem-field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="jem-form-grid2">
            <div className="jem-input-group">
              <span className="jem-label">OHADA {t('cost_centers.class', 'class')} (1–7)</span>
              <input
                className="jem-field"
                type="number"
                min={1}
                max={7}
                value={ohadaClass}
                onChange={(e) => setOhadaClass(Number(e.target.value))}
              />
            </div>
            <div className="jem-input-group">
              <span className="jem-label">{t('cost_centers.sort', 'Sort order')}</span>
              <input
                className="jem-field jem-mono"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="jem-input-group">
            <span className="jem-label">{t('cost_centers.col_ref_account', 'Ref. compte (sous-compte)')}</span>
            <input
              className="jem-field jem-mono"
              value={relatedAccountCode}
              onChange={(e) => setRelatedAccountCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
              placeholder="601, 641, 701…"
              maxLength={20}
            />
          </div>
          {initial && (
            <label className="jem-label jem-label--inline" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {t('common.active', 'Active')}
            </label>
          )}
        </div>
      </JemShellModal>
    </ModalPortal>
  );
};

export default CostCenters;
