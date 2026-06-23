import React from 'react';
import { useFormContext } from 'react-hook-form';
import type { JournalEntryFormValues } from '../../schemas/journalEntrySchema';
import { RotateCcw } from 'lucide-react';
import './JournalEntryForm.css';

/**
 * For manual REV lines: capture a reference to the source journal (number or id text).
 * Full one-click reverse from a posted document uses the list/detail action and API reverse endpoint.
 */
export const ReversalReferencePanel: React.FC = () => {
  const { register, watch } = useFormContext<JournalEntryFormValues>();
  if (watch('journalType') !== 'REV') return null;
  return (
    <div className="jem-panel jem-panel--rev" role="region" aria-label="Reversal reference">
      <div className="jem-panel__title">
        <RotateCcw className="w-4 h-4" />
        Reversal reference
      </div>
      <p className="jem-panel__help" style={{ margin: '0 0 0.5rem' }}>
        Enter the source journal id or number you are offsetting. For posted entries, use &quot;Reverse&quot; from the journal list when available.
      </p>
      <input
        type="text"
        className="jem-field"
        placeholder="e.g. GJ-0001 or UUID"
        {...register('reversalOfJournalId')}
      />
    </div>
  );
};
