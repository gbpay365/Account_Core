import React from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { journalEntrySchema } from '../../schemas/journalEntrySchema';
import type { JournalEntryFormValues } from '../../schemas/journalEntrySchema';
import type { CreateJournalEntryCommand } from '../../types/journalEntry';
import { JournalTypeSelect } from './JournalTypeSelect';
import { RecurrencePanel } from './RecurrencePanel';
import { ReversalReferencePanel } from './ReversalReferencePanel';
import { AllocationPanel } from './AllocationPanel';
import { LineItemsGrid } from './LineItemsGrid';
import { BalanceBar } from './BalanceBar';
import { useCreateJournalEntry } from '../../hooks/useJournalEntry';
import { filterActiveCostCenters, useCostCenters } from '../../hooks/useCostCenters';
import { Save, X, Calendar, Info, ChevronRight, Calculator, Coins, Percent } from 'lucide-react';
import { showToast } from '../../utils/dialogs';
import './JournalEntryForm.css';

function createNewJournalEntryDefaults(): JournalEntryFormValues {
  const d = new Date();
  const journalDate = d.toISOString().split('T')[0];
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  const reference = `JE-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${suffix.toUpperCase()}`;

  return {
    journalType: 'JNL',
    journalDate,
    fiscalYear: d.getFullYear(),
    fiscalPeriod: d.getMonth() + 1,
    currencyCode: 'XAF',
    exchangeRate: 1,
    reference,
    description: '',
    recurrenceFrequency: 'MONTHLY',
    recurrenceEndDate: '',
    reversalOfJournalId: '',
    allocationSourceAccount: '',
    lines: [
      { accountCode: '', debitAmount: 0, creditAmount: 0, taxAmount: 0, costCentre: '' },
      { accountCode: '', debitAmount: 0, creditAmount: 0, taxAmount: 0, costCentre: '' },
    ],
  };
}

interface JournalEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const JournalEntryForm: React.FC<JournalEntryFormProps> = ({ onSuccess, onCancel }) => {
  const initialDefaults = React.useMemo(() => createNewJournalEntryDefaults(), []);
  const methods = useForm<JournalEntryFormValues>({
    resolver: zodResolver(journalEntrySchema) as Resolver<JournalEntryFormValues>,
    defaultValues: initialDefaults,
  });

  const createMutation = useCreateJournalEntry();
  const { data: costCenterList = [] } = useCostCenters(false);
  const activeCostCenters = filterActiveCostCenters(costCenterList);
  const onSubmit = async (data: JournalEntryFormValues) => {
    if (activeCostCenters.length > 0) {
      for (const line of data.lines) {
        const amt = (line.debitAmount || 0) + (line.creditAmount || 0);
        if (amt > 0 && !String(line.costCentre ?? '').trim()) {
          showToast(
            'Chaque ligne avec un montant doit comporter un centre de coût (axe analytique SYSCOHADA) défini pour cette entreprise.',
            'error'
          );
          return;
        }
      }
    }
    try {
      await createMutation.mutateAsync(data as CreateJournalEntryCommand);
      showToast('Journal entry saved successfully!', 'success');
      methods.reset(createNewJournalEntryDefaults());
      onSuccess?.();
    } catch (error: unknown) {
      const e = error as { response?: { data?: { error?: string } }; message?: string };
      showToast('Error: ' + (e.response?.data?.error || e.message), 'error');
    }
  };

  return (
    <FormProvider {...methods}>
      <div className="jem">
        <header className="jem-header">
          <div className="jem-header__left">
            <div className="jem-mark" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <div className="jem-header__title-row">
                <h1 className="jem-header__title">New Journal Entry</h1>
                <ChevronRight className="jem-chevron" />
                <span className="jem-type-pill">{methods.watch('journalType')}</span>
              </div>
              <p className="jem-subtitle">Record a new transaction to the general ledger.</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="jem-close" aria-label="Close">
            <X width={20} height={20} />
          </button>
        </header>

        <form onSubmit={methods.handleSubmit(onSubmit)} className="jem-body" noValidate>
          <aside className="jem-sidebar">
            <div>
              <span className="jem-label">Core classification</span>
              <JournalTypeSelect />
            </div>

            <RecurrencePanel />
            <ReversalReferencePanel />
            <AllocationPanel />

            <hr className="jem-hr" />

            <div>
              <span className="jem-label">Metadata &amp; period</span>
              <div className="jem-input-group" style={{ marginTop: '0.5rem' }}>
                <label className="jem-label jem-label--inline">
                  <Calendar className="jem-ic" />
                  Posting date
                </label>
                <input
                  type="date"
                  readOnly
                  title="Set automatically; not editable"
                  autoComplete="off"
                  {...methods.register('journalDate')}
                  className="jem-field jem-field--locked"
                />
              </div>
              <div className="jem-grid-2" style={{ marginTop: '0.75rem' }}>
                <div className="jem-input-group">
                  <span className="jem-label">Fiscal year</span>
                  <input
                    type="number"
                    readOnly
                    title="Set automatically; not editable"
                    {...methods.register('fiscalYear', { valueAsNumber: true })}
                    className="jem-field jem-field--locked"
                  />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label">Period</span>
                  <input
                    type="number"
                    readOnly
                    title="Set automatically; not editable"
                    {...methods.register('fiscalPeriod', { valueAsNumber: true })}
                    className="jem-field jem-field--locked"
                  />
                </div>
              </div>
              <div className="jem-input-group" style={{ marginTop: '0.75rem' }}>
                <span className="jem-label jem-label--inline">
                  <Info className="jem-ic" />
                  Reference
                </span>
                <input
                  type="text"
                  readOnly
                  title="Autogenerated; not editable"
                  autoComplete="off"
                  spellCheck={false}
                  {...methods.register('reference')}
                  className="jem-field jem-mono jem-field--locked"
                />
              </div>
              <div className="jem-grid-2" style={{ marginTop: '0.75rem' }}>
                <div className="jem-input-group">
                  <span className="jem-label jem-label--inline">
                    <Coins className="jem-ic" />
                    CCY
                  </span>
                  <input
                    type="text"
                    readOnly
                    maxLength={3}
                    title="Set automatically; not editable"
                    {...methods.register('currencyCode')}
                    className="jem-field jem-mono jem-field--locked"
                  />
                </div>
                <div className="jem-input-group">
                  <span className="jem-label jem-label--inline">
                    <Percent className="jem-ic" />
                    % FX
                  </span>
                  <input
                    type="number"
                    readOnly
                    title="Set automatically; not editable"
                    step="0.000001"
                    {...methods.register('exchangeRate', { valueAsNumber: true })}
                    className="jem-field jem-mono jem-field--locked"
                  />
                </div>
              </div>
            </div>

            <hr className="jem-hr" />

            <div className="jem-input-group">
              <span className="jem-label">Description</span>
              <textarea
                {...methods.register('description')}
                rows={5}
                className="jem-field"
                placeholder="Transaction details for auditors…"
              />
            </div>
          </aside>

          <main className="jem-main">
            <div className="jem-section-head">
              <h2 className="jem-section-title">
                <Calculator className="jem-ic" />
                Ledger lines
              </h2>
              <span className="jem-badge-soft">Double entry</span>
            </div>

            <div className="jem-lines-host">
              <LineItemsGrid />
            </div>

            <div>
              <BalanceBar />
            </div>

            <div className="jem-footer">
              <button type="button" onClick={onCancel} className="jem-btn-ghost">
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="jem-btn-primary"
              >
                {createMutation.isPending ? (
                  <span className="jem-spin" aria-hidden />
                ) : (
                  <>
                    <Save width={18} height={18} />
                    Save draft
                  </>
                )}
              </button>
            </div>
          </main>
        </form>
      </div>
    </FormProvider>
  );
};
