import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalPortal } from '../components/ModalPortal';
import { JemShellModal } from '../components/jem/JemShellModal';
import '../components/JournalEntry/JournalEntryForm.css';
import api from '../api';

const Companies: React.FC = () => {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', taxId: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = () => {
    api.get('/companies')
      .then(res => { setCompanies(res.data); setLoading(false); })
      .catch(() => { setError(t('companies.load_failed')); setLoading(false); });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/companies', newCompany);
      setShowModal(false);
      setNewCompany({ name: '', taxId: '' });
      loadCompanies();
    } catch {
      setError(t('companies.create_failed'));
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'28px' }}>
        <div>
          <h1 style={{ margin:0, fontSize:'1.8rem' }}>🏢 {t('common.companies')}</h1>
          <p style={{ margin:'6px 0 0', color:'var(--text-muted)' }}>{t('companies.subtitle')}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-glow">+ {t('companies.new_company')}</button>
      </div>

      {error && <div className="glass-panel" style={{ padding:'20px', color:'var(--color-danger)', marginBottom:'24px' }}>⚠️ {error}</div>}

      {loading ? (
        <div className="glass-panel" style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)' }}>
          <div style={{ fontSize:'2rem' }}>⏳</div><p>{t('common.loading')}</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'20px' }}>
          {companies.map(c => (
            <div key={c.id} className="glass-panel" style={{ padding:'24px', transition:'transform 0.2s ease', cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              <div style={{ display:'flex', alignItems:'center', gap:'16px', marginBottom:'16px' }}>
                <div style={{ width:'48px', height:'48px', borderRadius:'12px', background:'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
                  display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'1.2rem', fontWeight:700 }}>
                  {c.name.charAt(0)}
                </div>
                <div>
                  <h3 style={{ margin:0, fontSize:'1.2rem', color:'var(--text-main)' }}>{c.name}</h3>
                  <div style={{ fontSize:'0.85rem', color:'var(--text-muted)', fontFamily:'monospace', marginTop:'4px' }}>NIU: {c.taxId || t('companies.not_set')}</div>
                </div>
              </div>
              <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
                {t('companies.registered')}: {new Date(c.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <JemShellModal
            title={t('companies.modal_title')}
            subtitle={t('companies.subtitle')}
            onClose={() => setShowModal(false)}
            size="sm"
            pill="TEN"
            footer={
              <>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" form="new-company-form" className="jem-btn-primary">
                  {t('common.create')}
                </button>
              </>
            }
          >
            <form id="new-company-form" onSubmit={handleCreate} style={{ display: 'grid', gap: 14 }}>
              <div className="jem-input-group">
                <span className="jem-label">{t('companies.form_name')}</span>
                <input
                  required
                  className="jem-field"
                  type="text"
                  value={newCompany.name}
                  onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                />
              </div>
              <div className="jem-input-group">
                <span className="jem-label">{t('companies.form_taxid')}</span>
                <input
                  className="jem-field jem-mono"
                  type="text"
                  value={newCompany.taxId}
                  onChange={(e) => setNewCompany({ ...newCompany, taxId: e.target.value })}
                />
              </div>
            </form>
          </JemShellModal>
        </ModalPortal>
      )}
    </div>
  );
};

export default Companies;
