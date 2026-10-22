-- -----------------------------------------------------------------------------
-- Migration 023: Budget Phase 5 - Ordonnancement & Mandats de Paiement
-- Implements the Public & Donor 5-Stage Expenditure Chain:
-- 1. DA: Pré-engagement (budget_pre_commitments)
-- 2. BC: Engagement Ferme (budget_commitments)
-- 3. PV: Service Fait / Certification (service_certifications)
-- 4. MDT: Mandat de Paiement / Ordonnancement (budget_payment_orders)
-- 5. REG: Règlement / Décaissement Trésorerie (Disbursement & Settlement)
-- -----------------------------------------------------------------------------

-- 1. Add liquidation/mandating tracking columns to budget_commitments
ALTER TABLE budget_commitments
  ADD COLUMN mandated_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER certified_amount,
  ADD COLUMN paid_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00 AFTER mandated_amount;

-- 2. Table: budget_payment_orders (Mandats de Paiement / Ordonnancement)
CREATE TABLE IF NOT EXISTS budget_payment_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  mandat_number VARCHAR(50) NOT NULL UNIQUE,
  mandat_date DATE NOT NULL,
  budget_id INT UNSIGNED NOT NULL,
  budget_line_id INT UNSIGNED NOT NULL,
  commitment_id INT UNSIGNED NULL,
  certification_id INT UNSIGNED NULL,
  supplier_id INT UNSIGNED NULL,
  beneficiary_name VARCHAR(255) NOT NULL,
  beneficiary_bank_details VARCHAR(255) NULL,
  invoice_number VARCHAR(100) NULL,
  invoice_date DATE NULL,
  gross_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  tax_withholding_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  warranty_retention_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  penalty_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
  object_description TEXT NOT NULL,
  status ENUM('draft', 'submitted', 'visa_approved', 'visa_rejected', 'transmitted_treasury', 'paid', 'cancelled') NOT NULL DEFAULT 'draft',
  ordered_by INT UNSIGNED NULL,
  ordered_at DATETIME NULL,
  visa_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  visa_by INT UNSIGNED NULL,
  visa_date DATETIME NULL,
  visa_notes TEXT NULL,
  payment_id INT UNSIGNED NULL,
  payment_method ENUM('bank_transfer', 'check', 'cash', 'other') NULL,
  bank_account_id INT UNSIGNED NULL,
  payment_reference VARCHAR(100) NULL,
  paid_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  paid_at DATETIME NULL,
  paid_by INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bpo_org (org_id),
  KEY idx_bpo_budget (budget_id),
  KEY idx_bpo_line (budget_line_id),
  KEY idx_bpo_comm (commitment_id),
  KEY idx_bpo_cert (certification_id),
  KEY idx_bpo_status (status),
  KEY idx_bpo_visa (visa_status),
  KEY idx_bpo_date (mandat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table: budget_payment_order_audit (Visa and Transition Logs)
CREATE TABLE IF NOT EXISTS budget_payment_order_audit (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  payment_order_id INT UNSIGNED NOT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_by INT UNSIGNED NULL,
  actor_name VARCHAR(150) NULL,
  action_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  KEY idx_bpoa_order (payment_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
