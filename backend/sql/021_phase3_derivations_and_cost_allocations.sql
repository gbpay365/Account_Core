-- -----------------------------------------------------------------------------
-- Migration 021: Phase 3 Hierarchical Dimension Derivations & Secondary Cost Allocations
-- Supports SAP FMDERIVE-style Account/Cost Center Derivation & Secondary Repartition Cycles
-- -----------------------------------------------------------------------------

-- 1. Budget Derivation Rules (FMDERIVE / Dimension Pyramids)
CREATE TABLE IF NOT EXISTS budget_derivation_rules (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                 INT UNSIGNED NOT NULL,
  rule_code              VARCHAR(50)  NOT NULL,
  rule_name              VARCHAR(150) NOT NULL,
  dimension_type         ENUM('account', 'cost_center') NOT NULL DEFAULT 'account',
  source_pattern         VARCHAR(50)  NOT NULL,
  target_account_id      INT UNSIGNED NULL,
  target_cost_center_id  INT UNSIGNED NULL,
  priority               INT UNSIGNED NOT NULL DEFAULT 10,
  is_active              TINYINT(1)   NOT NULL DEFAULT 1,
  notes                  TEXT         NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_bdr_lookup (org_id, dimension_type, is_active, priority),
  CONSTRAINT fk_bdr_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_bdr_tgt_acct FOREIGN KEY (target_account_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_bdr_tgt_cc FOREIGN KEY (target_cost_center_id) REFERENCES cost_centers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Secondary Cost Allocation Cycles (Cycles de Répartition Analytique / SAP Assessment)
CREATE TABLE IF NOT EXISTS cost_allocation_cycles (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                 INT UNSIGNED NOT NULL,
  code                   VARCHAR(50)  NOT NULL,
  name                   VARCHAR(150) NOT NULL,
  cycle_type             ENUM('assessment', 'distribution') NOT NULL DEFAULT 'assessment',
  description            TEXT         NULL,
  is_active              TINYINT(1)   NOT NULL DEFAULT 1,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cac_code (org_id, code),
  CONSTRAINT fk_cac_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Allocation Segments (Sender definition)
CREATE TABLE IF NOT EXISTS cost_allocation_segments (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id               INT UNSIGNED NOT NULL,
  segment_name           VARCHAR(150) NOT NULL,
  sender_cost_center_id  INT UNSIGNED NOT NULL,
  sender_account_id      INT UNSIGNED NULL,
  method                 ENUM('percentage', 'fixed_amount', 'headcount', 'square_meters') NOT NULL DEFAULT 'percentage',
  notes                  TEXT         NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cas_cycle FOREIGN KEY (cycle_id) REFERENCES cost_allocation_cycles (id) ON DELETE CASCADE,
  CONSTRAINT fk_cas_sender_cc FOREIGN KEY (sender_cost_center_id) REFERENCES cost_centers (id) ON DELETE CASCADE,
  CONSTRAINT fk_cas_sender_acct FOREIGN KEY (sender_account_id) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Allocation Targets (Receivers and percentage weights)
CREATE TABLE IF NOT EXISTS cost_allocation_targets (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  segment_id             INT UNSIGNED NOT NULL,
  receiver_cost_center_id INT UNSIGNED NOT NULL,
  weight_pct             DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  fixed_amount           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  CONSTRAINT fk_cat_segment FOREIGN KEY (segment_id) REFERENCES cost_allocation_segments (id) ON DELETE CASCADE,
  CONSTRAINT fk_cat_receiver_cc FOREIGN KEY (receiver_cost_center_id) REFERENCES cost_centers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Allocation Execution Runs (Execution history and GL audit tracking)
CREATE TABLE IF NOT EXISTS cost_allocation_runs (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                 INT UNSIGNED NOT NULL,
  cycle_id               INT UNSIGNED NOT NULL,
  fiscal_year_id         INT UNSIGNED NOT NULL,
  period_id              INT UNSIGNED NULL,
  run_number             VARCHAR(50)  NOT NULL,
  run_date               DATE         NOT NULL,
  total_allocated_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  status                 ENUM('simulated', 'posted', 'reversed') NOT NULL DEFAULT 'posted',
  journal_entry_id       INT UNSIGNED NULL,
  executed_by            INT UNSIGNED NULL,
  notes                  TEXT         NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_car_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_car_cycle FOREIGN KEY (cycle_id) REFERENCES cost_allocation_cycles (id) ON DELETE CASCADE,
  CONSTRAINT fk_car_fy FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years (id) ON DELETE RESTRICT,
  CONSTRAINT fk_car_period FOREIGN KEY (period_id) REFERENCES accounting_periods (id) ON DELETE SET NULL,
  CONSTRAINT fk_car_user FOREIGN KEY (executed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Allocation Run Lines (Audit trail of each transfer from sender to receiver)
CREATE TABLE IF NOT EXISTS cost_allocation_run_lines (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id                 INT UNSIGNED NOT NULL,
  segment_id             INT UNSIGNED NOT NULL,
  sender_cost_center_id  INT UNSIGNED NOT NULL,
  receiver_cost_center_id INT UNSIGNED NOT NULL,
  allocated_amount       DECIMAL(18,2) NOT NULL,
  weight_pct             DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  calculation_basis      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  CONSTRAINT fk_carl_run FOREIGN KEY (run_id) REFERENCES cost_allocation_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
