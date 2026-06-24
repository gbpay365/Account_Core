import api from './index';
import { getStoredCompanyId } from '../lib/companyContext';
import type { JournalType, JournalEntryListRow, CreateJournalEntryCommand, ReverseJournalEntryCommand, JournalEntryDto } from '../types/journalEntry';

const RESOURCE_PATH = 'journal-entries';

type ApiLine = { debit?: number; credit?: number; Debit?: number; Credit?: number };

type ApiEntryListItem = {
    id: string;
    entryDate?: string;
    description?: string;
    reference?: string;
    validated?: boolean;
    voided?: boolean;
    lines?: ApiLine[] | null;
    journalType?: string;
    createdAt?: string;
};

function sortJournalEntriesNewestFirst(rows: JournalEntryListRow[]): JournalEntryListRow[] {
    return [...rows].sort((a, b) => {
        const dateA = Date.parse(a.journalDate) || 0;
        const dateB = Date.parse(b.journalDate) || 0;
        if (dateB !== dateA) return dateB - dateA;
        const createdA = Date.parse(a.createdAt || '') || 0;
        const createdB = Date.parse(b.createdAt || '') || 0;
        if (createdB !== createdA) return createdB - createdA;
        return b.id.localeCompare(a.id);
    });
}

function mapListItem(e: ApiEntryListItem, index: number): JournalEntryListRow {
    const lines = Array.isArray(e?.lines) ? e.lines! : [];
    const totalDebits = lines.reduce((s, l) => s + Number((l as ApiLine).debit ?? (l as ApiLine).Debit ?? 0), 0);
    const totalCredits = lines.reduce((s, l) => s + Number((l as ApiLine).credit ?? (l as ApiLine).Credit ?? 0), 0);
    const id = String(e?.id ?? `row-${index}`);
    const dateRaw = e.entryDate;
    const voided = Boolean(e?.voided);
    const descRaw = e?.description;
    const description = typeof descRaw === 'string' && descRaw.trim() !== '' ? descRaw.trim() : '—';
    const refRaw = e?.reference;
    return {
        id,
        journalNumber: id.length >= 8 ? id.slice(0, 8).toUpperCase() : id,
        journalType: (e.journalType as JournalType) || 'JNL',
        journalDate: dateRaw != null && dateRaw !== '' ? String(dateRaw) : new Date(0).toISOString(),
        description,
        reference: typeof refRaw === 'string' && refRaw.trim() !== '' ? refRaw.trim() : undefined,
        totalDebits,
        totalCredits,
        validated: Boolean(e?.validated) && !voided,
        status: voided ? 'Voided' : e?.validated ? 'Posted' : 'Draft',
        createdAt: e.createdAt != null ? String(e.createdAt) : undefined,
    };
}

export const fetchJournalEntries = async (params?: { year?: number, period?: number, type?: string, status?: string }): Promise<JournalEntryListRow[]> => {
    const companyId = getStoredCompanyId();
    const response = await api.get(RESOURCE_PATH, {
        params: companyId ? { ...params, companyId } : params,
    });
    const raw = response.data;
    if (!Array.isArray(raw)) return [];
    const rows = raw.map((e: ApiEntryListItem, i: number) => mapListItem(e, i));
    if (params?.type) {
        return sortJournalEntriesNewestFirst(rows.filter((r) => r.journalType === params.type));
    }
    return sortJournalEntriesNewestFirst(rows);
};

export const fetchJournalEntryById = async (id: string): Promise<JournalEntryDto> => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
        throw new Error('No company selected. Choose a company in the app header or after login.');
    }
    const response = await api.get(`${RESOURCE_PATH}/${id}`, {
        params: { companyId },
        headers: { 'X-Company-Id': companyId },
    });
    return mapDetailDto(response.data);
};

/** Map API (camelCase) into UI JournalEntryDto shape. */
function mapDetailDto(d: Record<string, unknown>): JournalEntryDto {
    const lines = Array.isArray(d.lines) ? d.lines as Record<string, unknown>[] : [];
    return {
        id: String(d.id),
        journalNumber: String(d.id).slice(0, 8).toUpperCase(),
        journalType: (d.journalType as JournalType) || 'JNL',
        status: d.voided ? 'Voided' : d.validated ? 'Posted' : 'Draft',
        journalDate: d.entryDate != null ? String(d.entryDate) : '',
        description: d.description != null ? String(d.description) : undefined,
        reference: d.reference != null ? String(d.reference) : undefined,
        fiscalYear: Number(d.fiscalYear) || 0,
        fiscalPeriod: Number(d.fiscalPeriod) || 0,
        currencyCode: d.currencyCode != null ? String(d.currencyCode) : undefined,
        exchangeRate: d.exchangeRate != null ? Number(d.exchangeRate) : undefined,
        totalDebits: Number(d.totalDebits) || 0,
        totalCredits: Number(d.totalCredits) || 0,
        postedBy: undefined,
        postedDate: undefined,
        createdBy: '',
        createdDate: d.createdAt != null ? String(d.createdAt) : '',
    lines: lines.map((l, i) => ({
        id: String(l.id ?? `line-${i}`),
            accountCode: String(l.accountCode ?? ''),
            accountName: l.accountName != null ? String(l.accountName) : undefined,
            debitAmount: Number(l.debit ?? 0),
            creditAmount: Number(l.credit ?? 0),
            description: l.lineDescription != null ? String(l.lineDescription) : (l.description != null ? String(l.description) : undefined),
            costCentre: l.costCentre != null ? String(l.costCentre) : undefined,
            taxCode: l.taxCode != null ? String(l.taxCode) : undefined,
            taxAmount: Number(l.taxAmount ?? 0),
        })),
    };
}

/** POST body aligned with `JournalEntryCreateDto` (ComptabiliteAPI). */
export const createJournalEntry = async (command: CreateJournalEntryCommand): Promise<string> => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
        throw new Error('No company selected. Choose a company in the app header or after login.');
    }

    let description = (command.description ?? '').trim();
    const ref = (command.reference ?? '').trim();
    if (command.journalType === 'RJE' && command.recurrenceFrequency) {
        const tail = [command.recurrenceFrequency, command.recurrenceEndDate].filter(Boolean).join(' → ');
        if (tail) {
            description = [description, `[RJE schedule: ${tail}]`].filter(Boolean).join(' ').trim();
        }
    }
    if (command.journalType === 'REV' && command.reversalOfJournalId) {
        const t = `Original: ${command.reversalOfJournalId}`;
        description = [description, `[REV] ${t}`].filter(Boolean).join(' ').trim();
    }
    if (!description && !ref) description = 'Journal entry';
    else if (!description) description = ref;

    const body = {
        entryDate: command.journalDate,
        journalType: command.journalType,
        reference: ref || null,
        description: description || null,
        companyId,
        fiscalYear: command.fiscalYear ?? 0,
        fiscalPeriod: command.fiscalPeriod ?? 0,
        currencyCode: command.currencyCode || 'XAF',
        exchangeRate: command.exchangeRate ?? 1,
        lines: command.lines.map((l) => ({
            accountCode: String(l.accountCode).trim(),
            debit: l.debitAmount,
            credit: l.creditAmount,
            lineDescription: l.description || null,
            costCentre: l.costCentre || null,
            taxCode: l.taxCode || null,
            taxAmount: l.taxAmount ?? 0,
            analyticAccountId: null,
        })),
    };
    const response = await api.post(RESOURCE_PATH, body);
    return String(response.data.id);
};

const runWithHeaders = (companyId: string) => ({
    params: { companyId },
    headers: { 'X-Company-Id': companyId },
});

export const postJournalEntry = async (id: string): Promise<void> => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
        throw new Error('No company selected. Choose a company in the app header or after login.');
    }
    const h = runWithHeaders(companyId);
    try {
        await api.put(`${RESOURCE_PATH}/${id}/post`, null, h);
    } catch {
        await api.patch(`${RESOURCE_PATH}/${id}/validate`, null, h);
    }
};

export const reverseJournalEntry = async (id: string, command: ReverseJournalEntryCommand): Promise<string> => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
        throw new Error('No company selected. Choose a company in the app header or after login.');
    }
    const h = runWithHeaders(companyId);
    const response = await api.post(
        `${RESOURCE_PATH}/${id}/reverse`,
        {
            reversalDate: command.reversalDate,
            fiscalYear: command.fiscalYear,
            fiscalPeriod: command.fiscalPeriod,
        },
        h
    );
    const d = response.data as { reversalId?: string; id?: string };
    return String(d.reversalId ?? d.id ?? '');
};

export const voidJournalEntry = async (id: string): Promise<void> => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
        throw new Error('No company selected. Choose a company in the app header or after login.');
    }
    const h = runWithHeaders(companyId);
    try {
        await api.put(`${RESOURCE_PATH}/${id}/void`, {}, h);
    } catch {
        await api.post(`${RESOURCE_PATH}/${id}/void`, {}, h);
    }
};
