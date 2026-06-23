import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';
import { useFiscalYear } from '../hooks/useFiscalYear';

const NotesAnnexes: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { fiscalYear, loading: yearLoading } = useFiscalYear();
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) {
      setError(t('notes_page.no_company'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.getNotes(fiscalYear, companyId, i18n.language);
      setNotes(res.data.notes ?? '');
    } catch {
      setError(t('notes_page.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [i18n.language, t, fiscalYear]);

  useEffect(() => {
    if (!yearLoading) loadNotes();
  }, [loadNotes, yearLoading]);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>📑 {t('nav.notes_annexes')}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{t('notes_page.subtitle')}</p>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem' }}>⏳</div>
          <p>{t('notes_page.loading')}</p>
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-danger)' }}>{error}</div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', background: 'white' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', fontFamily: 'var(--font-body)', lineHeight: '1.8', color: '#333', whiteSpace: 'pre-wrap' }}>
            {notes || t('notes_page.empty')}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesAnnexes;