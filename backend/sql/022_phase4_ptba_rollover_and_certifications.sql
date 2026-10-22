-- -----------------------------------------------------------------------------
-- Migration 022: Budget Phase 4 - Institutional Procurement, PTBA & PO Rollover
-- Implements:
-- 1. Service Certification / Acceptance Records (PV de Réception / Service Fait / GR)
-- 2. Open Firm Commitment / Purchase Order Carryforward (Year N -> Year N+1)
-- 3. PTBA Mass Formulation & Excel/CSV Batch Import Audits
-- -----------------------------------------------------------------------------

-- 1. Add certification & carryover linkage to budget_commitments
ALTER TABLE budget_commitments
  ADD COLUMN certified_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER amount,
  ADD COLUMN is_carried_over TINYINT(1) NOT NULL DEFAULT 0 AFTER certified_amount,
  ADD COLUMN carried_over_from_id INT UNSIGNED NULL AFTER is_carried_over,
  ADD KEY idx_comm_carryover (carried_over_from_id);

-- 2. Table: service_certifications (Procès-Verbaux de Réception / Service Fait)
CREATE TABLE IF NOT EXISTS service_certifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  commitment_id INT UNSIGNED NOT NULL,
  certificate_number VARCHAR(50) NOT NULL UNIQUE,
  certificate_date DATE NOT NULL,
  inspector_name VARCHAR(150) NOT NULL,
  certified_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  status ENUM('draft', 'certified', 'rejected', 'liquidated') NOT NULL DEFAULT 'certified',
  conformity_rating ENUM('full_conformity', 'minor_reserves', 'major_non_conformity') NOT NULL DEFAULT 'full_conformity',
  observations TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sc_org (org_id),
  KEY idx_sc_comm (commitment_id),
  KEY idx_sc_status (status),
  KEY idx_sc_date (certificate_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table: commitment_rollovers (Audit trail of active PO carryovers Year N -> N+1)
CREATE TABLE IF NOT EXISTS commitment_rollovers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  source_fiscal_year_id INT UNSIGNED NOT NULL,
  target_fiscal_year_id INT UNSIGNED NOT NULL,
  source_commitment_id INT UNSIGNED NOT NULL,
  target_commitment_id INT UNSIGNED NOT NULL,
  rollover_amount DECIMAL(20,2) NOT NULL,
  rollover_number VARCHAR(50) NOT NULL UNIQUE,
  executed_by INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cr_org (org_id),
  KEY idx_cr_src_fy (source_fiscal_year_id),
  KEY idx_cr_tgt_fy (target_fiscal_year_id),
  KEY idx_cr_src_comm (source_commitment_id),
  KEY idx_cr_tgt_comm (target_commitment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table: budget_ptba_imports (Audit trail of PTBA bulk imports)
CREATE TABLE IF NOT EXISTS budget_ptba_imports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  budget_id INT UNSIGNED NOT NULL,
  batch_number VARCHAR(50) NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  lines_imported INT UNSIGNED NOT NULL DEFAULT 0,
  lines_updated INT UNSIGNED NOT NULL DEFAULT 0,
  total_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  imported_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bpi_org (org_id),
  KEY idx_bpi_budget (budget_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
