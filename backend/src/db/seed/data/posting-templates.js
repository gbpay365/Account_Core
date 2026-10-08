/**
 * FR-DE-006 :: go-live posting templates (scenario catalogue).
 * account_rule is a SYSCOHADA prefix resolved to the first postable 4-character account.
 */
export const POSTING_TEMPLATES = [
  {
    code: 'SUPPLIER_INVOICE',
    name: 'Supplier invoice',
    name_en: 'Supplier invoice',
    transaction_type: 'supplier_invoice',
    journal_code: 'HA',
    lines: [
      { side: 'credit', account_rule: '4011', amount_formula: 'gross', third_party_rule: 'supplier', is_proposed: 1,
        note: 'Balances expense and recoverable VAT to the supplier collective account' },
    ],
  },
  {
    code: 'SUPPLIER_CREDIT_NOTE',
    name: 'Supplier credit note',
    name_en: 'Supplier credit note',
    transaction_type: 'supplier_credit_note',
    journal_code: 'HA',
    lines: [
      { side: 'debit', account_rule: '4011', amount_formula: 'gross', third_party_rule: 'supplier', is_proposed: 1,
        note: 'A credit on an expense is balanced on the supplier, never on revenue' },
    ],
  },
  {
    code: 'SALES_INVOICE',
    name: 'Patient / third-party invoice',
    name_en: 'Patient / third-party invoice',
    transaction_type: 'sales_invoice',
    journal_code: 'VT',
    lines: [
      { side: 'debit', account_rule: '4111', amount_formula: 'gross', third_party_rule: 'customer', is_proposed: 1,
        note: 'Receivable for services rendered' },
    ],
  },
  {
    code: 'CUSTOMER_RECEIPT',
    name: 'Customer receipt',
    name_en: 'Customer receipt',
    transaction_type: 'customer_receipt',
    journal_code: 'BQ',
    lines: [
      { side: 'credit', account_rule: '4111', amount_formula: 'gross', third_party_rule: 'customer', is_proposed: 1,
        note: 'Clears the customer collective account against the bank debit' },
    ],
  },
  {
    code: 'SALARY_PAYMENT',
    name: 'Salary payment',
    name_en: 'Salary payment',
    transaction_type: 'salary_payment',
    journal_code: 'BQ',
    lines: [
      { side: 'debit', account_rule: '4221', amount_formula: 'gross', third_party_rule: 'employee', is_proposed: 1,
        note: 'Default counterpart of a bank credit for payroll' },
    ],
  },
  {
    code: 'ASSET_ACQUISITION',
    name: 'Medical equipment purchase',
    name_en: 'Medical equipment purchase',
    transaction_type: 'asset_acquisition',
    journal_code: 'IM',
    lines: [
      { side: 'credit', account_rule: '4011', amount_formula: 'gross', third_party_rule: 'supplier', is_proposed: 1,
        note: 'Supplier credit for a capitalised asset' },
    ],
  },
  {
    code: 'MAINTENANCE_INVOICE',
    name: 'Maintenance invoice',
    name_en: 'Maintenance invoice',
    transaction_type: 'maintenance_invoice',
    journal_code: 'HA',
    lines: [
      { side: 'credit', account_rule: '4011', amount_formula: 'gross', third_party_rule: 'supplier', is_proposed: 1,
        note: 'Third-party default for a maintenance expense' },
    ],
  },
  {
    code: 'DEPRECIATION',
    name: 'Monthly depreciation',
    name_en: 'Monthly depreciation',
    transaction_type: 'depreciation',
    journal_code: 'AM',
    lines: [
      { side: 'debit', account_rule: '6813', amount_formula: 'gross', third_party_rule: 'none', is_proposed: 1,
        note: 'Expense counterpart of accumulated depreciation' },
    ],
  },
  {
    code: 'ASSET_DISPOSAL',
    name: 'Asset disposal',
    name_en: 'Asset disposal',
    transaction_type: 'asset_disposal',
    journal_code: 'IM',
    lines: [
      { side: 'debit', account_rule: '6541', amount_formula: 'gross', third_party_rule: 'none', is_proposed: 1,
        note: 'Net book value removed on disposal' },
    ],
  },
];
