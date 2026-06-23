import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PermissionProvider } from '../contexts/PermissionContext';
import { ProtectedRoute } from '../components/ProtectedRoute';
import DashboardLayout from '../layouts/DashboardLayout';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import BalanceSheet from '../pages/BalanceSheet';
import IncomeStatement from '../pages/IncomeStatement';
import CashFlow from '../pages/CashFlow';
import JournalEntries from '../pages/JournalEntries';
import Ecf from '../pages/Ecf';
import TrialBalance from '../pages/TrialBalance';
import ChartOfAccounts from '../pages/ChartOfAccounts';
import CostCenters from '../pages/CostCenters';
import TaxCalculation from '../pages/TaxCalculation';
import Companies from '../pages/Companies';
import NotesAnnexes from '../pages/NotesAnnexes';
import ReportingModule from '../pages/ReportingModule';
import Unauthorized from '../pages/Unauthorized';

import Products from '../pages/erp/Products';
import Customers from '../pages/erp/Customers';
import Suppliers from '../pages/erp/Suppliers';
import Sales from '../pages/erp/Sales';
import SupplierInvoices from '../pages/erp/SupplierInvoices';
import FixedAssets from '../pages/FixedAssets';

import Employees from '../pages/hr/Employees';
import Payroll from '../pages/hr/Payroll';

import AccessManagement from '../pages/AccessManagement';
import MyAccount from '../pages/MyAccount';
import Settings from '../pages/Settings';
import IntegrationsSettings from '../pages/IntegrationsSettings';
import Journals from '../pages/Journals';
import GeneralLedger from '../pages/GeneralLedger';
import Reconciliation from '../pages/Reconciliation';
import AuditLog from '../pages/AuditLog';
import Billing from '../pages/Billing';
import RulesValidators from '../pages/RulesValidators';
import CrmPipeline from '../pages/enterprise/CrmPipeline';
import WarehouseManagement from '../pages/enterprise/WarehouseManagement';
import ProjectProfitability from '../pages/enterprise/ProjectProfitability';
import PortalAccess from '../pages/enterprise/PortalAccess';
import Procurement from '../pages/enterprise/Procurement';
import ComplianceHub from '../pages/enterprise/ComplianceHub';
import DocumentManagement from '../pages/enterprise/DocumentManagement';

export const AppRoutes = () => {
  return (
    <BrowserRouter>
      <PermissionProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Protected layout — DashboardLayout renders <Outlet /> for children */}
          <Route
            element={
              <ProtectedRoute requiredResource="dashboard" requiredAction="read">
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/journal" element={<JournalEntries />} />
            <Route path="/journals" element={<Journals />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/general-ledger" element={<GeneralLedger />} />
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/rules" element={<RulesValidators />} />
            <Route path="/account" element={<MyAccount />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/integrations" element={<IntegrationsSettings />} />
            <Route
              path="/ecf"
              element={
                <ProtectedRoute requiredResource="ecf" requiredAction="read" redirectTo="/unauthorized">
                  <Ecf />
                </ProtectedRoute>
              }
            />
            <Route path="/reporting" element={<ReportingModule />} />
            <Route path="/trial-balance" element={<TrialBalance />} />
            <Route path="/income-statement" element={<IncomeStatement />} />
            <Route path="/balance-sheet" element={<BalanceSheet />} />
            <Route path="/cash-flow" element={<CashFlow />} />
            <Route path="/notes" element={<NotesAnnexes />} />
            <Route path="/accounts" element={<ChartOfAccounts />} />
            <Route path="/cost-centers" element={<CostCenters />} />
            <Route path="/tax" element={<TaxCalculation />} />
            <Route path="/companies" element={<Companies />} />
            <Route
              path="/access-management"
              element={
                <ProtectedRoute requiredResource="access" requiredAction="read" redirectTo="/unauthorized">
                  <AccessManagement />
                </ProtectedRoute>
              }
            />

            {/* Enterprise modules (sidebar MODULES) */}
            <Route path="/enterprise/crm" element={<CrmPipeline />} />
            <Route path="/enterprise/warehouse" element={<WarehouseManagement />} />
            <Route path="/enterprise/project-profitability" element={<ProjectProfitability />} />
            <Route path="/enterprise/portals" element={<PortalAccess />} />
            <Route path="/enterprise/procurement" element={<Procurement />} />
            <Route path="/enterprise/compliance" element={<ComplianceHub />} />
            <Route path="/enterprise/documents" element={<DocumentManagement />} />

            {/* ERP Modules */}
            <Route path="/products" element={<Products />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/ap-invoices" element={<SupplierInvoices />} />
            <Route path="/fixed-assets" element={<FixedAssets />} />

            {/* HR & Payroll Modules */}
            <Route path="/employees" element={<Employees />} />
            <Route path="/payroll" element={<Payroll />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PermissionProvider>
    </BrowserRouter>
  );
};
