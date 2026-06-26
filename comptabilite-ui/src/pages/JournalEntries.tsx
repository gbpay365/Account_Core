import React, { useState, useMemo } from 'react';
import { Plus, RefreshCw, Eye } from 'lucide-react';
import { ModalPortal } from '../components/ModalPortal';
import { useJournalEntries, usePostJournalEntry, useVoidJournalEntry } from '../hooks/useJournalEntry';
import { JournalEntryForm, JournalEntryDetailModal } from '../components/JournalEntry';
import { showToast, showConfirm } from '../utils/dialogs';
import type { JournalStatus } from '../types/journalEntry';
import './JournalEntries.css';
import '../components/JournalEntry/JournalEntryForm.css';

const badgeForStatus: Record<JournalStatus, string> = {
  Draft: 'je-badge--draft',
  Validated: 'je-badge--validated',
  Posted: 'je-badge--posted',
  Voided: 'je-badge--voided',
  Reversed: 'je-badge--reversed',
};

const JournalEntries: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('');

  const { data: entries, isLoading, error, refetch, isFetching } = useJournalEntries(
    filterType ? { type: filterType } : undefined
  );

  const postMutation = usePostJournalEntry();
  const voidMutation = useVoidJournalEntry();

  const listAggregates = useMemo(() => {
    if (!entries?.length) return { count: 0, xaf: 0 };
    return {
      count: entries.length,
      xaf: entries.reduce((s, e) => s + (Number(e.totalDebits) || 0), 0),
    };
  }, [entries]);

  const handlePost = async (id: string) => {
    if (!(await showConfirm('Post this journal entry? This action cannot be undone.'))) return;
    try {
      await postMutation.mutateAsync(id);
      showToast('Journal entry posted successfully.', 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      showToast('Post failed: ' + (e.response?.data?.error || e.message), 'error');
    }
  };

  const handleVoid = async (id: string) => {
    if (!(await showConfirm('Void this journal entry? This action cannot be undone.'))) return;
    try {
      await voidMutation.mutateAsync(id);
      showToast('Journal entry voided.', 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      showToast('Void failed: ' + (e.response?.data?.error || e.message), 'error');
    }
  };

  return (
    <div className="je-page">
      <div className="je-card">
        <div className="je-hero">
          <div className="je-hero__row">
            <div className="je-mark" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <h1>Journal Entries</h1>
              <p>
                Sage GL Engine: Manage and audit your financial transactions
              </p>
            </div>
          </div>
        </div>

        <div className="je-toolbar">
          <button
            type="button"
            className="je-btn je-btn--primary"
            onClick={() => setShowModal(true)}
          >
            <Plus className="je-ic" strokeWidth={2.5} aria-hidden />
            + New Entry
          </button>
          <label className="je-select-wrap">
            <span className="je-sr">Filter by type</span>
            <select
              className="je-select"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="JNL">Standard (JNL)</option>
              <option value="RJE">Recurring (RJE)</option>
              <option value="REV">Reversal (REV)</option>
            </select>
          </label>
          <button
            type="button"
            className="je-btn je-btn--ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh list"
          >
            <RefreshCw
              className={isFetching ? 'je-ic je-icon-spin' : 'je-ic'}
              strokeWidth={2.5}
              aria-hidden
            />
            Refresh
          </button>
          {entries && entries.length > 0 && (
            <p className="je-stat">
              <strong>{listAggregates.count}</strong> entr
              {listAggregates.count === 1 ? 'y' : 'ies'} —{' '}
              <strong>
                {listAggregates.xaf.toLocaleString('fr-FR')}
                <span className="je-stat__unit">XAF</span>
              </strong>
            </p>
          )}
        </div>

        <div className="je-content">
          {isLoading ? (
            <div className="je-loading">
              <div className="je-loading__shimmer" role="status" />
              <span>Loading journal entries…</span>
            </div>
          ) : error ? (
            <div className="je-error" role="alert">
              Could not load entries. Check your connection and try again.
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="je-empty">
              <h2>No entries found</h2>
              <p>Start by creating a new journal entry.</p>
              <button
                type="button"
                className="je-btn je-btn--primary"
                onClick={() => setShowModal(true)}
              >
                <Plus className="je-ic" strokeWidth={2.5} aria-hidden />
                Create first entry
              </button>
            </div>
          ) : (
            <div className="je-table-scroller">
              <table className="je-table">
                <thead className="je-thead">
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th className="je-numeric">Debits (XAF)</th>
                    <th className="je-numeric">Credits (XAF)</th>
                    <th className="je-center">Status</th>
                    <th className="je-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="je-tbody">
                  {entries.map((entry, i) => (
                    <tr
                      key={entry.id}
                      className="je-row-anim"
                      style={{
                        animationDelay: `${Math.min(i * 40, 480)}ms`,
                      }}
                    >
                      <td>
                        <span className="je-ref">{entry.journalNumber}</span>
                      </td>
                      <td>
                        {new Date(entry.journalDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <span className="je-type-pill">{entry.journalType}</span>
                      </td>
                      <td
                        className="je-desc-cell"
                        title={
                          entry.description && entry.description !== '—' ? entry.description : undefined
                        }
                      >
                        {entry.description}
                      </td>
                      <td className="je-amount je-amount--debit">
                        {(Number(entry.totalDebits) || 0).toLocaleString('fr-FR')}
                      </td>
                      <td className="je-amount je-amount--credit">
                        {(Number(entry.totalCredits) || 0).toLocaleString('fr-FR')}
                      </td>
                      <td className="je-td-center">
                        <span
                          className={`je-badge ${
                            badgeForStatus[entry.status] || 'je-badge--draft'
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="je-td-center">
                        <div className="je-actions">
                          <button
                            type="button"
                            className="je-btn je-btn--view"
                            onClick={() => setViewEntryId(entry.id)}
                            title="View full journal (header and lines)"
                          >
                            <Eye className="je-ic" strokeWidth={2.5} aria-hidden />
                            View
                          </button>
                          {entry.status === 'Draft' && (
                            <button
                              type="button"
                              className="je-btn je-btn--action je-btn--post"
                              onClick={() => handlePost(entry.id)}
                            >
                              Post
                            </button>
                          )}
                          {entry.status === 'Posted' && (
                            <button
                              type="button"
                              className="je-btn je-btn--action je-btn--void"
                              onClick={() => handleVoid(entry.id)}
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ModalPortal>
          <div className="jem-backdrop jem-backdrop--journal">
            <div className="jem-backdrop__inner jem-backdrop__inner--journal">
              <JournalEntryForm
                onSuccess={() => {
                  setShowModal(false);
                  refetch();
                }}
                onCancel={() => setShowModal(false)}
              />
            </div>
          </div>
        </ModalPortal>
      )}

      {viewEntryId && (
        <ModalPortal>
          <JournalEntryDetailModal entryId={viewEntryId} onClose={() => setViewEntryId(null)} />
        </ModalPortal>
      )}
    </div>
  );
};

export default JournalEntries;
