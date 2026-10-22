-- -----------------------------------------------------------------------------
-- Migration 024: Budget Phase 6 - Plan de Passation des Marchés (PPM) & Seuils
-- Implements International & Public Procurement Standards (TOMPRO / World Bank):
-- 1. Table: procurement_plans (PPM Annuel / Pluriannuel)
-- 2. Table: procurement_packages (Marchés / Lots contractuels & Jalons)
-- 3. Table: procurement_thresholds (Grille des Seuils Réglementaires & Bailleurs)
-- 4. Linkage to budget_commitments (procurement_package_id)
-- -----------------------------------------------------------------------------

-- 1. Table: procurement_plans (PPM)
CREATE TABLE IF NOT EXISTS procurement_plans (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  budget_id INT UNSIGNED NOT NULL,
  fiscal_year_id INT UNSIGNED NOT NULL,
  plan_code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status ENUM('draft', 'submitted', 'approved', 'archived') NOT NULL DEFAULT 'draft',
  donor_approval_reference VARCHAR(100) NULL,
  donor_approval_date DATE NULL,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ppm_org (org_id),
  KEY idx_ppm_budget (budget_id),
  KEY idx_ppm_fy (fiscal_year_id),
  KEY idx_ppm_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table: procurement_packages (Lots / Marchés du PPM)
CREATE TABLE IF NOT EXISTS procurement_packages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  budget_line_id INT UNSIGNED NOT NULL,
  package_number VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  procurement_category ENUM('works', 'goods', 'consulting_firms', 'individual_consultants', 'non_consulting_services') NOT NULL DEFAULT 'goods',
  procurement_method ENUM('AON', 'AOI', 'DC', 'ED', 'SFQ', 'QCBS', 'LCS', '3CV') NOT NULL DEFAULT 'AON',
  review_type ENUM('prior_review', 'post_review') NOT NULL DEFAULT 'post_review',
  estimated_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  contract_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  awarded_supplier_id INT UNSIGNED NULL,
  awarded_supplier_name VARCHAR(255) NULL,
  contract_number VARCHAR(100) NULL,
  contract_signed_date DATE NULL,
  status ENUM('planned', 'tender_launched', 'bids_evaluated', 'awarded', 'contract_signed', 'cancelled') NOT NULL DEFAULT 'planned',
  planned_launch_date DATE NULL,
  actual_launch_date DATE NULL,
  planned_opening_date DATE NULL,
  actual_opening_date DATE NULL,
  planned_award_date DATE NULL,
  actual_award_date DATE NULL,
  planned_completion_date DATE NULL,
  actual_completion_date DATE NULL,
  commitment_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pkg_org (org_id),
  KEY idx_pkg_plan (plan_id),
  KEY idx_pkg_line (budget_line_id),
  KEY idx_pkg_status (status),
  KEY idx_pkg_cat (procurement_category),
  KEY idx_pkg_comm (commitment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table: procurement_thresholds (Seuils Réglementaires des Marchés Publics & Bailleurs)
CREATE TABLE IF NOT EXISTS procurement_thresholds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  donor_code VARCHAR(50) NOT NULL DEFAULT 'NATIONAL',
  category ENUM('works', 'goods', 'consulting_firms', 'individual_consultants', 'non_consulting_services') NOT NULL,
  method VARCHAR(20) NOT NULL,
  min_amount DECIMAL(20,2) NOT NULL DEFAULT 0.00,
  max_amount DECIMAL(20,2) NOT NULL DEFAULT 999999999999.00,
  prior_review_threshold DECIMAL(20,2) NOT NULL DEFAULT 50000000.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pt_org (org_id),
  KEY idx_pt_donor (donor_code),
  KEY idx_pt_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed default standard regulatory thresholds (CEMAC / World Bank benchmark)
INSERT INTO procurement_thresholds (org_id, donor_code, category, method, min_amount, max_amount, prior_review_threshold, currency, description)
VALUES
  (1, 'NATIONAL', 'goods', 'DC', 0.00, 25000000.00, 25000000.00, 'XAF', 'Demande de Cotations Fournitures (< 25M FCFA)'),
  (1, 'NATIONAL', 'goods', 'AON', 25000000.00, 500000000.00, 100000000.00, 'XAF', 'Appel d\'Offres National Fournitures (25M à 500M FCFA)'),
  (1, 'NATIONAL', 'goods', 'AOI', 500000000.00, 999999999999.00, 250000000.00, 'XAF', 'Appel d\'Offres International Fournitures (> 500M FCFA)'),
  (1, 'NATIONAL', 'works', 'DC', 0.00, 50000000.00, 50000000.00, 'XAF', 'Demande de Cotations Travaux (< 50M FCFA)'),
  (1, 'NATIONAL', 'works', 'AON', 50000000.00, 1000000000.00, 200000000.00, 'XAF', 'Appel d\'Offres National Travaux (50M à 1 Milliard FCFA)'),
  (1, 'NATIONAL', 'works', 'AOI', 1000000000.00, 999999999999.00, 500000000.00, 'XAF', 'Appel d\'Offres International Travaux (> 1 Milliard FCFA)'),
  (1, 'NATIONAL', 'consulting_firms', 'SFQ', 0.00, 50000000.00, 50000000.00, 'XAF', 'Sélection Fondée sur les Qualifications Consultants (< 50M FCFA)'),
  (1, 'NATIONAL', 'consulting_firms', 'QCBS', 50000000.00, 999999999999.00, 100000000.00, 'XAF', 'Sélection Qualité/Coût Firmes (> 50M FCFA)'),
  (1, 'NATIONAL', 'individual_consultants', '3CV', 0.00, 999999999999.00, 30000000.00, 'XAF', 'Sélection Consultants Individuels sur 3 CV')
ON DUPLICATE KEY UPDATE org_id = VALUES(org_id);
