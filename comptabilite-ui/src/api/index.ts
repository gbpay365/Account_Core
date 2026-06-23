import axios from 'axios';
import i18n from '../i18n';

const api = axios.create({ 
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5072/api' 
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) {
      config.headers.Authorization = `Bearer ${token}`;
  }
  // Include current UI language for backend error messages
  config.headers['Accept-Language'] = i18n.language || 'en';
  return config;
});

/** Clear stale session when the API rejects the JWT (expired, wrong key, redirect stripped header, etc.). */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url = String(err.config?.url || '');
      if (!url.includes('/auth/login')) {
        localStorage.removeItem('access_token');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export const reportsApi = {
  getReportCatalog: () => api.get('/reports/catalog'),
  getReportAvailability: (fiscalYear: number, companyId: string) =>
    api.get(
      `/reports/availability?fiscalYear=${fiscalYear}&companyId=${encodeURIComponent(companyId)}`
    ),
  getJournalYears: (companyId: string) =>
    api.get(`/reports/journal-years?companyId=${encodeURIComponent(companyId)}`),
  /** Headline figures from the same live generators as exports (journal + chart of accounts). */
  getReportSummary: (engineKey: string, fiscalYear: number, companyId: string, lang: string) =>
    api.get(
      `/reports/summary?engineKey=${encodeURIComponent(engineKey)}&fiscalYear=${fiscalYear}&companyId=${encodeURIComponent(companyId)}&lang=${encodeURIComponent(lang)}`
    ),
  getProjectProfitability: (fiscalYear: number, companyId: string) =>
    api.get(
      `/reports/project-profitability?fiscalYear=${fiscalYear}&companyId=${encodeURIComponent(companyId)}`
    ),
  getTrialBalance: (year: number, companyId: string) => 
    api.get(`/reports/trial-balance?fiscalYear=${year}&companyId=${companyId}`),
  getGeneralLedger: (year: number, companyId: string, opts?: { accountCode?: string; journalType?: string; fiscalPeriod?: number; lang?: string }) => {
    const params = new URLSearchParams({ fiscalYear: String(year), companyId });
    if (opts?.accountCode) params.set('accountCode', opts.accountCode);
    if (opts?.journalType) params.set('journalType', opts.journalType);
    if (opts?.fiscalPeriod) params.set('fiscalPeriod', String(opts.fiscalPeriod));
    if (opts?.lang) params.set('lang', opts.lang);
    return api.get(`/reports/general-ledger?${params.toString()}`);
  },
  getIncomeStatement: (year: number, companyId: string) => 
    api.get(`/reports/income-statement?fiscalYear=${year}&companyId=${companyId}`),
  getBalanceSheet: (year: number, companyId: string) => 
    api.get(`/reports/balance-sheet?fiscalYear=${year}&companyId=${companyId}`),
  getCashFlow: (year: number, companyId: string) => 
    api.get(`/reports/cash-flow?fiscalYear=${year}&companyId=${companyId}`),
  getNotes: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/notes?fiscalYear=${year}&companyId=${companyId}&lang=${encodeURIComponent(lang)}`),
  // PDF exports
  exportCashFlowPdf: (year: number, companyId: string, lang: string) => 
    api.get(`/reports/cash-flow/export?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportIncomeStatementPdf: (year: number, companyId: string, lang: string) => 
    api.get(`/reports/income-statement/export?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportBalanceSheetPdf: (year: number, companyId: string, lang: string) => 
    api.get(`/reports/balance-sheet/export?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  // Excel exports
  exportTrialBalanceExcel: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/trial-balance/export/excel?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportIncomeStatementExcel: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/income-statement/export/excel?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportBalanceSheetExcel: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/balance-sheet/export/excel?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  // XML / HTML exports (server-generated UTF-8 documents)
  exportTrialBalanceXml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/trial-balance/export/xml?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportTrialBalanceHtml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/trial-balance/export/html?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportIncomeStatementXml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/income-statement/export/xml?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportIncomeStatementHtml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/income-statement/export/html?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportBalanceSheetXml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/balance-sheet/export/xml?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportBalanceSheetHtml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/balance-sheet/export/html?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportCashFlowXml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/cash-flow/export/xml?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
  exportCashFlowHtml: (year: number, companyId: string, lang: string) =>
    api.get(`/reports/cash-flow/export/html?fiscalYear=${year}&companyId=${companyId}&lang=${lang}`, { responseType: 'blob' }),
};

export const journalEntriesApi = {
  getEntries: (companyId: string) => api.get(`/journalentries?companyId=${companyId}`),
  createEntry: (entryData: Record<string, unknown>) => api.post('/journalentries', entryData)
};

export const commercialApi = {
  getProducts: (companyId: string) => api.get(`/commercial/products?companyId=${companyId}`),
  getProductFamilies: (companyId: string) => api.get(`/commercial/product-families?companyId=${companyId}`),
  createProduct: (product: Record<string, unknown>) => api.post('/commercial/products', product),
  updateProduct: (id: string, product: Record<string, unknown>) => api.put(`/commercial/products/${id}`, product),
  deleteProduct: (id: string) => api.delete(`/commercial/products/${id}`),
  
  getCustomers: (companyId: string) => api.get(`/commercial/customers?companyId=${companyId}`),
  createCustomer: (customer: Record<string, unknown>) => api.post('/commercial/customers', customer),
  updateCustomer: (id: string, customer: Record<string, unknown>) => api.put(`/commercial/customers/${id}`, customer),
  deleteCustomer: (id: string) => api.delete(`/commercial/customers/${id}`),

  getSuppliers: (companyId: string) => api.get(`/commercial/suppliers?companyId=${companyId}`),
  createSupplier: (supplier: { companyId: string; name: string; accountCode?: string; email?: string; phone?: string; address?: string; contactPerson?: string; taxId?: string }) =>
    api.post('/commercial/suppliers', supplier),

  getSalesDocuments: (companyId: string, status?: string) => 
    api.get(`/commercial/sales?companyId=${companyId}${status ? `&status=${status}` : ''}`),
  createQuote: (document: Record<string, unknown>) => api.post('/commercial/sales/quote', document),
  transformToOrder: (id: string) => api.post(`/commercial/sales/${id}/transform-order`),
  transformToInvoice: (id: string) => api.post(`/commercial/sales/${id}/transform-invoice`),
  patchSalesDocumentStatus: (id: string, status: string) => api.patch(`/commercial/sales/${id}/status`, { status })
};

export const apApi = {
  getInvoices: (companyId: string, status?: string) =>
    api.get(`/ap/invoices?companyId=${companyId}${status ? `&status=${status}` : ''}`),
  getInvoice: (id: string) => api.get(`/ap/invoices/${id}`),
  createInvoice: (body: Record<string, unknown>) => api.post('/ap/invoices', body),
  updateInvoice: (id: string, body: Record<string, unknown>) => api.put(`/ap/invoices/${id}`, body),
  deleteInvoice: (id: string) => api.delete(`/ap/invoices/${id}`),
  postInvoice: (id: string) => api.post(`/ap/invoices/${id}/post`),

  getPayments: (companyId: string, status?: string) =>
    api.get(`/ap/payments?companyId=${companyId}${status ? `&status=${status}` : ''}`),
  getPayment: (id: string) => api.get(`/ap/payments/${id}`),
  createPayment: (body: Record<string, unknown>) => api.post('/ap/payments', body),
  postPayment: (id: string) => api.post(`/ap/payments/${id}/post`),
};

export const assetsApi = {
  getCategories: () => api.get('/assets/categories'),
  list: (companyId: string, status?: string, category?: string) => {
    const p = new URLSearchParams({ companyId });
    if (status) p.set('status', status);
    if (category) p.set('category', category);
    return api.get(`/assets?${p.toString()}`);
  },
  get: (id: string) => api.get(`/assets/${id}`),
  create: (body: Record<string, unknown>) => api.post('/assets', body),
  update: (id: string, body: Record<string, unknown>) => api.put(`/assets/${id}`, body),
  postAcquisition: (id: string, creditAccountCode?: string) =>
    api.post(`/assets/${id}/acquisition`, creditAccountCode ? { creditAccountCode } : {}),
  postDepreciation: (id: string, periodYearMonth: number) =>
    api.post(`/assets/${id}/depreciation?periodYearMonth=${periodYearMonth}`),
  runBatchDepreciation: (companyId: string, periodYearMonth: number) =>
    api.post(`/assets/depreciation/run?companyId=${companyId}&periodYearMonth=${periodYearMonth}`),
  requestDisposal: (id: string, body: Record<string, unknown>) => api.post(`/assets/${id}/disposal/request`, body),
  approveDisposal: (id: string) => api.post(`/assets/${id}/disposal/approve`),
  postDisposal: (id: string, partialAmount?: number) =>
    api.post(`/assets/${id}/disposal`, partialAmount ? { partialAmount } : {}),
  writeOff: (id: string, body: Record<string, unknown>) => api.post(`/assets/${id}/write-off`, body),
  revalue: (id: string, body: Record<string, unknown>) => api.post(`/assets/${id}/revaluation`, body),
  addComponent: (id: string, body: Record<string, unknown>) => api.post(`/assets/${id}/components`, body),
  capitalizeFromInvoice: (companyId: string, body: Record<string, unknown>) =>
    api.post(`/assets/capitalize-from-invoice?companyId=${companyId}`, body),
  getRegisterReport: (companyId: string, asOf?: string) =>
    api.get(`/assets/reports/register?companyId=${companyId}${asOf ? `&asOf=${asOf}` : ''}`),
  getDepreciationSchedule: (companyId: string, fiscalYear: number) =>
    api.get(`/assets/reports/depreciation-schedule?companyId=${companyId}&fiscalYear=${fiscalYear}`),
  getMovements: (companyId: string, from: string, to: string) =>
    api.get(`/assets/reports/movements?companyId=${companyId}&from=${from}&to=${to}`),
  getGlReconciliation: (companyId: string) =>
    api.get(`/assets/reports/gl-reconciliation?companyId=${companyId}`),
};

/** Base URL for static files (receipts under wwwroot), stripping `/api` from VITE_API_URL. */
export const apiStaticOrigin = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5072/api';
  return apiUrl.replace(/\/api\/?$/, '');
};

export const ecfApi = {
  listDeclarations: (companyId: string) => api.get(`/taxdeclarations?companyId=${companyId}`),
  getDeclaration: (id: string) => api.get(`/taxdeclarations/${id}`),
  calculate: (body: {
    companyId: string;
    declarationType: string;
    fiscalYear: number;
    periodMonth?: number | null;
    periodQuarter?: number | null;
  }) => api.post('/taxdeclarations/calculate', body),
  submitDgi: (id: string) => api.post(`/taxdeclarations/${id}/submit-dgi`),
  patchStatus: (id: string, companyId: string, status: string) =>
    api.patch(`/taxdeclarations/${id}/status?companyId=${encodeURIComponent(companyId)}`, { status }),
  downloadEdiXml: (id: string) => api.get(`/taxdeclarations/${id}/edi-xml`, { responseType: 'blob' }),
  listFec: (companyId: string) => api.get(`/taxdeclarations/fec/generations?companyId=${companyId}`),
  generateFec: (body: { companyId: string; fiscalYear: number }) => api.post('/taxdeclarations/fec/generate', body),
  downloadFec: (generationId: string) =>
    api.get(`/taxdeclarations/fec/${generationId}/download`, { responseType: 'blob' }),
  downloadComplianceZip: (companyId: string, fiscalYear: number) =>
    api.get(
      `/taxdeclarations/compliance-zip?companyId=${encodeURIComponent(companyId)}&fiscalYear=${fiscalYear}`,
      { responseType: 'blob' }
    ),
  getComplianceChecklist: (companyId: string, fiscalYear: number, jurisdiction = 'CM') =>
    api.get(
      `/taxdeclarations/compliance/checklist?companyId=${encodeURIComponent(companyId)}&fiscalYear=${fiscalYear}&jurisdiction=${encodeURIComponent(jurisdiction)}`
    ),
  generateCompliancePack: (body: { companyId: string; fiscalYear: number; lockMonth?: number | null }) =>
    api.post('/taxdeclarations/compliance/pack', body, { responseType: 'blob' }),
  listAttachments: (declarationId: string, companyId: string) =>
    api.get(`/taxdeclarations/${declarationId}/attachments?companyId=${encodeURIComponent(companyId)}`),
  uploadAttachment: (declarationId: string, companyId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/taxdeclarations/${declarationId}/attachments?companyId=${encodeURIComponent(companyId)}`, fd);
  },
  downloadAttachment: (attachmentId: string) =>
    api.get(`/taxdeclarations/attachments/${attachmentId}/download`, { responseType: 'blob' }),
  submitEbillingInvoice: (body: Record<string, unknown>) => api.post('/ebilling/submit-invoice', body),
  getEbillingIntegrationStatus: () => api.get('/ebilling/integration-status'),
};

export const complianceApi = {
  getOptions: () => api.get('/compliance/options'),
  getLiasseMappings: (jurisdiction = 'CM') => api.get(`/compliance/liasse-mappings?jurisdiction=${encodeURIComponent(jurisdiction)}`),
  getReconciliation: (fiscalYear: number, companyId: string) =>
    api.get(
      `/compliance/reconciliation?fiscalYear=${fiscalYear}&companyId=${encodeURIComponent(companyId)}`
    ),
};

export const payrollApi = {
  getEmployees: (companyId: string) =>
    api.get(`/payroll/employees?companyId=${encodeURIComponent(companyId)}`),
  getDepartmentSummaries: (companyId: string, year: number, month: number) =>
    api.get(
      `/payroll/department-summaries?companyId=${encodeURIComponent(companyId)}&year=${year}&month=${month}`
    ),
};

/** Access management: users/roles (requires auth). */
export const authAccessApi = {
  getUsers: (companyId: string) => api.get(`/auth/users?companyId=${companyId}`),
  getRoles: (companyId?: string) =>
    api.get(companyId ? `/auth/roles?companyId=${encodeURIComponent(companyId)}` : '/auth/roles'),
  getPermissionCatalog: () => api.get('/auth/permissions/catalog'),
  getRolePermissions: (roleId: string) => api.get(`/auth/roles/${roleId}/permissions`),
  updateRolePermissions: (roleId: string, permissionIds: string[]) =>
    api.put(`/auth/roles/${roleId}/permissions`, { permissionIds }),
  updateUserRole: (userId: string, roleId: string, companyId: string) =>
    api.patch(`/auth/users/${userId}/role?companyId=${encodeURIComponent(companyId)}`, { roleId }),
  createRole: (name: string) => api.post('/auth/roles', { name }),
  createUser: (body: {
    fullName: string;
    email: string;
    roleId: string;
    companyId: string;
    password?: string;
  }) => api.post('/auth/users', body)
};

export const billingApi = {
  getPlans: () => api.get('/billing/plans'),
  getSubscription: (companyId: string) => api.get(`/billing/subscription?companyId=${encodeURIComponent(companyId)}`),
  subscribe: (body: { companyId: string; planId: string; billingCycle?: string; provider?: string }) =>
    api.post('/billing/subscribe', body),
  cancel: (companyId: string) => api.post(`/billing/cancel?companyId=${encodeURIComponent(companyId)}`),
  getPayments: (companyId: string) => api.get(`/billing/payments?companyId=${encodeURIComponent(companyId)}`),
  checkout: (body: { companyId: string; planId: string; billingCycle?: string; provider?: string }) =>
    api.post('/billing/checkout', body),
};

export const rulesApi = {
  list: (companyId: string) => api.get(`/rules?companyId=${encodeURIComponent(companyId)}`),
  create: (body: Record<string, unknown>) => api.post('/rules', body),
  update: (id: string, body: Record<string, unknown>) => api.put(`/rules/${id}`, body),
  delete: (id: string, companyId: string) => api.delete(`/rules/${id}?companyId=${encodeURIComponent(companyId)}`),
  seedDefaults: (companyId: string) => api.post(`/rules/seed-defaults?companyId=${encodeURIComponent(companyId)}`),
  getFieldCatalog: () => api.get('/rules/field-catalog'),
};

export const seedApi = {
  seedProducts: () => api.post('/seed/products')
};

export const integrationSettingsApi = {
  get: (companyId: string) => api.get(`/integration-settings?companyId=${encodeURIComponent(companyId)}`),
  save: (companyId: string, body: Record<string, unknown>) =>
    api.put(`/integration-settings?companyId=${encodeURIComponent(companyId)}`, body),
  testHms: (companyId: string, body?: Record<string, unknown>) =>
    api.post(`/integration-settings/test-hms?companyId=${encodeURIComponent(companyId)}`, body ?? {}),
  testZaizens: (companyId: string, body?: Record<string, unknown>) =>
    api.post(`/integration-settings/test-zaizens?companyId=${encodeURIComponent(companyId)}`, body ?? {}),
};

export const coreConfigApi = {
  getCurrencies: (companyId: string) => api.get(`/core/currencies?companyId=${encodeURIComponent(companyId)}`),
  createCurrency: (body: Record<string, unknown>) => api.post('/core/currencies', body),
  getFiscalYears: (companyId: string) => api.get(`/core/fiscal-years?companyId=${encodeURIComponent(companyId)}`),
  createFiscalYear: (body: Record<string, unknown>) => api.post('/core/fiscal-years', body),
  closePeriod: (periodId: string) => api.patch(`/core/periods/${periodId}/close`),
  getJournals: (companyId: string) => api.get(`/core/journals?companyId=${encodeURIComponent(companyId)}`),
  createJournal: (body: Record<string, unknown>) => api.post('/core/journals', body),
  updateJournal: (id: string, body: Record<string, unknown>) => api.put(`/core/journals/${id}`, body),
  seedDefaults: (companyId: string) => api.post(`/core/seed-defaults?companyId=${encodeURIComponent(companyId)}`),
};

export const reconciliationApi = {
  list: (companyId: string, type?: string) =>
    api.get(`/reconciliation?companyId=${encodeURIComponent(companyId)}${type ? `&type=${type}` : ''}`),
  getCandidates: (companyId: string, type: string) =>
    api.get(`/reconciliation/candidates?companyId=${encodeURIComponent(companyId)}&type=${type}`),
  create: (body: Record<string, unknown>) => api.post('/reconciliation', body),
};

export const auditApi = {
  query: (companyId?: string, take = 100) =>
    api.get(`/finance/audit?take=${take}${companyId ? `&companyId=${encodeURIComponent(companyId)}` : ''}`),
};

export { getApiErrorMessage, downloadBlob } from '../utils/apiHelpers';

export default api;
