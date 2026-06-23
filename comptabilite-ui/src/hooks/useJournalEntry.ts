import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/journalEntryApi';
import type { CreateJournalEntryCommand, ReverseJournalEntryCommand } from '../types/journalEntry';

export const useJournalEntries = (params?: { year?: number, period?: number, type?: string, status?: string }) => {
    return useQuery({
        queryKey: ['journalEntries', params],
        queryFn: () => api.fetchJournalEntries(params)
    });
};

export const useJournalEntry = (id: string) => {
    return useQuery({
        queryKey: ['journalEntry', id],
        queryFn: () => api.fetchJournalEntryById(id),
        enabled: !!id
    });
};

export const useCreateJournalEntry = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (cmd: CreateJournalEntryCommand) => api.createJournalEntry(cmd),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
        }
    });
};

export const usePostJournalEntry = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.postJournalEntry(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
            queryClient.invalidateQueries({ queryKey: ['journalEntry', id] });
        },
    });
};

export const useReverseJournalEntry = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, cmd }: { id: string, cmd: ReverseJournalEntryCommand }) => api.reverseJournalEntry(id, cmd),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
        },
    });
};

export const useVoidJournalEntry = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.voidJournalEntry(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
            queryClient.invalidateQueries({ queryKey: ['journalEntry', id] });
        },
    });
};
