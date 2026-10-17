-- =============================================================================
-- Migration 008: Phase 2 Operational Workflows
--
-- 1. Accrual & Cut-off Automated Reversals (Extournes automatiques)
-- 2. Recurring Journals (Abonnements récurrents)
-- 3. Period-End Multi-Currency FX Revaluation (Comptes 4781/4782, 697/194)
-- 4. Capitalization from Work in Progress (Comptes 239/249 vers 21x/23x/24x)
-- =============================================================================

-- 1. Journal entries: auto-reversal and recurring linkage
ALTER TABLE journal_entries
  ADD COLUMN auto_reverse_date DATE NULL AFTER reversed_by_entry_id,
  ADD COLUMN is_recurring TINYINT(1) NOT NULL DEFAULT 0 AFTER auto_reverse_date,
  ADD COLUMN recurring_template_id INT UNSIGNED NULL AFTER is_recurring,
  ADD KEY idx_je_auto_reverse (org_id, auto_reverse_date, status);

-- 2. Posting templates: recurrence engine
ALTER TABLE posting_templates
  ADD COLUMN is_recurring TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
  ADD COLUMN frequency ENUM('monthly', 'quarterly', 'semi_annual', 'annual') NULL AFTER is_recurring,
  ADD COLUMN day_of_month TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER frequency,
  ADD COLUMN start_date DATE NULL AFTER day_of_month,
  ADD COLUMN end_date DATE NULL AFTER start_date,
  ADD COLUMN next_run_date DATE NULL AFTER end_date,
  ADD COLUMN last_run_at DATETIME NULL AFTER next_run_date,
  ADD COLUMN auto_post TINYINT(1) NOT NULL DEFAULT 0 AFTER last_run_at;

-- 3. Asset Categories: WIP account support (Comptes 239/249)
ALTER TABLE asset_categories
  ADD COLUMN wip_account_id INT UNSIGNED NULL AFTER subsidy_income_account_id,
  ADD CONSTRAINT fk_ac_wip_acct FOREIGN KEY (wip_account_id) REFERENCES accounts (id);

-- Assign default WIP account:
-- 239 (Bâtiments et installations en cours) for facilities/buildings
-- 249 (Matériel en cours) for biomedical, vehicles, IT equipment
UPDATE asset_categories ac
  LEFT JOIN accounts a_wip_bld ON a_wip_bld.org_id = ac.org_id AND a_wip_bld.code = '239'
  LEFT JOIN accounts a_wip_mat ON a_wip_mat.org_id = ac.org_id AND a_wip_mat.code = '249'
  JOIN accounts a_asset ON a_asset.id = ac.asset_account_id
SET ac.wip_account_id = CASE
  WHEN a_asset.code LIKE '23%' THEN COALESCE(a_wip_bld.id, a_wip_mat.id)
  ELSE COALESCE(a_wip_mat.id, a_wip_bld.id)
END;

-- 4. Assets: WIP capitalization entry reference
ALTER TABLE assets
  ADD COLUMN wip_capitalization_entry_id INT UNSIGNED NULL AFTER parent_asset_id,
  ADD CONSTRAINT fk_asset_wip_entry FOREIGN KEY (wip_capitalization_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL;

-- 5. Multi-Currency FX Revaluation Runs
CREATE TABLE IF NOT EXISTS currency_revaluation_runs (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                INT UNSIGNED NOT NULL,
  period_id             INT UNSIGNED NOT NULL,
  as_of_date            DATE NOT NULL,
  status                ENUM('simulated','posted','reversed') NOT NULL DEFAULT 'simulated',
  entry_id              INT UNSIGNED NULL,
  provision_entry_id    INT UNSIGNED NULL,
  reversal_entry_id     INT UNSIGNED NULL,
  total_latent_loss     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_latent_gain     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_provision       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  run_by                INT UNSIGNED NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at             DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_cr_org_period (org_id, period_id),
  CONSTRAINT fk_cr_org FOREIGN KEY (org_id) REFERENCES organizations (id),
  CONSTRAINT fk_cr_period FOREIGN KEY (period_id) REFERENCES accounting_periods (id),
  CONSTRAINT fk_cr_entry FOREIGN KEY (entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  CONSTRAINT fk_cr_prov_entry FOREIGN KEY (provision_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  CONSTRAINT fk_cr_rev_entry FOREIGN KEY (reversal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS currency_revaluation_lines (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id                INT UNSIGNED NOT NULL,
  account_id            INT UNSIGNED NOT NULL,
  subledger_id          INT UNSIGNED NULL,
  currency              VARCHAR(3) NOT NULL,
  foreign_balance       DECIMAL(18,2) NOT NULL,
  book_rate             DECIMAL(14,6) NOT NULL,
  closing_rate          DECIMAL(14,6) NOT NULL,
  book_amount_xaf       DECIMAL(18,2) NOT NULL,
  revalued_amount_xaf   DECIMAL(18,2) NOT NULL,
  variance_xaf          DECIMAL(18,2) NOT NULL,
  variance_type         ENUM('latent_loss','latent_gain','neutral') NOT NULL,
  PRIMARY KEY (id),
  KEY idx_crl_run (run_id),
  CONSTRAINT fk_crl_run FOREIGN KEY (run_id) REFERENCES currency_revaluation_runs (id) ON DELETE CASCADE,
  CONSTRAINT fk_crl_account FOREIGN KEY (account_id) REFERENCES accounts (id),
  CONSTRAINT fk_crl_subledger FOREIGN KEY (subledger_id) REFERENCES subledger_accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
