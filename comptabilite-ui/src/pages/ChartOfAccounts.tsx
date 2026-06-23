import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2, RefreshCw, Download } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import {
  fetchAccountChartFlat,
  createAccount,
  updateAccount,
  deleteAccount,
  importWyvernCoa,
  type AccountAdminDto,
  type CreateAccountRequest,
} from '../api/accountsApi';
import { showToast } from '../utils/dialogs';
import { ModalPortal } from '../components/ModalPortal';
import { JemShellModal } from '../components/jem/JemShellModal';
import '../components/JournalEntry/JournalEntryForm.css';

const accountTypes = ['asset', 'liability', 'equity', 'expense', 'revenue', 'cost'];

const ChartOfAccounts: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language.startsWith('en');
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('journal', 'read');
  const canWrite = hasPermission('journal', 'write');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState<string>('6');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [prefix, setPrefix] = useState('');

  const classNo =
    filterClass === 'all' ? undefined : (Number.isNaN(parseInt(filterClass, 10)) ? 6 : parseInt(filterClass, 10));
  const { data: rows = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['accountChartFlat', classNo, includeInactive, search],
    queryFn: () =>
      fetchAccountChartFlat({
        classNo,
        includeInactive,
        search: search.trim() || undefined,
      }),
    enabled: canRead,
  });

  const byPrefix = (list: AccountAdminDto[]) => {
    if (!prefix.trim()) return list;
    const p = prefix.trim();
    return list.filter((a) => a.code === p || a.code.startsWith(p));
  };
  const filtered = byPrefix(rows);

  const createM = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountChartFlat'] });
      queryClient.invalidateQueries({ queryKey: ['accountChart', 'hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setModal(null);
      showToast(isEn ? 'Account created.' : 'Compte créé.', 'success');
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      showToast(e.response?.data?.error || (isEn ? 'Failed to create.' : 'Échec.'), 'error'),
  });
  const updateM = useMutation({
    mutationFn: ({ code, body }: { code: string; body: Parameters<typeof updateAccount>[1] }) => updateAccount(code, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountChartFlat'] });
      queryClient.invalidateQueries({ queryKey: ['accountChart', 'hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setModal(null);
      showToast(isEn ? 'Updated.' : 'Enregistré.', 'success');
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      showToast(e.response?.data?.error || (isEn ? 'Update failed.' : 'Échec.'), 'error'),
  });
  const deleteM = useMutation({
    mutationFn: ({ code, force }: { code: string; force: boolean }) => deleteAccount(code, force),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['accountChartFlat'] });
      queryClient.invalidateQueries({ queryKey: ['accountChart', 'hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setModal(null);
      showToast(
        r.deactivated
          ? isEn
            ? 'Account deactivated (had movements).'
            : 'Compte désactivé (contient des écritures).'
          : isEn
            ? 'Account removed.'
            : 'Compte supprimé.',
        'success'
      );
    },
  });
  const importWyvernM = useMutation({
    mutationFn: () => importWyvernCoa({ replaceExisting: true }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['accountChartFlat'] });
      queryClient.invalidateQueries({ queryKey: ['accountChart', 'hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast(
        isEn
          ? `Chart replaced with ${r.total} WYVERN accounts (${r.removed} removed, ${r.inserted} new, ${r.updated} updated).`
          : `Plan remplacé : ${r.total} comptes WYVERN (${r.removed} supprimés, ${r.inserted} nouveaux, ${r.updated} mis à jour).`,
        'success'
      );
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      showToast(e.response?.data?.error || (isEn ? 'Import failed.' : 'Échec import.'), 'error'),
  });

  type ModalState =
    | { mode: 'create'; parentCode?: string }
    | { mode: 'edit'; account: AccountAdminDto }
    | null;
  const [modal, setModal] = useState<ModalState>(null);

  const classes = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const typeColor: Record<string, string> = {
    asset: 'var(--color-primary)',
    liability: 'var(--color-warning)',
    equity: 'var(--color-success)',
    expense: 'var(--color-danger)',
    revenue: '#10b981',
    cost: '#6366f1',
  };

  if (!canRead) {
    return (
      <div className="glass-panel" style={{ padding: 32 }}>
        <p>{isEn ? 'You need permission to view the chart of accounts (journal → read).' : "Permission requise : journal → lecture."}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>📋 {t('common.accounts', 'Chart of accounts')}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
            {t('accounts.chart_subtitle', 'Add, edit, or remove detail accounts (e.g. 665, 667 under 66) where your SYSCOHADA plan allows.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="glass-button" onClick={() => refetch()} disabled={isFetching} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={16} className={isFetching ? 'spin' : ''} />
            {t('common.refresh', 'Refresh')}
          </button>
          {canWrite && (
            <button
              type="button"
              className="glass-button"
              onClick={() => {
                if (
                  !window.confirm(
                    isEn
                      ? 'Replace the entire chart with WYVERN 6-digit accounts? Accounts not in WYVERN will be permanently removed.'
                      : 'Remplacer tout le plan par les comptes WYVERN à 6 chiffres ? Les comptes absents de WYVERN seront supprimés.'
                  )
                )
                  return;
                importWyvernM.mutate();
              }}
              disabled={importWyvernM.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {importWyvernM.isPending ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
              {t('accounts.import_wyvern', 'Import from WYVERN')}
            </button>
          )}
          {canWrite && (
            <button type="button" className="glass-button" onClick={() => setModal({ mode: 'create' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={18} />
              {t('accounts.add', 'Add account')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: 16, color: 'var(--color-danger)', marginBottom: 16 }}>
          {(error as Error).message}
        </div>
      )}

      <div
        className="glass-panel"
        style={{ padding: '16px 24px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <input
          type="text"
          placeholder={t('accounts.search_placeholder', 'Code or label…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, border: 'none', background: 'transparent', fontSize: '1rem' }}
        />
        <input
          type="text"
          title={t('accounts.prefix_filter', 'Filter by prefix, e.g. 66 to see 66, 665, 667')}
          placeholder={t('accounts.prefix', 'Prefix e.g. 66')}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.replace(/[^0-9]/g, ''))}
          style={{ width: 120, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}>
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          {t('accounts.inactive', 'Show inactive')}
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFilterClass('all')}
            style={{
              padding: '6px 12px',
              borderRadius: 99,
              border: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              background: filterClass === 'all' ? 'var(--color-primary)' : 'rgba(79,70,229,0.1)',
              color: filterClass === 'all' ? 'white' : 'var(--color-primary)',
            }}
          >
            {t('accounts.filter_all', 'All')}
          </button>
          {classes.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setFilterClass(c)}
              style={{
                padding: '6px 12px',
                borderRadius: 99,
                border: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                background: filterClass === c ? 'var(--color-primary)' : 'rgba(79,70,229,0.1)',
                color: filterClass === c ? 'white' : 'var(--color-primary)',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>
          <Loader2 className="spin" size={32} style={{ color: 'var(--color-primary)' }} />
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="premium-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>{t('accounts.col_code', 'Code')}</th>
                <th>{t('accounts.col_name_en', 'EN')}</th>
                <th>{t('accounts.col_name_fr', 'FR')}</th>
                <th style={{ textAlign: 'center' }}>{t('accounts.col_type', 'Type')}</th>
                <th style={{ textAlign: 'center' }}>Parent</th>
                <th style={{ textAlign: 'center' }}>{t('accounts.col_leaf', 'Postable')}</th>
                <th style={{ textAlign: 'center' }}>OK</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-primary)', padding: '10px 14px' }}>{a.code}</td>
                  <td>{a.nameEn}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{a.nameFr}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 99,
                        fontSize: '0.75rem',
                        background: (typeColor[a.accountType] || '#888') + '22',
                        color: typeColor[a.accountType] || '#888',
                        fontWeight: 600,
                      }}
                    >
                      {a.accountType}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{a.parentCode ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{a.isLeaf ? (isEn ? 'Yes' : 'Oui') : isEn ? 'Folder' : 'Dossier'}</td>
                  <td style={{ textAlign: 'center' }}>{a.isActive ? '✓' : '○'}</td>
                  {canWrite && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {a.code.length > 1 && (
                        <button
                          type="button"
                          className="nav-link"
                          onClick={() => setModal({ mode: 'create', parentCode: a.code })}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: '0.8rem' }}
                        >
                          + {isEn ? 'sub' : 'Sous-compte'}
                        </button>
                      )}
                      {a.code.length > 1 && (
                        <button
                          type="button"
                          className="nav-link"
                          onClick={() => setModal({ mode: 'edit', account: a })}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-primary)', marginLeft: 8 }}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {a.code.length > 1 && (
                        <button
                          type="button"
                          className="nav-link"
                          onClick={async () => {
                            if (!window.confirm(isEn ? `Delete ${a.code} permanently?` : `Supprimer ${a.code} (sans écriture) ?`)) return;
                            try {
                              await deleteM.mutateAsync({ code: a.code, force: false });
                            } catch {
                              if (window.confirm(isEn ? 'Account has posted lines. Deactivate (soft) instead?' : 'Écritures présentes. Désactiver le compte ?')) {
                                await deleteM.mutateAsync({ code: a.code, force: true });
                              }
                            }
                          }}
                          title={t('accounts.delete_title', 'Delete or deactivate')}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c', marginLeft: 4 }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{t('accounts.no_match', 'No match')}</div>
          )}
        </div>
      )}

      {canWrite && modal && (
        <AccountModal
          key={modal.mode === 'create' ? `c-${modal.parentCode || 'n'}` : (modal as { account: AccountAdminDto }).account.id}
          isEn={isEn}
          t={t}
          modal={modal}
          onClose={() => setModal(null)}
          onCreate={(b) => createM.mutate(b)}
          onUpdate={(c, b) => updateM.mutate({ code: c, body: b })}
          isSaving={createM.isPending || updateM.isPending}
        />
      )}

      <style>{`
        .spin { animation: coa-spin 0.8s linear infinite; }
        @keyframes coa-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

const AccountModal: React.FC<{
  isEn: boolean;
  t: TFunction;
  modal: { mode: 'create'; parentCode?: string } | { mode: 'edit'; account: AccountAdminDto };
  onClose: () => void;
  onCreate: (b: CreateAccountRequest) => void;
  onUpdate: (code: string, b: Parameters<typeof updateAccount>[1]) => void;
  isSaving: boolean;
}> = ({ isEn, t, modal, onClose, onCreate, onUpdate, isSaving }) => {
  const parentCode = modal.mode === 'create' ? modal.parentCode : undefined;
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState(modal.mode === 'edit' ? modal.account.nameEn : '');
  const [nameFr, setNameFr] = useState(modal.mode === 'edit' ? modal.account.nameFr : '');
  const [accountType, setAccountType] = useState(modal.mode === 'edit' ? modal.account.accountType : 'expense');
  const [normalBalance, setNormalBalance] = useState<'debit' | 'credit'>(
    modal.mode === 'edit' ? (modal.account.normalBalance as 'debit' | 'credit') || 'debit' : 'debit'
  );
  const [isLeaf, setIsLeaf] = useState(modal.mode === 'edit' ? modal.account.isLeaf : true);
  const [isActive, setIsActive] = useState(modal.mode === 'edit' ? modal.account.isActive : true);

  const title = modal.mode === 'create' ? t('accounts.add', 'Add account') : t('accounts.edit', 'Edit account');
  const subtitle =
    parentCode == null
      ? isEn
        ? 'Sous-compte: parent is the longest code prefix in your chart (e.g. 66 before 665).'
        : 'Sous-compte: le parent est le plus long préfixe existant (ex. 66 avant 665).'
      : isEn
        ? `The code must start with “${parentCode}” (e.g. 665, 667).`
        : `Le compte complet doit commencer par « ${parentCode} » (ex. 665, 667).`;

  return (
    <ModalPortal onClose={onClose}>
      <JemShellModal
        title={title}
        subtitle={subtitle}
        onClose={onClose}
        size="md"
        pill={modal.mode === 'edit' ? (modal as { account: AccountAdminDto }).account.code : undefined}
        footer={
          <>
            <button type="button" className="jem-btn-ghost" onClick={onClose} disabled={isSaving}>
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              className="jem-btn-primary"
              disabled={isSaving}
              onClick={() => {
                if (modal.mode === 'create') {
                  if (!code.trim() || (parentCode && !code.startsWith(parentCode))) {
                    showToast(
                      isEn
                        ? `The code must start with parent prefix “${parentCode}”.`
                        : `Le compte doit commencer par le préfixe parent « ${parentCode} ».`,
                      'error'
                    );
                    return;
                  }
                  onCreate({
                    code: code.trim(),
                    nameEn,
                    nameFr,
                    accountType,
                    normalBalance,
                    isLeaf,
                  });
                } else {
                  onUpdate((modal as { account: AccountAdminDto }).account.code, {
                    nameEn,
                    nameFr,
                    accountType,
                    normalBalance,
                    isLeaf,
                    isActive,
                  });
                }
              }}
            >
              {t('common.save', 'Save')}
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {modal.mode === 'create' && (
            <div className="jem-input-group">
              <span className="jem-label">{t('accounts.col_code', 'Compte (full code)')}</span>
              <input
                className="jem-field jem-mono"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 20))}
                disabled={isSaving}
                placeholder={parentCode ? `${parentCode}…` : '665'}
              />
            </div>
          )}
          {modal.mode === 'edit' && (
            <p className="jem-mono" style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>
              {(modal as { account: AccountAdminDto }).account.code}
            </p>
          )}
          <div className="jem-form-grid2">
            <div className="jem-input-group">
              <span className="jem-label">{t('accounts.col_name_en', 'EN')}</span>
              <input className="jem-field" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div className="jem-input-group">
              <span className="jem-label">{t('accounts.col_name_fr', 'FR')}</span>
              <input className="jem-field" value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
            </div>
          </div>
          <div className="jem-form-grid2">
            <div className="jem-input-group">
              <span className="jem-label">{t('accounts.col_type', 'Type')}</span>
              <select
                className="jem-field"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
              >
                {accountTypes.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div className="jem-input-group">
              <span className="jem-label">{t('accounts.col_normal', 'Normal')}</span>
              <select
                className="jem-field"
                value={normalBalance}
                onChange={(e) => setNormalBalance(e.target.value as 'debit' | 'credit')}
              >
                <option value="debit">debit</option>
                <option value="credit">credit</option>
              </select>
            </div>
          </div>
          <label className="jem-label" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input type="checkbox" style={{ marginTop: 3 }} checked={isLeaf} onChange={(e) => setIsLeaf(e.target.checked)} />
            <span>
              {isEn
                ? 'Postable (detail / leaf). Uncheck for a header account (no direct posting on this compte).'
                : 'Postable (feuille). Décoccher = dossier sans saisie directe.'}
            </span>
          </label>
          {modal.mode === 'edit' && (
            <label className="jem-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {t('common.active', 'Active')}
            </label>
          )}
        </div>
      </JemShellModal>
    </ModalPortal>
  );
};

export default ChartOfAccounts;
