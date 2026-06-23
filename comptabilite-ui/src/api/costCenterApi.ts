import api from './index';
import { getStoredCompanyId } from '../lib/companyContext';
import type { CostCenterDto, CostCenterTemplateInfo } from '../types/costCenter';

const withCompany = () => {
  const companyId = getStoredCompanyId();
  if (!companyId) {
    throw new Error('No company selected.');
  }
  return {
    params: { companyId },
    headers: { 'X-Company-Id': companyId } as Record<string, string>,
  };
};

export async function fetchCostCenterTemplates(): Promise<CostCenterTemplateInfo[]> {
  const res = await api.get<CostCenterTemplateInfo[]>('cost-centers/templates');
  return Array.isArray(res.data) ? res.data : [];
}

export type TemplateLine = {
  code: string;
  ohadaClass: number;
  name: string;
  description: string | null;
  relatedAccountCode: string | null;
};

export async function fetchCostCenterTemplateLines(templateKey: string): Promise<TemplateLine[]> {
  const k = encodeURIComponent(templateKey);
  const res = await api.get<TemplateLine[]>(`cost-centers/templates/${k}/lines`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchCostCenters(includeInactive = false): Promise<CostCenterDto[]> {
  const c = withCompany();
  const res = await api.get<CostCenterDto[]>('cost-centers', {
    ...c,
    params: { ...c.params, includeInactive },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export type ApplyCostCenterTemplateOptions = {
  templateKey: string;
  codePrefix?: string;
  enrichNameWithCompany?: boolean;
  enrichDescriptionWithCompany?: boolean;
  updateExistingFromTemplate?: boolean;
};

export async function applyCostCenterTemplate(
  opts: ApplyCostCenterTemplateOptions
): Promise<{ added: number; updated: number }> {
  const c = withCompany();
  const res = await api.post<{ added: number; updated: number }>(
    'cost-centers/apply-template',
    {
      templateKey: opts.templateKey,
      codePrefix: opts.codePrefix?.trim() || undefined,
      enrichNameWithCompany: opts.enrichNameWithCompany ?? true,
      enrichDescriptionWithCompany: opts.enrichDescriptionWithCompany ?? true,
      updateExistingFromTemplate: opts.updateExistingFromTemplate ?? false,
    },
    c
  );
  const d = res.data as { added?: number; updated?: number };
  return { added: Number(d?.added ?? 0), updated: Number(d?.updated ?? 0) };
}

export async function createCostCenter(body: {
  code: string;
  name: string;
  description?: string;
  ohadaClass: number;
  sortOrder: number;
  relatedAccountCode?: string | null;
}): Promise<void> {
  const c = withCompany();
  await api.post('cost-centers', body, c);
}

export async function updateCostCenter(
  id: string,
  body: {
    code: string;
    name: string;
    description?: string;
    ohadaClass: number;
    sortOrder: number;
    isActive: boolean;
    relatedAccountCode?: string | null;
  }
): Promise<void> {
  const c = withCompany();
  await api.put(`cost-centers/${id}`, body, c);
}

export async function setCostCenterActive(id: string, isActive: boolean): Promise<void> {
  const c = withCompany();
  await api.patch(`cost-centers/${id}/active`, { isActive }, c);
}
