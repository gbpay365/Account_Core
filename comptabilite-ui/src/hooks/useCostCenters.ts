import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import * as api from '../api/costCenterApi';
import { getStoredCompanyId } from '../lib/companyContext';
import type { CostCenterDto } from '../types/costCenter';

export const costCentersQueryKey = ['costCenters'] as const;

export const useCostCenters = (includeInactive = false) => {
  const companyId = getStoredCompanyId();
  return useQuery({
    queryKey: [...costCentersQueryKey, companyId, includeInactive],
    queryFn: () => api.fetchCostCenters(includeInactive),
    enabled: !!companyId,
  });
};

export const useCostCenterTemplates = () => {
  return useQuery({
    queryKey: ['costCenterTemplates'],
    queryFn: () => api.fetchCostCenterTemplates(),
  });
};

export const useApplyCostCenterTemplate = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (opts: api.ApplyCostCenterTemplateOptions) => api.applyCostCenterTemplate(opts),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: costCentersQueryKey });
    },
  });
};

export function filterActiveCostCenters(list: CostCenterDto[] | undefined): CostCenterDto[] {
  if (!list) return [];
  return list.filter((c) => c.isActive);
}
