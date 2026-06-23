import React from 'react';
import { useFormContext } from 'react-hook-form';
import type { JournalEntryFormValues } from '../../schemas/journalEntrySchema';
import { Repeat } from 'lucide-react';
import './JournalEntryForm.css';

export const RecurrencePanel: React.FC = () => {
  const { register, watch } = useFormContext<JournalEntryFormValues>();
  const t = watch('journalType');
  if (t !== 'RJE') return null;
  return (
    <div className="jem-panel jem-panel--rje" role="region" aria-label="Recurring schedule">
      <div className="jem-panel__title">
        <Repeat className="w-4 h-4" />
        Recurrence (RJE)
      </div>
      <p className="jem-panel__help">
        Schedule is stored in the entry description. A nightly job (when configured) can generate future runs.
      </p>
      <div className="jem-grid-2">
        <div className="jem-input-group">
          <span className="jem-label">Frequency</span>
          <select className="jem-field" {...register('recurrenceFrequency')}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>
        <div className="jem-input-group">
          <span className="jem-label">End (optional)</span>
          <input type="date" className="jem-field" {...register('recurrenceEndDate')} />
        </div>
      </div>
    </div>
  );
};
