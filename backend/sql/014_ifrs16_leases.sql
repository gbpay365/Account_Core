-- 014_ifrs16_leases.sql
-- IFRS 16 Leases & Right-of-Use (ROU) Asset Register

CREATE TABLE IF NOT EXISTS lease_contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  contract_ref VARCHAR(64) NOT NULL,
  asset_name VARCHAR(255) NOT NULL,
  lessor_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  term_months INT NOT NULL,
  monthly_payment DECIMAL(15,2) NOT NULL,
  discount_rate_pct DECIMAL(6,3) NOT NULL,
  initial_liability DECIMAL(15,2) NOT NULL,
  initial_rou_asset DECIMAL(15,2) NOT NULL,
  accum_depreciation DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  accum_interest DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  carrying_liability DECIMAL(15,2) NOT NULL,
  carrying_rou_asset DECIMAL(15,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'XAF',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lease_org (org_id)
);
