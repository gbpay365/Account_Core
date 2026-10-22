-- -----------------------------------------------------------------------------
-- Migration 020: Budget Phase 2 - Multi-Stage Procurement & Controller Overrides
-- Implements:
-- 1. Multi-Stage Procurement Pipeline (Pre-Commitment / DA -> Firm Commitment / BC -> Liquidation)
-- 2. Controller Emergency Override Ticket Workflow (Dérogations Budgétaires AVC)
-- 3. Pre-commitment tracking on budget lines
-- -----------------------------------------------------------------------------

-- 1. Add procurement stage, parent link, and override link to budget_commitments
ALTER TABLE budget_commitments
  ADD COLUMN stage ENUM('pre_commitment', 'firm_commitment') NOT NULL DEFAULT 'firm_commitment' AFTER commitment_number,
  ADD COLUMN parent_commitment_id INT UNSIGNED NULL AFTER stage,
  ADD COLUMN override_id INT UNSIGNED NULL AFTER parent_commitment_id,
  MODIFY COLUMN status ENUM('draft', 'approved', 'converted', 'liquidated', 'cancelled') NOT NULL DEFAULT 'draft',
  ADD KEY idx_comm_stage (stage),
  ADD KEY idx_comm_parent (parent_commitment_id),
  ADD KEY idx_comm_override (override_id);

-- 2. Add pre_committed_amount to budget_lines for performance caching & multi-stage rollup
ALTER TABLE budget_lines
  ADD COLUMN pre_committed_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER q4_amount;

-- 3. Create budget_overrides table for Controller Derogation / Override Tickets
CREATE TABLE IF NOT EXISTS budget_overrides (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  budget_id INT UNSIGNED NOT NULL,
  budget_line_id INT UNSIGNED NOT NULL,
  ticket_number VARCHAR(40) NOT NULL UNIQUE,
  requested_by INT UNSIGNED NOT NULL,
  authorized_by INT UNSIGNED NULL,
  overrun_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  justification VARCHAR(500) NOT NULL,
  status ENUM('pending', 'approved', 'used', 'rejected', 'expired') NOT NULL DEFAULT 'approved',
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  used_in_commitment_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ovr_org_budget (org_id, budget_id),
  KEY idx_ovr_line (budget_line_id),
  KEY idx_ovr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
