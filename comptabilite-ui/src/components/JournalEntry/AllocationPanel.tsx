import React, { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { JournalEntryFormValues } from '../../schemas/journalEntrySchema';
import { Target } from 'lucide-react';
import './JournalEntryForm.css';

/**
 * AJE: optional helper fields. Lines must still balance; user completes grid or pastes from spreadsheet.
 */
export const AllocationPanel: React.FC = () => {
  const { control, register, watch } = useFormContext<JournalEntryFormValues>();
  const t = watch('journalType');
  const lines = useWatch({ control, name: 'lines' });
  const source = watch('allocationSourceAccount');
  const total = watch('allocationTotalAmount');

  const lineSum = useMemo(() => {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((s, l) => s + (l?.debitAmount ?? 0) + (l?.creditAmount ?? 0), 0);
  }, [lines]);

  if (t !== 'AJE') return null;
  return (
    <div className="jem-panel jem-panel--aje" role="region" aria-label="Allocation (AJE)">
      <div className="jem-panel__title">
        <Target className="w-4 h-4" />
        Allocation (AJE)
      </div>
      <p className="jem-panel__help">Enter a source and total to track your split; add debit lines so they match credits (or vice versa) in the grid below.</p>
      <div className="jem-grid-2">
        <div className="jem-input-group">
          <span className="jem-label">Source account (optional)</span>
          <input className="jem-field" placeholder="4xxx…" {...register('allocationSourceAccount')} />
        </div>
        <div className="jem-input-group">
          <span className="jem-label">Total to allocate (optional)</span>
          <input
            type="number"
            className="jem-field"
            step="0.01"
            {...register('allocationTotalAmount', {
              setValueAs: (v) =>
                v === '' || v === null || (typeof v === 'string' && v.trim() === '')
                  ? undefined
                  : Number(v),
            })}
          />
        </div>
      </div>
      {source && total && total > 0 && lineSum > 0 && (
        <p className="jem-hint" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          Check: line movement sum is {lineSum.toFixed(2)} vs total {Number(total).toFixed(2)}.
        </p>
      )}
    </div>
  );
};
