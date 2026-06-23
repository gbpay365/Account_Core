import React from 'react';
import { useFormContext } from 'react-hook-form';
import type { JournalEntryFormValues } from '../../schemas/journalEntrySchema';
import { Layers, Package } from 'lucide-react';

const MANUAL: { code: JournalEntryFormValues['journalType']; label: string }[] = [
  { code: 'JNL', label: 'Standard (JNL)' },
  { code: 'RJE', label: 'Recurring (RJE)' },
  { code: 'REV', label: 'Reversal (REV)' },
  { code: 'AJE', label: 'Allocation (AJE)' },
  { code: 'TJE', label: 'Tax (TJE)' },
];

const SYSTEM: { code: JournalEntryFormValues['journalType']; label: string }[] = [
  { code: 'OBL', label: 'Opening balance (OBL)' },
];

/**
 * Central Sage-style type selector. SLB (sub-ledger) is not offered here: it is system-only.
 */
export const JournalTypeSelect: React.FC = () => {
  const { register, watch } = useFormContext<JournalEntryFormValues>();
  const selected = watch('journalType');

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <Layers className="w-3.5 h-3.5" />
        Journal type
      </label>
      <div className="relative">
        <select
          {...register('journalType')}
          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer transition-all"
        >
          <optgroup label="Manual">
            {MANUAL.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="System / setup">
            {SYSTEM.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </optgroup>
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <Package className="w-4 h-4" />
        </div>
      </div>
      {selected === 'OBL' && (
        <p className="text-[10px] text-amber-700/90 leading-relaxed m-0 px-0.5">
          OBL: use once per account in opening period; pair with your chart-of-accounts process.
        </p>
      )}
    </div>
  );
};
