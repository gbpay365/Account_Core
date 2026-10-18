-- -----------------------------------------------------------------------------
-- Migration 012: Phase 3 Multi-Donor Projects, Mobile Money & Cash Close
-- -----------------------------------------------------------------------------

-- 1. Multi-Donor Project Conventions & Grants (Tompro / Succès Parity)
CREATE TABLE IF NOT EXISTS donor_projects (
  id                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                     INT UNSIGNED NOT NULL,
  donor_name                 VARCHAR(150) NOT NULL,
  project_code               VARCHAR(50)  NOT NULL,
  project_name               VARCHAR(255) NOT NULL,
  agreement_ref              VARCHAR(100) NULL,
  currency                   CHAR(3)      NOT NULL DEFAULT 'XAF',
  total_budget               DECIMAL(20,2) NOT NULL DEFAULT 0,
  financing_rate             DECIMAL(5,2)  NOT NULL DEFAULT 100.00,
  designated_bank_account_id INT UNSIGNED NULL,
  start_date                 DATE         NOT NULL,
  end_date                   DATE         NULL,
  status                     VARCHAR(30)  NOT NULL DEFAULT 'active',
  notes                      TEXT         NULL,
  created_at                 DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dp_code (org_id, project_code),
  CONSTRAINT fk_dp_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_dp_bank FOREIGN KEY (designated_bank_account_id) REFERENCES bank_accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donor_expense_categories (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id        INT UNSIGNED NOT NULL,
  category_code     VARCHAR(30)  NOT NULL,
  name              VARCHAR(200) NOT NULL,
  budget_allocated  DECIMAL(20,2) NOT NULL DEFAULT 0,
  eligible_rate     DECIMAL(5,2)  NOT NULL DEFAULT 100.00,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dec_code (project_id, category_code),
  CONSTRAINT fk_dec_proj FOREIGN KEY (project_id) REFERENCES donor_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donor_disbursement_requests (
  id                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id                 INT UNSIGNED NOT NULL,
  drf_number                 VARCHAR(50)  NOT NULL,
  request_date               DATE         NOT NULL,
  period_start               DATE         NOT NULL,
  period_end                 DATE         NOT NULL,
  initial_advance            DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_expenditures_claimed DECIMAL(20,2) NOT NULL DEFAULT 0,
  eligible_amount_claimed    DECIMAL(20,2) NOT NULL DEFAULT 0,
  replenishment_requested    DECIMAL(20,2) NOT NULL DEFAULT 0,
  designated_account_balance DECIMAL(20,2) NOT NULL DEFAULT 0,
  status                     VARCHAR(30)  NOT NULL DEFAULT 'draft',
  submission_date            DATE         NULL,
  notes                      TEXT         NULL,
  created_at                 DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_drf_num (project_id, drf_number),
  CONSTRAINT fk_drf_proj FOREIGN KEY (project_id) REFERENCES donor_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donor_expenditure_items (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  drf_id          INT UNSIGNED NOT NULL,
  category_id     INT UNSIGNED NOT NULL,
  entry_line_id   INT UNSIGNED NULL,
  voucher_ref     VARCHAR(80)  NOT NULL,
  voucher_date    DATE         NOT NULL,
  beneficiary_name VARCHAR(200) NOT NULL,
  description     VARCHAR(255) NOT NULL,
  total_amount    DECIMAL(20,2) NOT NULL DEFAULT 0,
  currency        CHAR(3)      NOT NULL DEFAULT 'XAF',
  eligible_rate   DECIMAL(5,2)  NOT NULL DEFAULT 100.00,
  eligible_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  notes           VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_dei_drf (drf_id),
  CONSTRAINT fk_dei_drf FOREIGN KEY (drf_id) REFERENCES donor_disbursement_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_dei_cat FOREIGN KEY (category_id) REFERENCES donor_expense_categories (id) ON DELETE RESTRICT,
  CONSTRAINT fk_dei_line FOREIGN KEY (entry_line_id) REFERENCES journal_lines (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Cash Registers & Mobile Money Counters (Arrêté de Caisse Journalier)
CREATE TABLE IF NOT EXISTS cash_registers (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id             INT UNSIGNED NOT NULL,
  code               VARCHAR(30)  NOT NULL,
  name               VARCHAR(150) NOT NULL,
  cashier_user_id    INT UNSIGNED NULL,
  cash_account_id    INT UNSIGNED NOT NULL,
  momo_account_id    INT UNSIGNED NOT NULL,
  orange_account_id  INT UNSIGNED NOT NULL,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cr_code (org_id, code),
  CONSTRAINT fk_creg_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_creg_user FOREIGN KEY (cashier_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_creg_cash FOREIGN KEY (cash_account_id) REFERENCES accounts (id),
  CONSTRAINT fk_creg_momo FOREIGN KEY (momo_account_id) REFERENCES accounts (id),
  CONSTRAINT fk_creg_orange FOREIGN KEY (orange_account_id) REFERENCES accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mobile_money_transactions (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id             INT UNSIGNED NOT NULL,
  cash_register_id   INT UNSIGNED NOT NULL,
  provider           ENUM('mtn_momo', 'orange_money') NOT NULL,
  telecom_ref        VARCHAR(80)  NOT NULL,
  transaction_date   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  customer_phone     VARCHAR(30)  NULL,
  patient_name       VARCHAR(150) NULL,
  patient_file_no    VARCHAR(50)  NULL,
  gross_amount       DECIMAL(20,2) NOT NULL DEFAULT 0,
  fee_amount         DECIMAL(20,2) NOT NULL DEFAULT 0,
  net_amount         DECIMAL(20,2) NOT NULL DEFAULT 0,
  journal_entry_id   INT UNSIGNED NULL,
  status             VARCHAR(30)  NOT NULL DEFAULT 'pending',
  notes              VARCHAR(255) NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mm_ref (org_id, telecom_ref),
  KEY ix_mm_cr (cash_register_id),
  CONSTRAINT fk_mmtx_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_mmtx_cr FOREIGN KEY (cash_register_id) REFERENCES cash_registers (id) ON DELETE CASCADE,
  CONSTRAINT fk_mmtx_je FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_cash_closes (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                 INT UNSIGNED NOT NULL,
  cash_register_id       INT UNSIGNED NOT NULL,
  close_date             DATE         NOT NULL,
  cashier_id             INT UNSIGNED NOT NULL,
  physical_cash_counted  DECIMAL(20,2) NOT NULL DEFAULT 0,
  system_cash_expected   DECIMAL(20,2) NOT NULL DEFAULT 0,
  cash_variance          DECIMAL(20,2) NOT NULL DEFAULT 0,
  momo_collected         DECIMAL(20,2) NOT NULL DEFAULT 0,
  orange_collected       DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_collections      DECIMAL(20,2) NOT NULL DEFAULT 0,
  bank_deposit_amount    DECIMAL(20,2) NOT NULL DEFAULT 0,
  bank_deposit_ref       VARCHAR(80)  NULL,
  variance_entry_id      INT UNSIGNED NULL,
  deposit_entry_id       INT UNSIGNED NULL,
  status                 VARCHAR(30)  NOT NULL DEFAULT 'draft',
  approved_by            INT UNSIGNED NULL,
  notes                  TEXT         NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dcc_cr_date (cash_register_id, close_date),
  CONSTRAINT fk_dcash_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_dcash_cr FOREIGN KEY (cash_register_id) REFERENCES cash_registers (id) ON DELETE CASCADE,
  CONSTRAINT fk_dcash_cashier FOREIGN KEY (cashier_id) REFERENCES users (id),
  CONSTRAINT fk_dcash_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_dcash_ve FOREIGN KEY (variance_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  CONSTRAINT fk_dcash_de FOREIGN KEY (deposit_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Ensure postable subaccounts for mobile money, caisse, and bank transfers
INSERT INTO accounts (org_id, code, name, name_en, account_class, parent_id, level, account_type, normal_side, is_postable, is_active, in_tier_normal)
SELECT o.id, '5713', 'Caisse Mobile Money — Orange Money', 'Mobile Money Cash Register — Orange Money', 5, NULL, 3, 'asset', 'debit', 1, 1, 1 FROM organizations o
UNION ALL
SELECT o.id, '5851', 'Virements internes de caisse en banque', 'Internal Cash-to-Bank Transfer Transit', 5, NULL, 3, 'asset', 'debit', 1, 1, 1 FROM organizations o
UNION ALL
SELECT o.id, '6312', 'Frais et commissions sur paiements mobiles', 'Telecom & Mobile Money Transaction Fees', 6, NULL, 3, 'expense', 'debit', 1, 1, 1 FROM organizations o
UNION ALL
SELECT o.id, '6581', 'Déficits et pertes sur écarts de caisse', 'Cash Count Discrepancies — Shortages', 6, NULL, 3, 'expense', 'debit', 1, 1, 1 FROM organizations o
UNION ALL
SELECT o.id, '7581', 'Excédents constatés sur écarts de caisse', 'Cash Count Discrepancies — Overage', 7, NULL, 3, 'revenue', 'credit', 1, 1, 1 FROM organizations o
ON DUPLICATE KEY UPDATE is_postable = 1;
