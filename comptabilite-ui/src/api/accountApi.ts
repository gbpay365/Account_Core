import api from './index';

export interface AccountLookupDto {
  code: string;
  nameFr: string;
  nameEn: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
  isLeaf: boolean;
}

export interface JournalAccountDto {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  ohadaClass: number;
  accountType: string;
  normalBalance: 'debit' | 'credit';
}

export const fetchAccounts = async (search?: string): Promise<AccountLookupDto[]> => {
  const response = await api.get<AccountLookupDto[]>('/Accounts', { params: { search } });
  return response.data;
};

export const fetchJournalAccounts = async (q?: string): Promise<JournalAccountDto[]> => {
  const response = await api.get<{ accounts: JournalAccountDto[] }>('/accounts/journal', { params: q ? { q } : {} });
  return Array.isArray(response.data.accounts) ? response.data.accounts : [];
};

export type ServiceCatalogResponse = {
  by_account_code: Record<
    string,
    {
      account_code: string;
      label: string;
      hms_subcategory?: string;
      services: { key: string; name: string; price: number }[];
      default_price: number;
    }
  >;
};

export const fetchServiceCatalog = async (): Promise<ServiceCatalogResponse['by_account_code']> => {
  const response = await api.get<ServiceCatalogResponse>('/accounts/service-catalog');
  return response.data.by_account_code ?? {};
};
