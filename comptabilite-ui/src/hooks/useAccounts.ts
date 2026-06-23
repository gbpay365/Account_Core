import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '../api/accountApi';

export const useAccounts = (search?: string) => {
  return useQuery({
    queryKey: ['accounts', search],
    queryFn: () => fetchAccounts(search),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};
