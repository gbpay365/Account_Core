import React, { useEffect } from 'react';
import { X, FileText, Calendar, Bookmark, Hash, Table2, Coins, RefreshCw } from 'lucide-react';
import { useJournalEntry } from '../../hooks/useJournalEntry';
import type { JournalStatus } from '../../types/journalEntry';
import { JemShellModal } from '../jem/JemShellModal';
import './JournalEntryForm.css';
import '../../pages/JournalEntries.css';

const statusClass: Record<JournalStatus, string> = {
  Draft: 'je-badge--draft',
  Validated: 'je-badge--validated',
  Posted: 'je-badge--posted',
  Voided: 'je-badge--voided',
  Reversed: 'je-badge--reversed',
};

type Props = {
  entryId: string;
  onClose: () => void;
};

export const JournalEntryDetailModal: React.FC<Props> = ({ entryId, onClose }) => {
  const { data, isLoading, isError, error, refetch } = useJournalEntry(entryId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <JemShellModal
      title="Journal entry"
      pill={data?.status ?? (isLoading ? '…' : '—')}
      subtitle={
        data
          ? `${data.journalNumber} · ${data.journalType}`
          : isLoading
            ? 'Loading…'
            : 'View lines and metadata for this document.'
      }
      onClose={onClose}
      size="xl"
      wideBody
      className="jem--journal-wide"
      bodyClassName="jem-body--detail-scroll"
      titleId="je-detail-title"
      footer={
        <button type="button" onClick={onClose} className="jem-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <X width={18} height={18} />
          Close
        </button>
      }
    >
      <div>
        {isLoading && (
          <div className="je-loading" style={{ padding: '2rem' }}>
            <div className="je-loading__shimmer" role="status" />
            <span>Loading…</span>
          </div>
        )}
        {isError && (
          <div className="je-error" role="alert" style={{ margin: '1rem' }}>
            {(error as Error)?.message || 'Could not load this entry.'}
          </div>
        )}
        {data && !isLoading && (
          <>
            <section className="je-detail-meta" aria-label="Header" style={{ marginTop: 0 }}>
              <div className="je-detail-meta__grid">
                <div className="je-detail-field">
                  <span className="je-detail-label">
                    <Calendar className="je-ic" />
                    Date
                  </span>
                  <span>
                    {new Date(data.journalDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="je-detail-field">
                  <span className="je-detail-label">
                    <FileText className="je-ic" />
                    Type
                  </span>
                  <span className="je-type-pill">{data.journalType}</span>
                </div>
                <div className="je-detail-field">
                  <span className="je-detail-label">
                    <Hash className="je-ic" />
                    Fiscal
                  </span>
                  <span>
                    {data.fiscalYear} / {data.fiscalPeriod}
                  </span>
                </div>
                <div className="je-detail-field">
                  <span className="je-detail-label">
                    <Coins className="je-ic" />
                    Currency
                  </span>
                  <span>
                    {data.currencyCode || 'XAF'}
                    {data.exchangeRate != null && data.exchangeRate !== 1 && (
                      <span className="je-detail-muted"> · FX {data.exchangeRate}</span>
                    )}
                  </span>
                </div>
              </div>
              {data.reference && (
                <div className="je-detail-block">
                  <span className="je-detail-label">
                    <Bookmark className="je-ic" />
                    Reference
                  </span>
                  <p className="je-detail-text">{data.reference}</p>
                </div>
              )}
              <div className="je-detail-block">
                <span className="je-detail-label">Status</span>
                <p className="je-detail-text">
                  <span className={`je-badge ${statusClass[data.status] || 'je-badge--draft'}`}>
                    {data.status}
                  </span>
                </p>
              </div>
              <div className="je-detail-block">
                <span className="je-detail-label">Description</span>
                <p className="je-detail-text je-detail-text--long">
                  {data.description?.trim() || '—'}
                </p>
              </div>
              <div className="je-detail-totals">
                <div>
                  <span className="je-detail-label">Total debits</span>
                  <span className="je-amount je-amount--debit">
                    {(data.totalDebits || 0).toLocaleString('fr-FR')} {data.currencyCode || 'XAF'}
                  </span>
                </div>
                <div>
                  <span className="je-detail-label">Total credits</span>
                  <span className="je-amount je-amount--credit">
                    {(data.totalCredits || 0).toLocaleString('fr-FR')} {data.currencyCode || 'XAF'}
                  </span>
                </div>
              </div>
            </section>

            <section className="je-detail-lines" aria-label="Lines">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <h3 className="je-detail-lines__title" style={{ margin: 0 }}>
                  <Table2 className="je-ic" style={{ width: 18, height: 18 }} />
                  Lines
                </h3>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="jem-btn-ghost"
                  disabled={isLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
              <div className="je-table-scroller" style={{ borderRadius: '0.5rem' }}>
                <table className="je-table je-detail-lines-table">
                  <thead className="je-thead">
                    <tr>
                      <th className="je-td-idx">#</th>
                      <th>Account</th>
                      <th>Line description</th>
                      <th className="je-numeric">Debit</th>
                      <th className="je-numeric">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="je-tbody">
                    {data.lines?.map((line, i) => (
                      <tr key={line.id}>
                        <td className="je-td-idx je-muted">{i + 1}</td>
                        <td>
                          <span className="je-mono-sm">{line.accountCode}</span>
                        </td>
                        <td className="je-detail-line-desc">
                          {line.description?.trim() || '—'}
                          {line.costCentre && <span className="je-detail-muted"> · CC: {line.costCentre}</span>}
                        </td>
                        <td className="je-amount je-amount--debit je-numeric">
                          {(line.debitAmount || 0) > 0 ? (line.debitAmount || 0).toLocaleString('fr-FR') : '—'}
                        </td>
                        <td className="je-amount je-amount--credit je-numeric">
                          {(line.creditAmount || 0) > 0 ? (line.creditAmount || 0).toLocaleString('fr-FR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </JemShellModal>
  );
};
