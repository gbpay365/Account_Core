-- Migration 025: Phase 7 — Multi-Donor Co-Financing Keys & Expense Proration (TOMPRO / World Bank Parity)

-- 1. Ensure Sovereign Counterpart Fund Project exists (BIE / Fonds de Contrepartie)
INSERT INTO donor_projects (org_id, donor_name, project_code, project_name, agreement_ref, currency, total_budget, financing_rate, designated_bank_account_id, start_date, end_date, status, notes)
SELECT 1, 'État du Cameroun (MINEPAT / MINSANTE)', 'BIE-CAM-2026', 'Fonds de Contrepartie Nationale & Budget d\'Investissement Public', 'DECRET-BIE-2026-04', 'XAF', 80000000.00, 100.00, 1, '2026-01-01', '2027-12-31', 'active', 'Fonds souverains de contrepartie obligatoire pour co-financement Banque Mondiale et Bailleurs.'
WHERE NOT EXISTS (SELECT 1 FROM donor_projects WHERE org_id = 1 AND project_code = 'BIE-CAM-2026');

-- 2. Multi-Donor Co-Financing Keys (Clés de Co-financement Multi-Bailleurs)
CREATE TABLE IF NOT EXISTS donor_cofinancing_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dck_code (org_id, code),
  KEY idx_dck_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Co-Financing Key Percentage Breakdown Lines (Quote-parts Bailleurs)
CREATE TABLE IF NOT EXISTS donor_cofinancing_key_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_id INT NOT NULL,
  project_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NULL,
  percentage DECIMAL(5,2) NOT NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dckl_key (key_id),
  KEY idx_dckl_proj (project_id),
  KEY idx_dckl_cat (category_id),
  CONSTRAINT fk_dckl_key FOREIGN KEY (key_id) REFERENCES donor_cofinancing_keys (id) ON DELETE CASCADE,
  CONSTRAINT fk_dckl_proj FOREIGN KEY (project_id) REFERENCES donor_projects (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Materialized Co-Financing Splits Ledger (Grand Livre des Répartitions de Co-financement)
CREATE TABLE IF NOT EXISTS donor_cofinancing_splits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  key_id INT NOT NULL,
  project_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NULL,
  commitment_id INT UNSIGNED NULL,
  payment_order_id INT UNSIGNED NULL,
  voucher_ref VARCHAR(100) NULL,
  total_source_amount DECIMAL(20,2) NOT NULL,
  split_percentage DECIMAL(5,2) NOT NULL,
  split_amount DECIMAL(20,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
  stage VARCHAR(30) NOT NULL DEFAULT 'commitment',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dcs_org (org_id),
  KEY idx_dcs_key (key_id),
  KEY idx_dcs_proj (project_id),
  KEY idx_dcs_comm (commitment_id),
  KEY idx_dcs_mandat (payment_order_id),
  CONSTRAINT fk_dcs_key FOREIGN KEY (key_id) REFERENCES donor_cofinancing_keys (id) ON DELETE RESTRICT,
  CONSTRAINT fk_dcs_proj FOREIGN KEY (project_id) REFERENCES donor_projects (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Extend budget_lines and budget_commitments with cofinancing_key_id
SET @dbname = DATABASE();

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'budget_lines' AND COLUMN_NAME = 'cofinancing_key_id');
SET @stmt = IF(@col_exists = 0, 'ALTER TABLE budget_lines ADD COLUMN cofinancing_key_id INT NULL AFTER spread_curve, ADD KEY idx_bl_cofin (cofinancing_key_id)', 'SELECT 1');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'budget_commitments' AND COLUMN_NAME = 'cofinancing_key_id');
SET @stmt = IF(@col_exists = 0, 'ALTER TABLE budget_commitments ADD COLUMN cofinancing_key_id INT NULL AFTER procurement_package_id, ADD KEY idx_bc_cofin (cofinancing_key_id)', 'SELECT 1');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. Seed Default Standard Multi-Donor Co-Financing Keys
INSERT INTO donor_cofinancing_keys (org_id, code, name, description)
VALUES
  (1, 'COFIN-IDA-BIE-80-20', 'Co-financement Travaux & BTP (80% IDA / 20% Contrepartie)', 'Clé standard de financement pour génie civil et réhabilitation hospitalière.'),
  (1, 'COFIN-SANTE-70-20-10', 'Co-financement Programme Santé (70% IDA / 20% Fonds Mondial / 10% BIE)', 'Clé tripartite de renforcement des capacités et fournitures médicales.'),
  (1, 'COFIN-FM-100', 'Financement Exclusif Fonds Mondial (100% Palu/VIH)', 'Prise en charge intégrale des intrants et moustiquaires.')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 7. Seed lines for Co-Financing Keys
-- Key 1: 80% IDA (proj 2), 20% BIE (proj 3)
INSERT INTO donor_cofinancing_key_lines (key_id, project_id, percentage, notes)
SELECT k.id, p.id, 80.00, 'Quote-part Crédit IDA'
FROM donor_cofinancing_keys k
JOIN donor_projects p ON p.project_code = 'IDA-SANTE-02'
WHERE k.code = 'COFIN-IDA-BIE-80-20' AND k.org_id = 1
  AND NOT EXISTS (SELECT 1 FROM donor_cofinancing_key_lines WHERE key_id = k.id AND project_id = p.id);

INSERT INTO donor_cofinancing_key_lines (key_id, project_id, percentage, notes)
SELECT k.id, p.id, 20.00, 'Quote-part Contrepartie État BIE'
FROM donor_cofinancing_keys k
JOIN donor_projects p ON p.project_code = 'BIE-CAM-2026'
WHERE k.code = 'COFIN-IDA-BIE-80-20' AND k.org_id = 1
  AND NOT EXISTS (SELECT 1 FROM donor_cofinancing_key_lines WHERE key_id = k.id AND project_id = p.id);

-- Key 2: 70% IDA, 20% FM, 10% BIE
INSERT INTO donor_cofinancing_key_lines (key_id, project_id, percentage, notes)
SELECT k.id, p.id, 70.00, 'Quote-part IDA'
FROM donor_cofinancing_keys k
JOIN donor_projects p ON p.project_code = 'IDA-SANTE-02'
WHERE k.code = 'COFIN-SANTE-70-20-10' AND k.org_id = 1
  AND NOT EXISTS (SELECT 1 FROM donor_cofinancing_key_lines WHERE key_id = k.id AND project_id = p.id);

INSERT INTO donor_cofinancing_key_lines (key_id, project_id, percentage, notes)
SELECT k.id, p.id, 20.00, 'Quote-part Fonds Mondial'
FROM donor_cofinancing_keys k
JOIN donor_projects p ON p.project_code = 'FM-PALU-2026'
WHERE k.code = 'COFIN-SANTE-70-20-10' AND k.org_id = 1
  AND NOT EXISTS (SELECT 1 FROM donor_cofinancing_key_lines WHERE key_id = k.id AND project_id = p.id);

INSERT INTO donor_cofinancing_key_lines (key_id, project_id, percentage, notes)
SELECT k.id, p.id, 10.00, 'Quote-part BIE'
FROM donor_cofinancing_keys k
JOIN donor_projects p ON p.project_code = 'BIE-CAM-2026'
WHERE k.code = 'COFIN-SANTE-70-20-10' AND k.org_id = 1
  AND NOT EXISTS (SELECT 1 FROM donor_cofinancing_key_lines WHERE key_id = k.id AND project_id = p.id);

-- Key 3: 100% FM
INSERT INTO donor_cofinancing_key_lines (key_id, project_id, percentage, notes)
SELECT k.id, p.id, 100.00, 'Subvention intégrale Fonds Mondial'
FROM donor_cofinancing_keys k
JOIN donor_projects p ON p.project_code = 'FM-PALU-2026'
WHERE k.code = 'COFIN-FM-100' AND k.org_id = 1
  AND NOT EXISTS (SELECT 1 FROM donor_cofinancing_key_lines WHERE key_id = k.id AND project_id = p.id);
