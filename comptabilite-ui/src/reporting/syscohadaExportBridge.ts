import { reportsApi } from '../api';
import i18n from '../i18n';
export { downloadBlob } from '../utils/apiHelpers';

export type EngineExportKind = 'trial_balance' | 'income_statement' | 'balance_sheet' | 'cash_flow';

/** Keys aligned with the server GET /api/reports/catalog engineKey values. */
export type ReportEngineKey =
  | 'trial_balance'
  | 'income_statement'
  | 'balance_sheet'
  | 'cash_flow'
  | 'notes'
  | 'project_profitability';

export interface ResolvedExport {
  kind: EngineExportKind;
  fileBase: string;
  exportFn: () => Promise<Blob>;
  /** Shown after download when we substituted a format (e.g. Excel for TB when PDF requested). */
  userMessage?: string;
  /** File extension to use (defaults from format / kind). */
  fileExtension?: string;
  /** If true, validate blob starts with %PDF- before save (API may return JSON errors as blob). */
  expectPdf?: boolean;
}

function normTitle(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[—–]/g, '-')
    .trim();
}

/**
 * When a catalog report matches standard SYSCOHADA / statutory outputs the API already
 * provides, we can download directly. Unmatched PDF falls back to balance sheet PDF; other
 * combinations may return null (use manifest flow).
 */
export function resolveEngineExport(
  reportTitle: string,
  format: string,
  fiscalYear: number,
  companyId: string,
  lang: string
): ResolvedExport | null {
  const n = normTitle(reportTitle);
  const fmt = format.toUpperCase().trim();

  if (n.includes('trial balance') || n.includes('balance de verification')) {
    if (fmt === 'XML') {
      return {
        kind: 'trial_balance',
        fileBase: 'trial_balance',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportTrialBalanceXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'trial_balance',
        fileBase: 'trial_balance',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportTrialBalanceHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XLSX' || fmt === 'EXCEL' || fmt === 'CSV' || fmt === 'PDF' || fmt === 'JSON') {
      return {
        kind: 'trial_balance',
        fileBase: 'trial_balance',
        fileExtension: 'xlsx',
        userMessage:
          fmt === 'PDF' || fmt === 'JSON'
            ? i18n.t('reporting_messages.no_pdf_fallback_excel', { lng: lang })
            : undefined,
        exportFn: () =>
          reportsApi
            .exportTrialBalanceExcel(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  if (
    n.includes('income statement') ||
    n.includes('compte de résultat') ||
    n.includes('compte de resultat') ||
    n.includes('état de résultat') ||
    n.includes('etat de resultat') ||
    n.includes('revenue statement') ||
    n.includes('monthly revenue statement') ||
    n.includes('income & expenditure') ||
    n.includes('income and expenditure') ||
    (n.includes('p&l') && !n.includes('balance')) ||
    (n.includes('profit and loss') && !n.includes('balance'))
  ) {
    if (fmt === 'PDF') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        expectPdf: true,
        exportFn: () =>
          reportsApi
            .exportIncomeStatementPdf(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XML') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportIncomeStatementXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportIncomeStatementHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XLSX' || fmt === 'EXCEL' || fmt === 'CSV') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        fileExtension: 'xlsx',
        exportFn: () =>
          reportsApi
            .exportIncomeStatementExcel(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  if (
    n.includes('balance sheet') ||
    n.includes('(bilan') ||
    (n.includes('bilan') && (n.includes('ohada') || n.includes('syscohada') || n.includes('actif') || n.includes('passif')))
  ) {
    if (fmt === 'PDF') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        expectPdf: true,
        exportFn: () =>
          reportsApi
            .exportBalanceSheetPdf(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XML') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportBalanceSheetXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportBalanceSheetHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XLSX' || fmt === 'EXCEL' || fmt === 'CSV') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'xlsx',
        exportFn: () =>
          reportsApi
            .exportBalanceSheetExcel(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  if (
    n.includes('cash flow') ||
    n.includes('cashflow') ||
    n.includes('tableau des flux') ||
    n.includes('flux de trésorerie') ||
    n.includes('flux de tresorerie') ||
    n.includes('tableau de la trésorerie') ||
    n.includes('flujo de caja')
  ) {
    if (fmt === 'PDF') {
      return {
        kind: 'cash_flow',
        fileBase: 'cashflow',
        expectPdf: true,
        exportFn: () =>
          reportsApi.exportCashFlowPdf(fiscalYear, companyId, lang).then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XML') {
      return {
        kind: 'cash_flow',
        fileBase: 'cashflow',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportCashFlowXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'cash_flow',
        fileBase: 'cashflow',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportCashFlowHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  // "Financial statements" / états financiers (catalog often omits the words "balance sheet")
  const isFinancialStatementsLine =
    n.includes('financial statement') ||
    n.includes('financial statements') ||
    n.includes('états financiers') ||
    n.includes('etats financiers') ||
    n.includes('statement of financial position') ||
    (n.includes('quarterly') && n.includes('financial') && n.includes('statement')) ||
    (n.includes('annual') && n.includes('financial') && n.includes('statement') && n.includes('syscohada'));

  if (isFinancialStatementsLine) {
    if (fmt === 'PDF') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        expectPdf: true,
        userMessage: i18n.t('reporting_messages.full_statements_bs_pdf', { lng: lang }),
        exportFn: () =>
          reportsApi
            .exportBalanceSheetPdf(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XML') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'xml',
        userMessage: i18n.t('reporting_messages.full_statements_bs_xml', { lng: lang }),
        exportFn: () =>
          reportsApi
            .exportBalanceSheetXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'html',
        userMessage: i18n.t('reporting_messages.full_statements_bs_html', { lng: lang }),
        exportFn: () =>
          reportsApi
            .exportBalanceSheetHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XLSX' || fmt === 'EXCEL' || fmt === 'CSV' || fmt === 'JSON') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'xlsx',
        userMessage:
          fmt === 'JSON'
            ? i18n.t('reporting_messages.json_handoff_excel', { lng: lang })
            : i18n.t('reporting_messages.full_statements_bs_excel', { lng: lang }),
        exportFn: () =>
          reportsApi
            .exportBalanceSheetExcel(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
  }

  if (fmt === 'PDF') {
    return {
      kind: 'balance_sheet',
      fileBase: 'balance_sheet',
      expectPdf: true,
      userMessage: i18n.t('reporting_messages.no_pdf_match_fallback_bs', { lng: lang }),
      exportFn: () =>
        reportsApi
          .exportBalanceSheetPdf(fiscalYear, companyId, lang)
          .then((r) => r.data as Blob),
    };
  }

  return null;
}

/**
 * Same exports as the title-based resolver, keyed for the intelligent module (no catalog string matching).
 * Returns null for JSON on core financials (use REST JSON download in the panel) and for
 * notes / project_profitability (data-only in API).
 */
export function resolveEngineExportByKey(
  key: ReportEngineKey,
  format: string,
  fiscalYear: number,
  companyId: string,
  lang: string
): ResolvedExport | null {
  const fmt = format.toUpperCase().trim();

  if (key === 'notes' || key === 'project_profitability') return null;

  if (fmt === 'JSON') return null;

  if (key === 'trial_balance') {
    if (fmt === 'XML') {
      return {
        kind: 'trial_balance',
        fileBase: 'trial_balance',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportTrialBalanceXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'trial_balance',
        fileBase: 'trial_balance',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportTrialBalanceHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XLSX' || fmt === 'EXCEL' || fmt === 'CSV' || fmt === 'PDF') {
      return {
        kind: 'trial_balance',
        fileBase: 'trial_balance',
        fileExtension: 'xlsx',
        userMessage:
          fmt === 'PDF' ? i18n.t('reporting_messages.no_pdf_fallback_excel', { lng: lang }) : undefined,
        exportFn: () =>
          reportsApi
            .exportTrialBalanceExcel(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  if (key === 'income_statement') {
    if (fmt === 'PDF') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        expectPdf: true,
        exportFn: () =>
          reportsApi
            .exportIncomeStatementPdf(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XML') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportIncomeStatementXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportIncomeStatementHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XLSX' || fmt === 'EXCEL' || fmt === 'CSV') {
      return {
        kind: 'income_statement',
        fileBase: 'income_statement',
        fileExtension: 'xlsx',
        exportFn: () =>
          reportsApi
            .exportIncomeStatementExcel(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  if (key === 'balance_sheet') {
    if (fmt === 'PDF') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        expectPdf: true,
        exportFn: () =>
          reportsApi
            .exportBalanceSheetPdf(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XML') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportBalanceSheetXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportBalanceSheetHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XLSX' || fmt === 'EXCEL' || fmt === 'CSV') {
      return {
        kind: 'balance_sheet',
        fileBase: 'balance_sheet',
        fileExtension: 'xlsx',
        exportFn: () =>
          reportsApi
            .exportBalanceSheetExcel(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  if (key === 'cash_flow') {
    if (fmt === 'PDF') {
      return {
        kind: 'cash_flow',
        fileBase: 'cashflow',
        expectPdf: true,
        exportFn: () =>
          reportsApi.exportCashFlowPdf(fiscalYear, companyId, lang).then((r) => r.data as Blob),
      };
    }
    if (fmt === 'XML') {
      return {
        kind: 'cash_flow',
        fileBase: 'cashflow',
        fileExtension: 'xml',
        exportFn: () =>
          reportsApi
            .exportCashFlowXml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'HTML') {
      return {
        kind: 'cash_flow',
        fileBase: 'cashflow',
        fileExtension: 'html',
        exportFn: () =>
          reportsApi
            .exportCashFlowHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    if (fmt === 'CSV') {
      return {
        kind: 'cash_flow',
        fileBase: 'cashflow',
        fileExtension: 'html',
        userMessage: i18n.t('reporting_messages.no_csv_fallback_html', { lng: lang }),
        exportFn: () =>
          reportsApi
            .exportCashFlowHtml(fiscalYear, companyId, lang)
            .then((r) => r.data as Blob),
      };
    }
    return null;
  }

  return null;
}

export function extensionFor(resolved: ResolvedExport, format: string): string {
  if (resolved.fileExtension) return resolved.fileExtension;
  const fmt = format.toUpperCase();
  if (fmt === 'PDF') return 'pdf';
  if (fmt === 'HTML') return 'html';
  if (fmt === 'XML') return 'xml';
  if (resolved.kind === 'cash_flow') return 'pdf';
  return 'xlsx';
}

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

/**
 * If the server returns JSON (error body) with responseType blob, turn it into a clear Error.
 */
export async function assertPdfBlob(blob: Blob): Promise<void> {
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const same =
    head.length === PDF_MAGIC.length && head.every((b, i) => b === PDF_MAGIC[i]);
  if (same) return;
  const asText = await blob.slice(0, 2000).text();
  const t = asText.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    let msg = i18n.t('reporting_messages.pdf_error_fallback');
    try {
      const j = JSON.parse(t) as { error?: string; message?: string; title?: string };
      msg = j.error || j.message || j.title || msg;
    } catch {
      /* use default */
    }
    throw new Error(msg);
  }
  throw new Error(i18n.t('reporting_messages.pdf_invalid_error'));
}

export function platformSlug(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'core';
}
