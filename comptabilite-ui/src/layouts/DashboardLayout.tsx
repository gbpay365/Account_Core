import React, { useState, useEffect, useContext } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import { authService } from '../services/authService';
import { PermissionContext } from '../contexts/PermissionContext';
import { useTranslation } from 'react-i18next';
import { getStoredCompanyId, setStoredCompanyId } from '../lib/companyContext';
import './DashboardLayout.css';

const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { hasPermission } = useContext(PermissionContext);
  const [companyBootstrapped, setCompanyBootstrapped] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ fullName: string; roleName?: string; username?: string } | null>(null);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    workspace: true,
    reporting: true,
    modules: true,
    erp: true,
    hr: true,
    config: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const isActive = (path: string) => (location.pathname === path ? 'active' : '');
  const isActiveModule = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`) ? 'active' : '';

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!authService.isAuthenticated()) return;
    authService.getMe()
      .then((me) => setCurrentUser({ fullName: me.fullName, roleName: me.roleName, username: me.username }))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!authService.isAuthenticated()) return;
    api.get('/companies')
      .then((res) => {
        const companies = Array.isArray(res.data) ? res.data : [];
        if (companies.length === 0) {
          setStoredCompanyId('');
          return;
        }

        const stored = getStoredCompanyId();
        const exists = stored && companies.some((c: { id?: unknown }) => String(c.id || '') === stored);
        if (!exists) setStoredCompanyId(String(companies[0].id || ''));
      })
      .catch(console.error)
      .finally(() => setCompanyBootstrapped(true));
  }, []);

  if (!companyBootstrapped) {
    return (
      <div className="dashboard-layout">
        <div className="glass-panel" style={{ margin: '48px auto', padding: '28px', maxWidth: 560, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading company…
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-top-header">
          <div className="header-logo-icon">♡</div>
          <div className="header-text">
            <h2>ZAIZEN</h2>
            <span>FINANCIAL INTELLIGENCE</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          
          {/* WORKSPACE */}
          <div className="category-group">
            <div className="category-header" onClick={() => toggleSection('workspace')}>
              <div className="category-header-left">
                <span className="category-icon">⌂</span>
                <div className="category-title-wrap">
                  <span className="category-title">{t('common.workspace')}</span>
                  <span className="category-subtitle">{t('common.live_ops')}</span>
                </div>
              </div>
              <span className={`category-arrow ${expandedSections.workspace ? 'open' : ''}`}>^</span>
            </div>
            <div className={`category-links ${expandedSections.workspace ? 'open' : ''}`}>
              <div className="category-links-inner">
                <Link to="/" className={`nav-link ${isActive('/')}`}>
                  <span className="link-icon">⊞</span> {t('common.dashboard')}
                </Link>
                <Link to="/journal" className={`nav-link ${isActive('/journal')}`}>
                  <span className="link-icon">📝</span> {t('common.journal')}
                </Link>
                <Link to="/journals" className={`nav-link ${isActive('/journals')}`}>
                  <span className="link-icon">📒</span> {t('journals.nav')}
                </Link>
                <Link to="/accounts" className={`nav-link ${isActive('/accounts')}`}>
                  <span className="link-icon">⊩</span> {t('common.accounts')}
                </Link>
                <Link to="/reconciliation" className={`nav-link ${isActive('/reconciliation')}`}>
                  <span className="link-icon">🔗</span> {t('reconciliation.nav')}
                </Link>
                <Link to="/fixed-assets" className={`nav-link ${isActive('/fixed-assets')}`}>
                  <span className="link-icon">🏗️</span> {t('assets.nav')}
                </Link>
                <Link to="/cost-centers" className={`nav-link ${isActive('/cost-centers')}`}>
                  <span className="link-icon">▦</span> {t('common.cost_centers', 'Cost centres')}
                </Link>
                <Link to="/trial-balance" className={`nav-link ${isActive('/trial-balance')}`}>
                  <span className="link-icon">⇄</span> {t('trial_balance.title')}
                </Link>
              </div>
            </div>
          </div>

          {/* REPORTING */}
          <div className="category-group">
            <div className="category-header" onClick={() => toggleSection('reporting')}>
              <div className="category-header-left">
                <span className="category-icon">📊</span>
                <div className="category-title-wrap">
                  <span className="category-title">{t('common.reporting')}</span>
                  <span className="category-subtitle">{t('common.financial_statements')}</span>
                </div>
              </div>
              <span className={`category-arrow ${expandedSections.reporting ? 'open' : ''}`}>^</span>
            </div>
            <div className={`category-links category-links--tall ${expandedSections.reporting ? 'open' : ''}`}>
              <div className="category-links-inner">
                <Link to="/reporting" className={`nav-link ${isActiveModule('/reporting')}`}>
                  <span className="link-icon">📑</span> {t('common.report_catalog')}
                </Link>
                <Link to="/trial-balance" className={`nav-link ${isActive('/trial-balance')}`}>
                  <span className="link-icon">⚖️</span> {t('trial_balance.title')}
                </Link>
                <Link to="/general-ledger" className={`nav-link ${isActive('/general-ledger')}`}>
                  <span className="link-icon">📖</span> {t('general_ledger.nav')}
                </Link>
                <Link to="/income-statement" className={`nav-link ${isActive('/income-statement')}`}>
                  <span className="link-icon">📉</span> {t('common.income_statement')}
                </Link>
                <Link to="/balance-sheet" className={`nav-link ${isActive('/balance-sheet')}`}>
                  <span className="link-icon">🏛️</span> {t('common.balance_sheet')}
                </Link>
                <Link to="/cash-flow" className={`nav-link ${isActive('/cash-flow')}`}>
                  <span className="link-icon">💸</span> {t('common.cash_flow')}
                </Link>
                <Link to="/notes" className={`nav-link ${isActive('/notes')}`}>
                  <span className="link-icon">📑</span> {t('nav.notes_annexes')}
                </Link>
                <Link to="/ecf" className={`nav-link ${isActive('/ecf')}`}>
                  <span className="link-icon">📋</span> {t('nav.ecf')}
                </Link>
                <Link to="/enterprise/compliance" className={`nav-link nav-link--highlight ${isActiveModule('/enterprise/compliance')}`}>
                  <span className="link-icon">🛡️</span> {t('compliance_hub.title')}
                </Link>
              </div>
            </div>
          </div>

          {/* MODULES — enterprise extensions */}
          <div className="category-group">
            <div className="category-header" onClick={() => toggleSection('modules')}>
              <div className="category-header-left">
                <span className="category-icon">🧩</span>
                <div className="category-title-wrap">
                  <span className="category-title">{t('common.modules')}</span>
                  <span className="category-subtitle">{t('common.crm_subtitle')}</span>
                </div>
              </div>
              <span className={`category-arrow ${expandedSections.modules ? 'open' : ''}`}>^</span>
            </div>
            <div className={`category-links ${expandedSections.modules ? 'open' : ''}`}>
              <div className="category-links-inner">
                <Link to="/enterprise/crm" className={`nav-link ${isActiveModule('/enterprise/crm')}`}>
                  <span className="link-icon">🤝</span> {t('common.crm')}
                </Link>
                <Link to="/enterprise/warehouse" className={`nav-link ${isActiveModule('/enterprise/warehouse')}`}>
                  <span className="link-icon">🏢</span> {t('common.warehouse')}
                </Link>
                <Link to="/enterprise/project-profitability" className={`nav-link ${isActiveModule('/enterprise/project-profitability')}`}>
                  <span className="link-icon">💎</span> {t('common.project_profitability')}
                </Link>
                <Link to="/enterprise/portals" className={`nav-link ${isActiveModule('/enterprise/portals')}`}>
                  <span className="link-icon">🔗</span> {t('common.portal_access')}
                </Link>
              </div>
            </div>
          </div>

          {/* ERP & COMMERCIAL */}
          <div className="category-group">
            <div className="category-header" onClick={() => toggleSection('erp')}>
              <div className="category-header-left">
                <span className="category-icon">🛍️</span>
                <div className="category-title-wrap">
                  <span className="category-title">{t('common.erp_commercial')}</span>
                  <span className="category-subtitle">{t('common.sales_inventory')}</span>
                </div>
              </div>
              <span className={`category-arrow ${expandedSections.erp ? 'open' : ''}`}>^</span>
            </div>
            <div className={`category-links ${expandedSections.erp ? 'open' : ''}`}>
              <div className="category-links-inner">
                <Link to="/products" className={`nav-link ${isActive('/products')}`}>
                  <span className="link-icon">📦</span> {t('common.products')}
                </Link>
                <Link to="/customers" className={`nav-link ${isActive('/customers')}`}>
                  <span className="link-icon">👥</span> {t('common.customers')}
                </Link>
                <Link to="/suppliers" className={`nav-link ${isActive('/suppliers')}`}>
                  <span className="link-icon">🏬</span> {t('common.suppliers')}
                </Link>
                <Link to="/sales" className={`nav-link ${isActive('/sales')}`}>
                  <span className="link-icon">💰</span> {t('common.sales_invoices')}
                </Link>
                <Link to="/ap-invoices" className={`nav-link ${isActive('/ap-invoices')}`}>
                  <span className="link-icon">📄</span> {t('common.ap_invoices')}
                </Link>
              </div>
            </div>
          </div>

          {/* Employees & Payroll */}
          <div className="category-group">
            <div className="category-header" onClick={() => toggleSection('hr')}>
              <div className="category-header-left">
                <span className="category-icon">👥</span>
                <div className="category-title-wrap">
                  <span className="category-title">{t('common.hr_payroll')}</span>
                </div>
              </div>
              <span className={`category-arrow ${expandedSections.hr ? 'open' : ''}`}>^</span>
            </div>
            <div className={`category-links ${expandedSections.hr ? 'open' : ''}`}>
              <div className="category-links-inner">
                <Link to="/employees" className={`nav-link ${isActive('/employees')}`}>
                  <span className="link-icon">👩‍💼</span> {t('common.employees')}
                </Link>
                <Link to="/payroll" className={`nav-link ${isActive('/payroll')}`}>
                  <span className="link-icon">💸</span> {t('common.payroll')}
                </Link>
              </div>
            </div>
          </div>

          {/* CONFIGURATION */}
          <div className="category-group">
            <div className="category-header" onClick={() => toggleSection('config')}>
              <div className="category-header-left">
                <span className="category-icon">⚙️</span>
                <div className="category-title-wrap">
                  <span className="category-title">{t('common.configuration')}</span>
                  <span className="category-subtitle">{t('common.system_settings')}</span>
                </div>
              </div>
              <span className={`category-arrow ${expandedSections.config ? 'open' : ''}`}>^</span>
            </div>
            <div className={`category-links category-links--tall ${expandedSections.config ? 'open' : ''}`}>
              <div className="category-links-inner">
                <Link to="/accounts" className={`nav-link ${isActive('/accounts')}`}>
                  <span className="link-icon">📋</span> {t('common.accounts')}
                </Link>
                <Link to="/cost-centers" className={`nav-link ${isActive('/cost-centers')}`}>
                  <span className="link-icon">▦</span> {t('common.cost_centers', 'Cost centres')}
                </Link>
                <Link to="/tax" className={`nav-link ${isActive('/tax')}`}>
                  <span className="link-icon">🧮</span> {t('common.tax')}
                </Link>
                <Link to="/companies" className={`nav-link ${isActive('/companies')}`}>
                  <span className="link-icon">🏢</span> {t('common.companies')}
                </Link>
                <Link to="/settings" className={`nav-link ${isActive('/settings')}`}>
                  <span className="link-icon">⚙️</span> {t('settings.nav')}
                </Link>
                <Link to="/integrations" className={`nav-link ${isActive('/integrations')}`}>
                  <span className="link-icon">🔌</span> {t('integrations.nav', 'Integrations')}
                </Link>
                <Link to="/audit-log" className={`nav-link ${isActive('/audit-log')}`}>
                  <span className="link-icon">🔍</span> {t('audit_log.nav')}
                </Link>
                <Link to="/rules" className={`nav-link ${isActive('/rules')}`}>
                  <span className="link-icon">⚡</span> {t('rules.nav')}
                </Link>
                <Link to="/billing" className={`nav-link ${isActive('/billing')}`}>
                  <span className="link-icon">💳</span> {t('billing.nav')}
                </Link>
                {hasPermission('access', 'read') && (
                  <Link to="/access-management" className={`nav-link ${isActive('/access-management')}`}>
                    <span className="link-icon">🔑</span> {t('common.access_mgmt')}
                  </Link>
                )}
              </div>
            </div>
          </div>

        </nav>
      </aside>
      <main className="main-content">
        <header className="top-header">
          <div className="search-bar">
            <input type="text" placeholder={t('common.search')} />
          </div>
          <div className="user-profile">
            <Link
              to="/account"
              title={t('settings.change_password', 'Change password')}
              style={{ color: 'inherit', textDecoration: 'none', marginRight: 12 }}
            >
              {currentUser?.fullName || t('common.user')}
              {currentUser?.roleName ? ` · ${currentUser.roleName}` : ''}
            </Link>
            <Link to="/account" className="logout-btn" style={{ textDecoration: 'none', marginRight: 8 }}>
              {t('account.change_password_short', 'Password')}
            </Link>
            <button onClick={handleLogout} className="logout-btn">{t('common.logout')}</button>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
