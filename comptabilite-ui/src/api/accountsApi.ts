import api from './index';

export type AccountTreeNode = {
  code: string;
  nameEn: string;
  nameFr: string;
  class: number;
  isLeaf: boolean;
  children: AccountTreeNode[];
};

export type AccountAdminDto = {
  id: string;
  code: string;
  nameEn: string;
  nameFr: string;
  class: number;
  parentCode: string | null;
  accountType: string;
  normalBalance: string;
  isLeaf: boolean;
  isActive: boolean;
};

export type CreateAccountRequest = {
  code: string;
  nameEn: string;
  nameFr: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
  isLeaf: boolean;
};

export type UpdateAccountRequest = Partial<{
  nameEn: string;
  nameFr: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
  isLeaf: boolean;
  isActive: boolean;
}>;

export async function fetchAccountChartHierarchy(params?: { classNo?: number; prefix?: string }): Promise<AccountTreeNode[]> {
  const res = await api.get<AccountTreeNode[]>('accounts/chart/hierarchy', { params });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchAccountChartFlat(params: {
  classNo?: number;
  includeInactive?: boolean;
  search?: string;
}): Promise<AccountAdminDto[]> {
  const res = await api.get<AccountAdminDto[]>('accounts/chart/flat', { params });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createAccount(body: CreateAccountRequest): Promise<AccountAdminDto> {
  const res = await api.post<AccountAdminDto>('accounts', body);
  return res.data;
}

export async function updateAccount(code: string, body: UpdateAccountRequest): Promise<AccountAdminDto> {
  const res = await api.put<AccountAdminDto>(`accounts/${encodeURIComponent(code)}`, body);
  return res.data;
}

export async function deleteAccount(code: string, force: boolean = false): Promise<{ ok: boolean; deactivated: boolean }> {
  const res = await api.delete<{ ok: boolean; deactivated: boolean }>(`accounts/${encodeURIComponent(code)}`, { params: { force } });
  return res.data;
}

export type CoaImportResult = {
  source: string;
  inserted: number;
  updated: number;
  removed: number;
  total: number;
};

export async function importWyvernCoa(body?: {
  baseUrl?: string;
  username?: string;
  password?: string;
  replaceExisting?: boolean;
}): Promise<CoaImportResult> {
  const res = await api.post<CoaImportResult>('accounts/chart/import/wyvern', { replaceExisting: true, ...body });
  return res.data;
}

export async function importOhadaCoa(): Promise<CoaImportResult> {
  const res = await api.post<CoaImportResult>('accounts/chart/import/ohada');
  return res.data;
}
