-- -----------------------------------------------------------------------------
-- Migration 015: Harmonize bank_statements and bank_statement_lines with Phase 1 spec
-- -----------------------------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS bank_statement_lines;
DROP TABLE IF EXISTS bank_statements;

CREATE TABLE bank_statements (
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

CREATE TABLE bank_statement_lines (
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

SET FOREIGN_KEY_CHECKS = 1;
