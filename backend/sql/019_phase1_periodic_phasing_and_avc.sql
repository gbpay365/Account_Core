-- -----------------------------------------------------------------------------
-- Migration 019: Budget Phase 1 - Periodic Phasing (T1-T4) & Progressive AVC
-- Implements SAP S/4HANA & Sage X3 periodic spreading curves and multi-tier
-- Availability Control (AVC) progressive warning/blocking thresholds.
-- -----------------------------------------------------------------------------

-- 1. Add AVC tolerance thresholds to budgets master table
ALTER TABLE budgets 
  ADD COLUMN warning_threshold_pct DECIMAL(5,2) NOT NULL DEFAULT 80.00 AFTER status,
  ADD COLUMN block_threshold_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00 AFTER warning_threshold_pct;

-- 2. Add periodic phasing (Q1-Q4 / T1-T4), spread curve, and line-level warning threshold to budget_lines
ALTER TABLE budget_lines
  ADD COLUMN spread_curve ENUM('equal_quarterly', 'even_monthly', 'front_loaded', 'back_loaded', 'custom') NOT NULL DEFAULT 'equal_quarterly' AFTER control_mode,
  ADD COLUMN warning_threshold_pct DECIMAL(5,2) NULL AFTER spread_curve,
  ADD COLUMN q1_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER warning_threshold_pct,
  ADD COLUMN q2_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER q1_amount,
  ADD COLUMN q3_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER q2_amount,
  ADD COLUMN q4_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER q3_amount;

-- 3. Populate existing budget lines with balanced equal quarterly phasing
UPDATE budget_lines
   SET q1_amount = ROUND(amount / 4, 2),
       q2_amount = ROUND(amount / 4, 2),
       q3_amount = ROUND(amount / 4, 2),
       q4_amount = amount - (ROUND(amount / 4, 2) * 3)
 WHERE amount > 0;
