import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { rulesApi } from '../api';
import { getStoredCompanyId } from '../lib/companyContext';
import { showToast } from '../utils/dialogs';

const TRIGGER_EVENTS = ['create', 'submit', 'validate'];
const ACTIONS = ['reject', 'require_approval'];
const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains'];

const RulesValidators: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<any[]>([]);
  const [fieldCatalog, setFieldCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', triggerEvent: 'validate', action: 'reject',
    errorMessage: '', priority: 100,
    conditions: [{ field: 'max_amount', operator: 'gt', value: '' }]
  });

  const companyId = getStoredCompanyId();

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [rRes, cRes] = await Promise.all([
        rulesApi.list(companyId),
        rulesApi.getFieldCatalog(),
      ]);
      setRules(rRes.data);
      setFieldCatalog(cRes.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    try {
      await rulesApi.create({ ...form, companyId });
      setShowForm(false);
      setForm({
        name: '', description: '', triggerEvent: 'validate', action: 'reject',
        errorMessage: '', priority: 100,
        conditions: [{ field: 'max_amount', operator: 'gt', value: '' }]
      });
      showToast(t('rules.created'), 'success');
      load();
    } catch { showToast(t('rules.create_failed'), 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !confirm(t('rules.confirm_delete'))) return;
    await rulesApi.delete(id, companyId);
    load();
  };

  const handleSeed = async () => {
    if (!companyId) return;
    await rulesApi.seedDefaults(companyId);
    showToast(t('rules.seeded'), 'success');
    load();
  };

  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: 'max_amount', operator: 'gt', value: '' }] }));
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>⚡ {t('rules.title')}</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{t('rules.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="jem-btn-ghost" onClick={handleSeed}>{t('rules.seed_defaults')}</button>
          <button className="btn-glow" onClick={() => setShowForm(true)}>+ {t('rules.new')}</button>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: 60, textAlign: 'center' }}>{t('common.loading')}</div>
      ) : rules.length === 0 ? (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('rules.empty')} <button className="btn-glow" style={{ marginLeft: 12 }} onClick={handleSeed}>{t('rules.seed_defaults')}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rules.map((rule: any) => (
            <div key={rule.id} className="glass-panel" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{rule.name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{rule.description}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.15)' }}>
                      {t('rules.trigger')}: {rule.triggerEvent}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 8, background: 'rgba(251,191,36,0.15)' }}>
                      {t('rules.action')}: {rule.action}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
                      P{rule.priority}
                    </span>
                  </div>
                </div>
                <button className="jem-btn-ghost" onClick={() => handleDelete(rule.id)}>{t('common.delete')}</button>
              </div>
              {rule.conditions?.length > 0 && (
                <div style={{ marginTop: 14, fontSize: '0.85rem' }}>
                  <strong>{t('rules.conditions')}:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                    {rule.conditions.map((c: any, i: number) => (
                      <li key={i}><code>{c.field}</code> {c.operator} <code>{c.value}</code></li>
                    ))}
                  </ul>
                </div>
              )}
              {rule.errorMessage && (
                <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--color-danger)' }}>{rule.errorMessage}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflow: 'auto', padding: 24 }}>
          <div className="glass-panel" style={{ padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <h3>{t('rules.new')}</h3>
            <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12 }}>
              <input placeholder={t('common.label')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              <input placeholder={t('rules.description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <select value={form.triggerEvent} onChange={e => setForm({ ...form, triggerEvent: e.target.value })}>
                  {TRIGGER_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
                <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
                  {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <input placeholder={t('rules.error_message')} value={form.errorMessage} onChange={e => setForm({ ...form, errorMessage: e.target.value })} required />
              <input type="number" placeholder={t('rules.priority')} value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 100 })} />

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong>{t('rules.conditions')}</strong>
                  <button type="button" className="jem-btn-ghost" onClick={addCondition}>+ {t('rules.add_condition')}</button>
                </div>
                {form.conditions.map((c, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <select value={c.field} onChange={e => {
                      const conditions = [...form.conditions];
                      conditions[i] = { ...c, field: e.target.value };
                      setForm({ ...form, conditions });
                    }}>
                      {(fieldCatalog.length ? fieldCatalog : [{ field: 'max_amount' }]).map((f: any) => (
                        <option key={f.field} value={f.field}>{f.label || f.field}</option>
                      ))}
                    </select>
                    <select value={c.operator} onChange={e => {
                      const conditions = [...form.conditions];
                      conditions[i] = { ...c, operator: e.target.value };
                      setForm({ ...form, conditions });
                    }}>
                      {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input placeholder={t('rules.value')} value={c.value} onChange={e => {
                      const conditions = [...form.conditions];
                      conditions[i] = { ...c, value: e.target.value };
                      setForm({ ...form, conditions });
                    }} required />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="jem-btn-ghost" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-glow">{t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RulesValidators;
