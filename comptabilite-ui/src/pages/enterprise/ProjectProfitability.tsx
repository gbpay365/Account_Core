import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import { getStoredCompanyId } from '../../lib/companyContext';
import { useFiscalYear } from '../../hooks/useFiscalYear';

interface Project {
  projectId: string;
  projectName: string;
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
}

const ProjectProfitability: React.FC = () => {
  const { fiscalYear, loading: yearLoading } = useFiscalYear();
  const [data, setData] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      setLoading(true);
      const res = await api.get(`/reports/project-profitability?companyId=${companyId}&fiscalYear=${fiscalYear}`);
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [fiscalYear]);

  useEffect(() => { if (!yearLoading) loadData(); }, [loadData, yearLoading]);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>💎 Project Profitability</h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>Real-time revenue vs. expense by analytical project</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={loadData} disabled={loading}>↻ Refresh</button>
          <div className="fiscal-badge" style={{ background: 'var(--color-primary)', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '0.85rem' }}>
            FY {fiscalYear}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div className="glass-panel" style={{ padding: '28px' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>Project</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Expenses</th>
                <th style={{ textAlign: 'right' }}>Net Profit</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.map(p => (
                <tr key={p.projectId}>
                  <td>{p.projectName}</td>
                  <td style={{ textAlign: 'right' }}>{p.totalRevenue.toLocaleString('fr-FR', { style: 'currency', currency: 'XAF' })}</td>
                  <td style={{ textAlign: 'right' }}>{p.totalExpense.toLocaleString('fr-FR', { style: 'currency', currency: 'XAF' })}</td>
                  <td style={{ textAlign: 'right', color: p.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {p.netProfit.toLocaleString('fr-FR', { style: 'currency', currency: 'XAF' })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {p.totalRevenue > 0 ? Math.round((p.netProfit / p.totalRevenue) * 100) + '%' : '—'}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No project data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProjectProfitability;