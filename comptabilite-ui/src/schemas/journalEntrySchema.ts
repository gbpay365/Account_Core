import { z } from 'zod';

export const lineItemSchema = z.object({
  accountCode: z.string().regex(/^\d{6}$/, 'Use a 6-digit OHADA posting account'),
  accountName: z.string().optional(),
  debitAmount: z.number().min(0, 'Debit cannot be negative'),
  creditAmount: z.number().min(0, 'Credit cannot be negative'),
  description: z.string().optional(),
  costCentre: z.string().optional(),
  catalogServiceKey: z.string().optional(),
  taxCode: z.string().optional(),
  taxAmount: z.number().default(0)
}).refine(data => (data.debitAmount > 0 || data.creditAmount > 0), {
  message: "Line must have a debit or credit amount",
  path: ["debitAmount"]
}).refine(data => !(data.debitAmount > 0 && data.creditAmount > 0), {
  message: "Line cannot have both debit and credit",
  path: ["debitAmount"]
});

export const journalEntrySchema = z.object({
  /** SLB is system-only; not in this form. */
  journalType: z.enum(['JNL', 'RJE', 'REV', 'AJE', 'TJE', 'OBL']),
  journalDate: z.string().min(1, 'Date is required'),
  fiscalYear: z.number().int().min(0).max(2099),
  fiscalPeriod: z.number().int().min(0).max(13),
  currencyCode: z.string().length(3, { message: 'Use a 3-letter currency code' }),
  exchangeRate: z.number().positive({ message: 'Exchange rate must be positive' }),
  reference: z.string().optional(),
  description: z.string().optional(),
  /** RJE: shown in RecurrencePanel */
  recurrenceFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  recurrenceEndDate: z.string().optional(),
  /** REV: link text for audit trail (appended to description) */
  reversalOfJournalId: z.string().max(80).optional(),
  /** AJE: user completes lines manually or from allocation tool later */
  allocationSourceAccount: z.string().max(20).optional(),
  allocationTotalAmount: z.number().min(0).optional(),
  lines: z.array(lineItemSchema).min(2, 'At least 2 lines are required')
}).refine(data => {
  const debits = data.lines.reduce((sum, line) => sum + line.debitAmount, 0);
  const credits = data.lines.reduce((sum, line) => sum + line.creditAmount, 0);
  return Math.abs(debits - credits) < 0.01;
}, {
  message: "Journal entry must balance (Total Debits = Total Credits)",
  path: ["lines"]
});

export type JournalEntryFormValues = z.infer<typeof journalEntrySchema>;
