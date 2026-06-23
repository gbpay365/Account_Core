import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { payrollApi } from '../../api';
import { getStoredCompanyId } from '../../lib/companyContext';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  position?: string;
  positionEn?: string;
  department?: string;
  hireDate?: string;
  isActive?: boolean;
  externalEmployeeCode?: string;
}

const Employees: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const isEn = i18n.language.startsWith('en');

  const loadEmployees = useCallback(async () => {
    const companyId = getStoredCompanyId();
    if (!companyId) return;
    try {
      const res = await payrollApi.getEmployees(companyId);
      const raw = Array.isArray(res.data) ? res.data : [];
      setEmployees(
        raw.map((e: Record<string, unknown>) => ({
          id: String(e.id ?? e.Id ?? ''),
          firstName: String(e.firstName ?? e.FirstName ?? ''),
          lastName: String(e.lastName ?? e.LastName ?? ''),
          email: String(e.email ?? e.Email ?? ''),
          position: String(e.position ?? e.Position ?? ''),
          positionEn: String(e.positionEn ?? e.PositionEn ?? ''),
          department: String(e.department ?? e.Department ?? ''),
          hireDate: e.hireDate ? String(e.hireDate) : e.HireDate ? String(e.HireDate) : undefined,
          isActive: e.isActive !== false && e.IsActive !== false,
          externalEmployeeCode: String(e.externalEmployeeCode ?? e.ExternalEmployeeCode ?? ''),
        }))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>👩‍💼 {t('hr.employees_title')}</h1>
        <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)' }}>{t('hr.employees_readonly_hint')}</p>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('hr.loading')}
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '28px' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t('hr.name')}</th>
                <th>{t('hr.position')}</th>
                <th>{t('hr.department', { defaultValue: 'Department' })}</th>
                <th>{t('hr.email')}</th>
                <th>{t('hr.matricule', { defaultValue: 'Matricule' })}</th>
                <th>{t('settings.status', { defaultValue: 'Status' })}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.firstName} {e.lastName}
                  </td>
                  <td>{(isEn ? e.positionEn : e.position) || e.position || '—'}</td>
                  <td>{e.department || '—'}</td>
                  <td>{e.email || '—'}</td>
                  <td>{e.externalEmployeeCode || '—'}</td>
                  <td>
                    {e.isActive === false ? (
                      <span style={{ color: 'var(--text-muted)' }}>{t('hr.inactive', { defaultValue: 'Inactive' })}</span>
                    ) : (
                      <span style={{ color: '#10b981' }}>{t('hr.active', { defaultValue: 'Active' })}</span>
                    )}
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('hr.no_employees')}
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

export default Employees;
