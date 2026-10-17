-- -----------------------------------------------------------------------------
-- Migration 009: Phase 3 Governance & Audit (Multi-Axial Budgeting, FEC, Audit Seal)
-- -----------------------------------------------------------------------------

-- 1. Multi-Axial Analytical Accounting: Funding Programs & Analytical Activities
CREATE TABLE IF NOT EXISTS funding_programs (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  code           VARCHAR(30)  NOT NULL,
  name           VARCHAR(200) NOT NULL,
  donor_name     VARCHAR(150) NULL,
  currency       CHAR(3)      NOT NULL DEFAULT 'XAF',
  budget_amount  DECIMAL(20,2) NOT NULL DEFAULT 0,
  start_date     DATE         NULL,
  end_date       DATE         NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fp_code (org_id, code),
  CONSTRAINT fk_fp_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytical_activities (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  program_id     INT UNSIGNED NULL,
  code           VARCHAR(30)  NOT NULL,
  name           VARCHAR(200) NOT NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_act_code (org_id, code),
  CONSTRAINT fk_act_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_act_prg FOREIGN KEY (program_id) REFERENCES funding_programs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add multi-axial dimensions to journal_lines
ALTER TABLE journal_lines
  ADD COLUMN program_id INT UNSIGNED NULL AFTER cost_center_id,
  ADD COLUMN activity_id INT UNSIGNED NULL AFTER program_id,
  ADD CONSTRAINT fk_jl_prog FOREIGN KEY (program_id) REFERENCES funding_programs (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_jl_act FOREIGN KEY (activity_id) REFERENCES analytical_activities (id) ON DELETE SET NULL;

-- Add program_id to budget_lines
ALTER TABLE budget_lines
  ADD COLUMN program_id INT UNSIGNED NULL AFTER cost_center_id,
  ADD CONSTRAINT fk_bl_prog FOREIGN KEY (program_id) REFERENCES funding_programs (id) ON DELETE SET NULL;

-- 2. Audit Trail & Cryptographic Entry Seal (SHA-256 Chaining)
ALTER TABLE journal_entries
  ADD COLUMN entry_hash     VARCHAR(64)  NULL AFTER status,
  ADD COLUMN prev_hash      VARCHAR(64)  NULL AFTER entry_hash,
  ADD COLUMN is_sealed      TINYINT(1)   NOT NULL DEFAULT 0 AFTER prev_hash,
  ADD COLUMN sealed_at      DATETIME     NULL AFTER is_sealed,
  ADD COLUMN seal_sequence  INT UNSIGNED NULL AFTER sealed_at,
  ADD KEY ix_je_sealed (org_id, is_sealed, seal_sequence);

CREATE TABLE IF NOT EXISTS audit_seal_runs (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id           INT UNSIGNED NOT NULL,
  period_id        INT UNSIGNED NULL,
  fiscal_year_id   INT UNSIGNED NULL,
  entries_count    INT UNSIGNED NOT NULL DEFAULT 0,
  first_entry_no   VARCHAR(30)  NULL,
  last_entry_no    VARCHAR(30)  NULL,
  genesis_hash     VARCHAR(64)  NOT NULL,
  final_seal_hash  VARCHAR(64)  NOT NULL,
  verified         TINYINT(1)   NOT NULL DEFAULT 1,
  sealed_by        INT UNSIGNED NULL,
  sealed_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes            VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_asr_org (org_id, sealed_at),
  CONSTRAINT fk_asr_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default funding programs and analytical activities for hospital governance
INSERT IGNORE INTO funding_programs (org_id, code, name, donor_name, budget_amount, start_date, end_date)
VALUES
  (1, 'PROPRES', 'Fonds Propres & Recouvrement Hospitalier', 'Hôpital Général', 350000000.00, '2026-01-01', '2026-12-31'),
  (1, 'FM-PALU', 'Fonds Mondial - Programme National Paludisme', 'The Global Fund', 85000000.00, '2026-01-01', '2026-12-31'),
  (1, 'PEPFAR-VIH', 'PEPFAR - Prévention et Traitement VIH/Sida', 'USAID / CDC', 65000000.00, '2026-01-01', '2026-12-31'),
  (1, 'SUBV-ETAT', 'Subvention d Exploitation Ministère de la Santé', 'Ministère de la Santé Publique', 120000000.00, '2026-01-01', '2026-12-31');

INSERT IGNORE INTO analytical_activities (org_id, program_id, code, name)
VALUES
  (1, 1, 'ACT-CONSULT', 'Consultations Externes & Ambulatoires'),
  (1, 1, 'ACT-BLOC', 'Interventions Chirurgicales & Urgences'),
  (1, 2, 'ACT-DIST-MII', 'Distribution Moustiquaires Imprégnées & TDR'),
  (1, 3, 'ACT-ARV', 'Distribution ARV & Suivi Charge Virale'),
  (1, 4, 'ACT-MAINT-PARC', 'Maintenance Préventive Parc Imagerie & Stérilisation');
