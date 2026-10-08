-- =============================================================================
-- LedgerCore :: 001_core.sql
-- Organisation, security, audit, fiscal calendar, currency, parameters.
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                  VARCHAR(20)  NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  legal_name            VARCHAR(200) NULL,
  org_type              ENUM('hospital','clinic','health_district','group') NOT NULL DEFAULT 'hospital',
  parent_id             INT UNSIGNED NULL,
  country_code          CHAR(2)      NOT NULL DEFAULT 'CM',
  functional_currency   CHAR(3)      NOT NULL DEFAULT 'XAF',
  presentation_currency CHAR(3)      NOT NULL DEFAULT 'XAF',
  reporting_tier        ENUM('normal','allege','smt') NOT NULL DEFAULT 'normal',
  frameworks            SET('ohada','ifrs') NOT NULL DEFAULT 'ohada,ifrs',
  tax_id                VARCHAR(50)  NULL,
  vat_number            VARCHAR(50)  NULL,
  address               VARCHAR(300) NULL,
  city                  VARCHAR(100) NULL,
  phone                 VARCHAR(50)  NULL,
  email                 VARCHAR(150) NULL,
  logo_path             VARCHAR(300) NULL,
  retention_years       TINYINT UNSIGNED NOT NULL DEFAULT 10,
  is_active             TINYINT(1)   NOT NULL DEFAULT 1,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_code (code),
  KEY ix_org_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FR-STD-003 :: country parameter packs, no code changes per OHADA member state
CREATE TABLE IF NOT EXISTS country_parameters (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  country_code           CHAR(2)      NOT NULL,
  name                   VARCHAR(100) NOT NULL,
  is_ohada_member        TINYINT(1)   NOT NULL DEFAULT 1,
  currency               CHAR(3)      NOT NULL,
  vat_standard_rate      DECIMAL(7,4) NOT NULL DEFAULT 19.2500,
  vat_reduced_rate       DECIMAL(7,4) NULL,
  medical_equipment_vat  ENUM('standard','reduced','exempt') NOT NULL DEFAULT 'standard',
  withholding_rate       DECIMAL(7,4) NULL,
  fiscal_year_start_month TINYINT UNSIGNED NOT NULL DEFAULT 1,
  default_reporting_tier ENUM('normal','allege','smt') NOT NULL DEFAULT 'normal',
  statutory_annex_code   VARCHAR(30)  NULL,
  retention_years        TINYINT UNSIGNED NOT NULL DEFAULT 10,
  tax_authority_name     VARCHAR(150) NULL,
  notes                  VARCHAR(400) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_country (country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Departments / wards act as cost centres (SRS 2.5 key assumption)
CREATE TABLE IF NOT EXISTS cost_centers (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED NOT NULL,
  code            VARCHAR(20)  NOT NULL,
  name            VARCHAR(150) NOT NULL,
  name_en         VARCHAR(150) NULL,
  cc_type         ENUM('ward','department','clinical_service','support','administration','project','technical') NOT NULL DEFAULT 'department',
  parent_id       INT UNSIGNED NULL,
  manager_user_id INT UNSIGNED NULL,
  building        VARCHAR(100) NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cc_code (org_id, code),
  KEY ix_cc_parent (parent_id),
  CONSTRAINT fk_cc_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Security :: NFR "Basic Access Security" - authenticated login, RBAC, action log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  name_en     VARCHAR(100) NULL,
  description VARCHAR(300) NULL,
  is_system   TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(60)  NOT NULL,
  module      VARCHAR(40)  NOT NULL,
  description VARCHAR(200) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perm_code (code),
  KEY ix_perm_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  email          VARCHAR(150) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(150) NOT NULL,
  job_title      VARCHAR(100) NULL,
  phone          VARCHAR(50)  NULL,
  role_id        INT UNSIGNED NOT NULL,
  cost_center_id INT UNSIGNED NULL,
  locale         ENUM('fr','en') NOT NULL DEFAULT 'fr',
  is_technician  TINYINT(1)   NOT NULL DEFAULT 0,
  hourly_rate    DECIMAL(12,2) NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  must_change_pw TINYINT(1)   NOT NULL DEFAULT 0,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_email (email),
  KEY ix_user_org (org_id),
  KEY ix_user_role (role_id),
  CONSTRAINT fk_user_org  FOREIGN KEY (org_id)  REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles (id),
  CONSTRAINT fk_user_cc   FOREIGN KEY (cost_center_id) REFERENCES cost_centers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Logged action history (10-year retention, see organizations.retention_years)
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id      INT UNSIGNED NULL,
  user_id     INT UNSIGNED NULL,
  user_email  VARCHAR(150) NULL,
  action      VARCHAR(60)  NOT NULL,
  entity_type VARCHAR(60)  NOT NULL,
  entity_id   VARCHAR(60)  NULL,
  summary     VARCHAR(400) NULL,
  before_json LONGTEXT     NULL,
  after_json  LONGTEXT     NULL,
  ip_address  VARCHAR(60)  NULL,
  user_agent  VARCHAR(300) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_type, entity_id),
  KEY ix_audit_user (user_id),
  KEY ix_audit_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Fiscal calendar :: FR-GL-003 posting & period control
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fiscal_years (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id     INT UNSIGNED NOT NULL,
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(100) NOT NULL,
  start_date DATE         NOT NULL,
  end_date   DATE         NOT NULL,
  status     ENUM('open','closed','locked') NOT NULL DEFAULT 'open',
  closed_by  INT UNSIGNED NULL,
  closed_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fy_code (org_id, code),
  CONSTRAINT fk_fy_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounting_periods (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  fiscal_year_id INT UNSIGNED NOT NULL,
  period_no      TINYINT UNSIGNED NOT NULL,
  code           VARCHAR(20)  NOT NULL,
  name           VARCHAR(60)  NOT NULL,
  start_date     DATE         NOT NULL,
  end_date       DATE         NOT NULL,
  is_adjustment  TINYINT(1)   NOT NULL DEFAULT 0,
  status         ENUM('open','closed','locked') NOT NULL DEFAULT 'open',
  depr_posted    TINYINT(1)   NOT NULL DEFAULT 0,
  closed_by      INT UNSIGNED NULL,
  closed_at      DATETIME     NULL,
  locked_by      INT UNSIGNED NULL,
  locked_at      DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_period_code (org_id, code),
  KEY ix_period_fy (fiscal_year_id),
  KEY ix_period_dates (org_id, start_date, end_date),
  CONSTRAINT fk_period_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_period_fy  FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Currency :: FR-TR-002 multi-currency & FX revaluation (IAS 21)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currencies (
  code     CHAR(3)     NOT NULL,
  name     VARCHAR(60) NOT NULL,
  symbol   VARCHAR(8)  NULL,
  decimals TINYINT UNSIGNED NOT NULL DEFAULT 2,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exchange_rates (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED NOT NULL,
  from_currency CHAR(3)      NOT NULL,
  to_currency   CHAR(3)      NOT NULL,
  rate_date     DATE         NOT NULL,
  rate          DECIMAL(20,8) NOT NULL,
  rate_type     ENUM('spot','average','closing') NOT NULL DEFAULT 'spot',
  source        VARCHAR(60)  NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fx (org_id, from_currency, to_currency, rate_date, rate_type),
  KEY ix_fx_date (rate_date),
  CONSTRAINT fk_fx_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Shared infrastructure
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequences (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED NOT NULL,
  name          VARCHAR(40)  NOT NULL,
  prefix        VARCHAR(20)  NOT NULL DEFAULT '',
  next_value    INT UNSIGNED NOT NULL DEFAULT 1,
  padding       TINYINT UNSIGNED NOT NULL DEFAULT 5,
  include_year  TINYINT(1)   NOT NULL DEFAULT 1,
  reset_yearly  TINYINT(1)   NOT NULL DEFAULT 1,
  last_year     SMALLINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seq (org_id, name),
  CONSTRAINT fk_seq_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  org_id      INT UNSIGNED NOT NULL,
  setting_key VARCHAR(80)  NOT NULL,
  value_text  TEXT         NULL,
  data_type   ENUM('string','int','decimal','bool','json') NOT NULL DEFAULT 'string',
  category    VARCHAR(40)  NULL,
  description VARCHAR(250) NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, setting_key),
  CONSTRAINT fk_set_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Document / certificate store (SRS section 7 architecture)
CREATE TABLE IF NOT EXISTS attachments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id      INT UNSIGNED NOT NULL,
  entity_type VARCHAR(50)  NOT NULL,
  entity_id   INT UNSIGNED NOT NULL,
  doc_type    VARCHAR(40)  NOT NULL DEFAULT 'other',
  title       VARCHAR(200) NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(400) NOT NULL,
  mime_type   VARCHAR(100) NULL,
  size_bytes  INT UNSIGNED NULL,
  issue_date  DATE         NULL,
  expiry_date DATE         NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_att_entity (entity_type, entity_id),
  KEY ix_att_expiry (expiry_date),
  CONSTRAINT fk_att_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alert feed: calibration overdue, warranty/contract expiry, maintenance due
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id      INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NULL,
  role_code   VARCHAR(40)  NULL,
  category    VARCHAR(40)  NOT NULL,
  severity    ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(600) NULL,
  entity_type VARCHAR(50)  NULL,
  entity_id   INT UNSIGNED NULL,
  due_date    DATE         NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notif_user (org_id, user_id, is_read),
  KEY ix_notif_cat (org_id, category),
  CONSTRAINT fk_notif_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
