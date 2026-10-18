-- ============================================================================
-- Migration 013: Phase 4 - CEMAC Statutory Payroll (DIPE), DFE Electronic
-- Invoicing & Inter-Branch Reciprocal Clearing (SYSCOHADA AUDCIF)
-- ============================================================================

-- 1. Ensure Required SYSCOHADA Postable Accounts Exist
INSERT INTO accounts (org_id, code, name, name_en, account_class, parent_id, level, account_type, normal_side, is_postable, is_active, in_tier_normal)
SELECT o.id, '1851', 'Comptes de liaison Siège / Hôpital Central', 'Headquarters / Central Hospital Reciprocal Liaison', 1, NULL, 3, 'liability', 'credit', 1, 1, 1 FROM organizations o
UNION ALL
SELECT o.id, '1852', 'Comptes de liaison Succursales et Dispensaires', 'Branch Clinics & Satellite Dispensaries Liaison', 1, NULL, 3, 'liability', 'credit', 1, 1, 1 FROM organizations o
UNION ALL
SELECT o.id, '4421', 'État, autres organismes (FNE et CFC)', 'State & Other Agencies (FNE / CFC Social Contributions)', 4, NULL, 3, 'liability', 'credit', 1, 1, 1 FROM organizations o
UNION ALL
SELECT o.id, '6461', 'Droits de timbres fiscaux sur factures', 'Statutory Fiscal Stamp Duties on Commercial Invoices', 6, NULL, 3, 'expense', 'debit', 1, 1, 1 FROM organizations o
ON DUPLICATE KEY UPDATE is_postable = 1, is_active = 1;

-- 2. Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  registration_number VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(50) NULL,
  niu VARCHAR(50) NOT NULL,
  cnps_number VARCHAR(50) NOT NULL,
  department VARCHAR(100) NOT NULL,
  job_title VARCHAR(150) NOT NULL,
  contract_type ENUM('CDI', 'CDD', 'STAGE', 'TEMPORAIRE') DEFAULT 'CDI',
  hire_date DATE NOT NULL,
  base_salary DECIMAL(15,2) NOT NULL DEFAULT 0,
  transport_allowance DECIMAL(15,2) NOT NULL DEFAULT 0,
  housing_allowance DECIMAL(15,2) NOT NULL DEFAULT 0,
  representation_allowance DECIMAL(15,2) NOT NULL DEFAULT 0,
  children_count INT NOT NULL DEFAULT 0,
  bank_name VARCHAR(100) DEFAULT 'Afriland First Bank',
  bank_account_rib VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_emp_reg (org_id, registration_number),
  CONSTRAINT fk_emp_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  INDEX idx_emp_dept (department),
  INDEX idx_emp_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Payroll Runs Table (Périodes de Paie & Synthèse Mensuelle)
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  period_code VARCHAR(20) NOT NULL,
  period_name VARCHAR(100) NOT NULL,
  run_date DATE NOT NULL,
  total_gross DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_taxable DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cnps_employee DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_irpp DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cac DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_tdl DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cfc_employee DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_net_payable DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cnps_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_fne DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cfc_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_employer_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  journal_entry_id INT UNSIGNED NULL,
  status ENUM('draft', 'calculated', 'posted', 'paid') DEFAULT 'draft',
  created_by VARCHAR(100) DEFAULT 'Chef Comptable',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prun_code (org_id, period_code),
  CONSTRAINT fk_prun_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_prun_je FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Payslips Table (Bulletins de Salaire Individuels)
CREATE TABLE IF NOT EXISTS payslips (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  payroll_run_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  period_code VARCHAR(20) NOT NULL,
  base_salary DECIMAL(15,2) NOT NULL DEFAULT 0,
  overtime_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  bonuses_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  transport_allowance DECIMAL(15,2) NOT NULL DEFAULT 0,
  housing_allowance DECIMAL(15,2) NOT NULL DEFAULT 0,
  representation_allowance DECIMAL(15,2) NOT NULL DEFAULT 0,
  gross_salary DECIMAL(15,2) NOT NULL DEFAULT 0,
  taxable_gross DECIMAL(15,2) NOT NULL DEFAULT 0,
  cnps_capped_gross DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Retenues Salariales
  cnps_employee DECIMAL(15,2) NOT NULL DEFAULT 0,
  irpp DECIMAL(15,2) NOT NULL DEFAULT 0,
  cac DECIMAL(15,2) NOT NULL DEFAULT 0,
  tdl DECIMAL(15,2) NOT NULL DEFAULT 0,
  cfc_employee DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_employee_deductions DECIMAL(15,2) NOT NULL DEFAULT 0,
  net_salary DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Charges Patronales
  cnps_pvi_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  cnps_pf_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  cnps_at_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cnps_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  fne_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  cfc_employer DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_employer_contributions DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_payroll_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_method ENUM('VIREMENT', 'ESPECES', 'CHEQUE', 'MOMO') DEFAULT 'VIREMENT',
  payment_status ENUM('pending', 'paid') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_pslip_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_pslip_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs (id) ON DELETE CASCADE,
  CONSTRAINT fk_pslip_emp FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  INDEX idx_pslip_period (period_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Electronic Invoicing & DFE Fiscal Stamp Duty (Dispositif Fiscal Électronique)
CREATE TABLE IF NOT EXISTS dfe_invoices (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  invoice_number VARCHAR(50) NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_niu VARCHAR(50) NOT NULL,
  customer_email VARCHAR(150) NULL,
  invoice_date DATE NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAF',
  total_ht DECIMAL(15,2) NOT NULL DEFAULT 0,
  tva_rate DECIMAL(5,2) NOT NULL DEFAULT 19.25,
  total_tva DECIMAL(15,2) NOT NULL DEFAULT 0,
  fiscal_stamp_duty DECIMAL(15,2) NOT NULL DEFAULT 1000.00,
  total_ttc DECIMAL(15,2) NOT NULL DEFAULT 0,
  dfe_security_token VARCHAR(64) NOT NULL,
  dfe_qr_payload TEXT NOT NULL,
  dfe_status ENUM('certified', 'cancelled') DEFAULT 'certified',
  journal_entry_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dfe_inv (org_id, invoice_number),
  UNIQUE KEY uq_dfe_token (dfe_security_token),
  CONSTRAINT fk_dfe_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_dfe_je FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  INDEX idx_dfe_date (invoice_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Branch Establishments & Reciprocal Inter-Branch Accounts (Compte 18)
CREATE TABLE IF NOT EXISTS branch_establishments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  city VARCHAR(100) NOT NULL,
  branch_type ENUM('headquarters', 'hospital', 'clinic', 'dispensary', 'pharmacy') NOT NULL DEFAULT 'clinic',
  liaison_account_code VARCHAR(20) NOT NULL DEFAULT '1851',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_branch_code (org_id, code),
  CONSTRAINT fk_branch_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interbranch_transfers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  transfer_number VARCHAR(50) NOT NULL,
  source_branch_id INT UNSIGNED NOT NULL,
  dest_branch_id INT UNSIGNED NOT NULL,
  transfer_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'XAF',
  description VARCHAR(255) NOT NULL,
  source_journal_entry_id INT UNSIGNED NULL,
  dest_journal_entry_id INT UNSIGNED NULL,
  status ENUM('draft', 'posted', 'reconciled') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ibt_num (org_id, transfer_number),
  CONSTRAINT fk_ibt_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_ibt_src FOREIGN KEY (source_branch_id) REFERENCES branch_establishments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_ibt_dst FOREIGN KEY (dest_branch_id) REFERENCES branch_establishments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_ibt_sje FOREIGN KEY (source_journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  CONSTRAINT fk_ibt_dje FOREIGN KEY (dest_journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
