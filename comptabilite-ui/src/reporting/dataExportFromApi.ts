import { reportsApi } from '../api';
import type { ReportEngineKey } from './syscohadaExportBridge';

/** Builds pretty-printed JSON for download when the user selects JSON format. */
export async function buildReportJsonExport(
  engineKey: ReportEngineKey,
  fiscalYear: number,
  companyId: string,
  lang: string
): Promise<string> {
  switch (engineKey) {
    case 'trial_balance': {
      const r = await reportsApi.getTrialBalance(fiscalYear, companyId);
      return JSON.stringify(r.data, null, 2);
    }
    case 'income_statement': {
      const r = await reportsApi.getIncomeStatement(fiscalYear, companyId);
      return JSON.stringify(r.data, null, 2);
    }
    case 'balance_sheet': {
      const r = await reportsApi.getBalanceSheet(fiscalYear, companyId);
      return JSON.stringify(r.data, null, 2);
    }
    case 'cash_flow': {
      const r = await reportsApi.getCashFlow(fiscalYear, companyId);
      return JSON.stringify(r.data, null, 2);
    }
    case 'notes': {
      const r = await reportsApi.getNotes(fiscalYear, companyId, lang);
      return JSON.stringify(r.data, null, 2);
    }
    case 'project_profitability': {
      const r = await reportsApi.getProjectProfitability(fiscalYear, companyId);
      return JSON.stringify(r.data, null, 2);
    }
    default:
      return '{}';
  }
}
