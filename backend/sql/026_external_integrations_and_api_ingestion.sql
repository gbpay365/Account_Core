-- 026_external_integrations_and_api_ingestion.sql
-- Integration Clients, API Keys, Event Mappings, and Ingestion Audit Logs for External Systems (e.g., HMS, POS, ERP, Billing)

CREATE TABLE IF NOT EXISTS integration_clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  client_code VARCHAR(50) NOT NULL,
  api_key VARCHAR(100) NOT NULL,
  api_secret VARCHAR(100) NULL,
  default_journal_id INT NULL,
  default_status ENUM('draft', 'posted') NOT NULL DEFAULT 'draft',
  ip_whitelist VARCHAR(255) NULL,
  webhook_url VARCHAR(255) NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_int_clients_key (api_key),
  UNIQUE KEY uk_int_clients_code (org_id, client_code),
  INDEX idx_int_clients_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  client_id INT NULL,
  event_code VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  default_journal_id INT NULL,
  debit_account_id INT NOT NULL,
  credit_account_id INT NOT NULL,
  default_cost_center_id INT NULL,
  tax_code_id INT NULL,
  description_template VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_int_map_org (org_id, event_code),
  INDEX idx_int_map_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  client_id INT NULL,
  event_code VARCHAR(100) NULL,
  external_reference VARCHAR(120) NULL,
  request_ip VARCHAR(50) NULL,
  payload JSON NULL,
  entry_id INT NULL,
  entry_no VARCHAR(50) NULL,
  status ENUM('draft_created', 'auto_posted', 'rejected', 'duplicate') NOT NULL,
  total_amount DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
  error_message TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_int_logs_org (org_id, created_at),
  INDEX idx_int_logs_ref (org_id, external_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default HMS integration client and standard healthcare mapping rules if not existing
INSERT IGNORE INTO integration_clients 
  (id, org_id, name, client_code, api_key, default_journal_id, default_status, description, is_active)
VALUES 
  (1, 1, 'Hospital Management System (HMS Core)', 'HMS_MAIN', 'lch_live_hms_77d2e8fa91024bc681f03aa4', 4, 'draft', 'Primary HMS gateway for outpatient, inpatient, consultation, and pharmacy collections', 1);

-- Default healthcare event mappings:
-- 1. CONSULTATION_FEE: Debit 5711 (Caisse) or Bank, Credit 7061 (Consultations et actes medicaux), Cost Center URG (Urgences / Soins)
INSERT IGNORE INTO integration_mappings
  (id, org_id, client_id, event_code, name, default_journal_id, debit_account_id, credit_account_id, default_cost_center_id, description_template, is_active)
VALUES
  (1, 1, 1, 'CONSULTATION_FEE', 'Medical Consultation & Clinical Fees', 4, 821, 396, 3, 'Consultation fee — {patient_name} ({reference})', 1),
  (2, 1, 1, 'HOSPITAL_BILLING', 'Inpatient Ward & Bed Day Billing', 4, 345, 396, 4, 'Hospitalisation billing — {patient_name} ({reference})', 1),
  (3, 1, 1, 'PHARMACY_SALE', 'Hospital Dispensary & Pharmacy Medication Sales', 4, 821, 882, 3, 'Medication dispensary sale — {reference}', 1),
  (4, 1, 1, 'PATIENT_DEPOSIT', 'Patient Advance Deposit / Caution hospitalière', 6, 821, 345, 1, 'Patient caution deposit — {patient_name} ({reference})', 1);
