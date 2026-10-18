-- -----------------------------------------------------------------------------
-- Migration 010: Phase 1 Banking & Fiscal Core (Bank Reconciliation & Withholding Taxes)
-- -----------------------------------------------------------------------------

-- 1. Imported Bank Statements
CREATE TABLE IF NOT EXISTS bank_statements (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id              INT UNSIGNED NOT NULL,
  bank_account_id     INT UNSIGNED NOT NULL,
  statement_number    VARCHAR(50)  NOT NULL,
  statement_date      DATE         NOT NULL,
  start_date          DATE         NOT NULL,
  end_date            DATE         NOT NULL,
  opening_balance     DECIMAL(20,2) NOT NULL DEFAULT 0,
  closing_balance     DECIMAL(20,2) NOT NULL DEFAULT 0,
  source_format       VARCHAR(30)  NOT NULL DEFAULT 'excel',
  original_file_name  VARCHAR(255) NULL,
  status              VARCHAR(30)  NOT NULL DEFAULT 'imported',
  created_by          INT UNSIGNED NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bs_stmt (bank_account_id, statement_number),
  CONSTRAINT fk_bs_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_ba FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Individual Statement Lines
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  statement_id         INT UNSIGNED NOT NULL,
  line_date            DATE         NOT NULL,
  value_date           DATE         NULL,
  amount               DECIMAL(20,2) NOT NULL,
  reference            VARCHAR(100) NULL,
  cheque_no            VARCHAR(50)  NULL,
  description          VARCHAR(255) NOT NULL,
  partner_name         VARCHAR(150) NULL,
  reconciled           TINYINT(1)   NOT NULL DEFAULT 0,
  reconciled_entry_id  INT UNSIGNED NULL,
  reconciled_line_id   INT UNSIGNED NULL,
  reconciled_at        DATETIME     NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_bsl_stmt (statement_id),
  KEY ix_bsl_rec (reconciled),
  CONSTRAINT fk_bsl_stmt FOREIGN KEY (statement_id) REFERENCES bank_statements (id) ON DELETE CASCADE,
  CONSTRAINT fk_bsl_entry FOREIGN KEY (reconciled_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  CONSTRAINT fk_bsl_line FOREIGN KEY (reconciled_line_id) REFERENCES journal_lines (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Reconciled Session Records & Audit
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id                             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                         INT UNSIGNED NOT NULL,
  bank_account_id                INT UNSIGNED NOT NULL,
  statement_id                   INT UNSIGNED NULL,
  reconciliation_date            DATE         NOT NULL,
  statement_closing_balance      DECIMAL(20,2) NOT NULL,
  ledger_closing_balance         DECIMAL(20,2) NOT NULL,
  outstanding_cheques_amount     DECIMAL(20,2) NOT NULL DEFAULT 0,
  outstanding_deposits_amount    DECIMAL(20,2) NOT NULL DEFAULT 0,
  unrecorded_charges_amount      DECIMAL(20,2) NOT NULL DEFAULT 0,
  reconciled_balance             DECIMAL(20,2) NOT NULL,
  difference                     DECIMAL(20,2) NOT NULL DEFAULT 0,
  is_balanced                    TINYINT(1)   NOT NULL DEFAULT 0,
  notes                          TEXT         NULL,
  signed_off_by                  INT UNSIGNED NULL,
  signed_off_at                  DATETIME     NULL,
  created_at                     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_br_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_br_ba FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_br_stmt FOREIGN KEY (statement_id) REFERENCES bank_statements (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. CEMAC Withholding Tax Certificates (Attestations de Retenue à la Source)
CREATE TABLE IF NOT EXISTS withholding_certificates (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                 INT UNSIGNED NOT NULL,
  certificate_no         VARCHAR(50)  NOT NULL,
  supplier_id            INT UNSIGNED NOT NULL,
  subledger_id           INT UNSIGNED NULL,
  entry_id               INT UNSIGNED NULL,
  certificate_date       DATE         NOT NULL,
  tax_period             VARCHAR(10)  NOT NULL,
  invoice_ref            VARCHAR(100) NOT NULL,
  gross_amount           DECIMAL(20,2) NOT NULL,
  has_tva                TINYINT(1)   NOT NULL DEFAULT 1,
  tva_rate               DECIMAL(5,2) NOT NULL DEFAULT 19.25,
  tva_amount             DECIMAL(20,2) NOT NULL DEFAULT 0,
  tva_withheld_amount    DECIMAL(20,2) NOT NULL DEFAULT 0,
  precompte_rate         DECIMAL(5,2) NOT NULL DEFAULT 2.20,
  precompte_amount       DECIMAL(20,2) NOT NULL DEFAULT 0,
  tsr_rate               DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  tsr_amount             DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_withheld_amount  DECIMAL(20,2) NOT NULL DEFAULT 0,
  net_payable_amount     DECIMAL(20,2) NOT NULL DEFAULT 0,
  status                 VARCHAR(30)  NOT NULL DEFAULT 'issued',
  dgi_receipt_ref        VARCHAR(100) NULL,
  created_by             INT UNSIGNED NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wc_num (org_id, certificate_no),
  CONSTRAINT fk_wc_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_wc_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  CONSTRAINT fk_wc_subledger FOREIGN KEY (subledger_id) REFERENCES subledger_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_wc_entry FOREIGN KEY (entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Supplier Fiscal Regime (Régime Fiscal CEMAC)
ALTER TABLE suppliers ADD COLUMN tax_regime VARCHAR(30) NOT NULL DEFAULT 'reel';
UPDATE suppliers SET tax_regime = 'reel' WHERE tax_regime IS NULL OR tax_regime = '';

