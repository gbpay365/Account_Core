import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { JournalEntryFormValues } from '../../schemas/journalEntrySchema';
import { ShieldCheck, ShieldAlert, Scale } from 'lucide-react';

export const BalanceBar: React.FC = () => {
  const { control } = useFormContext<JournalEntryFormValues>();
  const lines = useWatch({ control, name: 'lines' }) || [];

  const totalDebits = lines.reduce((sum, line) => sum + (Number(line.debitAmount) || 0), 0);
  const totalCredits = lines.reduce((sum, line) => sum + (Number(line.creditAmount) || 0), 0);
  const difference = totalDebits - totalCredits;
  const isBalanced = Math.abs(difference) < 0.01 && lines.length >= 2;
  const showImbalance = !isBalanced && Math.abs(difference) > 0.01;

  return (
    <div
      className={[
        'jem-balance',
        isBalanced && 'jem-balance--ok',
        !isBalanced && showImbalance && 'jem-balance--imb',
        !isBalanced && !showImbalance && 'jem-balance--warn',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Scale
        className="jem-balance__bg-icon"
        strokeWidth={1.25}
        aria-hidden
      />
      <div className="jem-balance__left">
        <div className="jem-balance__icon" aria-hidden>
          {isBalanced ? <ShieldCheck width={20} height={20} strokeWidth={2.2} /> : <ShieldAlert width={20} height={20} strokeWidth={2.2} />}
        </div>
        <div>
          <p className="jem-balance__label">Balance check</p>
          <h4 className="jem-balance__headline">
            {isBalanced
              ? 'Balanced'
              : difference === 0 && lines.length < 2
                ? 'Add at least two lines'
                : 'Not balanced'}
          </h4>
        </div>
      </div>

      <div className="jem-balance__right jem-balance__nums">
        <div className="jem-balance__cell">
          <p className="jem-balance__cell--small">Total Debits</p>
          <p className="jem-balance__val">
            {totalDebits.toLocaleString('fr-FR')}
            <span className="jem-balance__unit">XAF</span>
          </p>
        </div>
        <div className="jem-balance__sep" />
        <div className="jem-balance__cell">
          <p className="jem-balance__cell--small">Total Credits</p>
          <p className="jem-balance__val">
            {totalCredits.toLocaleString('fr-FR')}
            <span className="jem-balance__unit">XAF</span>
          </p>
        </div>
        {showImbalance && (
          <>
            <div className="jem-balance__sep" />
            <div className="jem-balance__imb">
              <p className="jem-balance__cell--small jem-balance__label--bad">Imbalance</p>
              <p className="jem-balance__val--bad">
                {Math.abs(difference).toLocaleString('fr-FR')}
                <span className="jem-balance__unit--bad">XAF</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
