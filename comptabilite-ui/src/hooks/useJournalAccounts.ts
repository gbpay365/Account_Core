import { useQuery } from '@tanstack/react-query';
import { fetchJournalAccounts } from '../api/accountApi';

export const useJournalAccounts = (search?: string) => {
  return useQuery({
    queryKey: ['journalAccounts', search],
    queryFn: () => fetchJournalAccounts(search),
    staleTime: 1000 * 60 * 10,
  });
};
