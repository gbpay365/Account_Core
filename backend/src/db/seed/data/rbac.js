// Roles mirror the user classes in SRS section 2.3 / section 9 personas.
export const PERMISSIONS = [
  ['coa.view', 'accounting', 'View chart of accounts'],
  ['coa.manage', 'accounting', 'Create / edit accounts and IFRS mappings'],
  ['journal.view', 'accounting', 'View journal entries and the general ledger'],
  ['journal.create', 'accounting', 'Capture draft journal entries'],
  ['journal.post', 'accounting', 'Post journal entries to the ledger'],
  ['journal.reverse', 'accounting', 'Reverse a posted entry'],
  ['journal.post_closed', 'accounting', 'Post into a closed period with a logged override reason'],
  ['period.view', 'accounting', 'View fiscal years and periods'],
  ['period.close', 'accounting', 'Close an accounting period'],
  ['period.lock', 'accounting', 'Lock an accounting period'],
  ['period.reopen', 'accounting', 'Reopen a closed period'],
  ['close.view', 'accounting', 'View the period-end close checklist'],
  ['close.update', 'accounting', 'Complete close checklist tasks'],
  ['close.signoff', 'accounting', 'Sign off the period close'],

  ['supplier.view', 'procurement', 'View suppliers'],
  ['supplier.manage', 'procurement', 'Create / edit suppliers'],
  ['po.view', 'procurement', 'View purchase orders'],
  ['po.create', 'procurement', 'Raise purchase orders'],
  ['po.approve', 'procurement', 'Approve purchase orders'],
  ['grn.create', 'procurement', 'Record goods receipts'],

  ['ap.view', 'payables', 'View supplier invoices'],
  ['ap.create', 'payables', 'Capture supplier invoices'],
  ['ap.approve', 'payables', 'Approve supplier invoices for payment'],
  ['ap.post', 'payables', 'Post supplier invoices to the ledger'],
  ['ap.pay', 'payables', 'Record supplier payments'],

  ['ar.view', 'receivables', 'View receivables and aging'],
  ['ar.manage', 'receivables', 'Post receivables and receipts'],

  ['bank.view', 'treasury', 'View bank accounts and statements'],
  ['bank.import', 'treasury', 'Import bank statements (CSV / MT940 / API)'],
  ['bank.reconcile', 'treasury', 'Match statement lines against the ledger'],
  ['fx.manage', 'treasury', 'Maintain exchange rates and run FX revaluation'],

  ['tax.view', 'tax', 'View VAT / TVA positions'],
  ['tax.declare', 'tax', 'Generate statutory tax declarations'],

  ['budget.view', 'budget', 'View budgets and variance reports'],
  ['budget.manage', 'budget', 'Enter and revise budgets'],
  ['budget.approve', 'budget', 'Approve budgets'],

  ['asset.view', 'assets', 'View the asset register'],
  ['asset.create', 'assets', 'Register new assets'],
  ['asset.edit', 'assets', 'Edit asset master data'],
  ['asset.tag', 'assets', 'Generate and print barcode / QR / RFID tags'],
  ['asset.capitalize', 'assets', 'Capitalize an asset and post the fixed-asset entry'],
  ['asset.commission', 'assets', 'Record installation and commissioning checks'],
  ['asset.move', 'assets', 'Transfer location, cost centre or custodian'],
  ['asset.dispose_request', 'assets', 'Request disposal or decommissioning'],
  ['asset.dispose_approve', 'assets', 'Approve and complete a disposal'],
  ['category.manage', 'assets', 'Maintain the asset classification taxonomy'],

  ['maint.plan.view', 'maintenance', 'View preventive maintenance plans'],
  ['maint.plan.manage', 'maintenance', 'Create / edit maintenance and calibration plans'],
  ['wo.view', 'maintenance', 'View work orders'],
  ['wo.request', 'maintenance', 'Raise a breakdown / repair request'],
  ['wo.approve', 'maintenance', 'Approve work orders'],
  ['wo.assign', 'maintenance', 'Assign work orders to technicians'],
  ['wo.execute', 'maintenance', 'Start, update and complete work orders'],
  ['wo.verify', 'maintenance', 'Verify and close completed work orders'],
  ['calibration.view', 'maintenance', 'View calibration status and certificates'],
  ['calibration.record', 'maintenance', 'Record calibration results'],
  ['safety.record', 'maintenance', 'Record electrical safety test results'],
  ['contract.view', 'maintenance', 'View warranties and service contracts'],
  ['contract.manage', 'maintenance', 'Maintain warranties and service contracts'],
  ['usage.record', 'maintenance', 'Log usage hours, mileage and downtime'],

  ['errand.view', 'services', 'View general-services errands'],
  ['errand.create', 'services', 'Raise a general-services errand'],
  ['errand.assign', 'services', 'Assign an errand to a technician'],
  ['errand.execute', 'services', 'Start and complete an assigned errand'],
  ['shop.view', 'services', 'View shopping lists'],
  ['shop.create', 'services', 'Create and edit shopping lists'],
  ['shop.buy', 'services', 'Mark shopping-list items bought or unavailable'],

  ['depr.view', 'depreciation', 'View depreciation schedules'],
  ['depr.run', 'depreciation', 'Simulate a depreciation run'],
  ['depr.post', 'depreciation', 'Post depreciation to the general ledger'],
  ['valuation.manage', 'depreciation', 'Record revaluations and impairment tests'],

  ['report.financial', 'reporting', 'Produce OHADA and IFRS financial statements'],
  ['report.asset', 'reporting', 'Produce asset, maintenance and calibration reports'],
  ['report.export', 'reporting', 'Export reports to PDF / Excel'],

  ['admin.users', 'admin', 'Manage users and roles'],
  ['admin.settings', 'admin', 'Manage organisation settings and country parameters'],
  ['admin.audit', 'admin', 'Read the action history / audit log'],
];

const ALL = PERMISSIONS.map(([code]) => code);

export const ROLES = [
  {
    code: 'system_admin',
    name: 'Administrateur systeme',
    name_en: 'System Administrator',
    description: 'Full platform access including user and parameter administration.',
    permissions: ALL,
  },
  {
    code: 'cfo',
    name: 'Directeur financier / Chef comptable',
    name_en: 'CFO / Chief Accountant',
    description:
      'Reviews entries, manages period close, approves consolidated OHADA and IFRS statements.',
    permissions: ALL.filter((p) => !p.startsWith('admin.users')),
  },
  {
    code: 'accounting_clerk',
    name: 'Agent comptable',
    name_en: 'Accounting Clerk',
    description: 'Captures day-to-day journal entries, invoices and payments.',
    permissions: [
      'coa.view', 'journal.view', 'journal.create', 'period.view', 'close.view',
      'supplier.view', 'supplier.manage', 'po.view', 'grn.create',
      'ap.view', 'ap.create', 'ar.view', 'bank.view', 'bank.import',
      'tax.view', 'budget.view', 'asset.view', 'depr.view',
      'report.financial', 'report.asset', 'report.export',
    ],
  },
  {
    code: 'biomedical_technician',
    name: 'Technicien biomedical',
    name_en: 'Biomedical Technician',
    description:
      'Performs preventive maintenance, calibration and electrical safety testing; closes work orders from a mobile device.',
    permissions: [
      'asset.view', 'asset.move', 'asset.tag', 'asset.commission',
      'maint.plan.view', 'wo.view', 'wo.request', 'wo.execute',
      'calibration.view', 'calibration.record', 'safety.record',
      'contract.view', 'usage.record', 'report.asset',
    ],
  },
  {
    code: 'asset_manager',
    name: 'Responsable patrimoine et services techniques',
    name_en: 'Facilities & Asset Manager',
    description:
      'Owns the asset register, schedules maintenance, tracks custody and location across wards.',
    permissions: [
      'coa.view', 'journal.view', 'supplier.view', 'po.view', 'ap.view',
      'asset.view', 'asset.create', 'asset.edit', 'asset.tag', 'asset.commission',
      'asset.move', 'asset.dispose_request', 'category.manage',
      'maint.plan.view', 'maint.plan.manage',
      'wo.view', 'wo.request', 'wo.approve', 'wo.assign', 'wo.verify',
      'calibration.view', 'calibration.record', 'safety.record',
      'contract.view', 'contract.manage', 'usage.record',
      'depr.view', 'budget.view', 'report.asset', 'report.export',
      'errand.view', 'errand.create', 'errand.assign',
      'shop.view', 'shop.create',
    ],
  },
  {
    code: 'general_services_technician',
    name: 'Technicien des services généraux',
    name_en: 'General Services Technician',
    description:
      'Runs errands and shopping lists (light IT hardware, fleet garage runs, electrical and network cabling) and can execute assigned work orders. No register, classification, calibration, safety, or reporting access.',
    permissions: [
      'wo.view', 'wo.request', 'wo.execute', 'usage.record',
      'errand.view', 'errand.create', 'errand.execute',
      'shop.view', 'shop.create', 'shop.buy',
    ],
  },
  {
    code: 'ward_head',
    name: 'Chef de service / Chef de salle',
    name_en: 'Ward / Department Head',
    description:
      'Custodian of assets assigned to their department; raises repair requests when equipment fails.',
    permissions: [
      'asset.view', 'wo.view', 'wo.request', 'calibration.view',
      'budget.view', 'report.asset', 'usage.record',
      'errand.view', 'errand.create',
    ],
  },
  {
    code: 'procurement_officer',
    name: 'Responsable des achats',
    name_en: 'Procurement Officer',
    description:
      'Manages purchase orders and supplier / warranty records feeding new assets into the register.',
    permissions: [
      'supplier.view', 'supplier.manage', 'po.view', 'po.create', 'po.approve',
      'grn.create', 'ap.view', 'ap.create',
      'asset.view', 'asset.create', 'contract.view', 'contract.manage',
      'budget.view', 'report.asset', 'report.export',
    ],
  },
  {
    code: 'auditor',
    name: 'Auditeur / Administrateur hospitalier',
    name_en: 'Hospital Administrator / Auditor',
    description: 'Read-only oversight of financial and asset compliance.',
    permissions: [
      'coa.view', 'journal.view', 'period.view', 'close.view',
      'supplier.view', 'po.view', 'ap.view', 'ar.view', 'bank.view',
      'tax.view', 'budget.view', 'asset.view',
      'maint.plan.view', 'wo.view', 'calibration.view', 'contract.view',
      'depr.view', 'report.financial', 'report.asset', 'report.export',
      'admin.audit',
    ],
  },
];
