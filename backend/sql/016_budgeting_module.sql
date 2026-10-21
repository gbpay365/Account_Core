-- -----------------------------------------------------------------------------
-- Migration 016: West African Institutional & Enterprise Budgeting Module
-- (OHADA / UEMOA / CEMAC Budgetary Execution, Multi-Axial Commitments, 
--  Asset Capex Linking, Credit Transfers / Virements, and Real-Time Controls)
-- -----------------------------------------------------------------------------

-- 1. Enhance budget_lines with initial dotation and control mode
ALTER TABLE budget_lines ADD COLUMN initial_amount DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE budget_lines ADD COLUMN control_mode ENUM('strict_block','warning','none') NOT NULL DEFAULT 'strict_block';

-- Backfill initial_amount with amount for existing lines
UPDATE budget_lines SET initial_amount = amount WHERE initial_amount = 0 AND amount > 0;

-- 2. Budget Commitments (Engagements budgétaires / Réservations de crédits)
CREATE TABLE IF NOT EXISTS budget_commitments (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id              INT UNSIGNED NOT NULL,
  budget_id           INT UNSIGNED NOT NULL,
  budget_line_id      INT UNSIGNED NOT NULL,
  commitment_number   VARCHAR(40)  NOT NULL,
  description         VARCHAR(300) NOT NULL,
  vendor_id           INT UNSIGNED NULL,
  asset_id            INT UNSIGNED NULL,
  work_order_id       INT UNSIGNED NULL,
  journal_entry_id    INT UNSIGNED NULL,
  amount              DECIMAL(20,2) NOT NULL DEFAULT 0,
  committed_date      DATE         NOT NULL,
  status              ENUM('draft','approved','liquidated','cancelled') NOT NULL DEFAULT 'draft',
  approved_by         INT UNSIGNED NULL,
  approved_at         DATETIME     NULL,
  liquidated_at       DATETIME     NULL,
  notes               VARCHAR(500) NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bcomm (org_id, commitment_number),
  KEY ix_bcomm_line (budget_line_id),
  KEY ix_bcomm_asset (asset_id),
  KEY ix_bcomm_wo (work_order_id),
  KEY ix_bcomm_je (journal_entry_id),
  CONSTRAINT fk_bcomm_org   FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcomm_bud   FOREIGN KEY (budget_id) REFERENCES budgets (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcomm_line  FOREIGN KEY (budget_line_id) REFERENCES budget_lines (id) ON DELETE CASCADE,
  CONSTRAINT fk_bcomm_vend  FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE SET NULL,
  CONSTRAINT fk_bcomm_ast   FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE SET NULL,
  CONSTRAINT fk_bcomm_wo    FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE SET NULL,
  CONSTRAINT fk_bcomm_je    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Budget Transfers / Amendments (Virements de crédits / Décisions Modificatives)
CREATE TABLE IF NOT EXISTS budget_transfers (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  budget_id       INT UNSIGNED NOT NULL,
  transfer_number VARCHAR(40)  NOT NULL,
  source_line_id  INT UNSIGNED NOT NULL,
  target_line_id  INT UNSIGNED NOT NULL,
  amount          DECIMAL(20,2) NOT NULL DEFAULT 0,
  reason          VARCHAR(400) NOT NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  authorized_by   INT UNSIGNED NULL,
  authorized_at   DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_btrans (org_id, transfer_number),
  KEY ix_btrans_src (source_line_id),
  KEY ix_btrans_tgt (target_line_id),
  CONSTRAINT fk_btrans_org  FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_btrans_bud  FOREIGN KEY (budget_id) REFERENCES budgets (id) ON DELETE CASCADE,
  CONSTRAINT fk_btrans_src  FOREIGN KEY (source_line_id) REFERENCES budget_lines (id) ON DELETE CASCADE,
  CONSTRAINT fk_btrans_tgt  FOREIGN KEY (target_line_id) REFERENCES budget_lines (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Cross-Module Linkages: Assets, Work Orders & Journal Lines
ALTER TABLE assets ADD COLUMN budget_line_id INT UNSIGNED NULL;
ALTER TABLE assets ADD CONSTRAINT fk_ast_bl FOREIGN KEY (budget_line_id) REFERENCES budget_lines (id) ON DELETE SET NULL;

ALTER TABLE work_orders ADD COLUMN budget_line_id INT UNSIGNED NULL;
ALTER TABLE work_orders ADD CONSTRAINT fk_wo_bl FOREIGN KEY (budget_line_id) REFERENCES budget_lines (id) ON DELETE SET NULL;

ALTER TABLE journal_lines ADD COLUMN commitment_id INT UNSIGNED NULL;
ALTER TABLE journal_lines ADD CONSTRAINT fk_jl_comm FOREIGN KEY (commitment_id) REFERENCES budget_commitments (id) ON DELETE SET NULL;
