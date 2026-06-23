import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../api';
import { authService } from '../services/authService';
import { getStoredCompanyId } from '../lib/companyContext';

/** Read number fields from API JSON (camelCase or PascalCase). */
function sumField(o: Record<string, unknown> | null, ...names: string[]): number | undefined {
  if (!o) return undefined;
  for (const n of names) {
    const v = o[n];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }
  return undefined;
}

function fmtAmount(n: number | undefined, lang: string) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n);
}
import { buildReportJsonExport } from '../reporting/dataExportFromApi';
import {
  assertPdfBlob,
  downloadBlob,
  extensionFor,
  resolveEngineExportByKey,
  type ReportEngineKey,
} from '../reporting/syscohadaExportBridge';

const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Yearly'] as const;
type ReportFrequency = (typeof FREQUENCIES)[number];

export interface ReportCatalogItem {
  id: string;
  title: string;
  description: string;
  engineKey: string;
  formats: string[];
  category: string;
  readPermission: string;
  exportPermission: string | null;
}

function toISOWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const y = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const w = Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function normalizeCatalogRow(raw: unknown): ReportCatalogItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = (o.id ?? o.Id) as string | undefined;
  if (!id) return null;
  const fmts = o.formats ?? o.Formats;
  return {
    id,
    title: String(o.title ?? o.Title ?? id),
    description: String(o.description ?? o.Description ?? ''),
    engineKey: String(o.engineKey ?? o.EngineKey ?? id),
    formats: Array.isArray(fmts) ? (fmts as string[]) : [],
    category: String(o.category ?? o.Category ?? 'Reports'),
    readPermission: String(o.readPermission ?? o.ReadPermission ?? ''),
    exportPermission:
      o.exportPermission != null
        ? String(o.exportPermission)
        : o.ExportPermission != null
          ? String(o.ExportPermission)
          : null,
  };
}

function currentYear() {
  return new Date().getFullYear();
}

function fiscalYearForEngine(
  frequency: ReportFrequency,
  daily: string,
  weekValue: string,
  monthValue: string,
  yearValue: number
): number {
  if (frequency === 'Daily' && daily) return new Date(daily).getFullYear();
  if (frequency === 'Weekly' && weekValue) {
    const y = weekValue.split('-W')[0];
    return y ? parseInt(y, 10) : yearValue;
  }
  if (frequency === 'Monthly' && monthValue) {
    return new Date(monthValue + '-01').getFullYear();
  }
  return yearValue;
}

function periodLabelForFile(
  frequency: ReportFrequency,
  daily: string,
  weekValue: string,
  monthValue: string,
  yearValue: number
): string {
  if (frequency === 'Daily' && daily) return daily;
  if (frequency === 'Weekly' && weekValue) return weekValue;
  if (frequency === 'Monthly' && monthValue) return monthValue;
  return String(yearValue);
}

function hasPerm(perms: string[], p: string) {
  return perms.includes(p);
}

function canGenerate(
  item: ReportCatalogItem,
  format: string,
  perms: string[]
): boolean {
  if (!hasPerm(perms, item.readPermission)) return false;
  if (format === 'JSON') return true;
  if (item.exportPermission) return hasPerm(perms, item.exportPermission);
  return true;
}

const ReportGeneratorPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [companyId, setCompanyId] = useState(() => getStoredCompanyId());
  const lang = i18n.language || 'en';

  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [availability, setAvailability] = useState<{
    journalEntryCount: number;
    hasJournal: boolean;
    accountCount: number;
  } | null>(null);

  const [frequency, setFrequency] = useState<ReportFrequency>('Monthly');
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekValue, setWeekValue] = useState(() => toISOWeekString(new Date()));
  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [yearValue, setYearValue] = useState(currentYear);

  const [reportId, setReportId] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState('PDF');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [liveSummary, setLiveSummary] = useState<Record<string, unknown> | null>(null);
  const [liveSummaryLoading, setLiveSummaryLoading] = useState(false);
  const [liveSummaryError, setLiveSummaryError] = useState<string | null>(null);

  const helpUrl = (import.meta.env.VITE_REPORTS_HELP_URL as string | undefined)?.trim();

  useEffect(() => {
    const onCompanyChange = () => setCompanyId(getStoredCompanyId());
    window.addEventListener('companyChange', onCompanyChange);
    window.addEventListener('storage', onCompanyChange);
    let c = true;
    (async () => {
      setLoadingCatalog(true);
      setCatalogError(null);
      try {
        const [r, perms] = await Promise.all([reportsApi.getReportCatalog(), authService.getCurrentUserPermissions()]);
        if (!c) return;
        setPermissions(perms);
        const raw = r.data;
        const rows = Array.isArray(raw) ? raw : (raw as { items?: unknown })?.items ?? (raw as { reports?: unknown })?.reports;
        const list: ReportCatalogItem[] = [];
        if (Array.isArray(rows)) {
          for (const x of rows) {
            const n = normalizeCatalogRow(x);
            if (n) list.push(n);
          }
        } else {
          for (const v of Object.values((raw as Record<string, unknown>) || {})) {
            const n = normalizeCatalogRow(v);
            if (n) list.push(n);
          }
        }
        setCatalog(list);
      } catch (e) {
        if (c) setCatalogError(e instanceof Error ? e.message : t('reporting.load_failed_generic', 'Failed to load report catalog'));
      } finally {
        if (c) setLoadingCatalog(false);
      }
    })();
    return () => {
      window.removeEventListener('companyChange', onCompanyChange);
      window.removeEventListener('storage', onCompanyChange);
      c = false;
    };
  }, []);

  const visibleReports = useMemo(() => {
    return catalog.filter((c) => hasPerm(permissions, c.readPermission));
  }, [catalog, permissions]);

  const selected = useMemo(
    () => visibleReports.find((r) => r.id === reportId) ?? null,
    [visibleReports, reportId]
  );

  const fiscalYear = useMemo(
    () => fiscalYearForEngine(frequency, dailyDate, weekValue, monthValue, yearValue),
    [frequency, dailyDate, weekValue, monthValue, yearValue]
  );

  useEffect(() => {
    let c = true;
    if (!companyId) {
      setAvailability(null);
      return;
    }
    (async () => {
      try {
        if (!hasPerm(permissions, 'balance_sheet:read')) {
          if (c) setAvailability(null);
          return;
        }
        const res = await reportsApi.getReportAvailability(fiscalYear, companyId);
        if (!c) return;
        const d = res.data as {
          hasJournalDataForYear?: boolean;
          journalEntryCount?: number;
          accountCount?: number;
        };
        setAvailability({
          hasJournal: !!d.hasJournalDataForYear,
          journalEntryCount: d.journalEntryCount ?? 0,
          accountCount: d.accountCount ?? 0,
        });
      } catch {
        if (c) setAvailability(null);
      }
    })();
    return () => {
      c = false;
    };
  }, [companyId, fiscalYear, permissions]);

  const allowedFormats = useMemo(() => {
    if (!selected) return [] as string[];
    return selected.formats.filter((f) => canGenerate(selected, f, permissions));
  }, [selected, permissions]);

  useEffect(() => {
    if (!selected) return;
    if (allowedFormats.length && !allowedFormats.includes(outputFormat)) {
      setOutputFormat(allowedFormats[0]!);
    }
  }, [selected, allowedFormats, outputFormat]);

  const periodPart = useMemo(
    () => periodLabelForFile(frequency, dailyDate, weekValue, monthValue, yearValue),
    [frequency, dailyDate, weekValue, monthValue, yearValue]
  );

  useEffect(() => {
    let c = true;
    setLiveSummary(null);
    setLiveSummaryError(null);
    if (!selected || !companyId) {
      return;
    }
    if (!hasPerm(permissions, selected.readPermission)) {
      return;
    }
    (async () => {
      setLiveSummaryLoading(true);
      try {
        const res = await reportsApi.getReportSummary(
          selected.engineKey,
          fiscalYear,
          companyId,
          lang
        );
        if (!c) return;
        const d = res.data;
        setLiveSummary(
          d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null
        );
      } catch (e: unknown) {
        if (!c) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          setLiveSummaryError(t('reporting.no_live_perms', 'You are not allowed to view live figures for this report type.'));
        } else if (status === 401) {
          setLiveSummaryError(t('reporting.session_expired', 'Session expired. Sign in again to load live figures.'));
        } else {
          setLiveSummaryError(t('reporting.live_load_error', 'Could not load live figures from the server. Check the network and API (HTTPS in production).'));
        }
      } finally {
        if (c) setLiveSummaryLoading(false);
      }
    })();
    return () => {
      c = false;
    };
  }, [selected, companyId, fiscalYear, lang, permissions]);

  const openHelp = useCallback(() => {
    if (helpUrl && (helpUrl.startsWith('https://') || helpUrl.startsWith('http://'))) {
      window.open(helpUrl, '_blank', 'noopener,noreferrer');
    }
  }, [helpUrl]);

  const runGenerate = async () => {
    setMessage(null);
    setError(null);
    if (!companyId) {
      setError(t('reporting.select_company_error'));
      return;
    }
    if (!selected) {
      setError(t('reporting.choose_report_error'));
      return;
    }
    if (!canGenerate(selected, outputFormat, permissions)) {
      setError(t('reporting.no_perms_error'));
      return;
    }

    const key = selected.engineKey as ReportEngineKey;
    const fileStem = selected.id;

    if (outputFormat === 'JSON') {
      setBusy(true);
      try {
        const body = await buildReportJsonExport(key, fiscalYear, companyId, lang);
        const blob = new Blob([body], { type: 'application/json;charset=utf-8' });
        const name = `${fileStem}_FY${fiscalYear}_${periodPart}.json`;
        downloadBlob(blob, name);
        setMessage(t('reporting.json_success'));
      } catch (e) {
        setError(
          e instanceof Error ? e.message : t('reporting.json_failed_generic', 'JSON export failed. Check permissions and try again.')
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    const resolved = resolveEngineExportByKey(
      key,
      outputFormat,
      fiscalYear,
      companyId,
      lang
    );
    if (!resolved) {
      setError(t('reporting.engine_combo_unavailable', 'This report and format combination is not available from the engine. Try another format (e.g. JSON for raw data or HTML/XML for publishing).'));
      return;
    }

    setBusy(true);
    try {
      const blob = await resolved.exportFn();
      if (resolved.expectPdf) {
        await assertPdfBlob(blob);
      }
      const ext = extensionFor(resolved, outputFormat);
      const name = `${resolved.fileBase}_FY${fiscalYear}_${periodPart}.${ext}`;
      downloadBlob(blob, name);
      setMessage(
        [resolved.userMessage, t('reporting.download_started')].filter(Boolean).join(' ')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('reporting.export_failed_generic', 'Export failed. Check export permissions and network (HTTPS).'));
    } finally {
      setBusy(false);
    }
  };

  const byCategory = useMemo(() => {
    const m = new Map<string, ReportCatalogItem[]>();
    for (const r of visibleReports) {
      const cat = r.category || 'Other';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(r);
    }
    return m;
  }, [visibleReports]);

  if (loadingCatalog) {
    return (
      <div className="rg-panel rg-intel">
        <p className="rg-msg">{t('reporting.loading_catalog')}</p>
      </div>
    );
  }
  if (catalogError) {
    return (
      <div className="rg-panel rg-intel">
        <p className="rg-msg rg-err" role="alert">
          {catalogError}
        </p>
      </div>
    );
  }

  return (
    <div className="rg-panel rg-intel">
      <div className="rg-panel-head">
        <h2 className="rg-title">{t('reporting.intelligent_reporting')}</h2>
        <p className="rg-sub">
          {t('reporting.reporting_sub')}
        </p>
      </div>

      {helpUrl && (helpUrl.startsWith('https://') || helpUrl.startsWith('http://')) && (
        <div className="rg-row rg-secure-row" role="status">
          <span className="rg-secure-badge">TLS</span>
          <span className="rg-secure-txt">{t('reporting.help_tls_hint')}</span>
          <button type="button" className="btn-secondary" onClick={openHelp}>
            {t('reporting.open_help')}
          </button>
        </div>
      )}

      {availability && (
        <div className="rg-insight" role="status">
          <strong>{t('reporting.data_insight', { year: fiscalYear })}</strong>
          {availability.hasJournal ? (
            <span> — {t('reporting.journal_entries_count', { count: availability.journalEntryCount })}</span>
          ) : (
            <span> — {t('reporting.no_journal')}</span>
          )}
          <span> — {t('reporting.accounts_in_scope', { count: availability.accountCount })}</span>
        </div>
      )}

      <div className="rg-grid">
        <div className="rg-field">
          <label>{t('reporting.frequency')}</label>
          <div className="rg-pills">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                className={`rg-pill ${frequency === f ? 'on' : ''}`}
                onClick={() => setFrequency(f)}
              >
                {t(`reporting.freq_${f.toLowerCase()}`, f)}
              </button>
            ))}
          </div>
        </div>

        <div className="rg-field">
          <label>{t('reporting.period')}</label>
          {frequency === 'Daily' && (
            <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} lang={lang} />
          )}
          {frequency === 'Weekly' && <input type="week" value={weekValue} onChange={(e) => setWeekValue(e.target.value)} lang={lang} />}
          {frequency === 'Monthly' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select 
                value={monthValue.split('-')[1]} 
                onChange={(e) => setMonthValue(`${monthValue.split('-')[0]}-${e.target.value}`)}
                style={{ flex: 2 }}
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const m = String(i + 1).padStart(2, '0');
                  const date = new Date(2000, i, 1);
                  return (
                    <option key={m} value={m}>
                      {new Intl.DateTimeFormat(lang, { month: 'long' }).format(date)}
                    </option>
                  );
                })}
              </select>
              <input 
                type="number" 
                value={monthValue.split('-')[0]} 
                onChange={(e) => setMonthValue(`${e.target.value}-${monthValue.split('-')[1]}`)}
                style={{ flex: 1, minWidth: '80px' }}
                min={2000}
                max={2100}
              />
            </div>
          )}
          {frequency === 'Yearly' && (
            <input
              type="number"
              className="rg-year"
              value={yearValue}
              onChange={(e) => setYearValue(Number(e.target.value))}
              min={2000}
              max={2100}
            />
          )}
        </div>

        <div className="rg-field rg-field--full">
          <label htmlFor="rg-rep">{t('reporting.report_type')}</label>
          <select
            id="rg-rep"
            value={reportId}
            onChange={(e) => {
              setReportId(e.target.value);
              setMessage(null);
              setError(null);
            }}
          >
            <option value="">{t('reporting.select_report')}</option>
            {Array.from(byCategory.entries()).map(([cat, list]) => (
              <optgroup key={cat} label={t(`reporting.cat_${cat.toLowerCase().replace(/\s+/g, '_')}`, cat)}>
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t(`reports.${r.engineKey}.title`, r.title)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {selected && (
          <div className="rg-field rg-field--full">
            <p className="rg-desc">{t(`reports.${selected.engineKey}.description`, selected.description)}</p>
          </div>
        )}

        {selected && companyId && (
          <div className="rg-live-figures" aria-live="polite">
            <div className="rg-live-figures-h">{t('reporting.live_figures_title', { year: fiscalYear })}</div>
            {liveSummaryLoading && <p className="rg-live-muted">{t('reporting.loading_ledger')}</p>}
            {liveSummaryError && (
              <p className="rg-msg rg-err" role="status">
                {liveSummaryError}
              </p>
            )}
            {liveSummary && !liveSummaryLoading && (
              <>
                <p className="rg-live-source">
                  {t('reporting.source')}:{' '}
                  <strong>
                    {String(
                      (liveSummary.dataSource as string) ?? (liveSummary.DataSource as string) ?? 'live_ledger'
                    )}{' '}
                  </strong>
                  {t('reporting.live_source_hint')}
                </p>
                <ul className="rg-live-list">
                  {selected.engineKey === 'trial_balance' && (
                    <>
                      <li>
                        {t('reporting.account_lines')}:{' '}
                        <strong>
                          {sumField(liveSummary, 'accountLineCount', 'AccountLineCount') ?? '—'}
                        </strong>
                      </li>
                      <li>
                        {t('reporting.with_movement')}:{' '}
                        <strong>
                          {sumField(
                            liveSummary,
                            'accountsWithMovementCount',
                            'AccountsWithMovementCount'
                          ) ?? '—'}
                        </strong>
                      </li>
                      <li>{t('reporting.total_debits')}: <strong>{fmtAmount(sumField(liveSummary, 'sumTotalDebit', 'SumTotalDebit'), lang)}</strong></li>
                      <li>{t('reporting.total_credits')}: <strong>{fmtAmount(sumField(liveSummary, 'sumTotalCredit', 'SumTotalCredit'), lang)}</strong></li>
                    </>
                  )}
                  {selected.engineKey === 'income_statement' && (
                    <>
                      <li>{t('reporting.total_revenue')}: <strong>{fmtAmount(sumField(liveSummary, 'totalRevenue', 'TotalRevenue'), lang)}</strong></li>
                      <li>{t('reporting.total_expenses')}: <strong>{fmtAmount(sumField(liveSummary, 'totalExpenses', 'TotalExpenses'), lang)}</strong></li>
                      <li>{t('reporting.net_income')}: <strong>{fmtAmount(sumField(liveSummary, 'netIncome', 'NetIncome'), lang)}</strong></li>
                    </>
                  )}
                  {selected.engineKey === 'balance_sheet' && (
                    <>
                      <li>{t('reporting.total_assets')}: <strong>{fmtAmount(sumField(liveSummary, 'totalAssets', 'TotalAssets'), lang)}</strong></li>
                      <li>{t('reporting.total_liabilities')}: <strong>{fmtAmount(sumField(liveSummary, 'totalLiabilities', 'TotalLiabilities'), lang)}</strong></li>
                      <li>{t('reporting.total_equity')}: <strong>{fmtAmount(sumField(liveSummary, 'totalEquity', 'TotalEquity'), lang)}</strong></li>
                    </>
                  )}
                  {selected.engineKey === 'cash_flow' && (
                    <>
                      <li>
                        {t('reporting.operating_cash_flow')}:{' '}
                        <strong>
                          {fmtAmount(sumField(liveSummary, 'operatingCashFlow', 'OperatingCashFlow'), lang)}
                        </strong>
                      </li>
                      <li>
                        {t('reporting.net_cash_flow')}: <strong>{fmtAmount(sumField(liveSummary, 'netCashFlow', 'NetCashFlow'), lang)}</strong>
                      </li>
                      <li>
                        {t('reporting.closing_cash')}:{' '}
                        <strong>
                          {fmtAmount(sumField(liveSummary, 'closingCashClass5', 'ClosingCashClass5'), lang)}
                        </strong>
                      </li>
                    </>
                  )}
                  {selected.engineKey === 'notes' && (
                    <li>
                      {t('reporting.statutory_notes_len')}:{' '}
                      <strong>
                        {sumField(liveSummary, 'statutoryNotesTextLength', 'StatutoryNotesTextLength') ?? 0} {t('reporting.chars')}
                      </strong>
                    </li>
                  )}
                  {selected.engineKey === 'project_profitability' && (
                    <>
                      <li>{t('reporting.projects')}: <strong>{sumField(liveSummary, 'projectCount', 'ProjectCount') ?? 0}</strong></li>
                      <li>
                        {t('reporting.combined_net')}:{' '}
                        <strong>
                          {fmtAmount(
                            sumField(liveSummary, 'projectsCombinedNet', 'ProjectsCombinedNet'),
                            lang
                          )}
                        </strong>
                      </li>
                    </>
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        {selected && (
          <div className="rg-field">
            <label htmlFor="rg-fmt">{t('reporting.output_format')}</label>
            <select
              id="rg-fmt"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
            >
              {allowedFormats.length === 0 && (
                <option value="">{t('reporting.no_format_allowed', 'No format allowed (permissions)')}</option>
              )}
              {allowedFormats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rg-field rg-fy">
          <span>
            <strong>{t('reporting.engine_fiscal_year')}</strong> {fiscalYear}
            <em className="rg-hint"> {t('reporting.server_hint', { period: periodPart })}</em>
          </span>
        </div>
      </div>

      <div className="rg-actions">
        <button
          type="button"
          className="btn-glow"
          disabled={busy || !selected || !allowedFormats.length}
          onClick={runGenerate}
        >
          {busy ? t('reporting.working') : t('reporting.generate_download')}
        </button>
      </div>

      {error && (
        <p className="rg-msg rg-err" role="alert">
          {error}
        </p>
      )}
      {message && <p className="rg-msg rg-ok">{message}</p>}

      {!companyId && (
        <p className="rg-msg rg-warn" role="status">
          {t('reporting.no_company_warn')}
        </p>
      )}

      {visibleReports.length === 0 && (
        <p className="rg-msg rg-warn" role="status">
          {t('reporting.no_perms_warn')}
        </p>
      )}
    </div>
  );
};

export default ReportGeneratorPanel;
