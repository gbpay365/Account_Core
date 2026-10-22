-- -----------------------------------------------------------------------------
-- Migration 018: Budget Carryforward (Report à nouveau budgétaire)
-- Enables rolling over unconsumed budgetary allocations from fiscal year N to N+1
-- -----------------------------------------------------------------------------

-- 1. Add carried_forward_amount column to budget_lines
ALTER TABLE budget_lines ADD COLUMN carried_forward_amount DECIMAL(20,2) NOT NULL DEFAULT 0;

-- 2. Create budget_carryforwards audit and tracking table
CREATE TABLE IF NOT EXISTS budget_carryforwards (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id              INT UNSIGNED NOT NULL,
  source_budget_id    INT UNSIGNED NOT NULL,
  target_budget_id    INT UNSIGNED NOT NULL,
  source_line_id      INT UNSIGNED NOT NULL,
  target_line_id      INT UNSIGNED NOT NULL,
  amount              DECIMAL(20,2) NOT NULL DEFAULT 0,
  reason              VARCHAR(400) NULL,
  carried_by          INT UNSIGNED NULL,
  carried_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_bcf_src (source_budget_id),
  KEY ix_bcf_tgt (target_budget_id),
  KEY ix_bcf_sline (source_line_id),
  KEY ix_bcf_tline (target_line_id),
  CONSTRAINT fk_bcf_org   FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcf_sbud  FOREIGN KEY (source_budget_id) REFERENCES budgets (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcf_tbud  FOREIGN KEY (target_budget_id) REFERENCES budgets (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcf_sline FOREIGN KEY (source_line_id) REFERENCES budget_lines (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcf_tline FOREIGN KEY (target_line_id) REFERENCES budget_lines (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcf_user  FOREIGN KEY (carried_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
