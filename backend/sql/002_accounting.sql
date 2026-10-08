-- =============================================================================
-- LedgerCore :: 002_accounting.sql
-- Chart of accounts, dual-standard mapping, general ledger, AP/AR, treasury,
-- tax, budgeting, period close, statutory report templates.
-- =============================================================================

-- FR-GL-001 / FR-STD-001 :: hierarchical SYSCOHADA chart of accounts (classes 1-9)
CREATE TABLE IF NOT EXISTS accounts (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id               INT UNSIGNED NOT NULL,
  code                 VARCHAR(20)  NOT NULL,
  name                 VARCHAR(200) NOT NULL,
  name_en              VARCHAR(200) NULL,
  account_class        TINYINT UNSIGNED NOT NULL,
  parent_id            INT UNSIGNED NULL,
  level                TINYINT UNSIGNED NOT NULL DEFAULT 1,
  account_type         ENUM('asset','liability','equity','revenue','expense','analytic','offbalance') NOT NULL,
  normal_side          ENUM('debit','credit') NOT NULL,
  is_postable          TINYINT(1)   NOT NULL DEFAULT 1,
  is_reconcilable      TINYINT(1)   NOT NULL DEFAULT 0,
  requires_cost_center TINYINT(1)   NOT NULL DEFAULT 0,
  requires_asset       TINYINT(1)   NOT NULL DEFAULT 0,
  is_fixed_asset       TINYINT(1)   NOT NULL DEFAULT 0,
  in_tier_normal       TINYINT(1)   NOT NULL DEFAULT 1,
  in_tier_allege       TINYINT(1)   NOT NULL DEFAULT 1,
  in_tier_smt          TINYINT(1)   NOT NULL DEFAULT 0,
  currency             CHAR(3)      NULL,
  is_system            TINYINT(1)   NOT NULL DEFAULT 0,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_acct_code (org_id, code),
  KEY ix_acct_parent (parent_id),
  KEY ix_acct_class (org_id, account_class),
  CONSTRAINT fk_acct_org    FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acct_parent FOREIGN KEY (parent_id) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IFRS presentation layer (IAS 1 statement lines)
CREATE TABLE IF NOT EXISTS ifrs_accounts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id      INT UNSIGNED NOT NULL,
  code        VARCHAR(30)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  name_fr     VARCHAR(200) NULL,
  statement   ENUM('sofp','pl','oci','cf','soce','note') NOT NULL,
  section     VARCHAR(80)  NOT NULL,
  sub_section VARCHAR(80)  NULL,
  sign        TINYINT      NOT NULL DEFAULT 1,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  note_ref    VARCHAR(20)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ifrs_code (org_id, code),
  KEY ix_ifrs_stmt (org_id, statement, sort_order),
  CONSTRAINT fk_ifrs_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FR-STD-020 :: single entry, dual reporting - SYSCOHADA account -> IFRS line
CREATE TABLE IF NOT EXISTS account_mappings (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  account_id      INT UNSIGNED NOT NULL,
  ifrs_account_id INT UNSIGNED NOT NULL,
  allocation_pct  DECIMAL(7,4) NOT NULL DEFAULT 100.0000,
  note            VARCHAR(250) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_map (org_id, account_id, ifrs_account_id),
  CONSTRAINT fk_map_org   FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_map_acct  FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_map_ifrs  FOREIGN KEY (ifrs_account_id) REFERENCES ifrs_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- General ledger :: FR-GL-002 double-entry journals with balancing validation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journals (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id             INT UNSIGNED NOT NULL,
  code               VARCHAR(10)  NOT NULL,
  name               VARCHAR(100) NOT NULL,
  name_en            VARCHAR(100) NULL,
  journal_type       ENUM('sales','purchase','cash','bank','payroll','asset','depreciation','general','closing','fx') NOT NULL,
  default_account_id INT UNSIGNED NULL,
  allow_manual       TINYINT(1)   NOT NULL DEFAULT 1,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_jrn_code (org_id, code),
  CONSTRAINT fk_jrn_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_entries (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id              INT UNSIGNED NOT NULL,
  journal_id          INT UNSIGNED NOT NULL,
  entry_no            VARCHAR(30)  NOT NULL,
  entry_date          DATE         NOT NULL,
  period_id           INT UNSIGNED NOT NULL,
  reference           VARCHAR(80)  NULL,
  description         VARCHAR(400) NOT NULL,
  narration           TEXT         NULL,
  source              ENUM('manual','system','import','asset_acquisition','depreciation','revaluation','impairment','disposal','ap_invoice','ap_payment','ar_invoice','ar_receipt','bank','fx_revaluation','accrual','closing') NOT NULL DEFAULT 'manual',
  source_ref          VARCHAR(80)  NULL,
  -- FR-STD-020: one ledger, two presentations. 'both' is the shared book of
  -- record; 'ifrs'/'ohada' carry only the delta where the two bases diverge,
  -- so each statement selects framework IN ('both', <its own>).
  framework           ENUM('both','ohada','ifrs') NOT NULL DEFAULT 'both',
  currency            CHAR(3)      NOT NULL,
  fx_rate             DECIMAL(20,8) NOT NULL DEFAULT 1,
  total_debit         DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_credit        DECIMAL(20,2) NOT NULL DEFAULT 0,
  status              ENUM('draft','posted','reversed') NOT NULL DEFAULT 'draft',
  is_reversal         TINYINT(1)   NOT NULL DEFAULT 0,
  reverses_entry_id   INT UNSIGNED NULL,
  reversed_by_entry_id INT UNSIGNED NULL,
  closed_period_override TINYINT(1) NOT NULL DEFAULT 0,
  override_reason     VARCHAR(400) NULL,
  override_by         INT UNSIGNED NULL,
  created_by          INT UNSIGNED NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_by           INT UNSIGNED NULL,
  posted_at           DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_je_no (org_id, entry_no),
  KEY ix_je_period (org_id, period_id, status, framework),
  KEY ix_je_date (org_id, entry_date),
  KEY ix_je_source (org_id, source, source_ref),
  CONSTRAINT fk_je_org    FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_je_jrn    FOREIGN KEY (journal_id) REFERENCES journals (id),
  CONSTRAINT fk_je_period FOREIGN KEY (period_id) REFERENCES accounting_periods (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_lines (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id           INT UNSIGNED NOT NULL,
  entry_id         INT UNSIGNED NOT NULL,
  line_no          SMALLINT UNSIGNED NOT NULL,
  account_id       INT UNSIGNED NOT NULL,
  cost_center_id   INT UNSIGNED NULL,
  asset_id         INT UNSIGNED NULL,
  project_code     VARCHAR(30)  NULL,
  description      VARCHAR(400) NULL,
  debit            DECIMAL(20,2) NOT NULL DEFAULT 0,
  credit           DECIMAL(20,2) NOT NULL DEFAULT 0,
  currency         CHAR(3)      NOT NULL,
  fx_rate          DECIMAL(20,8) NOT NULL DEFAULT 1,
  debit_func       DECIMAL(20,2) NOT NULL DEFAULT 0,
  credit_func      DECIMAL(20,2) NOT NULL DEFAULT 0,
  tax_code_id      INT UNSIGNED NULL,
  partner_type     ENUM('supplier','customer','employee','bank','none') NOT NULL DEFAULT 'none',
  partner_id       INT UNSIGNED NULL,
  reconciled       TINYINT(1)   NOT NULL DEFAULT 0,
  reconciled_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_jl_line (entry_id, line_no),
  KEY ix_jl_account (org_id, account_id),
  KEY ix_jl_cc (org_id, cost_center_id),
  KEY ix_jl_asset (asset_id),
  CONSTRAINT fk_jl_entry FOREIGN KEY (entry_id) REFERENCES journal_entries (id) ON DELETE CASCADE,
  CONSTRAINT fk_jl_acct  FOREIGN KEY (account_id) REFERENCES accounts (id),
  CONSTRAINT fk_jl_cc    FOREIGN KEY (cost_center_id) REFERENCES cost_centers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tax :: FR-TX-001 VAT / TVA management with medical-equipment exemptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_codes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id            INT UNSIGNED NOT NULL,
  code              VARCHAR(20)  NOT NULL,
  name              VARCHAR(150) NOT NULL,
  tax_type          ENUM('vat_purchase','vat_sale','withholding','customs','exempt','zero_rated') NOT NULL,
  rate              DECIMAL(7,4) NOT NULL DEFAULT 0,
  is_recoverable    TINYINT(1)   NOT NULL DEFAULT 1,
  input_account_id  INT UNSIGNED NULL,
  output_account_id INT UNSIGNED NULL,
  applies_to        ENUM('all','goods','services','medical_equipment','pharmaceuticals') NOT NULL DEFAULT 'all',
  exemption_reason  VARCHAR(250) NULL,
  declaration_box   VARCHAR(20)  NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tax_code (org_id, code),
  CONSTRAINT fk_tax_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_transactions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  period_id       INT UNSIGNED NOT NULL,
  tax_code_id     INT UNSIGNED NOT NULL,
  entry_id        INT UNSIGNED NULL,
  line_id         INT UNSIGNED NULL,
  direction       ENUM('input','output') NOT NULL,
  base_amount     DECIMAL(20,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(20,2) NOT NULL DEFAULT 0,
  partner_type    ENUM('supplier','customer','none') NOT NULL DEFAULT 'none',
  partner_id      INT UNSIGNED NULL,
  partner_name    VARCHAR(200) NULL,
  partner_tax_id  VARCHAR(50)  NULL,
  doc_ref         VARCHAR(80)  NULL,
  doc_date        DATE         NOT NULL,
  is_declared     TINYINT(1)   NOT NULL DEFAULT 0,
  declaration_id  INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_txn_period (org_id, period_id, direction),
  CONSTRAINT fk_txn_org  FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_txn_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_declarations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED NOT NULL,
  period_id     INT UNSIGNED NOT NULL,
  declaration_type ENUM('vat','withholding','other') NOT NULL DEFAULT 'vat',
  reference     VARCHAR(40)  NOT NULL,
  total_input   DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_output  DECIMAL(20,2) NOT NULL DEFAULT 0,
  net_payable   DECIMAL(20,2) NOT NULL DEFAULT 0,
  credit_carried DECIMAL(20,2) NOT NULL DEFAULT 0,
  status        ENUM('draft','submitted','paid') NOT NULL DEFAULT 'draft',
  export_path   VARCHAR(400) NULL,
  generated_by  INT UNSIGNED NULL,
  generated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_decl (org_id, period_id, declaration_type),
  CONSTRAINT fk_decl_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Procurement & Accounts Payable :: FR-AP-001 three-way match
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id              INT UNSIGNED NOT NULL,
  code                VARCHAR(20)  NOT NULL,
  name                VARCHAR(200) NOT NULL,
  supplier_type       ENUM('equipment','consumables','services','biomedical_service','utilities','construction','other') NOT NULL DEFAULT 'other',
  tax_id              VARCHAR(50)  NULL,
  contact_name        VARCHAR(150) NULL,
  email               VARCHAR(150) NULL,
  phone               VARCHAR(50)  NULL,
  address             VARCHAR(300) NULL,
  country_code        CHAR(2)      NULL,
  currency            CHAR(3)      NOT NULL DEFAULT 'XAF',
  payment_terms_days  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  account_id          INT UNSIGNED NULL,
  is_service_provider TINYINT(1)   NOT NULL DEFAULT 0,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sup_code (org_id, code),
  KEY ix_sup_name (org_id, name),
  CONSTRAINT fk_sup_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  po_no          VARCHAR(30)  NOT NULL,
  supplier_id    INT UNSIGNED NOT NULL,
  order_date     DATE         NOT NULL,
  expected_date  DATE         NULL,
  cost_center_id INT UNSIGNED NULL,
  currency       CHAR(3)      NOT NULL,
  fx_rate        DECIMAL(20,8) NOT NULL DEFAULT 1,
  is_capex       TINYINT(1)   NOT NULL DEFAULT 0,
  subtotal       DECIMAL(20,2) NOT NULL DEFAULT 0,
  tax_total      DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_amount   DECIMAL(20,2) NOT NULL DEFAULT 0,
  status         ENUM('draft','approved','partially_received','received','invoiced','closed','cancelled') NOT NULL DEFAULT 'draft',
  approved_by    INT UNSIGNED NULL,
  approved_at    DATETIME     NULL,
  notes          VARCHAR(500) NULL,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_po_no (org_id, po_no),
  KEY ix_po_supplier (org_id, supplier_id),
  CONSTRAINT fk_po_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_po_sup FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  po_id             INT UNSIGNED NOT NULL,
  line_no           SMALLINT UNSIGNED NOT NULL,
  description       VARCHAR(300) NOT NULL,
  account_id        INT UNSIGNED NULL,
  asset_category_id INT UNSIGNED NULL,
  creates_asset     TINYINT(1)   NOT NULL DEFAULT 0,
  quantity          DECIMAL(16,4) NOT NULL DEFAULT 1,
  unit_price        DECIMAL(20,4) NOT NULL DEFAULT 0,
  tax_code_id       INT UNSIGNED NULL,
  tax_amount        DECIMAL(20,2) NOT NULL DEFAULT 0,
  line_total        DECIMAL(20,2) NOT NULL DEFAULT 0,
  received_qty      DECIMAL(16,4) NOT NULL DEFAULT 0,
  invoiced_qty      DECIMAL(16,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pol (po_id, line_no),
  CONSTRAINT fk_pol_po FOREIGN KEY (po_id) REFERENCES purchase_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goods_receipts (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id       INT UNSIGNED NOT NULL,
  grn_no       VARCHAR(30)  NOT NULL,
  po_id        INT UNSIGNED NOT NULL,
  receipt_date DATE         NOT NULL,
  delivery_note VARCHAR(80) NULL,
  received_by  INT UNSIGNED NULL,
  notes        VARCHAR(400) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grn_no (org_id, grn_no),
  CONSTRAINT fk_grn_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_grn_po  FOREIGN KEY (po_id) REFERENCES purchase_orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  grn_id      INT UNSIGNED NOT NULL,
  po_line_id  INT UNSIGNED NOT NULL,
  quantity    DECIMAL(16,4) NOT NULL,
  condition_note VARCHAR(250) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_grl_grn  FOREIGN KEY (grn_id) REFERENCES goods_receipts (id) ON DELETE CASCADE,
  CONSTRAINT fk_grl_line FOREIGN KEY (po_line_id) REFERENCES purchase_order_lines (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  invoice_no     VARCHAR(30)  NOT NULL,
  supplier_ref   VARCHAR(80)  NOT NULL,
  supplier_id    INT UNSIGNED NOT NULL,
  po_id          INT UNSIGNED NULL,
  invoice_date   DATE         NOT NULL,
  received_date  DATE         NULL,
  due_date       DATE         NOT NULL,
  period_id      INT UNSIGNED NULL,
  currency       CHAR(3)      NOT NULL,
  fx_rate        DECIMAL(20,8) NOT NULL DEFAULT 1,
  subtotal       DECIMAL(20,2) NOT NULL DEFAULT 0,
  tax_total      DECIMAL(20,2) NOT NULL DEFAULT 0,
  total          DECIMAL(20,2) NOT NULL DEFAULT 0,
  amount_paid    DECIMAL(20,2) NOT NULL DEFAULT 0,
  match_status   ENUM('unmatched','two_way','three_way','variance') NOT NULL DEFAULT 'unmatched',
  match_variance DECIMAL(20,2) NOT NULL DEFAULT 0,
  status         ENUM('draft','pending_approval','approved','posted','partially_paid','paid','disputed','cancelled') NOT NULL DEFAULT 'draft',
  entry_id       INT UNSIGNED NULL,
  approved_by    INT UNSIGNED NULL,
  approved_at    DATETIME     NULL,
  notes          VARCHAR(500) NULL,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_si_no (org_id, invoice_no),
  UNIQUE KEY uq_si_supplier_ref (org_id, supplier_id, supplier_ref),
  KEY ix_si_status (org_id, status),
  KEY ix_si_due (org_id, due_date),
  CONSTRAINT fk_si_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_si_sup FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_si_po  FOREIGN KEY (po_id) REFERENCES purchase_orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id        INT UNSIGNED NOT NULL,
  line_no           SMALLINT UNSIGNED NOT NULL,
  description       VARCHAR(300) NOT NULL,
  account_id        INT UNSIGNED NULL,
  cost_center_id    INT UNSIGNED NULL,
  asset_category_id INT UNSIGNED NULL,
  asset_id          INT UNSIGNED NULL,
  creates_asset     TINYINT(1)   NOT NULL DEFAULT 0,
  po_line_id        INT UNSIGNED NULL,
  quantity          DECIMAL(16,4) NOT NULL DEFAULT 1,
  unit_price        DECIMAL(20,4) NOT NULL DEFAULT 0,
  tax_code_id       INT UNSIGNED NULL,
  tax_amount        DECIMAL(20,2) NOT NULL DEFAULT 0,
  line_total        DECIMAL(20,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sil (invoice_id, line_no),
  CONSTRAINT fk_sil_inv FOREIGN KEY (invoice_id) REFERENCES supplier_invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Treasury :: FR-TR-001 bank reconciliation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id           INT UNSIGNED NOT NULL,
  code             VARCHAR(20)  NOT NULL,
  name             VARCHAR(150) NOT NULL,
  bank_name        VARCHAR(150) NULL,
  account_number   VARCHAR(60)  NULL,
  iban             VARCHAR(50)  NULL,
  swift            VARCHAR(20)  NULL,
  currency         CHAR(3)      NOT NULL,
  account_id       INT UNSIGNED NOT NULL,
  account_kind     ENUM('bank','cash','mobile_money') NOT NULL DEFAULT 'bank',
  opening_balance  DECIMAL(20,2) NOT NULL DEFAULT 0,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ba_code (org_id, code),
  CONSTRAINT fk_ba_org  FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_ba_acct FOREIGN KEY (account_id) REFERENCES accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_statements (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  bank_account_id INT UNSIGNED NOT NULL,
  statement_no    VARCHAR(40)  NOT NULL,
  statement_date  DATE         NOT NULL,
  period_start    DATE         NULL,
  period_end      DATE         NULL,
  opening_balance DECIMAL(20,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(20,2) NOT NULL DEFAULT 0,
  import_format   ENUM('csv','mt940','api','manual') NOT NULL DEFAULT 'csv',
  status          ENUM('imported','reconciling','reconciled') NOT NULL DEFAULT 'imported',
  imported_by     INT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bs (org_id, bank_account_id, statement_no),
  CONSTRAINT fk_bs_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_ba  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  statement_id   INT UNSIGNED NOT NULL,
  line_no        SMALLINT UNSIGNED NOT NULL,
  value_date     DATE         NOT NULL,
  booking_date   DATE         NULL,
  description    VARCHAR(400) NOT NULL,
  reference      VARCHAR(100) NULL,
  amount         DECIMAL(20,2) NOT NULL,
  balance_after  DECIMAL(20,2) NULL,
  matched_line_id INT UNSIGNED NULL,
  match_type     ENUM('none','auto','manual') NOT NULL DEFAULT 'none',
  match_score    DECIMAL(5,2) NULL,
  matched_by     INT UNSIGNED NULL,
  matched_at     DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bsl (statement_id, line_no),
  KEY ix_bsl_match (match_type),
  CONSTRAINT fk_bsl_stmt FOREIGN KEY (statement_id) REFERENCES bank_statements (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  payment_no      VARCHAR(30)  NOT NULL,
  direction       ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
  partner_type    ENUM('supplier','customer') NOT NULL DEFAULT 'supplier',
  partner_id      INT UNSIGNED NOT NULL,
  payment_date    DATE         NOT NULL,
  bank_account_id INT UNSIGNED NOT NULL,
  currency        CHAR(3)      NOT NULL,
  fx_rate         DECIMAL(20,8) NOT NULL DEFAULT 1,
  amount          DECIMAL(20,2) NOT NULL,
  method          ENUM('transfer','cheque','cash','mobile_money','card') NOT NULL DEFAULT 'transfer',
  reference       VARCHAR(100) NULL,
  entry_id        INT UNSIGNED NULL,
  status          ENUM('draft','approved','posted','cancelled') NOT NULL DEFAULT 'draft',
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pay_no (org_id, payment_no),
  CONSTRAINT fk_pay_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_ba  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id INT UNSIGNED NOT NULL,
  doc_type   ENUM('supplier_invoice','receivable') NOT NULL,
  doc_id     INT UNSIGNED NOT NULL,
  amount     DECIMAL(20,2) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_pa_doc (doc_type, doc_id),
  CONSTRAINT fk_pa_pay FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Accounts receivable :: FR-AR-001 posting from external billing / EHR via API
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED NOT NULL,
  code          VARCHAR(20)  NOT NULL,
  name          VARCHAR(200) NOT NULL,
  customer_type ENUM('patient','insurer','mutuelle','employer','government','ngo','other') NOT NULL DEFAULT 'patient',
  external_ref  VARCHAR(80)  NULL,
  tax_id        VARCHAR(50)  NULL,
  email         VARCHAR(150) NULL,
  phone         VARCHAR(50)  NULL,
  currency      CHAR(3)      NOT NULL DEFAULT 'XAF',
  payment_terms_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  account_id    INT UNSIGNED NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cust_code (org_id, code),
  KEY ix_cust_ext (org_id, external_ref),
  CONSTRAINT fk_cust_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receivables (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  doc_no         VARCHAR(30)  NOT NULL,
  customer_id    INT UNSIGNED NOT NULL,
  external_ref   VARCHAR(80)  NULL,
  source_system  VARCHAR(60)  NULL,
  doc_date       DATE         NOT NULL,
  due_date       DATE         NOT NULL,
  period_id      INT UNSIGNED NULL,
  cost_center_id INT UNSIGNED NULL,
  currency       CHAR(3)      NOT NULL,
  fx_rate        DECIMAL(20,8) NOT NULL DEFAULT 1,
  subtotal       DECIMAL(20,2) NOT NULL DEFAULT 0,
  tax_total      DECIMAL(20,2) NOT NULL DEFAULT 0,
  total          DECIMAL(20,2) NOT NULL DEFAULT 0,
  amount_settled DECIMAL(20,2) NOT NULL DEFAULT 0,
  status         ENUM('open','partially_paid','paid','written_off','cancelled') NOT NULL DEFAULT 'open',
  entry_id       INT UNSIGNED NULL,
  description    VARCHAR(400) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recv_no (org_id, doc_no),
  UNIQUE KEY uq_recv_ext (org_id, source_system, external_ref),
  KEY ix_recv_due (org_id, due_date, status),
  CONSTRAINT fk_recv_org  FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_recv_cust FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Budgeting :: FR-BG-001 budget vs actual by department
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budgets (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  fiscal_year_id INT UNSIGNED NOT NULL,
  code           VARCHAR(30)  NOT NULL,
  name           VARCHAR(150) NOT NULL,
  version        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status         ENUM('draft','submitted','approved','revised','closed') NOT NULL DEFAULT 'draft',
  approved_by    INT UNSIGNED NULL,
  approved_at    DATETIME     NULL,
  notes          VARCHAR(400) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bud (org_id, code, version),
  CONSTRAINT fk_bud_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_bud_fy  FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_lines (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  budget_id      INT UNSIGNED NOT NULL,
  account_id     INT UNSIGNED NOT NULL,
  cost_center_id INT UNSIGNED NULL,
  period_id      INT UNSIGNED NULL,
  budget_type    ENUM('opex','capex','maintenance','replacement','revenue') NOT NULL DEFAULT 'opex',
  amount         DECIMAL(20,2) NOT NULL DEFAULT 0,
  notes          VARCHAR(250) NULL,
  PRIMARY KEY (id),
  KEY ix_bl_acct (budget_id, account_id),
  KEY ix_bl_cc (cost_center_id),
  CONSTRAINT fk_bl_bud  FOREIGN KEY (budget_id) REFERENCES budgets (id) ON DELETE CASCADE,
  CONSTRAINT fk_bl_acct FOREIGN KEY (account_id) REFERENCES accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Period close :: FR-CN-002 guided close checklist with sign-off
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS close_checklists (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED NOT NULL,
  period_id     INT UNSIGNED NOT NULL,
  status        ENUM('not_started','in_progress','completed','signed_off') NOT NULL DEFAULT 'not_started',
  started_by    INT UNSIGNED NULL,
  started_at    DATETIME     NULL,
  completed_at  DATETIME     NULL,
  signed_off_by INT UNSIGNED NULL,
  signed_off_at DATETIME     NULL,
  notes         VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cl (org_id, period_id),
  CONSTRAINT fk_cl_org    FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_period FOREIGN KEY (period_id) REFERENCES accounting_periods (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS close_checklist_items (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  checklist_id INT UNSIGNED NOT NULL,
  seq          SMALLINT UNSIGNED NOT NULL,
  task_code    VARCHAR(40)  NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  VARCHAR(500) NULL,
  category     ENUM('accrual','reconciliation','depreciation','review','tax','fx','asset','reporting') NOT NULL,
  is_mandatory TINYINT(1)   NOT NULL DEFAULT 1,
  blocks_lock  TINYINT(1)   NOT NULL DEFAULT 1,
  status       ENUM('pending','in_progress','done','skipped','blocked') NOT NULL DEFAULT 'pending',
  assigned_to  INT UNSIGNED NULL,
  completed_by INT UNSIGNED NULL,
  completed_at DATETIME     NULL,
  notes        VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cli (checklist_id, task_code),
  CONSTRAINT fk_cli_cl FOREIGN KEY (checklist_id) REFERENCES close_checklists (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Statutory report templates :: FR-STD-002 / FR-STD-010 / FR-RP-001
-- Line formulas reference account code prefixes, e.g. "21,22,23|-28,-29"
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_lines (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id           INT UNSIGNED NOT NULL,
  framework        ENUM('ohada','ifrs') NOT NULL,
  statement_code   ENUM('BILAN','CR','TAFIRE','NOTES','SOFP','PL','OCI','CF','SOCE','PPE_NOTE') NOT NULL,
  line_code        VARCHAR(20)  NOT NULL,
  label            VARCHAR(250) NOT NULL,
  label_en         VARCHAR(250) NULL,
  parent_line_code VARCHAR(20)  NULL,
  side             ENUM('assets','liabilities','none') NOT NULL DEFAULT 'none',
  line_type        ENUM('header','detail','subtotal','total','spacer') NOT NULL DEFAULT 'detail',
  sign             TINYINT      NOT NULL DEFAULT 1,
  gross_formula    VARCHAR(600) NULL,
  depr_formula     VARCHAR(600) NULL,
  formula          VARCHAR(600) NULL,
  is_bold          TINYINT(1)   NOT NULL DEFAULT 0,
  note_ref         VARCHAR(20)  NULL,
  sort_order       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rl (org_id, framework, statement_code, line_code),
  KEY ix_rl_stmt (org_id, framework, statement_code, sort_order),
  CONSTRAINT fk_rl_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
