-- =============================================================================
-- LedgerCore :: 007_phase1_financial_core.sql
-- Phase 1 Core Financial Gaps:
-- 1. Auxiliary subledger accounts (Comptabilité auxiliaire des tiers)
-- 2. Lettrage / matching engine (Lettrage, délettrage, pointage)
-- 3. Donated asset subsidy amortisation link (Compte 14 -> Compte 865)
-- =============================================================================

-- 1. Subledger accounts table for third-party tracking (Suppliers, Customers, Employees)
CREATE TABLE IF NOT EXISTS subledger_accounts (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id                INT UNSIGNED NOT NULL,
  code                  VARCHAR(30)  NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  collective_account_id INT UNSIGNED NOT NULL,
  partner_type          ENUM('supplier','customer','employee','other') NOT NULL,
  partner_id            INT UNSIGNED NULL,
  is_active             TINYINT(1)   NOT NULL DEFAULT 1,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sub_code (org_id, code),
  KEY ix_sub_collective (org_id, collective_account_id),
  KEY ix_sub_partner (org_id, partner_type, partner_id),
  CONSTRAINT fk_sub_org  FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_acct FOREIGN KEY (collective_account_id) REFERENCES accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add auxiliary subledger and lettrage columns to journal_lines
ALTER TABLE journal_lines
  ADD COLUMN subledger_id INT UNSIGNED NULL AFTER partner_id,
  ADD COLUMN match_code   VARCHAR(10)  NULL AFTER reconciled,
  ADD COLUMN match_date   DATETIME     NULL AFTER match_code,
  ADD COLUMN match_type   ENUM('none','manual','auto','partial') NOT NULL DEFAULT 'none' AFTER match_date,
  ADD KEY ix_jl_subledger (subledger_id),
  ADD KEY ix_jl_match (org_id, match_code),
  ADD CONSTRAINT fk_jl_sub FOREIGN KEY (subledger_id) REFERENCES subledger_accounts (id) ON DELETE SET NULL;

-- 3. Add subsidy tracking columns to asset_categories
ALTER TABLE asset_categories
  ADD COLUMN subsidy_account_id INT UNSIGNED NULL AFTER accum_depr_account_id,
  ADD COLUMN subsidy_income_account_id INT UNSIGNED NULL AFTER subsidy_account_id,
  ADD CONSTRAINT fk_ac_sub_acct FOREIGN KEY (subsidy_account_id) REFERENCES accounts (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_ac_sub_inc  FOREIGN KEY (subsidy_income_account_id) REFERENCES accounts (id) ON DELETE SET NULL;

-- 4. Initialise subledger accounts from existing suppliers (Collective 4011)
INSERT INTO subledger_accounts (org_id, code, name, collective_account_id, partner_type, partner_id)
SELECT s.org_id,
       CONCAT('401-', s.code),
       s.name,
       COALESCE(s.default_account_id, a.id),
       'supplier',
       s.id
  FROM suppliers s
  JOIN accounts a ON a.org_id = s.org_id AND a.code = '4011'
 WHERE NOT EXISTS (
   SELECT 1 FROM subledger_accounts sub
    WHERE sub.org_id = s.org_id AND sub.partner_type = 'supplier' AND sub.partner_id = s.id
 );

-- 5. Initialise subledger accounts from existing customers (Collective 4111)
INSERT INTO subledger_accounts (org_id, code, name, collective_account_id, partner_type, partner_id)
SELECT c.org_id,
       CONCAT('411-', c.code),
       c.name,
       COALESCE(c.default_account_id, a.id),
       'customer',
       c.id
  FROM customers c
  JOIN accounts a ON a.org_id = c.org_id AND a.code = '4111'
 WHERE NOT EXISTS (
   SELECT 1 FROM subledger_accounts sub
    WHERE sub.org_id = c.org_id AND sub.partner_type = 'customer' AND sub.partner_id = c.id
 );

-- 6. Backfill subledger_id in journal_lines for existing partner entries
UPDATE journal_lines l
  JOIN subledger_accounts sub
    ON sub.org_id = l.org_id
   AND sub.partner_type = l.partner_type
   AND sub.partner_id = l.partner_id
   SET l.subledger_id = sub.id
 WHERE l.subledger_id IS NULL AND l.partner_type IN ('supplier', 'customer') AND l.partner_id IS NOT NULL;

-- 7. Configure default subsidy accounts on asset_categories (Compte 1431 and 8651)
UPDATE asset_categories ac
  LEFT JOIN accounts a14 ON a14.org_id = ac.org_id AND a14.code = '1431'
  LEFT JOIN accounts a86 ON a86.org_id = ac.org_id AND a86.code = '8651'
   SET ac.subsidy_account_id = a14.id,
       ac.subsidy_income_account_id = a86.id
 WHERE ac.subsidy_account_id IS NULL;
