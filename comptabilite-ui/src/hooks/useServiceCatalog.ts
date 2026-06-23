import { useQuery } from '@tanstack/react-query';
import { fetchServiceCatalog } from '../api/accountApi';

export const useServiceCatalog = () => {
  return useQuery({
    queryKey: ['serviceCatalog'],
    queryFn: fetchServiceCatalog,
    staleTime: 1000 * 60 * 30,
  });
};
