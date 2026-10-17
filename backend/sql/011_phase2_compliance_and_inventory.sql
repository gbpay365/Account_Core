-- -----------------------------------------------------------------------------
-- Migration 011: Phase 2 Annual Compliance, Fiscal Depreciation & Physical Audit
-- -----------------------------------------------------------------------------

-- 1. Asset Physical Inventory Campaigns (Campagnes d'Inventaire Physique)
CREATE TABLE IF NOT EXISTS asset_inventory_campaigns (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  name            VARCHAR(150) NOT NULL,
  fiscal_year_id  INT UNSIGNED NOT NULL,
  start_date      DATE         NOT NULL,
  end_date        DATE         NULL,
  status          VARCHAR(30)  NOT NULL DEFAULT 'in_progress',
  supervisor_id   INT UNSIGNED NULL,
  total_expected  INT UNSIGNED NOT NULL DEFAULT 0,
  total_scanned   INT UNSIGNED NOT NULL DEFAULT 0,
  total_missing   INT UNSIGNED NOT NULL DEFAULT 0,
  total_relocated INT UNSIGNED NOT NULL DEFAULT 0,
  notes           TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_aic_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_aic_fy FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years (id),
  CONSTRAINT fk_aic_sup FOREIGN KEY (supervisor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Physical Asset Scans & Barcode Audits (Relevés de Scan Code-Barres / QR)
CREATE TABLE IF NOT EXISTS asset_inventory_scans (
  id                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id                INT UNSIGNED NOT NULL,
  asset_id                   INT UNSIGNED NULL,
  scanned_tag                VARCHAR(80)  NOT NULL,
  location_id                INT UNSIGNED NULL,
  scanned_condition          VARCHAR(30)  NOT NULL DEFAULT 'good',
  scanned_operational_status VARCHAR(30)  NOT NULL DEFAULT 'in_service',
  audit_result               VARCHAR(30)  NOT NULL DEFAULT 'verified',
  scanned_by                 INT UNSIGNED NULL,
  scanned_at                 DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes                      VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY ix_ais_camp (campaign_id),
  KEY ix_ais_tag (scanned_tag),
  CONSTRAINT fk_ais_camp FOREIGN KEY (campaign_id) REFERENCES asset_inventory_campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_ais_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE SET NULL,
  CONSTRAINT fk_ais_loc FOREIGN KEY (location_id) REFERENCES asset_locations (id) ON DELETE SET NULL,
  CONSTRAINT fk_ais_user FOREIGN KEY (scanned_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Fiscal vs Economic Depreciation (Amortissements Dérogatoires SYSCOHADA)
CREATE TABLE IF NOT EXISTS fiscal_depreciation_schedules (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                 INT UNSIGNED NOT NULL,
  asset_id               INT UNSIGNED NOT NULL,
  fiscal_year            SMALLINT     NOT NULL,
  economic_depreciation  DECIMAL(20,2) NOT NULL DEFAULT 0,
  fiscal_depreciation    DECIMAL(20,2) NOT NULL DEFAULT 0,
  derogatory_amount      DECIMAL(20,2) NOT NULL DEFAULT 0,
  cumulative_derogatory  DECIMAL(20,2) NOT NULL DEFAULT 0,
  entry_id               INT UNSIGNED NULL,
  status                 VARCHAR(30)  NOT NULL DEFAULT 'calculated',
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fds_asset_yr (asset_id, fiscal_year),
  CONSTRAINT fk_fds_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_fds_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE CASCADE,
  CONSTRAINT fk_fds_entry FOREIGN KEY (entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. DSF Tableau 28 / 29 Tax Adjustments (Réintégrations et Déductions Fiscales)
CREATE TABLE IF NOT EXISTS dsf_tax_adjustments (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  fiscal_year_id  INT UNSIGNED NOT NULL,
  adjustment_type ENUM('reintegration', 'deduction') NOT NULL DEFAULT 'reintegration',
  line_code       VARCHAR(20)  NOT NULL,
  description     VARCHAR(255) NOT NULL,
  amount          DECIMAL(20,2) NOT NULL DEFAULT 0,
  notes           TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_dta_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_dta_fy FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Standard SYSCOHADA Postable Accounts for Fiscal Depreciation
INSERT INTO accounts (org_id, code, name, name_en, account_class, parent_id, level, account_type, normal_side, is_postable, is_active, in_tier_normal)
VALUES
  (1, '1511', 'Amortissements dérogatoires', 'Exceptional depreciation', 1, 94, 3, 'equity', 'credit', 1, 1, 1),
  (1, '8511', 'Dotations aux amortissements dérogatoires', 'Additions to exceptional depreciation', 8, 294, 3, 'expense', 'debit', 1, 1, 1),
  (1, '8611', 'Reprises sur amortissements dérogatoires', 'Reversals of exceptional depreciation', 8, 297, 3, 'revenue', 'credit', 1, 1, 1)
ON DUPLICATE KEY UPDATE is_postable = 1;
