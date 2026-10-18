"""
Importing this package registers every route with NiceGUI.

Order matters only in that `/assets/{id}` must be declared after `/assets`.
"""

from . import (  # noqa: F401
    login,
    dashboard,
    accounts,
    journal,
    ledger,
    periods,
    assets,
    categories,
    maintenance,
    technician,
    services,
    depreciation,
    reports,
    audit,
    bank_reconciliation,
    withholding_tax,
    dsf_reports,
    fiscal_depreciation,
    asset_inventory,
    donor_projects,
    cash_registers,
    payroll,
    dfe_invoicing,
    leases,
    admin,
    user_guide,
)
