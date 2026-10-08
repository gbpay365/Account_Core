-- =============================================================================
-- LedgerCore :: 004_posting.sql
-- FR-PL / FR-DE :: posting length, counter-account proposals, templates.
-- =============================================================================

ALTER TABLE accounts
  ADD COLUMN requires_third_party TINYINT(1) NOT NULL DEFAULT 0 AFTER requires_asset,
  ADD COLUMN default_counter_debit_id INT UNSIGNED NULL AFTER requires_third_party,
  ADD COLUMN default_counter_credit_id INT UNSIGNED NULL AFTER default_counter_debit_id;

ALTER TABLE journal_lines
  ADD COLUMN origin ENUM('manual','proposed','edited') NOT NULL DEFAULT 'manual' AFTER partner_id,
  ADD COLUMN proposal_source VARCHAR(30) NULL AFTER origin,
  ADD COLUMN proposal_rule_code VARCHAR(40) NULL AFTER proposal_source,
  ADD COLUMN proposal_reason VARCHAR(250) NULL AFTER proposal_rule_code;

ALTER TABLE suppliers
  ADD COLUMN default_account_id INT UNSIGNED NULL AFTER account_id,
  ADD COLUMN vat_code VARCHAR(20) NULL AFTER default_account_id,
  ADD COLUMN payment_account_id INT UNSIGNED NULL AFTER vat_code;

ALTER TABLE customers
  ADD COLUMN default_account_id INT UNSIGNED NULL AFTER account_id,
  ADD COLUMN vat_code VARCHAR(20) NULL AFTER default_account_id,
  ADD COLUMN payment_account_id INT UNSIGNED NULL AFTER vat_code;

CREATE TABLE IF NOT EXISTS posting_templates (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id           INT UNSIGNED NOT NULL,
  code             VARCHAR(40)  NOT NULL,
  name             VARCHAR(150) NOT NULL,
  name_en          VARCHAR(150) NULL,
  transaction_type VARCHAR(40)  NOT NULL,
  journal_code     VARCHAR(10)  NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pt_code (org_id, code),
  KEY ix_pt_type (org_id, transaction_type, is_active),
  CONSTRAINT fk_pt_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posting_template_lines (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id      INT UNSIGNED NOT NULL,
  line_no          SMALLINT UNSIGNED NOT NULL,
  side             ENUM('debit','credit') NOT NULL,
  account_rule     VARCHAR(40)  NOT NULL,
  amount_formula   VARCHAR(40)  NOT NULL DEFAULT 'balance',
  third_party_rule ENUM('none','supplier','customer','employee') NOT NULL DEFAULT 'none',
  is_proposed      TINYINT(1)   NOT NULL DEFAULT 1,
  note             VARCHAR(250) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ptl (template_id, line_no),
  CONSTRAINT fk_ptl_tpl FOREIGN KEY (template_id) REFERENCES posting_templates (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proposal_logs (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED NOT NULL,
  entry_id      INT UNSIGNED NULL,
  source        VARCHAR(30)  NOT NULL,
  rule_code     VARCHAR(40)  NULL,
  reason        VARCHAR(250) NULL,
  account_code  VARCHAR(20)  NULL,
  side          ENUM('debit','credit') NOT NULL,
  amount        DECIMAL(20,2) NOT NULL DEFAULT 0,
  outcome       ENUM('proposed','accepted','edited','rejected') NOT NULL DEFAULT 'proposed',
  user_id       INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pl_org (org_id, created_at),
  KEY ix_pl_entry (entry_id),
  CONSTRAINT fk_pl_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
