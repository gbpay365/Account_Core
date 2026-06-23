export type JournalType = 'JNL' | 'RJE' | 'REV' | 'AJE' | 'TJE' | 'SLB' | 'OBL';
export type JournalStatus = 'Draft' | 'Validated' | 'Posted' | 'Voided' | 'Reversed';

export interface LineItemDto {
    accountCode: string;
    accountName?: string;
    debitAmount: number;
    creditAmount: number;
    description?: string;
    costCentre?: string;
    taxCode?: string;
    taxAmount: number;
}

export interface LineItemResponseDto extends LineItemDto {
    id: string;
}

export interface JournalEntryDto {
    id: string;
    journalNumber: string;
    journalType: JournalType;
    status: JournalStatus;
    journalDate: string;
    description?: string;
    reference?: string;
    fiscalYear: number;
    fiscalPeriod: number;
    currencyCode?: string;
    exchangeRate?: number;
    totalDebits: number;
    totalCredits: number;
    postedBy?: string;
    postedDate?: string;
    createdBy: string;
    createdDate: string;
    lines: LineItemResponseDto[];
}

export interface CreateJournalEntryCommand {
    journalType: JournalType;
    journalDate: string;
    fiscalYear: number;
    fiscalPeriod: number;
    currencyCode: string;
    exchangeRate: number;
    reference?: string;
    description?: string;
    sourceModule?: string;
    /** RJE: appended into description and persisted server-side. */
    recurrenceFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    recurrenceEndDate?: string;
    /** REV: audit reference; appended into description. */
    reversalOfJournalId?: string;
    lines: LineItemDto[];
}

export interface ReverseJournalEntryCommand {
    /** Path param id is the original; this field is optional in callers. */
    originalJournalId?: string;
    reversalDate: string;
    fiscalYear: number;
    fiscalPeriod: number;
}

/** List row: normalized from `GET /api/journal-entries` (see `ComptabiliteAPI` anonymous projection). */
export interface JournalEntryListRow {
    id: string;
    journalNumber: string;
    journalType: JournalType;
    journalDate: string;
    /** Full text for list truncation + tooltips */
    description: string;
    reference?: string;
    totalDebits: number;
    totalCredits: number;
    status: JournalStatus;
    validated: boolean;
}
