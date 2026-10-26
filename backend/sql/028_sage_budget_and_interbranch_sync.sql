-- 028_sage_budget_and_interbranch_sync.sql
-- Sage 100c / Sage X3 Interoperability Framework & Multi-Branch Budget Synchronization Gateway

-- 1. Extend Branch Establishments with ERP Profile & Sage Credentials
ALTER TABLE branch_establishments 
  ADD COLUMN IF NOT EXISTS erp_system VARCHAR(50) NOT NULL DEFAULT 'ledgercore',
  ADD COLUMN IF NOT EXISTS api_endpoint_url VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS api_key_or_token VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS sage_company_id VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS sync_frequency VARCHAR(50) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_sync_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS last_sync_status ENUM('never', 'success', 'failed') NOT NULL DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS last_sync_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS budget_allocation_total DECIMAL(18,2) NOT NULL DEFAULT 0.00;

-- 2. Extend Budget Lines & Commitments with Branch Allocation & Source Tracking
ALTER TABLE budget_lines
  ADD COLUMN IF NOT EXISTS branch_id INT UNSIGNED NULL,
  ADD INDEX IF NOT EXISTS idx_bl_branch (branch_id);

ALTER TABLE budget_commitments
  ADD COLUMN IF NOT EXISTS branch_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS source_system VARCHAR(50) NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_reference VARCHAR(100) NULL,
  ADD INDEX IF NOT EXISTS idx_bc_branch (branch_id),
  ADD INDEX IF NOT EXISTS idx_bc_source (source_system);

-- 3. Inter-Branch Budget Appropriations & Transfers Table
CREATE TABLE IF NOT EXISTS interbranch_budget_allocations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  allocation_number VARCHAR(50) NOT NULL,
  budget_id INT UNSIGNED NOT NULL,
  budget_line_id INT UNSIGNED NULL,
  source_branch_id INT UNSIGNED NOT NULL,
  dest_branch_id INT UNSIGNED NOT NULL,
  allocation_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
  notes TEXT NULL,
  status ENUM('draft', 'approved', 'synced_to_remote', 'rejected') NOT NULL DEFAULT 'draft',
  remote_sync_ref VARCHAR(100) NULL,
  remote_synced_at DATETIME NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ibba_num (org_id, allocation_number),
  INDEX idx_ibba_org (org_id),
  INDEX idx_ibba_src (source_branch_id),
  INDEX idx_ibba_dst (dest_branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Sage Synchronization Audit Trail & Message Exchange Log
CREATE TABLE IF NOT EXISTS sage_sync_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL DEFAULT 1,
  branch_id INT UNSIGNED NULL,
  sync_type ENUM('budget_import', 'budget_export', 'commitment_push', 'actuals_sync', 'interbranch_transfer', 'ping') NOT NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  format ENUM('sage_pnm', 'sage_csv', 'sage_json', 'rest_api') NOT NULL,
  status ENUM('success', 'failed', 'partial') NOT NULL,
  records_processed INT NOT NULL DEFAULT 0,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  request_payload JSON NULL,
  response_payload JSON NULL,
  error_message TEXT NULL,
  ip_address VARCHAR(50) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ssl_org (org_id, created_at),
  INDEX idx_ssl_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Add Douala Branch if not exists
INSERT INTO branch_establishments 
  (org_id, code, name, city, branch_type, liaison_account_code, is_active, erp_system, sage_company_id, api_endpoint_url, api_key_or_token, sync_frequency, last_sync_status, last_sync_at, last_sync_message, budget_allocation_total)
VALUES 
  (1, 'DOUALA-BR', 'Centre Médical & Succursale Régionale de Douala', 'Douala', 'clinic', '1852', 1, 'sage_x3', 'SAGE_DOUALA_HOSP', 'https://sage-douala.shisong.health/api/v1/budget', 'sage_x3_token_dla_4412', 'daily', 'success', '2026-10-25 18:30:00', 'Automated nightly sync completed successfully (42 budget lines reconciled)', 120000000.00)
ON DUPLICATE KEY UPDATE 
  erp_system = 'sage_x3',
  sage_company_id = 'SAGE_DOUALA_HOSP',
  api_endpoint_url = 'https://sage-douala.shisong.health/api/v1/budget',
  api_key_or_token = 'sage_x3_token_dla_4412',
  last_sync_status = 'success',
  budget_allocation_total = 120000000.00;

-- 6. Update Existing Branches with ERP Profile
UPDATE branch_establishments 
   SET erp_system = 'ledgercore',
       budget_allocation_total = 450000000.00,
       last_sync_status = 'success',
       last_sync_at = NOW(),
       last_sync_message = 'Headquarters Native Node — Master Budget Ledger'
 WHERE code = 'SHISONG-HQ' AND org_id = 1;

UPDATE branch_establishments 
   SET erp_system = 'sage_100',
       sage_company_id = 'SAGE_YAOUNDE_CLINIC',
       api_endpoint_url = 'https://sage-yaounde.shisong.health/api/v1/budget',
       api_key_or_token = 'sage_live_yde_992144',
       sync_frequency = 'daily',
       last_sync_status = 'success',
       last_sync_at = '2026-10-26 07:15:00',
       last_sync_message = 'Sage 100cloud API handshake verified; 18 commitments synced',
       budget_allocation_total = 75000000.00
 WHERE code = 'YAOUNDE-LIAISON' AND org_id = 1;

UPDATE branch_establishments 
   SET erp_system = 'sage_100',
       sage_company_id = 'SAGE_BAMENDA_SAT',
       api_endpoint_url = 'https://sage-bamenda.shisong.health/api/v1',
       api_key_or_token = 'sage_live_bda_774120',
       sync_frequency = 'manual',
       last_sync_status = 'success',
       last_sync_at = '2026-10-24 16:45:00',
       last_sync_message = 'Manual Sage 100 PNM batch import processed',
       budget_allocation_total = 45000000.00
 WHERE code = 'BAMENDA-SAT' AND org_id = 1;

UPDATE branch_establishments 
   SET erp_system = 'ledgercore',
       budget_allocation_total = 30000000.00,
       last_sync_status = 'success',
       last_sync_at = NOW(),
       last_sync_message = 'Local satellite clinic — Real-time direct ledger link'
 WHERE code = 'KUMBO-TOWN' AND org_id = 1;

-- 7. Seed Integration Client for Sage Enterprise Gateway
INSERT INTO integration_clients 
  (id, org_id, name, client_code, api_key, default_journal_id, default_status, description, is_active)
VALUES 
  (2, 1, 'Sage 100c & Sage X3 Multi-Branch Enterprise Gateway', 'SAGE_GATEWAY', 'lch_live_sage_enterprise_88f9104b2c3d5e6a', 4, 'draft', 'Official Sage 100 / Sage X3 integration connector for branch budget synchronization, purchase commitments, and actual expenditures ingestion', 1)
ON DUPLICATE KEY UPDATE 
  name = 'Sage 100c & Sage X3 Multi-Branch Enterprise Gateway',
  is_active = 1;

-- 8. Seed Initial Inter-Branch Budget Allocations
INSERT IGNORE INTO interbranch_budget_allocations
  (id, org_id, allocation_number, budget_id, source_branch_id, dest_branch_id, allocation_date, amount, currency, notes, status, remote_sync_ref, remote_synced_at)
VALUES
  (1, 1, 'BGT-ALLOC-2026-001', 1, 1, 4, '2026-01-10', 75000000.00, 'XAF', 'Dotation budgétaire initiale 2026 vers la succursale de Yaoundé (Sage 100c)', 'synced_to_remote', 'SAGE-ENV-YDE-2026', '2026-01-10 10:00:00'),
  (2, 1, 'BGT-ALLOC-2026-002', 1, 1, (SELECT id FROM branch_establishments WHERE code = 'DOUALA-BR' LIMIT 1), '2026-01-12', 120000000.00, 'XAF', 'Enveloppe budgétaire d’investissement et fonctionnement Douala (Sage X3)', 'synced_to_remote', 'SAGE-X3-DLA-BGT-01', '2026-01-12 14:30:00'),
  (3, 1, 'BGT-ALLOC-2026-003', 1, 1, 3, '2026-01-15', 45000000.00, 'XAF', 'Dotation d’exploitation médicale satellite Bamenda (Sage 100)', 'synced_to_remote', 'SAGE-ENV-BDA-2026', '2026-01-15 11:20:00');

-- 9. Seed Sample Sage Sync Logs for Instant Verification
INSERT IGNORE INTO sage_sync_logs
  (id, org_id, branch_id, sync_type, direction, format, status, records_processed, total_amount, request_payload, response_payload, created_at)
VALUES
  (1, 1, 4, 'budget_export', 'outbound', 'sage_pnm', 'success', 28, 75000000.00, '{"budget_code": "BUD-2026", "target_branch": "YAOUNDE-LIAISON", "format": "sage_pnm"}', '{"status": "exported", "lines": 28, "filename": "SAGE100_BUDGET_2026_YAOUNDE.PNM"}', '2026-10-25 09:15:00'),
  (2, 1, 4, 'commitment_push', 'inbound', 'rest_api', 'success', 1, 3500000.00, '{"branch_code": "YAOUNDE-LIAISON", "commitment_number": "PO-SAGE-YDE-2026-089", "account_code": "6051", "amount": 3500000, "vendor": "Siemens Healthineers Africa"}', '{"status": "approved", "commitment_id": 105, "remaining_available": 24500000}', '2026-10-25 14:22:00'),
  (3, 1, (SELECT id FROM branch_establishments WHERE code = 'DOUALA-BR' LIMIT 1), 'actuals_sync', 'inbound', 'rest_api', 'success', 12, 18450000.00, '{"branch_code": "DOUALA-BR", "period": "2026-09", "total_actuals": 18450000}', '{"status": "synced", "records": 12, "budget_consumed_updated": true}', '2026-10-25 18:30:00');
